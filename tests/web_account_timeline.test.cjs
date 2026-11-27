// Draft coverage for SPEC AC5 (task isolation) and AC6 (unknown metadata), Prompt 2.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const guestProject = JSON.stringify({name:'브라우저 과업', papers:[{id:'guest'}], storageRevision:4});
function workspace(account = true, entries = new Map([['researchtrail.v5', guestProject]]),
                   tab = new Map([['researchtrail.view', 'guest-view']])) {
  const reads = [], writes = [], tabWrites = [];
  function storage(map, log) {
    return {
      getItem(k) { reads.push(k); return map.get(k) ?? null; },
      setItem(k,v) { log.push(k); map.set(k,v); },
      removeItem(k) { log.push(k); map.delete(k); },
    };
  }
  const nodes = new Map();
  function node(key) {
    if (!nodes.has(key)) nodes.set(key, {
      style:{setProperty(){}}, dataset:{}, value:'', innerHTML:'', clientWidth:900, clientHeight:600,
      classList:{add(){},remove(){},toggle(){}}, getBoundingClientRect(){return {left:0,right:900,width:900,height:600};},
      setAttribute(){}, replaceChildren(){this.innerHTML='';}, insertAdjacentHTML(){},
      addEventListener(type,fn){ this[type]=fn; }, querySelector(){return null;},
      querySelectorAll(){return [];}, remove(){}, focus(){}, close(){this.open=false;}, showModal(){this.open=true;},
      isConnected:true, scrollLeft:0, scrollTop:0,
    });
    return nodes.get(key);
  }
  const c = vm.createContext({
    window:{name:'',addEventListener(type,fn){this[type]=fn;}}, location:{search:account?'?workspace=account':''}, URLSearchParams,
    document:{body:{appendChild(){}},querySelector:node, querySelectorAll:()=>[], getElementById:id=>id==='app'?node('#app'):null,
      addEventListener(){}, createElement:()=>node(Symbol())},
    localStorage:storage(entries,writes), sessionStorage:storage(tab,tabWrites),
    Option:function(label,value){this.text=label;this.value=value;},
    setTimeout, clearTimeout, screens:{main:'<div></div>'}, screensReady:Promise.resolve(),
  });
  for (const file of ['core','helpers','projects','frame','timeline','paper-list','timeline-mobile','main']) {
    vm.runInContext(fs.readFileSync('web/js/'+file+'.js','utf8'),c);
  }
  return {c, entries, tab, reads, writes, tabWrites, node};
}

test('account startup, view restoration and pagehide cannot read or overwrite guest projects', () => {
  const {c,entries,tab,reads,writes,tabWrites}=workspace();
  c.startResearchTrail();
  assert.equal(c.S.source,'account');
  c.S.papers=[{id:'계정 전용'}];
  c.save();
  c.window.pagehide();
  c.clearStore();
  assert.equal(c.load({restoreView:true}),false);
  assert.deepEqual(writes,[]);
  assert.deepEqual(tabWrites,[]);
  assert.ok(!reads.some(k=>['researchtrail.v5','researchtrail.projects','researchtrail.view','researchtrail.screen'].includes(k)));
  assert.equal(entries.get('researchtrail.v5'),guestProject);
  assert.equal(tab.get('researchtrail.view'),'guest-view');
});

test('a browser-local workspace still loads its project catalog and intentionally saves', () => {
  const {c,entries}=workspace(false);
  assert.equal(c.S.source,'browser-local');
  assert.ok(entries.has('researchtrail.projects'));
  c.D={};
  c.showMain=()=>{};
  assert.equal(c.load({restoreView:true}),true);
  assert.equal(c.S.name,'브라우저 과업');
  assert.equal(c.S.papers[0].id,'guest');
  c.S.name='브라우저 편집';
  c.S.papers[0].title='수정한 제목';
  assert.equal(c.save(),true);
  assert.equal(JSON.parse(entries.get('researchtrail.v5')).papers[0].title,'수정한 제목');
});

function paper(use,date,edition) {
  return {document_id:'shared-document',document_use_id:use,document:{title:'같은 제목'},
    use:{reading_state_text:'읽는 중',purpose_text:use},date,artifacts:[{artifact_id:edition,label_text:'논문.pdf'}]};
}

