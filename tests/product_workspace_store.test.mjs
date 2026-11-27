// Draft AC5/AC7: exercise the same write queue used by original product controls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('web/js/workspace-store.js','utf8');
function fixture(storage=new Map()) {
  const runtime={crypto,structuredClone,console,sessionStorage:{
    get length(){return storage.size;},key:i=>[...storage.keys()][i],
    getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)
  }};
  vm.createContext(runtime); vm.runInContext(source,runtime);
  return runtime.createWorkspaceStore;
}
test('a dropped receipt keeps its payload and identity across reload, isolated by account',async()=>{
  const tab=new Map(), calls=[];
  const setup=(owner,fail)=>fixture(tab)({projectUrl:'fixture',accountId:owner,current:()=>true,
    write:async(path,body)=>{calls.push(structuredClone(body));if(fail)throw Error();return {record_id:'record'};}},()=>{});
  const first=setup('owner',true);
  await assert.rejects(first.mutate('메모','/tasks/A/records',{record:{content_text:'synthetic'}}));
  assert.equal(setup('other',false).pending().length,0);
  const fresh=setup('owner',false);
  assert.equal(fresh.pending()[0].task,'A');
  await fresh.retry(fresh.pending()[0].id);
  assert.equal(fresh.pending().length,0);
  assert.ok(calls[0].request_id);
  assert.deepEqual(calls[0],calls[1]);
});
test('edition patches serialize, preserve sibling keys and wait for both acknowledgements',async()=>{
  const calls=[], releases=[];
  const store=fixture()({projectUrl:'fixture',accountId:'a',current:()=>true,
    write:async(path,body)=>{calls.push(structuredClone(body));await new Promise(r=>releases.push(r));
      return {version:2+calls.length,data:calls.length===1?{depth:'low',memo:'old'}:{depth:'low',memo:'new'}};}},()=>{});
  store.load('task',{artifacts:{pdf:{version:2,data:{memo:'old'}}}});
  const one=store.patch('task','artifact','pdf',{depth:'low'});
  const two=store.patch('task','artifact','pdf',{memo:'new'});
  await new Promise(r=>setTimeout(r,0));
  assert.equal(calls.length,1); assert.equal(calls[0].version,2);
  releases.shift()(); await one;
  await new Promise(r=>setTimeout(r,0));
  assert.equal(store.pending().length,1); assert.equal(calls[1].version,3);
  releases.shift()(); await two;
  assert.equal(store.read('task','artifact','pdf').data.memo,'new');
});
test('an old successful retry cannot replace a fresher server revision',async()=>{
  let finish;
  const store=fixture()({projectUrl:'fixture',accountId:'a',current:()=>true,write:()=>new Promise(r=>{finish=r;})},()=>{});
  store.load('A',{project:{version:2,data:{tags:['old']}}});
  const pending=store.patch('A','project',null,{tags:['mine']});
  await new Promise(r=>setTimeout(r,0));
  store.load('A',{project:{version:4,data:{tags:['newer']}}});
  finish({version:3,data:{tags:['mine']}});
  await pending;
  assert.equal(store.read('A','project').version,4);
  assert.equal(store.read('A','project').data.tags[0],'newer');
});
test('a same-field conflict needs explicit resolution and retries only that leaf',async()=>{
  const calls=[];
  const store=fixture()({projectUrl:'fixture',accountId:'a',current:()=>true,write:async(path,body)=>{
    if(!body)return {project:{version:3,data:{tags:['other']}}};
    calls.push(structuredClone(body));
    if(body.version===2)throw Object.assign(Error(),{status:409});
    return {version:4,data:body.patch};
  }},()=>{});
  store.load('A',{project:{version:2,data:{tags:['base']}}});
  await assert.rejects(store.patch('A','project',null,{tags:['local']}));
  assert.equal(store.pending()[0].conflict,true);
  await store.retry(store.pending()[0].id,true);
  assert.equal(calls.at(-1).version,3);
  assert.ok(calls.every(b=>b.request_id===calls[0].request_id));
});

test('refresh retries the interrupted write before sending the later edit in that lane',async()=>{
  const tab=new Map(), calls=[];
  const owner={projectUrl:'fixture',accountId:'A',current:()=>true};
  const old=fixture(tab)({...owner,write:()=>new Promise(()=>{})},()=>{});
  old.load('task',{project:{version:2,data:{zoom:'month',unrelated:'private synthetic sample'}}});
  void old.patch('task','project',null,{zoom:'week'});
  void old.patch('task','project',null,{zoom:'all'});
  await new Promise(r=>setImmediate(r));
  assert.ok([...tab.values()].every(v=>!v.includes('private synthetic sample')));
  const fresh=fixture(tab)({...owner,write:async(path,body)=>{
    calls.push(body);
    return {version:body.version+1,data:body.patch};
  }},()=>{});
  const [head,later]=fresh.pending();
  assert.equal(head.phase,'failed');
  assert.equal(later.phase,'queued');
  await fresh.retry(head.id);
  await fresh.flush('task');
  assert.deepEqual(calls.map(c=>[c.request_id,c.version,c.patch.zoom]),[[head.id,2,'week'],[later.id,3,'all']]);
  assert.equal(fresh.read('task','project',null).data.zoom,'all');
});

test('a mismatched explicit action receipt leaves that exact confirmation available for retry',async()=>{
  const owner={projectUrl:'fixture',accountId:'A',current:()=>true};
  const status=[],calls=[];
  const store=fixture()({...owner,write:async(path,body)=>{
    calls.push(body.request_id);
    return {next_action_id:'accepted',source_record_id:calls.length===1?'different':'memo',
      saved_action:{action_text:body.reviewed_action.action_text}};
  }},(job,state)=>status.push(state));
  await assert.rejects(store.mutate('다음 작업','/tasks/task/next-actions',
    {confirmed:true,source_record_id:'memo',reviewed_action:{action_text:'표 확인하기'}}));
  assert.equal(status.at(-1),'failed');
  await store.retry(store.pending()[0].id);
  assert.equal(calls[0],calls[1]);
  assert.equal(status.at(-1),'saved');
});
