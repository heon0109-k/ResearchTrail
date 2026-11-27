import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {handleResearchTrail} from '../supabase/functions/researchtrail/handler.mjs';

test('reader access authenticates and scopes both routes without fetching any PDF bytes',async()=>{
  const task=randomUUID(), artifact=randomUUID();
  const base='https://fixture.invalid', path='/researchtrail/tasks/'+task+'/artifacts/'+artifact+'/reader';
  const calls=[];
  const backend={url:base,key:'synthetic-public',async fetch(url,options){
    assert.equal(options.headers.Authorization,'Bearer synthetic-owner');
    if(url.endsWith('/auth/v1/user'))return Response.json({id:'fixture'});
    calls.push([url,JSON.parse(options.body)]);
    return Response.json({last_page:3,highlights:[]});
  }};
  function send(method,body,auth=true){
    return handleResearchTrail(new Request(base+path,{method,headers:auth?{Authorization:'Bearer synthetic-owner'}:{},body}),backend);
  }
  assert.equal((await send('GET')).status,200);
  assert.ok((await send('POST','{"last_page":3}')).ok);
  assert.equal((await send('GET',undefined,false)).status,401);
  assert.equal((await send('DELETE')).status,405);
  assert.equal((await send('POST','invalid JSON')).status,400);
  assert.deepEqual(calls,[
    [base+'/rest/v1/rpc/rt_pdf_reader',{task_id:task,artifact_id:artifact}],
    [base+'/rest/v1/rpc/rt_save_pdf_reader',{task_id:task,artifact_id:artifact,payload:{last_page:3}}]]);
});
