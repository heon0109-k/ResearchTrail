import test from 'node:test';
import assert from 'node:assert/strict';
import {handleResearchTrail} from '../supabase/functions/researchtrail/handler.mjs';

// Prompt 3 / AC5. Only the verified caller may address an individual project's link.
test('editing and removing an exact link pass the session, task, link and retry ID to the RPC', async () => {
  const [task,link,key]=Array.from({length:3},()=>crypto.randomUUID());
  const calls=[];
  const backend={url:'https://synthetic.invalid',key:'fixture',fetch:async(url,init)=>{
    assert.equal(init.headers.Authorization,'Bearer fixture');
    if(url.endsWith('/auth/v1/user'))return Response.json({id:'fixture'});
    assert.ok(url.endsWith('/rpc/rt_change_paper_link'));
    calls.push(JSON.parse(init.body));
    return Response.json({task_id:task,link_id:link});
  }};
  const send=(method,body)=>handleResearchTrail(new Request(backend.url+'/functions/v1/researchtrail/tasks/'+task+'/paper-links/'+link,{
    method,headers:{Authorization:'Bearer fixture'},body:JSON.stringify(body)
  }),backend);
  for(const [method,payload] of [['PATCH',{reason_text:'같은 지표'}],['DELETE',{}]]){
    assert.equal((await send(method,{...payload,request_id:key})).status,200);
    assert.deepEqual(calls.at(-1),{task_id:task,link_id:link,request_id:key,payload});
  }
  for(const [method,body] of [['PATCH',{}],['PATCH',{request_id:key}],['PATCH',{reason_text:42,request_id:key}],
    ['DELETE',{request_id:key,owner_id:'foreign'}],['DELETE',{}]]){
    assert.equal((await send(method,body)).status,400);
  }
  assert.equal(calls.length,2);
});
