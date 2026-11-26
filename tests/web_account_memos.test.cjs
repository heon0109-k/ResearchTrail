// Independent account workspaces share only a synthetic API. Each gets its own DOM and tab storage.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');

const taskA = 'aaaa0000-0000-4000-8000-000000000001';
const taskB = 'bbbb0000-0000-4000-8000-000000000002';
const tick = () => new Promise(resolve => setImmediate(resolve));
function gate() {
  let resolve, reject;
  const promise = new Promise((yes,no) => { resolve=yes; reject=no; });
  return {promise, resolve, reject};
}
function server() {
  const records = new Map([[taskA,[]],[taskB,[]]]);
  const receipts = new Map(), calls = [];
  async function request(path,body) {
    calls.push({path,body:structuredClone(body)});
    if (path==='/tasks') return {tasks:[taskA,taskB].map(task_id=>({task_id,task:{goal_text:task_id}}))};
    const [, ,id,route] = path.split('/');
    if (route==='resume') return {task_id:id,task:{goal_text:id},records:structuredClone(records.get(id)),
      context:{questions:[],decisions:[],document_contexts:[]},next_actions:[]};
    assert.equal(route,'records');
    const previous = receipts.get(body.request_id);
    if (previous) { assert.deepEqual(structuredClone(body),previous.body); return previous.response; }
    const record_id = randomUUID();
    records.get(id).unshift({record_id, record:structuredClone(body.record),revises_record_id:body.revises_record_id||null,context_refs:{document_ids:[]}});
    const response = {record_id,context_refs:{document_ids:[]}};
    receipts.set(body.request_id,{body:structuredClone(body),response});
    return response;
  }
  return {records,calls,request};
}
function tab(storage = new Map()) {
  const nodes = new Map();
  const html = fs.readFileSync('web/views/account-projects.html','utf8');
  for (const [,id] of html.matchAll(/id="([^"]+)"/g)) {
    const handlers = new Map();
    nodes.set(id, {id,value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,style:{},
      addEventListener(type,fn){handlers.set(type,fn);}, focus(){},setAttribute(){},
      emit(type,target=this){return handlers.get(type)?.({target,preventDefault(){}});}});
  }
  const ctx = vm.createContext({document:{getElementById:id=>nodes.get(id),querySelector:s=>nodes.get(s.slice(1))},
    URL,crypto:{randomUUID},window:{},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
  for (const [,file] of html.matchAll(/<script src="(js\/[^"]+)"/g)) vm.runInContext(fs.readFileSync('web/'+file,'utf8'),ctx);
  let alive = true;
  return {nodes,storage, stop(){alive=false;}, start(request,account='a'){
    return ctx.startAccountProjects(request,{accountId:account,projectUrl:'https://fixture.invalid',current:()=>alive});
  },select:id=>ctx.projAccountMenu.select(id),
  type(text){const field=nodes.get('rNote');field.value=text;field.emit('input');},
  complete(){return nodes.get('rNote').emit('change');}};
}
test('two clients open and refresh server state; completion saves exact text only after acknowledgement',async()=>{
  const api=server(), first=tab(), second=tab(), ack=gate();
  let writes=0;
  await first.start(async(path,body)=>{
    const data=await api.request(path,body);
    if(body && ++writes===1) await ack.promise;
    return data;
  });
  await second.start(api.request);
  const text='  합성 메모\n 원문  ';
  first.type(text);
  assert.equal(writes,0);
  const save=first.complete();
  await tick();
  assert.equal(writes,1);
  assert.equal(first.nodes.get('rNote').value,text);
  assert.doesNotMatch(first.nodes.get('memoStatus').textContent,/저장했/);
  assert.doesNotMatch(second.nodes.get('accountRecords').innerHTML,/합성 메모/);
  first.type(text+'추가');
  await first.complete();
  ack.resolve();
  await save;
  await tick();
  assert.equal(writes,2);
  const versions=api.records.get(taskA);
  assert.equal(versions[1].record.content_text,text);
  assert.equal(versions[0].record.content_text,text+'추가');
  assert.equal(versions[0].revises_record_id,versions[1].record_id);
  assert.match(first.nodes.get('memoStatus').textContent,/저장했/);
  await second.select(taskB); await second.select(taskA);
  assert.match(second.nodes.get('accountRecords').innerHTML,/추가/);
  await second.select(taskB);
  const fresh=tab(second.storage);
  await fresh.start(api.request);
  assert.equal(api.calls.at(-1).path,'/tasks/'+taskB+'/resume');
  assert.doesNotMatch(fresh.nodes.get('accountRecords').innerHTML,/합성 메모/);
  await fresh.select(taskA);
  assert.match(fresh.nodes.get('accountRecords').innerHTML,/합성 메모/);
  assert.equal(api.calls.filter(c=>c.body).length,2);
});

test('a lost acknowledgement keeps the draft and the same request across refresh; identical new memos use fresh IDs',async()=>{
  const api=server(), first=tab();
  await first.start(async(path,body)=>{
    const result=await api.request(path,body);
    if(body) throw Error('lost acknowledgement');
    return result;
  });
  first.type('같은 원문'); await first.complete();
  assert.match(first.nodes.get('memoStatus').textContent,/다시/);
  const fresh=tab(first.storage); first.stop(); await fresh.start(api.request);
  assert.equal(fresh.nodes.get('rNote').value,'같은 원문');
  await fresh.nodes.get('memoFinish').emit('click');
  assert.equal(api.records.get(taskA).length,1);
  const [one,two]=api.calls.filter(c=>c.body);
  assert.equal(one.body.request_id,two.body.request_id);
  assert.match(fresh.nodes.get('memoStatus').textContent,/저장했/);
  fresh.nodes.get('rAddNote').emit('click');
  fresh.type('같은 원문'); await fresh.complete();
  assert.equal(api.records.get(taskA).length,2);
  assert.equal(api.records.get(taskA)[0].revises_record_id,null);
  assert.notEqual(api.calls.filter(c=>c.body).at(-1).body.request_id,one.body.request_id);
});
test('a late save or resume cannot replace a different task or account, even when reopening the original task',async()=>{
  const api=server(), first=tab(), lateSave=gate(), lateRead=gate();
  let delayRead=false;
  await first.start(async(path,body)=>{
    const result=await api.request(path,body);
    if(body) await lateSave.promise;
    if(delayRead && path==='/tasks/'+taskA+'/resume') await lateRead.promise;
    return result;
  });
  first.type('이전 화면');const saving=first.complete();
  await first.select(taskB);
  delayRead=true;
  const loading=first.select(taskA);
  await first.select(taskB);
  lateSave.resolve();lateRead.resolve();await Promise.all([saving,loading]);
  assert.equal(first.nodes.get('rNote').value,'');
  assert.doesNotMatch(first.nodes.get('accountRecords').innerHTML,/이전 화면/);
  assert.doesNotMatch(first.nodes.get('memoStatus').textContent,/저장했/);
  first.stop();
  const second=tab(first.storage);
  await second.start(server().request,'b');
  assert.equal(second.nodes.get('rNote').value,'');
  assert.equal(second.nodes.get('tName').textContent,taskA);
});

test('later keystrokes stay a draft while completed edits wait for their parent record IDs',async()=>{
  const api=server(), client=tab(), waiting=gate();
  let first=true;
  await client.start(async(path,body)=>{
    if(body && first){first=false;await waiting.promise;}
    return api.request(path,body);
  });
  client.type('첫 버전'); const pending=client.complete();
  client.type('둘째 버전'); await client.complete();
  client.type('셋째 버전'); await client.complete();
  client.type('아직 작성 중');
  waiting.resolve(); await pending; await tick();
  const rows=api.records.get(taskA);
  assert.deepEqual(rows.map(r=>r.record.content_text),['셋째 버전','둘째 버전','첫 버전']);
  assert.equal(rows[0].revises_record_id,rows[1].record_id);
  assert.equal(rows[1].revises_record_id,rows[2].record_id);
  assert.equal(client.nodes.get('rNote').value,'아직 작성 중');
  assert.doesNotMatch(client.nodes.get('memoStatus').textContent,/저장했/);
});

test('a second client can correct a saved record, then the first client sees both versions on refresh',async()=>{
  const api=server(), a=tab(), b=tab();
  await a.start(api.request);
  a.type('원래 기록'); await a.complete();
  const original=api.records.get(taskA)[0];
  await b.start(api.request);
  b.nodes.get('accountRecords').emit('click',{closest:()=>({dataset:{editRecord:original.record_id}})});
  assert.equal(b.nodes.get('rNote').value,'원래 기록');
  b.type('정정 내용'); await b.complete();
  const latest=api.records.get(taskA)[0];
  assert.equal(latest.revises_record_id,original.record_id);
  const refreshed=tab(a.storage); await refreshed.start(api.request);
  assert.match(refreshed.nodes.get('accountRecords').innerHTML,/정정 내용/);
  assert.match(refreshed.nodes.get('accountRecords').innerHTML,/원래 기록/);
  assert.equal(original.record.content_text,'원래 기록');
});

test('leaving the field completes an input-only edit; change and blur together save once',async()=>{
  const api=server(), client=tab();
  await client.start(api.request);
  const field=client.nodes.get('rNote');
  client.type('입력 후 포커스 이동');
  await field.emit('blur');
  assert.equal(api.records.get(taskA).length,1);
  client.type('두 번째 편집');
  const done=field.emit('change');
  await field.emit('blur');
  await done;
  assert.equal(api.calls.filter(c=>c.body).length,2);
  assert.equal(api.records.get(taskA)[0].record.content_text,'두 번째 편집');
});

test('only the selected paper is submitted and stored questions, decisions and confirmed actions are readable',async()=>{
  const api=server(), client=tab(), id='dddd0000-0000-4000-8000-000000000001';
  await client.start(async(path,body)=>{
    const data=await api.request(path,body);
    if(path.endsWith('/resume')){
      data.context={document_contexts:[{document_id:id,document:{title:'합성 논문'},use:{},artifacts:[]}],
        questions:[{question_text:'저장한 질문'}],decisions:[{decision_text:'저장한 판단'}]};
      data.next_actions=[{confirmed:true,saved_action:{action_text:'확인한 작업'}}];
    }
    return data;
  });
  assert.match(client.nodes.get('accountContext').innerHTML,/저장한 질문/);
  assert.match(client.nodes.get('accountContext').innerHTML,/저장한 판단/);
  assert.match(client.nodes.get('accountActions').innerHTML,/확인한 작업/);
  const paper=client.nodes.get('memoPaper');
  paper.value=id; paper.emit('change');
  client.type('선택한 논문 메모'); await client.complete();
  const writes=api.calls.filter(c=>c.body);
  assert.equal(writes.length,1);
  assert.equal(writes[0].path,'/tasks/'+taskA+'/records');
  assert.deepEqual(writes[0].body.context,{document_contexts:[{document_ref:{document_id:id},use:{}}]});
});

test('reopening A and switching accounts discards late receipts, including pending tab-storage updates',async()=>{
  for (const switchAccount of [false,true]) {
    const api=server(), a=tab(), delayed=gate();
    await a.start(async(path,body)=>{
      const reply=await api.request(path,body);
      if(body) await delayed.promise;
      return reply;
    });
    a.type('보류된 수정'); const pending=a.complete();
    await tick();
    if(switchAccount) a.stop();
    else {await a.select(taskB);await a.select(taskA);}
    const shown = switchAccount ? tab(a.storage) : a;
    if(switchAccount) await shown.start(server().request,'b');
    const before = [...a.storage];
    delayed.resolve(); await pending;
    assert.deepEqual([...a.storage],before);
    assert.doesNotMatch(shown.nodes.get('memoStatus').textContent,/저장했/);
    if(switchAccount) assert.equal(shown.nodes.get('rNote').value,'');
    else {
      assert.equal(shown.nodes.get('rNote').value,'보류된 수정');
      await shown.nodes.get('memoFinish').emit('click');
      assert.equal(api.records.get(taskA).length,1);
    }
  }
});

test('restoring a verified account at the site root opens its workspace immediately and passes the current session',async()=>{
  const html=fs.readFileSync('web/views/account.html','utf8'), nodes=new Map();
  function element(){return {addEventListener(type,fn){this[type]=fn;},replaceChildren(){this.firstElementChild=null;},
    appendChild(child){this.firstElementChild=child;}};}
  for(const [,id] of html.matchAll(/id="([^"]+)"/g)) nodes.set(id,element());
  let notify;
  const auth={onAuthStateChange(fn){notify=fn;},initialize:async()=>({})};
  const config={SUPABASE_URL:'https://fixture.invalid',SUPABASE_PUBLISHABLE_KEY:'synthetic-public'};
  const requests=[];
  const document={getElementById:id=>nodes.get(id),createElement:element};
  const window={RESEARCHTRAIL_CONFIG:config,location:{search:''},addEventListener(){},supabase:{createClient:()=>({auth})}};
  vm.runInNewContext(fs.readFileSync('web/js/account.js','utf8'),{document,window,URLSearchParams,AbortController,
    fetch:async(url,init)=>{requests.push([url,init]);return Response.json({tasks:[]});}});
  notify('INITIAL_SESSION',{user:{id:'a'},access_token:'synthetic-a'});
  const frame=nodes.get('authWorkspace').firstElementChild;
  assert.equal(frame.src,'views/account-projects.html');
  let load;
  frame.contentWindow={startAccountProjects(request,account){load={request,account};}};
  frame.load();
  assert.equal(load.account.accountId,'a');
  assert.equal(load.account.current(),true);
  await load.request('/tasks/'+taskA+'/resume');
  assert.equal(requests[0][1].headers.Authorization,'Bearer synthetic-a');
  notify('SIGNED_IN',{user:{id:'b'},access_token:'synthetic-b'});
  assert.equal(load.account.current(),false);
  await assert.rejects(load.request('/tasks/'+taskA+'/records',{record:{content_text:'차단'}}));
  assert.equal(requests.length,1);
});
