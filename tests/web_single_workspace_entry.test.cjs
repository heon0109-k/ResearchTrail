// Draft AC5/AC7. Exercise the shipped Auth shell and its product/guest routes.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const template=fs.readFileSync('web/views/account.html','utf8');
const authScript=fs.readFileSync('web/js/account.js','utf8');
const config={SUPABASE_URL:'https://fixture.invalid',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};

function page({search='',reload=false,tab=new Map()}={}) {
  function node(){
    return {children:[],hidden:true,contentWindow:{},get firstElementChild(){return this.children[0];},
      addEventListener(type,fn){this[type]=fn;},appendChild(e){this.children.push(e);},replaceChildren(){this.children=[];}};
  }
  const elements=Object.fromEntries([...template.matchAll(/id="([^"]+)"/g)].map(match=>[match[1],node()]));
  const requests=[],navigations=[],auth={initialize:async()=>({}),onAuthStateChange(fn){this.notify=fn;},
    async signOut(){this.notify('SIGNED_OUT',null);return {};}};
  const win={addEventListener(){},performance:{getEntriesByType:()=>[{type:reload?'reload':'navigate'}]},
    location:{origin:'https://site.invalid',search,replace:url=>navigations.push(url)},
    RESEARCHTRAIL_CONFIG:config,supabase:{createClient:()=>({auth})},
    sessionStorage:{getItem:k=>tab.get(k),removeItem:k=>tab.delete(k)}};
  const document={getElementById:k=>elements[k],createElement:node};
  vm.runInNewContext(authScript,{window:win,document,URLSearchParams,AbortController,
    fetch:async(url,options)=>{requests.push({url,options});return Response.json({tasks:[]});}});
  const event=(type,id,token=id)=>auth.notify(type,id?{user:{id},access_token:token}:null);
  const frame=()=>elements.authWorkspace.firstElementChild;
  async function mount(fail=false){
    const f=frame();let api;
    f.contentWindow.startAccountTimeline=async(get,transport)=>{
      api=transport;
      if(fail)throw Error('synthetic load failure');
      await get('/tasks?view=workspace');
    };
    await f.load();
    return api;
  }
  return {elements,event,frame,mount,requests,navigations};
}

test('verified callback and refresh ignore the old device-mode flag and mount only the signed-in product',async()=>{
  const legacy='researchtrail.deviceView.'+config.SUPABASE_URL;
  const tab=new Map([[legacy,'A'],['researchtrail.account.'+config.SUPABASE_URL+'.A.task','"saved"']]);
  for(const setup of [{search:'?code=fake&demo=1'},{reload:true}]){
    const p=page({...setup,tab});
    p.event('SIGNED_IN','A','access-A');
    p.event('INITIAL_SESSION',null);
    assert.equal(p.frame().src,'browser.html?workspace=account');
    assert.equal(p.elements.authMode.textContent,'계정에 저장');
    assert.equal(p.elements.authRetry.hidden,true);
    assert.equal(p.elements.authOpenLocal,undefined);
    assert.equal(p.elements.authBack,undefined);
    const mounted=p.frame();
    const api=await p.mount();
    assert.equal(p.requests.length,1);
    assert.equal(p.requests[0].options.headers.Authorization,'Bearer access-A');
    p.event('TOKEN_REFRESHED','A','updated-A');
    assert.equal(p.frame(),mounted);
    await api.write('/tasks?view=workspace');
    assert.equal(p.requests[1].options.headers.Authorization,'Bearer updated-A');
    assert.deepEqual(p.navigations,[]);
  }
});
test('auth-scoped retry remounts the product; switching accounts invalidates the old transport and logout opens device work',async()=>{
  const p=page();
  p.event('INITIAL_SESSION','A');
  await p.mount(true);
  assert.equal(p.elements.authRetry.hidden,false);
  assert.equal(p.frame(),undefined);
  p.elements.authRetry.click();
  const a=await p.mount();
  assert.equal(p.frame().src,'browser.html?workspace=account');
  p.event('SIGNED_IN','B');
  assert.equal(a.current(),false);
  await assert.rejects(a.write('/tasks'),/계정이 변경/);
  assert.equal((await p.mount()).accountId,'B');
  await p.elements.authLogout.click();
  assert.equal(p.frame().src,'browser.html');
  assert.equal(p.elements.authMode.textContent,'이 브라우저에만 저장');
  assert.equal(p.elements.authIdentity.textContent,'');
});
test('historical account bookmarks route to the canonical root inside a subpath and preserve callback parameters',()=>{
  const html=fs.readFileSync('web/views/site-root.html','utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  for(const filename of ['account.html','account-projects.html']){
    const origin='https://example.invalid',url=new URL(origin+'/site/views/'+filename+'?code=synthetic#callback');
    const nav=[],win={top:{location:{origin,replace:href=>nav.push(href)}}};
    vm.runInNewContext(script,{window:win,location:url,URL});
    assert.deepEqual(nav,[origin+'/site/?code=synthetic#callback']);
  }
});
test('direct configured product bookmarks enter Auth before reading device projects; explicit example exits return to root',()=>{
  const code=fs.readFileSync('web/js/core.js','utf8');
  for(const [search,expected] of [['?workspace=account','./?workspace=account#p'],['','./#p'],['?sample=1','./'],['?demo=1','./']]){
    const location=new URL('https://example.invalid/site/browser.html'+search+'#p'),nav=[];
    location.replace=value=>nav.push(value);location.assign=value=>nav.push(value);
    const window={RESEARCHTRAIL_CONFIG:config,location};window.top=window;
    const reads=[],localStorage={getItem:key=>{reads.push(key);return null;}};
    const c=vm.createContext({location,window,localStorage,document:{getElementById(){},addEventListener(){}},URLSearchParams});
    vm.runInContext(code,c);
    if(search.includes('=1'))assert.equal(c.returnFromStandaloneExample(),true);
    assert.deepEqual(nav,[expected]);assert.equal(reads.includes('researchtrail.me'),false);
  }
});
