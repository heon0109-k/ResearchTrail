// Offline companion to the built Playwright case. Real control events and the authenticated
// transport reach the actual Edge handler. Only the browser surface/PDF viewport are simulated.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {chatEdge,owner,token,origin,task,use,edition,sibling,question} from './fixtures/product-chat-edge.mjs';
const source=name=>readFileSync('web/js/'+name+'.js','utf8');

class Control extends EventTarget {
  children=[];attrs={};dataset={};classList={toggle(){}};value='';textContent='';
  focus(){}
  setAttribute(k,v){this.attrs[k]=String(v);}
  get firstElementChild(){return this.children[0];}
  replaceChildren(...children){this.children=children;}
  appendChild(child){this.children.push(child);}
  closest(selector){return selector==='[data-chat-action]' && this.dataset.chatAction?this:null;}
  event(type,props={}) {
    const e=new Event(type,{bubbles:true,cancelable:true});
    for(const [k,v] of Object.entries(props))Object.defineProperty(e,k,{value:v});
    this.dispatchEvent(e);
    if(this.parent){const bubble=new Event(type,{bubbles:true,cancelable:true});
      for(const [k,v] of Object.entries({...props,target:this}))Object.defineProperty(bubble,k,{value:v});
      this.parent.dispatchEvent(bubble);}
  }
}
// Bind tests to controls actually emitted by the shared templates. A renamed,
// hidden or removed tab, input, depth choice or cite loses its event target.
class Surface extends Control {
  get innerHTML(){return this.html||'';}
  set innerHTML(html){
    this.html=html;this.children=[];
    for(const m of html.matchAll(/<(button|input|textarea|section|p)\b([^>]*)>/g)){
      const node=new Control();node.parent=this;
      for(const a of m[2].matchAll(/(?:^|\s)([\w-]+)(?:="([^"]*)")?/g)){
        const [,key,value='']=a;
        if(key.startsWith('data-'))node.dataset[key.slice(5).replace(/-(\w)/g,(_,c)=>c.toUpperCase())]=value;
        else if(['id','name','value'].includes(key))node[key]=value;
        else if(key==='checked'||key==='hidden'||key==='disabled')node[key]=true;
      }
      this.children.push(node);
    }
  }
  querySelector(s){return this.children.find(n=>'#'+n.id===s)||null;}
  control(test){const n=this.children.find(test);assert.ok(n,'control present in shared template');return n;}
}
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function until(fn){for(let i=0;i<400;i++){if(fn())return;await turn();}assert.fail('Timed out waiting for control or receipt.');}

