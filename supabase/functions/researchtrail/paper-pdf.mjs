import {boundedBytes} from './bytes.mjs';
const bucket = 'researchtrail-pdfs';
const limit = 10 * 1024 * 1024;
const decoder = new TextDecoder();

function pdfSignature(bytes) {
  return /^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(decoder.decode(bytes.subarray(0,10))) &&
    /%%EOF[\x00\t\n\f\r ]*$/.test(decoder.decode(bytes.subarray(-1024)));
}
async function digest(bytes) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('');
}

export async function paperPdf(request, {task,kind,id}, {backend,owner,headers,rpc,cors,fail}) {
  const upload = kind==='papers';
  if (request.method !== (upload ? 'POST' : 'GET')) return fail(405,'INVALID_INPUT');
  let bytes, expectedHash, target;
  const existing=request.headers.get('x-pdf-artifact')?.toLowerCase();
  if (upload) {
    if (existing!==undefined && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(existing))
      return fail(400,'INVALID_INPUT');
    let name;
    try { name = decodeURIComponent(request.headers.get('x-pdf-name') || ''); }
    catch { return fail(400,'INVALID_INPUT'); }
    if (!/\.pdf$/i.test(name) || name.length<5 || name.length>255 || /[\\/\x00-\x1f\x7f]/.test(name) ||
        request.headers.get('content-type')?.toLowerCase() !== 'application/pdf') return fail(415,'INVALID_INPUT');
    bytes = await boundedBytes(request,limit);
    if (!bytes) return fail(413,'INVALID_INPUT');
    if (!pdfSignature(bytes)) return fail(415,'INVALID_INPUT');
    if (!backend.storageKey) return fail(503,'STORAGE_FAILURE');
    expectedHash = await digest(bytes);
    target = await rpc('rt_prepare_paper_pdf',{task_id:task,document_use_id:id,file_name:name,
      content_sha256:expectedHash,size_bytes:bytes.length,...(existing ? {existing_artifact_id:existing} : {})});
  } else target = await rpc('rt_paper_pdf',{task_id:task,artifact_id:id});

  if (!target.ok) return target;
  const artifact = await target.json();
  const path = artifact.object_name;
  // Only the database's canonical owner/use/digest path may reach the privileged writer.
  const [account,use,file,...extra] = String(path).split('/');
  if (account!==owner || !/^[0-9a-f-]{36}$/i.test(use) || extra.length ||
      !/^[0-9a-f]{64}$/.test(artifact.sha256) || file!==artifact.sha256+'.pdf' ||
      (upload && (use!==id || artifact.sha256!==expectedHash || artifact.size_bytes!==bytes.length)) ||
      (upload && existing && existing!==artifact.artifact_id) || (!upload && artifact.artifact_id!==id)) return fail(500,'STORAGE_FAILURE');
  const storage = backend.url+'/storage/v1/object/';
  const key = bucket+'/'+path;
  const ack = () => Response.json({artifact_id:artifact.artifact_id},{status:201,headers:cors});
  if (upload) {
    const writer = {apikey:backend.storageKey,'Content-Type':'application/pdf','x-upsert':'false','Cache-Control':'no-store'};
    if (!backend.storageKey.startsWith('sb_secret_')) writer.Authorization='Bearer '+backend.storageKey;
    const saved = await backend.fetch(storage+key,{method:'POST',headers:writer,body:bytes,redirect:'error'});
    if (saved.ok) return ack();
    const error = await saved.json().catch(()=>({}));
    if (!(saved.status===409 || error.error==='Duplicate' || error.code==='ResourceAlreadyExists' || error.statusCode==='409'))
      return fail(503,'STORAGE_FAILURE');
    // The previous write may have succeeded before its reply was lost. Verify its bytes.
  }
  const download = await backend.fetch(storage+'authenticated/'+key,{method:'GET',headers,redirect:'error'});
  if (!download.ok) return download.status>=500 ? fail(503,'STORAGE_FAILURE') : fail(404,'RESOURCE_UNAVAILABLE');
  const stored = await boundedBytes(download,limit);
  if (!stored || stored.length!==artifact.size_bytes || await digest(stored)!==artifact.sha256) return fail(503,'STORAGE_FAILURE');
  return upload ? ack() : new Response(stored,{headers:{...cors,'Content-Type':'application/pdf','X-Content-Type-Options':'nosniff'}});
}
