import { paperPdf } from './paper-pdf.mjs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, idempotency-key, x-pdf-name, x-pdf-artifact',
  'Cache-Control': 'no-store',
};
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const messages = {
  INVALID_INPUT: '입력 내용을 확인해 주세요.',
  INVALID_LINK: '선택한 연결을 확인해 주세요.',
  RESOURCE_UNAVAILABLE: '요청한 자료에 접근할 수 없어요.',
  STORAGE_FAILURE: '계정 자료를 불러오거나 저장하지 못했어요. 다시 시도해 주세요.',
};
function fail(status, code) {
  return Response.json({ error: { code, message: messages[code] } }, { status, headers: cors });
}

export async function handleResearchTrail(request, backend) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const authorization = request.headers.get('Authorization');
  if (!/^Bearer [^\s]+$/i.test(authorization || '')) return fail(401, 'RESOURCE_UNAVAILABLE');
  if (!backend.url || !backend.key) return fail(500, 'STORAGE_FAILURE');
  const headers = { Authorization: authorization, apikey: backend.key, 'Content-Type': 'application/json' };
  try {
    const verified = await backend.fetch(backend.url + '/auth/v1/user', { headers });
    if (!verified.ok) return verified.status >= 500 ? fail(503, 'STORAGE_FAILURE') : fail(401, 'RESOURCE_UNAVAILABLE');
    const owner = (await verified.json())?.id;
    if (!owner) return fail(401, 'RESOURCE_UNAVAILABLE');

    const path = new URL(request.url).pathname.replace(/^\/(?:functions\/v1\/)?researchtrail(?=\/|$)/, '');
    // Every database operation uses the verified caller's bearer, including PDF reservations.
    async function callRpc(rpc,args) {
      const result = await backend.fetch(backend.url + '/rest/v1/rpc/' + rpc, {
        method: 'POST', headers, body: JSON.stringify(args),
      });
      if (!result.ok) {
        const { code } = await result.json();
        if (code === 'RT001') return fail(400, 'INVALID_LINK');
        if (['P0002','23503','42501'].includes(code) || [401,403].includes(result.status)) return fail(404, 'RESOURCE_UNAVAILABLE');
        if (code?.startsWith('22') || ['23502','23514'].includes(code)) return fail(400, 'INVALID_INPUT');
        return fail(500, 'STORAGE_FAILURE');
      }
      return result;
    }
    const pdfRoute = /^\/tasks\/([^/]+)\/(papers|artifacts)\/([^/]+)\/pdf$/.exec(path);
    if (pdfRoute && uuid.test(pdfRoute[1]) && uuid.test(pdfRoute[3])) {
      return await paperPdf(request,{task:pdfRoute[1].toLowerCase(),kind:pdfRoute[2],id:pdfRoute[3].toLowerCase()},
        {backend,owner,headers,rpc:callRpc,cors,fail});
    }
    const match = /^\/tasks\/([^/]+)\/(papers|records|resume|next-actions)$/.exec(path);
    const post = request.method === 'POST';
    let rpc;
    const args = {};
    if (path === '/tasks') rpc = post ? 'rt_create_task' : 'rt_tasks';
    else if (path === '/documents' && !post) rpc = 'rt_documents';
    else if (match && uuid.test(match[1])) {
      if (match[2] === 'resume') {
        if (request.method !== 'GET') return fail(405, 'INVALID_INPUT');
        rpc = 'rt_resume';
      } else if (match[2] === 'records' || match[2] === 'next-actions') {
        if (!post) return fail(405, 'INVALID_INPUT');
        rpc = match[2] === 'records' ? 'rt_save_record' : 'rt_confirm_action';
      } else rpc = post ? 'rt_register_paper' : 'rt_papers';
      args.task_id = match[1];
    } else return fail(404, 'RESOURCE_UNAVAILABLE');
    if (!post && request.method !== 'GET') return fail(405, 'INVALID_INPUT');
    if (post) {
      let body;
      try { body = await request.json(); } catch { return fail(400, 'INVALID_INPUT'); }
      const fields = {
        rt_confirm_action: ['source_record_id', 'confirmed', 'reviewed_action', 'original_candidate', 'links', 'request_id'],
        rt_save_record: ['record', 'context', 'revises_record_id', 'request_id'],
        rt_register_paper: ['document', 'document_id', 'use', 'artifacts', 'date', 'request_id'],
        rt_create_task: ['goal_text', 'scope_text', 'target_output_text', 'progress_text', 'request_id'],
      }[rpc];
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          Object.keys(body).some(key => !fields.includes(key))) return fail(400, 'INVALID_INPUT');
      const { request_id: bodyKey, ...payload } = body;
      let request_id = bodyKey;
      if (rpc === 'rt_confirm_action' && payload.confirmed !== true) return fail(400, 'INVALID_INPUT');
      if (rpc === 'rt_save_record' || rpc === 'rt_confirm_action') {
        const headerKey = request.headers.get('Idempotency-Key');
        if (headerKey !== null && bodyKey !== undefined &&
            (typeof bodyKey !== 'string' || headerKey.toLowerCase() !== bodyKey.toLowerCase())) return fail(400, 'INVALID_INPUT');
        request_id = headerKey ?? bodyKey;
      } else if (request_id === undefined) request_id = crypto.randomUUID();
      if (typeof request_id !== 'string' || !uuid.test(request_id)) return fail(400, 'INVALID_INPUT');
      Object.assign(args, { request_id, payload });
    }
    const result = await callRpc(rpc,args);
    if (!result.ok) return result;
    return Response.json(await result.json(), { status: post ? 201 : 200, headers: cors });
  } catch {
    return fail(503, 'STORAGE_FAILURE');
  }
}
