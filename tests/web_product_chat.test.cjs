// Draft SPEC §4.2 and AC5. Exercise the original question tab with the signed-in transport.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {fixture}=require('./fixtures/account-chat-api.cjs');

class Tab extends EventTarget {
  innerHTML='';
  querySelector(){return null;}
  fire(type,target) {
    const event=new Event(type,{cancelable:true});
    Object.defineProperty(event,'target',{value:{closest(){return this;},dataset:{},...target}});
    this.dispatchEvent(event);
  }
  click(key,extra={}){this.fire('click',{dataset:{chatAction:key,...extra}});}
  async has(pattern) {
    for(let i=0;i<100;i++){if(pattern.test(this.innerHTML))return;await new Promise(r=>setTimeout(r,5));}
    assert.fail('Expected '+pattern);
  }
}
function reader(api,store) {
  const seen=[],paper=api.papers[0],edition=paper.artifacts[0],box=new Tab();
  const local=[];
  const env=vm.createContext({crypto:globalThis.crypto,TextEncoder,Date,setTimeout,document:{getElementById:()=>null},
    location:{search:'?workspace=account'},S:{source:'account'},ask:(_a,_b,_c,commit)=>commit(),
    localStorage:{getItem(k){local.push(k);return null;},setItem(k){local.push(k);}}});
  for(const file of ['core','chat','account-pdfs','account-chat'])vm.runInContext(fs.readFileSync('web/js/'+file+'.js','utf8'),env);
  env.S.taskId='A';env.S.reader='draft';
  env.accountWorkspace=store;
  env.window={matchMedia:()=>({matches:false})};
  let element=box;
  env.$=s=>s==='#rChat'?element:null;env.$$=()=>[];
  env.paperBy=()=>paper;
  env.ChatRetrieval={CHUNKER:'pages-1600-320'};
  env.PV={pid:'draft',cur:1,doc:{numPages:34,getData:async()=>api.files.draft}};
  env.pvGo=n=>{seen.push(n);};
  const account={...store,current:()=>true,write:(path,body)=>api.request(path,body)};
  env.productAccountChatOpen('A','draft',edition,account,Promise.resolve());
  const render=()=>env.chatSetTab('chat');
  return {box,render,seen,local,replace(){element=new Tab();render();return element;},close:()=>env.productAccountChatClose()};
}
test('the original signed-in composer retains the exact edition, retries only history storage and restores the confirmed conversation',async ()=>{
  const api=fixture(), saved={}, writes=[];
  api.indexes.draft=api.indexes.published;api.failAsk=false;
  let fail=true;
  const store={
    extra:(_type,id)=>saved[id],
    async patchExtra(type,id,patch,options){
      writes.push({type,id,requestId:options.request_id,patch:structuredClone(patch)});
      if(fail && patch.qa.turns){fail=false;throw Error('Synthetic write failure');}
      const qa=(saved[id]??={qa:{turns:{}}}).qa;
      if(patch.qa.depth)qa.depth=patch.qa.depth;
      for(const [k,turn] of Object.entries(patch.qa.turns||{})) {
        if(turn===null)delete qa.turns[k]; else qa.turns[k]=structuredClone(turn);
      }
    }
  };
  const a=reader(api,store);
  assert.equal(api.rag().length,0);
  a.render();await a.box.has(/동의/);a.box.click('consent');await a.box.has(/id="chatClip"/);
  for(const control of ['chatQ','chatEx','chatClip','chatSend','chatEffortValue'])assert.match(a.box.innerHTML,new RegExp('id="'+control+'"'));
  a.box.fire('change',{name:'chatEffort',value:'medium'});await a.box.has(/value="medium" checked/);
  a.box.fire('input',{id:'chatQ',value:'합성 질문'});a.box.click('send');
  await a.box.has(/대화 저장 다시 시도/);
  assert.equal(api.rag().filter(c=>c.path.endsWith('/ask')).length,1);
  a.box.click('retry-save');await a.box.has(/Draft passage 2/);
  const turns=writes.filter(w=>w.patch.qa.turns);
  assert.equal(turns.length,2);assert.deepEqual(turns[0],turns[1]);
  assert.ok(turns[0].requestId);assert.equal(turns[0].type,'artifact');assert.equal(turns[0].id,'draft');
  assert.equal(api.rag().filter(c=>c.path.endsWith('/ask')).length,1);
  const nextBox=a.replace();await nextBox.has(/Draft passage 2/);
  a.box.click('cite',{page:'2'});assert.deepEqual(a.seen,[]);
  nextBox.click('cite',{page:'2'});await new Promise(r=>setImmediate(r));assert.deepEqual(a.seen,[2]);
  a.close();
  const b=reader(api,store);
  b.render();await b.box.has(/동의/);b.box.click('consent');await b.box.has(/Draft passage 2/);
  assert.match(b.box.innerHTML,/value="medium" checked/);
  b.box.click('clear');await b.box.has(/class="chat-empty"/);
  assert.equal(Object.keys(saved.draft.qa.turns).length,0);
  assert.deepEqual([...a.local,...b.local],[]);
});