test('real account startup and views isolate projects, preserve edition IDs and show undated papers', async () => {
  const {c,writes,tabWrites,entries,tab,node}=workspace();
  const calls=[];
  const tasks=['a','b'].map(id=>({task_id:id,task:{goal_text:'과업 '+id}}));
  let readB;
  const get=(...args)=>{
    assert.equal(args.length,1);
    const [path]=args;
    calls.push(path);
    if(path==='/tasks')return {tasks};
    if(path==='/tasks/a/papers')return {papers:[paper('use1',null,'ed1'),paper('use2','2026-11-01','ed2')]};
    if(path==='/tasks/b/papers')return new Promise((resolve,reject)=>{readB={resolve,reject};});
    assert.fail(path);
  };
  await c.startAccountTimeline(get,{accountId:'user',projectUrl:'https://synthetic.invalid',current:()=>true});
  c.renderAll();
  const picker=node('#workspaceTask');
  const select=async id=>{picker.value=id;await picker.change();};
  assert.deepEqual(Array.from(c.S.papers,p=>[p.id,p.document_id,p.artifacts[0].artifact_id]),
    [['use1','shared-document','ed1'],['use2','shared-document','ed2']]);
  assert.equal(c.S.papers[0].date,null);
  assert.match(node('#undatedPapers').innerHTML,/날짜 미기록/);
  assert.match(node('#undatedPapers').innerHTML,/use1/);
  assert.match(node('#canvas').innerHTML,/use2/);
  assert.doesNotMatch(node('#canvas').innerHTML,/data-id="use1"/);
  c.setView('list');
  node('#paperListQuery').input({target:{value:'같은 제목'}});
  assert.match(node('#paperListRows').innerHTML,/use1/);
  assert.match(node('#paperListRows').innerHTML,/use2/);
  const listClick = (selector, dataset) => node('#paperList').click({target:{closest:s=>s===selector?{dataset}:null}});
  listClick('[data-list-paper]',{listPaper:'use1'});
  assert.match(node('#accountPaperDetail').innerHTML,/논문.pdf/);
  assert.equal(node('#accountPaperDetail').open,true);
  listClick('[data-list-state]',{listState:'done'});
  assert.doesNotMatch(node('#paperListRows').innerHTML,/data-list-paper/);
  listClick('[data-list-state]',{listState:'all'});
  c.setView('card');
  c.renderAll();
  c.setZoom('month');
  c.setZoom('all');
  c.window.resize();
  c.openAdd(null);
  assert.equal(c.S.panel,'none');
  c.window.pagehide();
  assert.deepEqual(tabWrites,[]);
  assert.deepEqual(calls,['/tasks','/tasks/a/papers']);
  const delayed=select('b');
  assert.equal(c.S.papers.length,0);
  assert.match(node('#workspaceStatus').textContent,/불러오는 중/);
  assert.equal(node('#accountPaperDetail').open,false);
  assert.equal(node('#accountPaperDetail').innerHTML,'');
  assert.doesNotMatch(node('#canvas').innerHTML+node('#paperList').innerHTML+node('#undatedPapers').innerHTML,/use[12]/);
  await select('a');
  readB.resolve({papers:[paper('late',null,'other')]});
  await delayed;
  assert.equal(c.S.papers.length,2);
  assert.equal(c.S.taskId,'a');
  const failed=select('b');
  readB.reject(new Error('synthetic'));
  await failed;
  assert.equal(c.S.papers.length,0);
  assert.match(node('#workspaceStatus').textContent,/불러오지 못/);
  const retry=node('#workspaceRetry').click();
  readB.resolve({papers:[]});await retry;
  assert.match(node('#workspaceStatus').textContent,/논문이 없/);
  assert.deepEqual(writes,[]);
  assert.equal(entries.get('researchtrail.v5'),guestProject);
  const preference='researchtrail.account.https://synthetic.invalid.user.task';
  assert.deepEqual(tabWrites,[preference,preference,preference]);
  const fresh=workspace(true,entries,tab);
  const reads=[];
  await fresh.c.startAccountTimeline(path=>{
    reads.push(path);
    return path==='/tasks'?{tasks}:{papers:[paper('fresh',null,'b-edition')]};
  },{accountId:'user',projectUrl:'https://synthetic.invalid',current:()=>true});
  assert.deepEqual(reads,['/tasks','/tasks/b/papers']);
  assert.match(fresh.node('#undatedPapers').innerHTML,/fresh/);
  assert.equal(fresh.node('#scroller').hidden,true);
  assert.deepEqual(fresh.writes,[]);
  assert.deepEqual(fresh.tabWrites,[]);
});

