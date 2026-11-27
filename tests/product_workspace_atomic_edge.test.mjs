// Draft AC5/AC7. Exercise the authenticated HTTP path without a live service.
import test from 'node:test';
import assert from 'node:assert/strict';
import {handleResearchTrail} from '../supabase/functions/researchtrail/handler.mjs';

const t=crypto.randomUUID(), p=crypto.randomUUID(), key=crypto.randomUUID();
async function run(path,method,payload,error) {
  const origin='https://fixture.invalid', calls=[];
  const request=new Request(origin+'/functions/v1/researchtrail/tasks/'+t+'/'+path,{
    method,headers:{Authorization:'Bearer synthetic-owner'},body:JSON.stringify({...payload,request_id:key})});
  const response=await handleResearchTrail(request,{url:origin,key:'test-public',fetch:async(url,options)=>{
    if(url.endsWith('/auth/v1/user'))return Response.json({id:'synthetic-owner'});
    assert.equal(new Headers(options.headers).get('Authorization'),'Bearer synthetic-owner');
    assert.ok(url.endsWith('/rpc/rt_workspace_change'));
    const args=JSON.parse(options.body); calls.push(args);
    return error?Response.json({code:error},{status:400}):Response.json({version:2,data:payload.patch,paper_fields:payload.paper_fields});
  }});
  return {response,calls};
}
test('a mixed paper edit forwards both halves with one receipt and rejects other targets',async()=>{
  const leaf={target:'paper',id:p,version:1,patch:{year:'2026'},paper_fields:{title:'Synthetic title'}};
  const {response,calls}=await run('workspace','PATCH',leaf);
  assert.deepEqual(await response.json(),{version:2,data:leaf.patch,paper_fields:leaf.paper_fields});
  assert.deepEqual(calls,[{task_id:t,target_id:null,request_id:key,operation:'patch_state',payload:leaf}]);
  for (const bad of [{...leaf,target:'artifact'},{...leaf,paper_fields:{owner_id:p}},{...leaf,paper_fields:[]}]) {
    const {response,calls}=await run('workspace','PATCH',bad);
    assert.equal(response.status,400); assert.deepEqual(calls,[]);
  }
});
test('tag archival forwards the confirmed paper IDs and preserves the membership conflict',async()=>{
  const body={tag_id:'methods',archive_papers:true,version:1,expected_papers:[p]};
  const {response,calls}=await run('tag-removal','POST',body,'RT409');
  assert.equal(response.status,409);
  assert.equal((await response.json()).error.code,'STORAGE_FAILURE');
  assert.deepEqual(calls,[{task_id:t,target_id:null,request_id:key,operation:'remove_tag',payload:body}]);
  for (const bad of [{...body,archive_papers:false},{...body,expected_papers:[p,p]},{...body,expected_papers:[5]}]){
    const {response,calls}=await run('tag-removal','POST',bad);
    assert.equal(response.status,400); assert.deepEqual(calls,[]);
  }
});
