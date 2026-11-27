import { paperPdf } from './paper-pdf.mjs';
import { ragIndex } from '../_rag/index-route.mjs';
import { ragAsk } from '../_rag/ask-route.mjs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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
    const link = /^\/tasks\/([^/]+)\/paper-links\/([^/]+)$/.exec(path);
    if (link && uuid.test(link[1]) && uuid.test(link[2])) {
      const edit = request.method === 'PATCH';
      if (!edit && request.method !== 'DELETE') return fail(405,'INVALID_INPUT');
      let body;
      try { body = await request.json(); } catch { return fail(400,'INVALID_INPUT'); }
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          typeof body.request_id !== 'string' || !uuid.test(body.request_id) ||
          Object.keys(body).some(k => k !== 'request_id' && !(edit && k === 'reason_text')) ||
          (edit && body.reason_text !== null && typeof body.reason_text !== 'string')) return fail(400,'INVALID_INPUT');
      const result = await callRpc('rt_change_paper_link',{task_id:link[1],link_id:link[2],
        payload:edit ? {reason_text:body.reason_text} : {}, request_id:body.request_id});
      return result.ok ? Response.json(await result.json(),{headers:cors}) : result;
    }
    const readerRoute = /^\/tasks\/([^/]+)\/artifacts\/([^/]+)\/reader$/.exec(path);
    if (readerRoute && uuid.test(readerRoute[1]) && uuid.test(readerRoute[2])) {
      const args = {task_id:readerRoute[1], artifact_id:readerRoute[2]};
      const write = request.method === 'POST';
      if (write) {
        try { args.payload = await request.json(); } catch { return fail(400,'INVALID_INPUT'); }
      } else if (request.method !== 'GET') return fail(405,'INVALID_INPUT');
      const result = await callRpc(write ? 'rt_save_pdf_reader' : 'rt_pdf_reader',args);
      return result.ok ? Response.json(await result.json(),{headers:cors}) : result;
    }
    const pdfRoute = /^\/tasks\/([^/]+)\/(papers|artifacts)\/([^/]+)\/pdf$/.exec(path);
    if (pdfRoute && uuid.test(pdfRoute[1]) && uuid.test(pdfRoute[3])) {
      return await paperPdf(request,{task:pdfRoute[1].toLowerCase(),kind:pdfRoute[2],id:pdfRoute[3].toLowerCase()},
        {backend,owner,headers,rpc:callRpc,cors,fail});
    }
    const ragRoute = /^\/tasks\/([^/]+)(?:\/artifacts\/([^/]+))?\/rag-index(?:\/(begin|chunks|finish))?$/.exec(path);
    if (ragRoute && uuid.test(ragRoute[1]) && (!ragRoute[2] || uuid.test(ragRoute[2]))) {
      return await ragIndex(request,{task:ragRoute[1].toLowerCase(),artifact:ragRoute[2]?.toLowerCase(),step:ragRoute[3]},
        {backend,rpc:callRpc,cors,fail});
    }
    const askRoute = /^\/tasks\/([^/]+)\/artifacts\/([^/]+)\/ask$/.exec(path);
    if (askRoute && uuid.test(askRoute[1]) && uuid.test(askRoute[2])) {
      return await ragAsk(request,{task:askRoute[1].toLowerCase(),artifact:askRoute[2].toLowerCase()},{backend,rpc:callRpc,cors,fail});
    }
    const match = /^\/tasks\/([^/]+)\/(papers|paper-links|records|resume|next-actions)$/.exec(path);
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
      } else if (match[2] === 'paper-links') rpc = post ? 'rt_link_papers' : 'rt_paper_links';
      else rpc = post ? 'rt_register_paper' : 'rt_papers';
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
        rt_link_papers: ['from_document_use_id', 'to_document_use_id', 'reason_text', 'request_id'],
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
