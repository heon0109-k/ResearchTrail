// Step 9: independent authenticated clients share only a synthetic object store and RPC boundary.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {handleResearchTrail} from '../supabase/functions/researchtrail/handler.mjs';
import {syntheticPdf} from './fixtures/synthetic-pdf.mjs';

const base='https://fixture.invalid', task=randomUUID(), use=randomUUID(), owner=randomUUID(), other=randomUUID();
const bucket='researchtrail-pdfs', limit=10*1024*1024;
const pdf=syntheticPdf();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(){
  const artifacts=new Map(),objects=new Map(),calls=[];
  const legacyId=randomUUID();
  let drop=false;
  const backend={url:base,key:'synthetic-public',storageKey:'synthetic-server',async fetch(url,options){
    const path=new URL(url).pathname, headers=new Headers(options.headers);
    const who=headers.get('authorization')?.slice(7);
    calls.push(path);
    if(path==='/auth/v1/user')return [owner,other].includes(who)?Response.json({id:who}):Response.json({},{status:401});
    if(path.startsWith('/rest/v1/rpc/')){
      const args=JSON.parse(options.body);
      if(who!==owner || args.task_id!==task)return Response.json({code:'P0002'},{status:404});
      if(path.endsWith('rt_prepare_paper_pdf')){
        if(args.document_use_id!==use)return Response.json({code:'P0002'},{status:404});
        if(args.existing_artifact_id && args.existing_artifact_id!==legacyId)return Response.json({code:'P0002'},{status:404});
        if(!artifacts.has(args.content_sha256))artifacts.set(args.content_sha256,{artifact_id:args.existing_artifact_id || randomUUID(),
          object_name:owner+'/'+use+'/'+args.content_sha256+'.pdf',sha256:args.content_sha256,size_bytes:args.size_bytes});
        return Response.json(artifacts.get(args.content_sha256));
      }
      assert.match(path,/rt_paper_pdf$/);
      const a=[...artifacts.values()].find(a=>a.artifact_id===args.artifact_id);
      return a?Response.json(a):Response.json({code:'P0002'},{status:404});
    }
    if(options.method==='POST'){
      assert.equal(headers.get('apikey'),backend.storageKey);
      assert.equal(headers.get('x-upsert'),'false');
      assert.equal(headers.get('content-type'),'application/pdf');
      const name=path.slice(('/storage/v1/object/'+bucket+'/').length);
      assert.ok([...artifacts.values()].some(a=>a.object_name===name));
      if(objects.has(name))return Response.json({statusCode:'409',error:'Duplicate'},{status:409});
      objects.set(name,new Uint8Array(options.body).slice());
      if(drop){drop=false;throw Error('lost storage acknowledgement');}
      return Response.json({Key:name});
    }
    assert.equal(who,owner);
    const prefix='/storage/v1/object/authenticated/'+bucket+'/';
    assert.ok(path.startsWith(prefix));
    const bytes=objects.get(path.slice(prefix.length));
    return bytes?new Response(bytes,{headers:{'Content-Type':'application/pdf'}}):new Response(null,{status:404});
  }};
  function call(who,path,body,extra={}){
    const headers={'Authorization':'Bearer '+who,...(body?{'Content-Type':'application/pdf','X-PDF-Name':encodeURIComponent('합성.pdf')}:{}) ,...extra};
    return handleResearchTrail(new Request(base+'/functions/v1/researchtrail'+path,{headers,method:body?'POST':'GET',body}),backend);
  }
  return {calls,artifacts,objects,legacyId,drop(){drop=true;},upload:(bytes=pdf,h={},who=owner)=>call(who,'/tasks/'+task+'/papers/'+use+'/pdf',bytes,h),
    get:(artifact,who=owner)=>call(who,'/tasks/'+task+'/artifacts/'+artifact+'/pdf')};
}

test('interrupted upload retries on one artifact; a fresh owner client retrieves exact bytes and a second account is denied',async()=>{
  const f=fixture();f.drop();
  assert.equal((await f.upload()).ok,false);
  const retried=await f.upload();assert.ok(retried.ok);
  const {artifact_id}=await retried.json();
  assert.equal(f.objects.size,1);assert.equal(f.artifacts.size,1);
  const saved=await f.get(artifact_id);
  assert.equal(saved.headers.get('content-type'),'application/pdf');
  assert.equal(hash(new Uint8Array(await saved.arrayBuffer())),hash(pdf));
  const before=f.calls.filter(c=>c.startsWith('/storage')).length;
  assert.equal((await f.get(artifact_id,other)).status,404);
  assert.equal((await f.upload(pdf,{},other)).status,404);
  assert.equal(f.calls.filter(c=>c.startsWith('/storage')).length,before);
  assert.ok(f.calls.every(c=>!c.includes('record')&&!c.includes('action')));
});

test('same-name different bytes get different artifacts; actual length, MIME and PDF signature are checked before storage',async()=>{
  const f=fixture(), max=new Uint8Array(limit);
  max.set(pdf);max.set(new TextEncoder().encode('%%EOF\n'),limit-6);
  assert.ok((await f.upload(max)).ok);assert.ok((await f.upload()).ok);
  assert.equal(f.artifacts.size,2);assert.equal(f.objects.size,2);
  for(const [bytes,headers] of [[new Uint8Array(limit+1),{'Content-Length':'4'}],[pdf,{'Content-Length':String(limit+1)}],
    [pdf,{'Content-Type':'image/png'}],[pdf,{'X-PDF-Name':'fake.html'}],[new TextEncoder().encode('plain text'),{}],[new Uint8Array(),{}]]){
    const res=await f.upload(bytes,headers);
    assert.ok([400,413,415].includes(res.status));assert.equal((await res.json()).error.code,'INVALID_INPUT');
  }
  assert.equal(f.objects.size,2);assert.equal(f.artifacts.size,2);
});

test('a duplicate response requires matching stored bytes before acknowledging the retry',async()=>{
  const f=fixture();
  const {artifact_id}=await (await f.upload()).json();
  const [name]=f.objects.keys();
  const damaged=pdf.slice();damaged[12]^=1;
  f.objects.set(name,damaged);
  assert.equal((await f.upload()).status,503);
  assert.equal((await f.get(artifact_id)).status,503);
  f.objects.delete(name);
  assert.equal((await f.get(artifact_id)).status,404);
});

test('an explicitly selected filename-only edition keeps its ID and rejects a different target',async()=>{
  const f=fixture();
  const saved=await f.upload(pdf,{'X-PDF-Artifact':f.legacyId});
  assert.equal((await saved.json()).artifact_id,f.legacyId);
  assert.equal((await f.upload(pdf,{'X-PDF-Artifact':randomUUID()})).status,404);
  assert.equal(f.objects.size,1);
});