async function accountTransport(backend) {
  let notify,account;
  const nodes=new Map(),doc={getElementById(k){if(!nodes.has(k))nodes.set(k,new Control());return nodes.get(k);},
    createElement(){const f=new Control();f.contentWindow={startAccountTimeline(_get,child){account=child;}};return f;}};
  const auth={initialize:async()=>({}),onAuthStateChange(fn){notify=fn;}};
  const window={location:{origin,search:'?code=synthetic'},RESEARCHTRAIL_CONFIG:{SUPABASE_URL:origin,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'},
    supabase:{createClient:()=>({auth})},performance:{getEntriesByType:()=>[]},addEventListener(){}};
  vm.runInNewContext(source('account'),{window,document:doc,URLSearchParams,AbortController,fetch:(url,init)=>backend.handle(new Request(url,init))});
  notify('SIGNED_IN',{user:{id:owner},access_token:token});
  doc.getElementById('authWorkspace').firstElementChild.event('load');
  await until(()=>account);
  return account;
}

test('the original question tab sends its real session and verified evidence returns to that edition and page',async()=>{
  const backend=chatEdge(),account=await accountTransport(backend);
  const paper=backend.papers[0],artifact=paper.artifacts.find(a=>a.artifact_id===edition);
  const bytes=await (await account.write('/tasks/'+task+'/artifacts/'+edition+'/pdf',null,{pdf:true})).arrayBuffer();
  const panels=new Surface(),box=new Surface(),history=[];
  const c=vm.createContext({crypto:globalThis.crypto,TextEncoder,structuredClone,Date,setTimeout,clearTimeout,document:{getElementById:()=>null},
    window:{matchMedia:()=>({matches:false})},location:{search:'?workspace=account'},fetch(){throw Error('Browser must not call a provider or local AI endpoint.');}});
  for(const file of ['core','reader','chat','account-pdfs','account-chat','workspace-store'])vm.runInContext(source(file),c);
  c.S.source='account';c.S.taskId=task;c.S.reader=use;paper.id=use;
  const store=c.createWorkspaceStore(account,()=>{});
  account.extra=(kind,id)=>store.read(task,kind,id).data;
  account.patchExtra=(kind,id,patch,opt)=>store.patch(task,kind,id,patch,opt);
  c.accountWorkspace=account;c.ChatRetrieval={CHUNKER:'pages-1600-320'};
  panels.innerHTML=c.readerPanelTabsHtml();assert.match(panels.innerHTML,/data-rtab="chat">질문하기</);
  const tabs=panels.children.filter(n=>n.dataset.rtab);
  c.$=s=>s==='#rChat'?box:box.querySelector(s);
  c.$$=s=>s==='[data-rtab]'?tabs:[];
  c.paperBy=id=>id===use?paper:null;c.PV={pid:use,cur:1,doc:{numPages:34,getData:async()=>bytes}};
  c.pvGo=page=>{history.push({id:artifact.artifact_id,page});c.PV.cur=page;};
  c.productAccountChatOpen(task,use,artifact,account,Promise.resolve());c.chatInit(paper);
  assert.equal(box.hidden,true);assert.equal(backend.calls.some(r=>r.host==='api.openai.com'),false);
  const tab=tabs.find(n=>n.dataset.rtab==='chat');tab.event('click');
  assert.equal(tab.attrs['aria-selected'],'true');assert.equal(box.hidden,false);
  await until(()=>box.querySelector('#chatConsent'));
  box.control(n=>n.id==='chatSaveKey').event('click');
  assert.match(box.querySelector('#chatMsg').textContent,/동의해 주세요/);
  assert.equal(backend.calls.some(r=>r.host==='api.openai.com'),false);
  box.control(n=>n.id==='chatConsent').checked=true;box.control(n=>n.id==='chatSaveKey').event('click');
  await until(()=>box.querySelector('#chatQ'));
  box.control(n=>n.name==='chatEffort'&&n.value==='medium').event('change');
  await until(()=>backend.metadata.artifacts[edition]?.data.qa.depth==='medium' && /value="medium" checked/.test(box.innerHTML));
  const input=box.control(n=>n.id==='chatQ');input.value=question;input.event('input');input.event('keydown',{key:'Enter'});
  await until(()=>box.children.some(n=>n.dataset.chatAction==='cite'));
  assert.match(box.innerHTML,/두 번째 쪽의 합성 답변/);
  box.control(n=>n.dataset.chatAction==='cite').event('click');
  await until(()=>history.length);
  assert.deepEqual(history,[{id:edition,page:2}]);assert.equal(c.PV.cur,2);
  backend.verify();
  // During a same-paper edition switch the detail panel can update the selected
  // edition before PDF.js replaces its document. An old completion must not save.
  const release=backend.pauseNextAnswer();
  const later=box.control(n=>n.id==='chatQ');later.value='지연된 질문';later.event('input');later.event('keydown',{key:'Enter'});
  await until(()=>backend.calls.filter(c=>c.name==='responses').length===2);
  paper.artifactId=sibling;release();
  await until(()=>backend.delivered.filter(path=>path.endsWith('/ask')).length===2);await turn();
  assert.equal(Object.keys(backend.metadata.artifacts[edition].data.qa.turns).length,1);
  assert.equal(backend.metadata.artifacts[sibling],undefined);
});
