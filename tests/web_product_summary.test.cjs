// Draft AC4/AC7. Account summary uses the same source controls and requires explicit action confirmation.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('account note organization uses recorded evidence, persists on the edition and makes no development-server request',async ()=>{
  let calls=0, release;
  const paper={id:'paper',artifactId:'edition',hl:[{id:'h',mine:'다음엔 표 1을 다시 읽기',page:2}]};
  const committed=new Promise(r=>{release=r;});
  const writes=[];
  const env=vm.createContext({S:{source:'account',taskId:'task',reader:'paper'},Date,crypto:globalThis.crypto,
    localStorage:{getItem(){throw Error('guest storage');}},fetch(){calls++;throw Error('network');},
    accountWorkspace:{extra:()=>({memoSummaryEnabled:true}),patchExtra:(target,id,patch)=>{writes.push({target,id,patch});return committed;}},
    $:()=>null, setTimeout, clearTimeout});
  for(const name of ['ai-stub','ai-summary'])vm.runInContext(fs.readFileSync('web/js/'+name+'.js','utf8'),env);
  env.aiRun(paper,true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(writes.length,1);
  assert.equal(writes[0].target,'artifact');
  assert.equal(writes[0].id,'edition');
  assert.equal(writes[0].patch.memoSummary.next.sources[0],'h');
  assert.equal(paper.aiSum,undefined);
  release();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(paper.aiSum.model,'규칙 기반');
  assert.equal(paper.todo,undefined);
  assert.equal(calls,0);
});

test('checking the original consent starts the authenticated model, and retrying the summary save reuses its receipt without asking again',async()=>{
  const paper={id:'paper',artifactId:'edition',hl:[{id:'h',record_id:'canonical',latestRecordId:'v2',mine:'표 2 확인하기',savedMemo:'표 2 확인하기'}]};
  const config={},writes=[],requests=[],elements={};
  const release=[];
  function el() {
    const target=new EventTarget();target.textContent='';target.checked=false;
    return target;
  }
  for(const id of ['aiSave','aiMsg','aiConsent'])elements[id]=el();
  const account={accountId:'owner',extra:(target)=>target==='project'?config:{},current:()=>true,
    async patchExtra(target,id,patch,options){
      if(target==='project'){Object.assign(config,patch);return {data:config};}
      writes.push({target,id,patch,request:options.request_id});return new Promise((ok,no)=>release.push({ok,no}));
    },
    async write(path,body){
      requests.push({path,body});return {model:'answer-model',done:[],open:[],next:{text:'표 2 확인하기',sources:['v2']}};
    }};
  const env=vm.createContext({S:{source:'account',taskId:'task',reader:'paper'},accountWorkspace:account,crypto:globalThis.crypto,
    $:s=>elements[s.slice(1)]||null,fetch(){throw Error('dev backend used');},setTimeout,clearTimeout});
  for(const name of ['ai-stub','ai-summary'])vm.runInContext(fs.readFileSync('web/js/'+name+'.js','utf8'),env);
  assert.match(env.aiSetupHtml(env.aiCfg()),/type="checkbox" id="aiConsent"/);
  env.aiWireSetup(paper);elements.aiSave.dispatchEvent(new Event('click'));await new Promise(r=>setImmediate(r));
  assert.equal(config.memoSummaryConsent,undefined);assert.equal(requests.length,0);
  elements.aiConsent.checked=true;elements.aiSave.dispatchEvent(new Event('click'));await new Promise(r=>setImmediate(r));
  assert.equal(config.memoSummaryConsent,'openai-v1');assert.equal(requests.length,1);
  assert.equal(requests[0].path,'/tasks/task/papers/paper/memo-summary');
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0].body)),{consent:true,artifact_id:'edition',record_ids:['v2']});
  assert.equal(writes[0].patch.memoSummary.next.sources[0],'h');assert.equal(paper.aiSum,undefined);
  release.shift().no(Error('lost receipt'));await new Promise(r=>setImmediate(r));
  const retry=env.aiRun(paper,true);await new Promise(r=>setImmediate(r));
  assert.equal(requests.length,1);assert.deepEqual(writes[1],writes[0]);
  release.shift().ok();await retry;
  assert.equal(paper.aiSum.model,'answer-model');assert.equal(paper.todo,undefined);
  paper.hl[0].mine='unsaved edit';
  await env.aiRun(paper,true);assert.equal(requests.length,1);
});

test('a reloaded reader can finish a prior model-result write and another client reopens it without a paid request',async()=>{
  const project={memoSummaryEnabled:true,memoSummaryConsent:'openai-v1'};
  let paid=0,confirmed,pending;
  function open(){
    const p={id:'p',artifactId:'a',hl:[{id:'h',mine:'saved',savedMemo:'saved',latestRecordId:'r'}]};
    const c=vm.createContext({S:{source:'account',taskId:'t',reader:'p'},crypto:globalThis.crypto,
      $:()=>null,setTimeout,clearTimeout,accountWorkspace:{accountId:'owner',current:()=>true,
        extra:target=>target==='project'?project:{memoSummary:confirmed},
        pendingSummary:()=>pending,async write(){paid++;throw Error('unexpected detail generation');},
        async patchExtra(target,id,patch,opt){assert.equal(target,'artifact');assert.equal(id,'a');
          assert.equal(opt.request_id,'stable-write');confirmed=patch.memoSummary;pending=null;}
      }});
    vm.runInContext(fs.readFileSync('web/js/ai-summary.js','utf8'),c);
    return {p,c};
  }
  const a=open(),hash=a.c.aiHash(a.c.aiSources(a.p),'');
  pending={id:'stable-write',edit:{patch:{memoSummary:{model:'answer-model',provider:'openai',hash,done:[],open:[],next:null}}}};
  await a.c.aiRun(a.p,false);assert.equal(a.c.AI_RT.st,'error');assert.equal(confirmed,undefined);
  await a.c.aiRun(a.p,true);assert.equal(confirmed.hash,hash);
  const b=open();b.c.aiInit(b.p);clearTimeout(b.c.AI_RT.timer);
  await b.c.aiRun(b.p,false);assert.equal(b.p.aiSum.model,'answer-model');assert.equal(paid,0);
});
test('switching edition before the provider returns cannot apply or persist the prior result',async()=>{
  const paper={id:'p',artifactId:'one',hl:[{id:'h',mine:'note',savedMemo:'note',record_id:'r'}]};
  let reply,writes=0;
  const c=vm.createContext({S:{source:'account',taskId:'t',reader:'p'},$:(s)=>null,
    accountWorkspace:{extra:()=>({memoSummaryEnabled:true,memoSummaryConsent:'openai-v1'}),
      current:()=>true,write:()=>new Promise(r=>{reply=r;}),patchExtra(){writes++;}}});
  vm.runInContext(fs.readFileSync('web/js/ai-summary.js','utf8'),c);
  const first=c.aiRun(paper,true);
  paper.artifactId='two';reply({done:[],open:[],next:{text:'candidate',sources:['r']}});
  await first;assert.equal(writes,0);assert.equal(paper.aiSum,undefined);
});
