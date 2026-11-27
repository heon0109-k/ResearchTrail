// Draft AC5/AC7. The shared paper editor and tag dialog keep one receipt per user action.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../web/js/workspace-store.js',import.meta.url),'utf8');
function storeFor(write,tab=new Map()){
  const context=vm.createContext({crypto,structuredClone,sessionStorage:{
    get length(){return tab.size;},key:n=>[...tab.keys()][n],getItem:key=>tab.get(key),
    setItem:(k,v)=>tab.set(k,v),removeItem:k=>tab.delete(k)}});
  vm.runInContext(code,context);
  return context.createWorkspaceStore({current:()=>true,accountId:'owner',projectUrl:'synthetic',write},()=>{});
}
const conflict=()=>Object.assign(new Error('version'),{status:409});
const data=(tag='blue')=>({version:1,data:{tags:[{id:tag,name:'태그'}]}});
test('one compound edit keeps the same canonical fields and tag on retry and rejects an incomplete receipt',async()=>{
  const calls=[],tab=new Map(), fields={title:'새 제목'};
  const first=storeFor(async(path,body)=>{calls.push(structuredClone(body));return {version:1,data:body.patch};},tab);
  await assert.rejects(first.patch('T','paper','P',{tag:'blue'},{requestId:'request',paperFields:fields}));
  await assert.rejects(first.patch('T','paper','P',{tag:'blue'},{requestId:'request',paperFields:{title:'다른 제목'}}));
  let includeTag=false;
  const second=storeFor(async(path,body)=>{calls.push(structuredClone(body));return {version:1,data:includeTag?body.patch:{},paper_fields:body.paper_fields};},tab);
  await assert.rejects(second.retry('request'),/태그/);
  assert.equal(second.pending().length,1);
  includeTag=true;
  await second.retry('request');
  assert.deepEqual(calls[0],calls[1]);
  assert.deepEqual(calls[0],calls[2]);
  assert.equal(calls[1].paper_fields.title,'새 제목');
  assert.equal(second.read('T','paper','P').data.tag,'blue');
  assert.equal(second.pending().length,0);
});
test('a tag archive recovered from an older client asks which papers to archive before sending',async()=>{
  const tab=new Map(),writes=[];
  const path='/tasks/T/tag-removal';
  tab.set('researchtrail.pending.synthetic.owner.old',JSON.stringify({
    id:'old',task:'T',lane:path,label:'태그 삭제',path,method:'POST',order:1,
    body:{tag_id:'blue',archive_papers:true,version:1,request_id:'old'}
  }));
  const store=storeFor(async(path,body)=>{writes.push(structuredClone(body));return {version:2,data:{tags:[]},removed:1};},tab);
  assert.equal(store.pending()[0].reviewTag,true);
  await assert.rejects(store.retry('old'),/다시 확인/);
  assert.equal(writes.length,0);
  await store.removeTag('T','blue',true,['P']);
  assert.notEqual(writes[0].request_id,'old');
  assert.deepEqual(writes[0].expected_papers,['P']);
  assert.equal(tab.size,0);
});
test('registering and editing papers with a new tag wait for the tag receipt and retain independent retries',async()=>{
  let acknowledgeTag;
  const calls=[];
  const store=storeFor(async(path,body)=>{
    calls.push(body.request_id);
    if(body.target==='project'){
      if(!acknowledgeTag)return new Promise((resolve,reject)=>{acknowledgeTag=()=>reject(Error('tag offline'));});
      return {version:1,data:body.patch};
    }
    if(path.endsWith('/papers'))return {task_id:'T',document_id:'D',document_use_id:'U'};
    return {version:1,data:body.patch};
  });
  const tag=store.patch('T','project',null,{tags:[{id:'blue'}]},{requestId:'new-tag'});
  const add=store.mutate('논문 등록','/tasks/T/papers',{request_id:'add',workspace_data:{tag:'blue'}});
  const edit=store.patch('T','paper','P',{tag:'blue'},{requestId:'edit'});
  const failures=Promise.all([tag,add,edit].map(p=>assert.rejects(p)));
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,['new-tag']);
  acknowledgeTag();
  await failures;
  assert.equal(store.pending().length,3);
  await store.retry('new-tag');
  await store.retry('edit');
  assert.deepEqual(calls,['new-tag','new-tag','edit']);
  await store.retry('add');
  assert.equal(store.pending().length,0);
});
test('a conflicting paper edit needs a new explicit decision before replacing canonical fields',async()=>{
  const writes=[];
  const store=storeFor(async(path,body)=>{
    if(!body)return {papers:{P:{version:2,data:{tag:'blue'}}}};
    writes.push(structuredClone(body));
    if(body.version<2)throw conflict();
    return {version:3,data:body.patch,paper_fields:body.paper_fields};
  });
  await assert.rejects(store.patch('T','paper','P',{tag:'amber'},{requestId:'r',paperFields:{title:'draft'}}));
  assert.equal(writes.length,1);
  assert.equal(store.pending()[0].conflict,true);
  await store.retry('r',true);
  assert.equal(writes.at(-1).version,2);
});
test('tag-only removal rebases without replaying a failed memo',async()=>{
  let memoCount=0;
  const bodies=[];
  const store=storeFor(async(path,body)=>{
    if(path.endsWith('/records')){memoCount++;throw Error('failed');}
    if(!body)return {project:{...data(),version:2},papers:{}};
    bodies.push(structuredClone(body));
    if(body.version<2)throw conflict();
    return {version:3,data:{tags:[]},removed:0};
  });
  store.load('T',{project:data()});
  await assert.rejects(store.mutate('메모','/tasks/T/records',{record:{content_text:'synthetic'}}));
  await store.removeTag('T','blue',false);
  assert.equal(bodies[0].request_id,bodies[1].request_id);
  assert.equal(memoCount,1);
  assert.equal(store.pending().length,1);
  assert.equal(store.pending()[0].label,'메모');
});
test('a newly tagged paper requires freshly confirmed membership before an archive',async()=>{
  const bodies=[];
  const store=storeFor(async(path,body)=>{
    if(!body)return {project:data(),papers:{P:{data:{tag:'blue'}},Q:{data:{tag:'blue'}}}};
    bodies.push(structuredClone(body));
    if(body.expected_papers.length!==2)throw conflict();
    return {version:2,data:{tags:[]},removed:2};
  });
  store.load('T',{project:data()});
  await assert.rejects(store.removeTag('T','blue',true,['P']));
  const [old]=store.pending();
  assert.equal(old.reviewTag,true);
  await assert.rejects(store.retry(old.id,true));
  assert.equal(bodies.length,1);
  store.releaseTagReview(old.id);
  await store.removeTag('T','blue',true,['Q','P']);
  assert.deepEqual(bodies[1].expected_papers,['P','Q']);
  assert.notEqual(bodies[0].request_id,bodies[1].request_id);
});
