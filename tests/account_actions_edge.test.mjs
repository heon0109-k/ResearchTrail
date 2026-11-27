// SPEC §5.4 / AC4. Synthetic authenticated requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {handleResearchTrail} from '../supabase/functions/researchtrail/handler.mjs';

const task = '88000000-0000-4000-8000-000000000001';
const record = '88000000-0000-4000-8000-000000000002';
const key = '88000000-0000-4000-8000-000000000003';
const base = 'https://fixture.invalid';
const payload = {source_record_id:record, confirmed:true, reviewed_action:{action_text:'직접 고른 작업'},
  original_candidate:{action_text:'원래 후보'}};

function call(body, {header, method='POST', signed=true}={}) {
  const calls = [];
  const headers = signed ? {Authorization:'Bearer synthetic-session'} : {};
  if (header) headers['Idempotency-Key'] = header;
  const result = handleResearchTrail(new Request(base+'/functions/v1/researchtrail/tasks/'+task+'/next-actions', {
    method, headers, body:body && JSON.stringify(body),
  }), {url:base,key:'synthetic-public',async fetch(url,init){
    if (url.endsWith('/auth/v1/user')) return Response.json({id:'synthetic-user'});
    calls.push({url,args:JSON.parse(init.body),authorization:init.headers.Authorization});
    return Response.json({next_action_id:key,source_record_id:record,saved_action:payload.reviewed_action});
  }});
  return {result,calls};
}

test('only an explicitly confirmed review goes to the authenticated confirmation RPC', async()=>{
  for (const [body,header] of [[payload,key],[{...payload,request_id:key},undefined]]) {
    const {result,calls}=call(body,{header});
    assert.equal((await result).status,201);
    assert.deepEqual(calls,[{url:base+'/rest/v1/rpc/rt_confirm_action',args:{task_id:task,request_id:key,payload},authorization:'Bearer synthetic-session'}]);
  }
  for (const confirmed of [false,null,undefined,'true']) {
    const {result,calls}=call({...payload,confirmed},{header:key});
    assert.equal((await result).status,400);
    assert.equal(calls.length,0);
  }
});

test('confirmation rejects a missing or conflicting operation ID, guest access and method changes', async()=>{
  for (const [body,options,status] of [[payload,{},400],[{...payload,request_id:record},{header:key},400],
    [{...payload,owner_id:task},{header:key},400],[payload,{header:key,signed:false},401],[undefined,{method:'GET'},405]]) {
    const {result,calls}=call(body,options);
    assert.equal((await result).status,status);
    assert.equal(calls.length,0);
  }
});
