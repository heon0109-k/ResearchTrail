// Draft for SPEC AC5 and AC7. Exercise the root document with synthetic Auth events.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('web/js/account.js', 'utf8');
const template = fs.readFileSync('web/views/account.html', 'utf8');
const accountUrl = 'browser.html?workspace=account';
function element() {
  return {children:[], hidden:true, contentWindow:{},
    get firstElementChild() { return this.children[0]; },
    addEventListener(type, fn) { this[type] = fn; },
    replaceChildren(...children) { this.children = children; },
    appendChild(el) { this.children.push(el); }};
}
function page({local = new Map(), tab = new Map(), reload = false, search = ''} = {}) {
  const nodes = Object.fromEntries([...template.matchAll(/id="([^"]+)"/g)].map(m => [m[1], element()]));
  const requests = [], authCalls = [];
  const auth = {initialize:async () => ({}), onAuthStateChange(fn) { this.event = fn; },
    signOut:async () => { authCalls.push('logout'); auth.event('SIGNED_OUT', null); return {}; },
    signInWithOAuth:async args => { authCalls.push(args); return {data:{url:'https://example.invalid/oauth'}}; }};
  const storage = map => ({getItem:k => map.get(k) ?? null, setItem:(k,v) => map.set(k,v), removeItem:k => map.delete(k)});
  const window = {addEventListener(){}, location:{search,origin:'https://reader.invalid',assign(){}}, history:{replaceState(){}},
    performance:{getEntriesByType:() => [{type:reload?'reload':'navigate'}]}, setTimeout,
    localStorage:storage(local), sessionStorage:storage(tab), supabase:{createClient:() => ({auth})},
    RESEARCHTRAIL_CONFIG:{SUPABASE_URL:'https://service.invalid',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'}};
  let respond = async () => Response.json({});
  vm.runInNewContext(source, {window, document:{getElementById:id => nodes[id], createElement:element},
    fetch:(url,options) => {requests.push({url,options}); return respond();}, URLSearchParams, AbortController, setTimeout});
  const frame = () => nodes.authWorkspace.firstElementChild;
  const event = (type,id,token) => auth.event(type, id ? {user:{id},access_token:token} : null);
  function timeline(start) {
    const el=frame();
    assert.equal(el?.src, accountUrl);
    let api;
    el.contentWindow.startAccountTimeline = (get,account) => { api = {get,...account}; return start?.(get,account); };
    el.load();
    return api;
  }
  return {nodes, frame, event, timeline, requests, authCalls, local, tab, reply:fn => {respond=fn;}};
}

test('authenticated callback and refresh use the shared transport; logout and account changes invalidate old frames', async () => {
  const p = page({search:'?code=synthetic'});
  p.event('SIGNED_IN','A','one');
  p.event('INITIAL_SESSION',null);
  const a = p.timeline(), first=p.frame();
  assert.doesNotMatch(template,/계정 프로젝트 열기/);
  assert.equal(p.nodes.authOpenLocal.hidden,false);
  p.event('TOKEN_REFRESHED','A','two');
  assert.equal(p.frame(),first);
  const bytes = new File(['synthetic'],'fixture.pdf',{type:'application/pdf'});
  await a.write('/tasks/X/papers/P/pdf',bytes,{pdf:true,artifactId:'edition'});
  assert.equal(p.requests[0].options.body,bytes);
  assert.equal(p.requests[0].options.headers.Authorization,'Bearer two');
  assert.equal(p.requests[0].options.headers['X-PDF-Artifact'],'edition');
  p.reply(async () => new Response(bytes));
  assert.equal(await (await a.write('/tasks/X/artifacts/edition/pdf',null,{pdf:true})).text(),'synthetic');
  let release;
  p.reply(() => new Promise(resolve => {release=resolve;}));
  const old = a.get('/tasks/X/papers');
  p.event('SIGNED_IN','B','three');
  p.timeline();
  release(Response.json({papers:['old']}));
  await assert.rejects(old);
  assert.equal(p.requests.at(-1).options.signal.aborted,true);
  p.event('TOKEN_REFRESHED','A','stale');
  assert.equal(p.nodes.authIdentity.textContent,'B');
  await p.nodes.authLogout.click();
  assert.equal(p.frame().src,'browser.html');
  assert.equal(p.nodes.authIdentity.textContent,'');
  assert.equal(p.nodes.authBack.hidden,true);
});

test('explicit device work survives refresh and only its owner can return to that mode', () => {
  const local = new Map([['researchtrail.v5','device work']]), tab = new Map();
  const a = page({local,tab});
  a.event('INITIAL_SESSION','A','one');
  const old=a.timeline();
  a.nodes.authOpenLocal.click();
  assert.equal(old.current(),false);
  assert.equal(a.frame().src,'browser.html');
  assert.match(a.nodes.authMode.textContent,/이 브라우저/);
  const refreshed=page({local,tab,reload:true});
  refreshed.event('INITIAL_SESSION','A','two');
  assert.equal(refreshed.frame().src,'browser.html');
  refreshed.nodes.authBack.click();
  refreshed.timeline();
  refreshed.nodes.authOpenLocal.click();
  refreshed.event('SIGNED_IN','B','three');
  refreshed.timeline();
  assert.equal(local.get('researchtrail.v5'),'device work');
  assert.equal(a.requests.length+refreshed.requests.length,0);
});

test('a session that receives its bearer later can open the timeline; a failed mount can retry', () => {
  const p=page();
  p.event('INITIAL_SESSION','A');
  assert.equal(p.frame(),undefined);
  p.event('TOKEN_REFRESHED','A','one');
  assert.equal(p.frame()?.src,accountUrl);
  p.frame().load();
  assert.match(p.nodes.authMessage.textContent,/다시/);
  assert.equal(p.nodes.authBack.hidden,false);
  p.nodes.authBack.click();
  assert.ok(p.timeline().current());
});

test('switch-account entry signs out locally and requests the Google account chooser', async () => {
  const p=page({search:'?switch=1'});
  p.event('INITIAL_SESSION','A','one');
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(p.authCalls[0],'logout');
  assert.equal(p.authCalls[1].options.queryParams.prompt,'select_account');
  assert.equal(p.authCalls[1].options.redirectTo,'https://reader.invalid/');
  assert.equal(p.requests.length,0);
});

// Mount the real picker and its change/reload handlers through the root's authenticated transport.
// DOM drawing and the PDF editor have their own controller and built-browser suites.
async function mountPicker(p,catalog) {
  const nodes = new Map(), calls=[];
  function node(key) {
    if(!nodes.has(key)) nodes.set(key,{...element(),classList:{add(){}},close(){},remove(){},insertAdjacentHTML(){}});
    return nodes.get(key);
  }
  const state={source:'account'};
  const context=vm.createContext({S:state,screensReady:Promise.resolve(),app:{},screens:{main:''},
    $:node,$$:()=>[],wireDots(){},wireScroller(){},wireMinimap(){},wirePaperList(){},relayoutDots(){},
    createAccountGraphWorkspace:()=>({reset(){},projects(){}}), renderAll(){},
    Option:function(text,value){Object.assign(this,{text,value});},
    sessionStorage:{getItem:k=>p.tab.get(k)??null,setItem:(k,v)=>p.tab.set(k,v)},LIST_STATE:'',listSort:''});
  vm.runInContext(fs.readFileSync('web/js/main.js','utf8'),context);
  p.reply(()=>{
    const {url,options}=p.requests.at(-1);
    assert.equal(options.method,'GET');
    const path=new URL(url).pathname.replace('/functions/v1/researchtrail','');
    calls.push(path);
    return Response.json(path==='/tasks'?{tasks:catalog.map(id=>({task_id:id,task:{goal_text:id}}))}:
      path.endsWith('/papers')?{papers:[]}:{links:[]});
  });
  let ready;
  const api=p.timeline((get,account)=>{ready=context.startAccountTimeline(get,account);});
  await ready;
  const picker=node('#workspaceTask');
  return {calls,api,picker,status:node('#workspaceStatus'),create:node('#workspaceNew'),
    change:id=>{picker.value=id; return picker.change();}};
}
test('each account restores only its eligible selection in this tab and independently handles empty and revoked projects',async () => {
  const key='researchtrail.account.https://service.invalid.A.task';
  const local=new Map([['researchtrail.v5','device data']]), tab=new Map([[key,JSON.stringify('old')]]);
  const first=page({local,tab});
  first.event('INITIAL_SESSION','A','one');
  const a=await mountPicker(first,['first','old','chosen']);
  assert.equal(a.picker.value,'old');
  await a.change('chosen');
  assert.equal(JSON.parse(tab.get(key)),'chosen');
  const independent=page({local});
  independent.event('INITIAL_SESSION','A','another-token');
  const otherTab=await mountPicker(independent,['first','chosen']);
  assert.equal(otherTab.picker.value,'first');
  assert.equal(JSON.parse(independent.tab.get(key)),'first');
  assert.equal(local.has(key),false);
  const fresh=page({local,tab,reload:true});
  fresh.event('INITIAL_SESSION','A','new-token');
  const copy=await mountPicker(fresh,['first','chosen']);
  assert.equal(copy.picker.value,'chosen');
  assert.deepEqual(copy.calls,['/tasks','/tasks/chosen/papers','/tasks/chosen/paper-links']);
  fresh.event('SIGNED_IN','B','other');
  const empty=await mountPicker(fresh,[]);
  assert.match(empty.status.textContent,/새 프로젝트/);
  assert.equal(empty.create.disabled,false);
  assert.deepEqual(empty.calls,['/tasks']);
  await copy.change('first');
  assert.equal(JSON.parse(tab.get(key)),'chosen');
  fresh.event('SIGNED_IN','A','back');
  const revoked=await mountPicker(fresh,['first']);
  assert.equal(revoked.picker.value,'first');
  assert.equal(JSON.parse(tab.get(key)),'first');
  assert.deepEqual(revoked.calls,['/tasks','/tasks/first/papers','/tasks/first/paper-links']);
  assert.equal(local.get('researchtrail.v5'),'device data');
});

test('the guest landing exposes the example and device work and delegates Google login to the root', () => {
  const html=fs.readFileSync('web/views/landing.html','utf8');
  function landing(configured,saved) {
    const calls=[];
    const buttons=[...html.matchAll(/<button [^>]*data-lp="([^"]+)"/g)].map(([,lp])=>
      ({...element(),dataset:{lp},classList:{add(){}}}));
    const elements=new Map();
    const localStorage={getItem:()=>saved?JSON.stringify({papers:[],name:'기기 과업'}):null,setItem(){}};
    const window={addEventListener(){},parent:{document:{getElementById:id=>id==='authLogin'?
      {id,click:()=>calls.push('login')}:null}},RESEARCHTRAIL_CONFIG:{SUPABASE_URL:configured?'https://service.invalid':''}};
    const c=vm.createContext({window,app:{},screens:{landing:html},localStorage,sessionStorage:{setItem(){}},
      S:{papers:[]},KEY:'researchtrail.v5',curChar:()=>({}),spr:()=>'',
      $:s=>{
        if(s==='iframe[data-demo]' || s==='#lpPath') return null;
        if(!elements.has(s)) elements.set(s,element());
        return elements.get(s);
      },
      $$:s=>s==='[data-lp]'?buttons:buttons.filter(b=>s==='[data-lp="'+b.dataset.lp+'"]'),
      loadSample:()=>calls.push('example'),load:()=>{calls.push('device');return saved;},
      startEmpty:()=>calls.push('new'),firstRunTour:()=>{}});
    vm.runInContext(fs.readFileSync('web/js/landing.js','utf8')+'\nshowLanding()',c);
    return {button:name=>buttons.find(b=>b.dataset.lp===name),calls};
  }
  const guest=landing(false,false);
  assert.equal(guest.button('google').hidden,true);
  guest.button('sample').click();
  assert.deepEqual(guest.calls,['example']);
  guest.button('start').click();
  assert.deepEqual(guest.calls,['example','device','new']);
  const returning=landing(true,true);
  assert.equal(returning.button('google').hidden,false);
  assert.match(returning.button('start').textContent,/이 브라우저에 저장한 작업/);
  returning.button('start').click();
  returning.button('google').click();
  assert.deepEqual(returning.calls,['device','login']);
});

test('the shipped SDK exchanges a PKCE callback at the root and leaves device work intact',async t=>{
  const config={SUPABASE_URL:'https://service.invalid',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
  const store=new Map([['researchtrail.v5','device work'],['sb-service-auth-token-code-verifier',JSON.stringify('fixture-verifier')]]);
  const storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  const nodes=Object.fromEntries([...template.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,element()]));
  const requests=[];
  const window={
    URL,URLSearchParams,Headers,Request,Response,AbortController,TextEncoder,TextDecoder,
    atob,btoa,setTimeout,clearTimeout,setInterval,clearInterval,crypto:require('node:crypto').webcrypto,WebSocket,
    RESEARCHTRAIL_CONFIG:config, location:new URL('https://reader.invalid/?code=fixture'),
    history:{replaceState(_a,_b,url){window.location=new URL(url,window.location);}},
    localStorage:storage,document:{getElementById:id=>nodes[id],createElement:element,visibilityState:'hidden'},
    addEventListener(){},removeEventListener(){},navigator:{},
    async fetch(url,options){
      requests.push({url,body:JSON.parse(options.body)});
      return Response.json({user:{id:'fixture'},access_token:'synthetic-access',refresh_token:'synthetic-refresh',
        token_type:'bearer',expires_in:3600});
    },
  };
  window.window=window;
  const c=vm.createContext(window);
  vm.runInContext(fs.readFileSync('node_modules/@supabase/supabase-js/dist/umd/supabase.js','utf8'),c);
  let client;
  const sdk=window.supabase;
  window.supabase={createClient(...args){client=sdk.createClient(...args);return client;}};
  vm.runInContext(source,c);
  assert.ok(client,'the root created the real SDK client');
  t.after(()=>client.auth.dispose());
  const init=await client.auth.initialize();
  assert.equal(init.error,null);
  await new Promise(resolve=>{client.auth.onAuthStateChange(event=>{if(event==='INITIAL_SESSION')resolve();});});
  assert.deepEqual(requests,[{url:'https://service.invalid/auth/v1/token?grant_type=pkce',
    body:{auth_code:'fixture',code_verifier:'fixture-verifier'}}]);
  assert.equal(window.location.search,'');
  assert.equal(nodes.authWorkspace.firstElementChild.src,accountUrl);
  assert.equal(store.get('researchtrail.v5'),'device work');
});

test('the standalone device login intent is consumed even if the root already has a session',async () => {
  const p=page({search:'?login=1'});
  p.event('INITIAL_SESSION','A','one');
  p.timeline();
  await p.nodes.authLogout.click();
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.deepEqual(p.authCalls,['logout']);
  assert.equal(p.frame().src,'browser.html');
});
