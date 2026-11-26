// Run explicitly against a migrated LOCAL Supabase stack. Creates two synthetic test accounts.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {syntheticPdf} from './fixtures/synthetic-pdf.mjs';

async function check() {
  let url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url && !key) {
    // Keep the full local CLI status out of terminal output, including on failure.
    const cli=fileURLToPath(new URL('../node_modules/.bin/supabase',import.meta.url));
    let status;
    try { status=JSON.parse(execFileSync(cli,['status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']})); }
    catch { throw new Error('Local Supabase is unavailable. Run the check where the local stack and Docker are accessible.'); }
    url=status.API_URL;
    key=status.PUBLISHABLE_KEY;
  }
  assert.ok(url && key,'Set the local SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY together.');
  const base = new URL(url);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(base.hostname) && ['http:','https:'].includes(base.protocol)
    && !base.username && !base.password,'This test accepts only a loopback Supabase project.');
  async function call(path,token,body,headers={}) {
    return fetch(base.origin+path,{method:body?'POST':'GET',redirect:'error',
      headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',...headers},body});
  }
  async function json(result,operation) {
    assert.ok(result.ok,operation+' returned HTTP '+result.status);
    return result.json();
  }
  // Check reachability before creating the synthetic users.
  await json(await call('/auth/v1/health'),'Local Auth health check');
  async function signup() {
    const body=JSON.stringify({email:'rt-pdf-'+randomUUID()+'@example.test',password:randomUUID()+randomUUID()});
    const session=await json(await call('/auth/v1/signup',null,body),'Synthetic account signup');
    assert.ok(session.access_token,'Enable local email signups without email confirmation.');
    return {body,session};
  }
  const a=await signup(), b=await signup();
  const owner=a.session.access_token, other=b.session.access_token;
  const api='/functions/v1/researchtrail/tasks';
  const post=async(path,body)=>json(await call(path,owner,JSON.stringify(body)),'Project write');
  const {task_id}=await post(api,{goal_text:'Step 9 PDF 합성 검사',request_id:randomUUID()});
  const task=api+'/'+task_id;
  const {document_use_id}=await post(task+'/papers',{document:{title:'합성 PDF'},artifacts:[{access_locator_text:'https://doi.org/10.0000/synthetic'}],request_id:randomUUID()});
  const memo='  PDF 검사 합성 메모  ';
  const {record_id}=await post(task+'/records',{record:{content_text:memo},request_id:randomUUID()});
  const bytes=syntheticPdf(), hash=createHash('sha256').update(bytes).digest('hex');
  const upload=task+'/papers/'+document_use_id+'/pdf';
  const headers={'Content-Type':'application/pdf','X-PDF-Name':encodeURIComponent('합성.pdf')};
  const first=await json(await call(upload,owner,bytes,headers),'Upload');
  const retry=await json(await call(upload,owner,bytes,headers),'Retry upload');
  assert.ok(first.artifact_id && retry.artifact_id===first.artifact_id,'Retry must reuse the artifact');
  const fresh=await json(await call('/auth/v1/token?grant_type=password',null,a.body),'Independent owner sign-in');
  const resume=await json(await call(task+'/resume',fresh.access_token),'Owner resume');
  assert.deepEqual(resume.records.map(r=>r.record.content_text),[memo]);
  assert.equal(resume.next_actions.length,0);
  const artifacts=resume.context.document_contexts.flatMap(p=>p.artifacts);
  assert.deepEqual(artifacts.filter(a=>a.pdf).map(a=>[a.artifact_id,a.pdf.available,a.pdf.sha256]),[[first.artifact_id,true,hash]]);
  const read=task+'/artifacts/'+first.artifact_id+'/pdf';
  const response=await call(read,fresh.access_token);
  assert.equal(response.status,200,'Owner download');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
  assert.equal((await call(read,other)).status,404,'Foreign download');
  assert.equal((await call(upload,other,bytes,headers)).status,404,'Foreign upload');
  const object='researchtrail-pdfs/'+a.session.user.id+'/'+document_use_id+'/'+hash+'.pdf';
  const storage='/storage/v1/object/';
  assert.equal((await call(storage+'authenticated/'+object,owner)).status,200,'Owner Storage access');
  assert.equal((await call(storage+'authenticated/'+object,other)).ok,false,'Foreign Storage access');
  assert.equal((await call(storage+'public/'+object,null)).ok,false,'Public Storage access');
  const extra=object.replace(hash,'f'.repeat(64));
  assert.equal((await call(storage+extra,owner,bytes,headers)).ok,false,'Direct client upload');
  console.log('PASS: private Storage upload, retry, fresh owner session, exact bytes, memo count, second-account and public denial.');
  if (process.argv.includes('--reader')) {
    const reader=task+'/artifacts/'+first.artifact_id+'/reader';
    const highlight={id:randomUUID(),page:1,text:'ResearchTrail PDF fixture',rects:[[0.1,0.2,0.5,0.08]],record_id};
    await post(reader,{highlight});
    await post(reader,{highlight});
    await post(reader,{last_page:1});
    const state=await json(await call(reader,fresh.access_token),'Fresh owner reader');
    assert.deepEqual(state,{last_page:1,highlights:[highlight]});
    const edition=new Uint8Array(bytes.length+1);
    edition.set(bytes); edition[bytes.length]=10;
    const another=await json(await call(upload,owner,edition,headers),'Same-name edition');
    const empty=await json(await call(task+'/artifacts/'+another.artifact_id+'/reader',owner),'Separate edition');
    assert.deepEqual(empty,{last_page:null,highlights:[]});
    assert.equal((await call(reader,other)).status,404,'Foreign reader');
    assert.equal((await call(reader,other,JSON.stringify({last_page:1}))).status,404,'Foreign reading position');
    console.log('PASS: fresh owner reads the page, normalized anchor and original memo reference. Other editions and accounts are isolated.');
  }
}
try { await check(); }
catch (error) {
  // Never print request headers, session bodies or credentials.
  console.error(error.cause?.code==='ECONNREFUSED' ? 'Local Supabase gateway is unreachable.' : error.message);
  process.exitCode=1;
}
