// Draft NF3 regression. The provider receives only a per-test canary. No network is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,cp,symlink,readdir,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {handleResearchTrail} from '../supabase/functions/researchtrail/handler.mjs';

test('account preview files, build logs and index/ask HTTP responses keep the provider credential server-side',async t=>{
  const root=path.resolve(import.meta.dirname,'..'), work=await mkdtemp(path.join(os.tmpdir(),'rt-qa-privacy-'));
  t.after(()=>rm(work,{recursive:true,force:true}));
  const secret='synthetic-provider-'+randomUUID();
  const clear=data=>assert.ok(!String(data).includes(secret),'a server-only marker escaped');
  const preview={SUPABASE_URL:'https://fixture.invalid',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
  await mkdir(path.join(work,'scripts'));
  await cp(path.join(root,'scripts/build-web.mjs'),path.join(work,'scripts/build-web.mjs'));
  await cp(path.join(root,'web'),path.join(work,'web'),{recursive:true});
  await symlink(path.join(root,'node_modules'),path.join(work,'node_modules'),'dir');
  const {stdout,stderr}=await promisify(execFile)(process.execPath,['scripts/build-web.mjs'],{
    cwd:work,env:{...preview,OPENAI_API_KEY:secret}});
  clear(stdout); clear(stderr);
  for(const dir of ['web','dist']){
    for(const file of await readdir(path.join(work,dir),{recursive:true,withFileTypes:true})){
      if(!file.isFile()) continue;
      const bytes=await readFile(path.join(file.parentPath,file.name));
      assert.ok(!bytes.includes(secret),'provider marker in website');
      if(file.name.endsWith('.js') || file.name.endsWith('.html')) assert.ok(!bytes.includes('OPENAI_API_KEY'),'server setting in browser code');
    }
  }
  const task=randomUUID(), artifact=randomUUID(), seen=[], logs=[];
  for(const level of ['log','info','warn','error','debug']) t.mock.method(console,level,(...args)=>logs.push(...args));
  let index=null, failAt='/v1/embeddings';
  const passage='This is the synthetic source passage.';
  const backend={url:preview.SUPABASE_URL,key:preview.SUPABASE_PUBLISHABLE_KEY,openaiKey:secret,fetch:async(url,init)=>{
    const {hostname,pathname}=new URL(url);
    const auth=new Headers(init.headers).get('Authorization');
    if(hostname==='api.openai.com'){
      assert.ok(auth==='Bearer '+secret); seen.push(pathname);
      if(pathname===failAt) return Response.json({error:{message:secret}},{status:429});
      if(pathname==='/v1/embeddings') return Response.json({data:[{index:0,embedding:Array(1536).fill(0.1)}]});
      if(pathname==='/v1/responses') return Response.json({status:'completed',output:[{content:[{type:'output_text',
        text:JSON.stringify({in_scope:true,found:true,answer:'확인된 합성 답변',used_docs:['A'],evidence:[{doc:'A',page:1,quote:passage}]})}]}]});
      throw Error('Unexpected provider endpoint');
    }
    assert.equal(auth,'Bearer user'); clear(init.body);
    if(pathname==='/auth/v1/user') return Response.json({id:'user'});
    const step=pathname.split('/').pop();
    if(step==='rt_rag_index_status') return Response.json({artifacts:[{artifact_id:artifact,document_use_id:'paper',index}]});
    if(step==='rt_rag_search'){
      const row={artifact_id:artifact,document_use_id:'paper',page:1,start:0,end:passage.length,text:passage};
      return Response.json({matches:[{...row,similarity:0.9}],current:[row]});
    }
    if(step==='rt_rag_add_chunks') return Response.json({received:1,stored:1,artifact_id:artifact});
    if(['rt_rag_begin_index','rt_rag_finish_index'].includes(step)){
      const ready=step==='rt_rag_finish_index';
      index={chunker:'pages-1600-320',embedding_model:'fixture',status:ready?'ready':'indexing',chunk_count:ready?1:null};
      return Response.json({artifact_id:artifact,...index});
    }
    throw Error('Unexpected destination');
  }};
  async function call(resource,body,expected){
    const request=new Request(preview.SUPABASE_URL+'/functions/v1/researchtrail/tasks/'+task+resource,{
      method:body?'POST':'GET',headers:{Authorization:'Bearer user'},body:body && JSON.stringify(body)});
    const response=await handleResearchTrail(request,backend);
    clear(JSON.stringify(Object.fromEntries(response.headers)));
    const json=await response.text(); clear(json);
    assert.equal(response.status,expected);
    return JSON.parse(json);
  }
  const base='/artifacts/'+artifact, indexBase=base+'/rag-index/';
  const batch={chunks:[{page:1,start:0,end:7,text:'fixture'}]};
  const question={question:'합성 질문',scope:'open_pdf',answer_depth:'auto',consent:true};
  await call('/rag-index',undefined,200);
  await call(indexBase+'begin',{chunker:'pages-1600-320',pdf_sha256:'f'.repeat(64),consent:true},201);
  await call(indexBase+'chunks',batch,503);
  failAt=null;
  await call(indexBase+'chunks',batch,201);
  await call(indexBase+'finish',{chunk_count:1},200);
  failAt='/v1/responses';
  await call(base+'/ask',question,503);
  failAt=null;
  assert.equal((await call(base+'/ask',question,200)).kind,'answer');
  assert.deepEqual(seen,['/v1/embeddings','/v1/embeddings','/v1/embeddings','/v1/responses','/v1/embeddings','/v1/responses']);
  clear(JSON.stringify(logs)); logs.forEach(clear);
});
