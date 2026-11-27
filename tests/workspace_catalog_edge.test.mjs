// Draft AC5 regression for the shared timeline and the prior account catalog.
import test from 'node:test';
import assert from 'node:assert/strict';
import {handleResearchTrail} from '../supabase/functions/researchtrail/handler.mjs';

test('only the signed-in workspace projection requests the paper catalog without redundant memo references',async()=>{
  const task=crypto.randomUUID(), origin='https://fixture.invalid', calls=[];
  const backend={url:origin,key:'synthetic-public',fetch:async(url,init)=>{
    assert.equal(new Headers(init.headers).get('Authorization'),'Bearer synthetic-user');
    if (url.endsWith('/auth/v1/user')) return Response.json({id:'synthetic-user'});
    calls.push([url.split('/').pop(),JSON.parse(init.body)]);
    return Response.json({papers:[]});
  }};
  for (const suffix of ['?view=workspace','']) {
    const req=new Request(origin+'/functions/v1/researchtrail/tasks/'+task+'/papers'+suffix,{headers:{Authorization:'Bearer synthetic-user'}});
    const result=await handleResearchTrail(req,backend);
    assert.equal(result.status,200);
    assert.deepEqual(await result.json(),{papers:[]});
  }
  assert.deepEqual(calls,[['rt_workspace_papers',{task_id:task}],['rt_papers',{task_id:task}]]);
});
