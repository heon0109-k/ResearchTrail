// Draft AC5. Route exercise with an authenticated synthetic transport.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleResearchTrail} from '../supabase/functions/researchtrail/handler.mjs';

const task=crypto.randomUUID(),rid=crypto.randomUUID();
const origin='https://workspace.invalid';
async function invoke(body,method='PATCH',auth=true) {
  const calls=[];
  const req=new Request(origin+'/functions/v1/researchtrail/tasks/'+task+'/active-project',{method,
    headers:auth?{authorization:'Bearer synthetic'}:{},body:body && JSON.stringify(body)});
  const result=await handleResearchTrail(req,{url:origin,key:'fixture-public',fetch:async(url,opts)=>{
    assert.equal(new Headers(opts.headers).get('Authorization'),'Bearer synthetic');
    if(url.endsWith('/auth/v1/user'))return Response.json({id:'fixture-owner'});
    calls.push([url.split('/').pop(),JSON.parse(opts.body)]);
    return Response.json({task_id:task,revision:5,request_id:rid});
  }});
  return {result,calls};
}
test('an explicit project choice sends only the verified owner’s revision and receipt to the selection RPC',async()=>{
  const {result,calls}=await invoke({revision:5,request_id:rid});
  assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{task_id:task,revision:5,request_id:rid});
  assert.deepEqual(calls,[['rt_select_workspace_task',{task_id:task,revision:5,request_id:rid}]]);
});
test('unauthenticated, unversioned, malformed and alternate-method choices cannot write the preference',async()=>{
  for(const [body,method,auth,status] of [
    [{revision:1,request_id:rid},'PATCH',false,401],
    [{revision:0,request_id:rid},'PATCH',true,400],
    [{revision:1,request_id:rid,owner_id:task},'PATCH',true,400],
    [{revision:1,request_id:'invalid'},'PATCH',true,400],
    [null,'GET',true,405]
  ]) {
    const {result,calls}=await invoke(body,method,auth);
    assert.equal(result.status,status);assert.deepEqual(calls,[]);
  }
});
