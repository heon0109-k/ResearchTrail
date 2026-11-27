// Draft AC5/AC7 coverage. Old account reader payloads are synthetic.
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');

class Node extends EventTarget {
  constructor(){super();this.children=[];this.textContent='';}
  replaceChildren(...nodes){this.children=nodes;}
  appendChild(node){this.children.push(node);return node;}
  setAttribute(){}
}
function harness() {
  const entries=new Map(), status=new Map(), document={createElement:()=>new Node()};
  for(const owner of ['owner','other']) {
    const prefix='researchtrail.account.origin.'+owner+'.';
    entries.set(prefix+'draft.A.e',JSON.stringify({text:'original memo',label:'file.pdf',operations:[]}));
    entries.set(prefix+'reader.A.e',JSON.stringify({label:'file.pdf',payload:{last_page:9}}));
    entries.set(prefix+'draft.A.missing',JSON.stringify({text:'unavailable draft',operations:[]}));
    entries.set(prefix+'draft.A',JSON.stringify({text:'project note',operations:[]}));
    entries.set(prefix+'draft.B.e',JSON.stringify({text:'separate project note',operations:[]}));
    entries.set(prefix+'memoCard.A.e.new',JSON.stringify({text:'new card'}));
  }
  const sessionStorage={get length(){return entries.size;},key:i=>Array.from(entries.keys())[i],getItem:k=>entries.get(k),
    setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
  const c=vm.createContext({sessionStorage,document,S:{taskId:'A'},accountReaderOperation:p=>p.highlight?'하이라이트':'읽기 위치',
    $:k=>{if(!status.has(k))status.set(k,new Node());return status.get(k);}});
  for(const name of ['account-save-status','workspace-recovery'])
    vm.runInContext(readFileSync('web/js/'+name+'.js','utf8'),c);
  const account={projectUrl:'origin',accountId:'owner',current:()=>true};
  const saves=c.createAccountSaveStatus(null,account.current,account);saves.focus('A');
  const sent=[],replies=[];
  const api={...account,saves,resume:{task_id:'A',context:{document_contexts:[
    {document_id:'d',document:{title:'archived paper'},artifacts:[{artifact_id:'e',label_text:'file.pdf'}]}]}},
    write(path,body){sent.push({path,body});return new Promise((resolve,reject)=>replies.push({resolve,reject}));}};
  return {c,api,saves,status,sent,replies,entries};
}
test('the recovery controls reopen an archived edition draft, replay only its failed reader request and retain other scopes',async()=>{
  const {c,api,saves,status,sent,replies,entries}=harness(),box=new Node(),opened=[];
  c.renderLegacyRecovery('A',api,box,scope=>{opened.push(scope);});
  function controls(node=box){return node.children.flatMap(child=>[child,...controls(child)]);}
  const memo=controls().find(n=>n.textContent.includes('메모 이어')&&!n.disabled);
  await memo.onclick();
  assert.deepEqual({...opened[0]},{documentId:'d',artifactId:'e',label:'archived paper · file.pdf'});
  assert.equal(opened.length,1);
  assert.ok(controls().some(n=>n.disabled && n.textContent.includes('확인할 수 없어요')));
  assert.ok(!controls().some(n=>n.textContent.includes('project note')||n.textContent.includes('new card')));
  const reader=()=>controls().find(n=>n.textContent.includes('9쪽') && n.textContent.includes('다시 저장'));
  const run=reader().onclick();
  assert.match(status.get('#memoStatus').textContent,/읽기 위치 저장 중/);
  assert.equal(sent[0].path,'/tasks/A/artifacts/e/reader');
  replies.shift().resolve({highlights:[],last_page:1});await run;
  assert.ok(saves.read('reader.A.e'));
  assert.match(status.get('#memoStatus').textContent,/읽기 위치 저장을 확인하지 못/);
  const next=reader().onclick();replies.shift().resolve({highlights:[],last_page:9});await next;
  assert.deepEqual(JSON.parse(JSON.stringify(sent)),Array(2).fill({path:'/tasks/A/artifacts/e/reader',body:{last_page:9}}));
  assert.equal(saves.read('reader.A.e'),null);
  assert.ok(saves.read('draft.A.e') && saves.read('draft.B.e') && saves.read('draft.A.missing'));
  assert.ok(entries.has('researchtrail.account.origin.other.reader.A.e'));
});
test('a stale page receipt preserves newer payload contents; a different logged-in owner cannot complete the old retry',async()=>{
  const {c,api,saves,replies}=harness();
  const first=c.listLegacyRecovery('A',api).find(r=>r.retry);
  const work=first.retry();
  saves.store('reader.A.e',{payload:{last_page:10},label:'file.pdf'});
  replies.shift().resolve({highlights:[],last_page:9});await work;
  assert.equal(saves.read('reader.A.e').payload.last_page,10);
  const newer=c.listLegacyRecovery('A',api).find(r=>r.retry).retry();
  api.current=()=>false;
  replies.shift().resolve({highlights:[],last_page:10});await newer;
  assert.equal(saves.read('reader.A.e').payload.last_page,10);
  assert.equal(c.listLegacyRecovery('A',api).length,0);
});
test('an anchor retry requires the original page, rectangle and linked record, while initial page accepts an existing position',async()=>{
  const {c,api,saves,replies,sent}=harness(),key='reader.A.e';
  const mark={id:'original-mark',page:3,text:'Synthetic excerpt',rects:[[0,0,.1,.2]],record_id:'record'};
  async function retry(payload,state) {
    saves.store(key,{payload,label:'test edition'});saves.track(key,'A','하이라이트','failed');
    const promise=c.listLegacyRecovery('A',api).find(r=>r.retry).retry();
    replies.shift().resolve(state);return promise;
  }
  assert.equal(await retry({highlight:mark},{last_page:3,highlights:[{...mark,page:4}]}),false);
  assert.equal(await retry({highlight:mark},{last_page:3,highlights:[{...mark,rects:[]}]}),false);
  assert.equal(await retry({highlight:mark},{last_page:3,highlights:[mark]}),true);
  assert.deepEqual(sent[0].body,sent[2].body);
  assert.equal(saves.read(key),null);
  const link={id:mark.id,record_id:'next'};
  assert.equal(await retry({link},{last_page:3,highlights:[mark]}),false);
  assert.equal(await retry({link},{last_page:3,highlights:[{...mark,record_id:link.record_id}]}),true);
  assert.equal(await retry({initial_page:1},{last_page:8,highlights:[]}),true);
  assert.deepEqual(JSON.parse(JSON.stringify(sent.at(-1).body)),{initial_page:1});
});
