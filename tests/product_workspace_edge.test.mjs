// Draft AC5/AC7 tests for the signed-in product controls. No network or provider is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {handleResearchTrail} from '../supabase/functions/researchtrail/handler.mjs';

const task=crypto.randomUUID(), paper=crypto.randomUUID(), rid=crypto.randomUUID();
const origin='https://workspace.invalid';
function call(method,path,body,error) {
  const calls=[];
  const backend={url:origin,key:'test-public',fetch:async(url,opts)=>{
    if (url.endsWith('/auth/v1/user')) return Response.json({id:'fixture-owner'});
    assert.equal(new Headers(opts.headers).get('Authorization'),'Bearer owner');
    calls.push([url.split('/').pop(),JSON.parse(opts.body)]);
    return error ? Response.json({code:error},{status:400}) : Response.json({version:1});
  }};
  const req=new Request(origin+'/functions/v1/researchtrail/tasks/'+task+path,{
    method,headers:{Authorization:'Bearer owner'},body:body===undefined?undefined:JSON.stringify(body)});
  return handleResearchTrail(req,backend).then(res=>({res,calls}));
}
test('workspace state, metadata and archive writes use authenticated project-scoped RPCs', async()=>{
  const reads=await call('GET','/workspace');
  assert.equal(reads.res.status,200);
  assert.deepEqual(reads.calls,[['rt_workspace_state',{task_id:task}]]);
  const cases=[
    ['PATCH','',{goal_text:'Renamed'},'rename_task',null],
    ['DELETE','',{},'archive_task',null],
    ['PATCH','/papers/'+paper,{date:'2026-10-22',purpose_text:'original context'},'edit_paper',paper],
    ['DELETE','/papers/'+paper,{},'archive_paper',paper],
    ['PATCH','/workspace',{target:'artifact',id:paper,version:3,patch:{qa:{depth:'auto'}}},'patch_state',null],
    ['POST','/tag-removal',{tag_id:'t1',archive_papers:true,version:1},'remove_tag',null],
  ];
  for(const [method,path,payload,operation,target_id] of cases){
    const {res,calls}=await call(method,path,{...payload,request_id:rid});
    assert.equal(res.status,200);
    assert.deepEqual(calls,[['rt_workspace_change',{task_id:task,target_id,operation,request_id:rid,payload}]]);
  }
});
test('version conflicts and invalid/rejected workspace writes have bounded public errors',async()=>{
  const conflict=await call('PATCH','/workspace',{target:'project',version:0,patch:{tags:[]},request_id:rid},'RT409');
  assert.equal(conflict.res.status,409);
  assert.equal((await conflict.res.json()).error.code,'STORAGE_FAILURE');
  for(const [method,path,body] of [['PATCH','',{goal_text:'name'}],['DELETE','/papers/'+paper,{owner_id:paper,request_id:rid}],
    ['PATCH','/workspace',{request_id:rid,version:1,target:'artifact'}],['POST','/workspace',{}]]){
    const {res,calls}=await call(method,path,body);
    assert.ok(res.status===400||res.status===405);
    assert.deepEqual(calls,[]);
  }
});

test('workspace accepts a normal capture and bounds actual streamed JSON bytes before its RPC',async()=>{
  const capture=await call('PATCH','/workspace',{request_id:rid,target:'artifact',id:paper,version:0,
    patch:{cards:{sample:{img:'data:image/png;base64,'+'A'.repeat(270000)}}}});
  assert.equal(capture.res.status,200);
  const over=await call('PATCH','/workspace',{request_id:rid,target:'artifact',id:paper,version:0,
    patch:{cards:{sample:{img:'A'.repeat(10*1024*1024)}}}});
  assert.equal(over.res.status,413);
  assert.equal((await over.res.json()).error.code,'INVALID_INPUT');
  assert.deepEqual(over.calls,[]);
});

test('paper registration forwards extras in one authenticated RPC and preserves the legacy call',async()=>{
  const canonical={document:{title:'Paper'},date:'2026-11-20'};
  const extras={year:'2026',authors:'Test Author'};
  const modern=await call('POST','/papers',{...canonical,workspace_data:extras,request_id:rid});
  assert.equal(modern.res.status,201);
  assert.deepEqual(modern.calls,[['rt_register_workspace_paper',{task_id:task,payload:canonical,workspace_data:extras,request_id:rid}]]);
  const legacy=await call('POST','/papers',{...canonical,request_id:rid});
  assert.deepEqual(legacy.calls,[['rt_register_paper',{task_id:task,payload:canonical,request_id:rid}]]);
});