test('the mobile timeline retains the undated group and task-list failures can be retried to an empty account', async () => {
  const {c,node,writes,tabWrites}=workspace();
  c.MTL_MQ={matches:true};
  node('#scroller').parentNode={};
  const account={accountId:'user',projectUrl:'https://synthetic.invalid',current:()=>true};
  await c.startAccountTimeline(async path=>path==='/tasks'?{tasks:[{task_id:'a',task:{goal_text:'과업'}}]}:
    {papers:[paper('mobile',null,'edition')]},account);
  assert.match(node('#mtl').innerHTML,/날짜 미기록/);
  assert.match(node('#mtl').innerHTML,/data-mtl-paper="mobile"/);
  assert.equal(node('#canvas').innerHTML,'');
  assert.deepEqual(writes,[]);
  assert.deepEqual(tabWrites,[]);

  const other=workspace();
  let attempts=0;
  await other.c.startAccountTimeline(async path=>{
    assert.equal(path,'/tasks');
    if(++attempts===1)throw new Error('synthetic');
    return {tasks:[]};
  },account);
  assert.match(other.node('#workspaceStatus').textContent,/목록을 불러오지 못/);
  await other.node('#workspaceRetry').click();
  assert.match(other.node('#workspaceStatus').textContent,/계정 프로젝트가 없/);
  assert.equal(other.node('#workspaceTask').disabled,true);
  assert.deepEqual(other.writes,[]);
  assert.deepEqual(other.tabWrites,[]);
});

test('the account project link opens the authenticated read-only transport', async () => {
  const entry=fs.readFileSync('web/views/account-projects.html','utf8');
  const base=new URL(entry.match(/<base href="([^"]+)"/)[1],'https://site.invalid/views/account-projects.html');
  const href=entry.match(/href="([^"]+)" target="_top">타임라인 보기</)[1];
  const url=new URL(href,base);
  assert.equal(url.pathname,'/');
  const nodes=new Map(), requests=[];
  function element(){
    return {addEventListener(type,fn){this[type]=fn;},replaceChildren(){this.firstElementChild=null;},
      appendChild(el){this.firstElementChild=el;}};
  }
  for(const [,id] of fs.readFileSync('web/views/account.html','utf8').matchAll(/id="([^"]+)"/g))nodes.set(id,element());
  let notify, transport, session;
  const auth={onAuthStateChange(fn){notify=fn;},initialize:async()=>({})};
  const window={location:url,addEventListener(){},supabase:{createClient:()=>({auth})},
    RESEARCHTRAIL_CONFIG:{SUPABASE_URL:'https://synthetic.invalid',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'}};
  vm.runInNewContext(fs.readFileSync('web/js/account.js','utf8'),{window,URLSearchParams,AbortController,
    document:{getElementById:id=>nodes.get(id),createElement:element},
    fetch:async(url,init)=>{requests.push([url,init]);return Response.json({papers:[]});}});
  notify('INITIAL_SESSION',{user:{id:'a'},access_token:'synthetic-a'});
  const frame=nodes.get('authWorkspace').firstElementChild;
  assert.equal(frame.src,'browser.html?workspace=account');
  frame.contentWindow={startAccountTimeline(get,account){transport=get;session=account;}};
  frame.load();
  await transport('/tasks/a/papers',{unexpected:'쓰기 요청'});
  const [[endpoint,init]]=requests;
  assert.equal(endpoint,'https://synthetic.invalid/functions/v1/researchtrail/tasks/a/papers');
  assert.equal(init.method,'GET');
  assert.equal(init.body,undefined);
  assert.equal(init.headers.Authorization,'Bearer synthetic-a');
  notify('SIGNED_IN',{user:{id:'b'},access_token:'synthetic-b'});
  assert.equal(session.current(),false);
  await assert.rejects(transport('/tasks/a/papers'));
  assert.equal(requests.length,1);
});
