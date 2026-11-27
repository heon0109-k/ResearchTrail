const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');

function workspace(api) {
  const nodes = new Map();
  const localWrites = [];
  function element(id) {
    const node = { id, value:'', textContent:'', hidden:false, disabled:false, isConnected:true, style:{},
      focus(){}, setAttribute(){}, getBoundingClientRect:()=>({left:0,bottom:10}),
      remove(){this.isConnected=false;nodes.delete(this.id);},
      addEventListener(event, fn){this[event]=fn;},
      set innerHTML(html) {
        this.html=html;
        for (const match of html.matchAll(/id="([^"]+)"/g)) element(match[1]);
      },
    };
    nodes.set(id,node);
    return node;
  }
  const html = fs.readFileSync('web/views/account-projects.html','utf8');
  for (const m of html.matchAll(/id="([^"]+)"/g)) element(m[1]);
  const context = { document:{getElementById:id=>nodes.get(id), querySelector:s=>nodes.get(s.slice(1)),
      createElement:()=>element(''), body:{appendChild:node=>nodes.set(node.id,node)}},
    localStorage:{getItem:()=>null, setItem:(...args)=>localWrites.push(args)},
    window:{}, crypto:{randomUUID}, URL, setTimeout };
  vm.createContext(context);
  for (const file of ['core','import','projects','panel','account-projects']) {
    vm.runInContext(fs.readFileSync('web/js/'+file+'.js','utf8'),context);
  }
  return {nodes, context, localWrites, start:() => context.startAccountProjects(api)};
}

const t1='11111111-0000-4000-8000-000000000001',t2='22222222-0000-4000-8000-000000000002';
test('project selector and add-paper form use the chosen account task and keep failed input for retry', async () => {
  const calls=[];
  let fail=true;
  const {nodes,context,localWrites,start}=workspace(async(path,body)=>{
    calls.push([path,body]);
    if(path==='/tasks') return body ? {task_id:t2, task:{goal_text:body.goal_text}} : {tasks:[{task_id:t1,task:{goal_text:'첫 과업'}}]};
    if(path==='/documents') return {documents:[]};
    if(!body) return {papers:[]};
    if(fail) throw new Error('등록을 다시 시도해 주세요.');
    return {document_use_id:'new-use'};
  });
  await start();
  assert.match(context.projMenuHtml(),/첫 과업/);
  assert.doesNotMatch(context.projMenuHtml(),/data-pj-sample|data-pj-del|data-pj-more/);
  nodes.get('tName').click();
  const menu=nodes.get('pjm');
  menu.click({target:{closest:selector=>selector==='[data-pj-new]' ? {} : null}});
  const input=nodes.get('pjmNew');
  input.value='둘째 과업';
  input.keydown({key:'Enter',preventDefault(){}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(context.projMenuHtml(),/둘째 과업/);
  await nodes.get('addBtn').click();
  nodes.get('aTitle').value='합성 논문';
  nodes.get('aDate').value='2026-11-01';
  nodes.get('aState').value='reading';
  nodes.get('aMemo').value='재현 비교';
  nodes.get('aSrc').value='https://example.invalid/version2';
  nodes.get('aFile').files=[{name:'fixture.pdf'}];
  const form=nodes.get('addForm');
  await form.submit({preventDefault(){}});
  assert.equal(nodes.get('aTitle').value,'합성 논문');
  assert.equal(nodes.get('aErr').hidden,false);
  fail=false;
  await form.submit({preventDefault(){}});
  const writes=calls.filter(([path,body])=>body&&path.endsWith('/papers'));
  assert.equal(writes.length,2);
  assert.equal(writes[0][0],'/tasks/'+t2+'/papers');
  assert.equal(writes[1][1].request_id,writes[0][1].request_id);
  const {document,use,artifacts}=writes[1][1];
  assert.equal(document.title,'합성 논문');
  assert.equal(use.purpose_text,'재현 비교');
  assert.equal(use.reading_state_text,'읽는 중');
  assert.deepEqual(JSON.parse(JSON.stringify(artifacts)),[{access_locator_text:'https://example.invalid/version2'},{label_text:'fixture.pdf'}]);
  assert.deepEqual(localWrites,[]);
});

test('a delayed paper list cannot repopulate a different selected task', async () => {
  let finish;
  const {context,nodes,start}=workspace(async path=>{
    if(path==='/tasks') return {tasks:[t1,t2].map(task_id=>({task_id,task:{goal_text:task_id}}))};
    if(path==='/tasks/'+t1+'/papers') return new Promise(r=>finish=r);
    return {papers:[]};
  });
  const pending=start();
  while(!finish) await Promise.resolve();
  await context.projAccountMenu.select(t2);
  finish({papers:[{document:{title:'stale'},use:{},artifacts:[]}]});
  await pending;
  assert.equal(nodes.get('tName').textContent,t2);
  assert.ok(!nodes.get('accountPapers').html?.includes('stale'));
});

test('the account frame binds writes to the current bearer and discards a previous account response', async () => {
  const nodes = Object.fromEntries([...fs.readFileSync('web/views/account.html','utf8').matchAll(/id="([^"]+)"/g)]
    .map(m => [m[1], { addEventListener(type, fn) {this[type]=fn;} }]));
  const workspace = nodes.authWorkspace;
  workspace.replaceChildren = () => { workspace.firstElementChild=null; };
  workspace.appendChild = frame => { workspace.firstElementChild=frame; };
  const document = {getElementById:id=>nodes[id], createElement:()=>({
    addEventListener(type,fn){this[type]=fn;},contentWindow:{startAccountProjects(request){this.request=request;}},
  })};
  let notify;
  const auth = { initialize:async()=>({}), onAuthStateChange(fn){notify=fn;} };
  const window = {location:{search:''}, addEventListener(){},
    RESEARCHTRAIL_CONFIG:{SUPABASE_URL:'https://project.example.invalid',SUPABASE_PUBLISHABLE_KEY:'test-publishable'},
    supabase:{createClient:()=>({auth})}};
  const sent=[];
  const transport=(url,options) => new Promise(resolve=>sent.push({url,options,resolve}));
  vm.runInNewContext(fs.readFileSync('web/js/account.js','utf8'), {document,window,fetch:transport,AbortController,URLSearchParams});
  const user=(name,token)=>({user:{id:name},access_token:token});
  notify('SIGNED_IN',user('a','test-a'));
  nodes.authProjects.click();
  let frame=workspace.firstElementChild;
  frame.load();
  const oldRequest=frame.contentWindow.request;
  const late=oldRequest('/tasks');
  notify('SIGNED_IN',user('b','test-b'));
  assert.equal(sent[0].options.signal.aborted,true);
  sent[0].resolve(Response.json({tasks:[{task_id:t1}]}));
  await assert.rejects(late,/계정/);
  await assert.rejects(oldRequest('/tasks',{goal_text:'stale'}),/계정/);
  assert.equal(sent.length,1);
  nodes.authProjects.click();
  frame=workspace.firstElementChild;
  frame.load();
  notify('TOKEN_REFRESHED',user('b','test-b-refreshed'));
  const write=frame.contentWindow.request('/tasks',{goal_text:'새 목표'});
  assert.equal(sent[1].url,'https://project.example.invalid/functions/v1/researchtrail/tasks');
  assert.equal(sent[1].options.headers.Authorization,'Bearer test-b-refreshed');
  sent[1].resolve(Response.json({task_id:t2}));
  assert.equal((await write).task_id,t2);
});

test('explicitly reusing a work sends its document ID and a fresh task-specific use', async () => {
  let written;
  const docId='12345678-0000-4000-8000-000000000001';
  const {nodes,start}=workspace(async(path,body)=>{
    if(path==='/tasks') return {tasks:[{task_id:t2,task:{goal_text:'다른 과업'}}]};
    if(path==='/documents') return {documents:[{document_id:docId,title:'같은 저작물'}]};
    if(body) written=body;
    return {papers:[]};
  });
  await start();
  await nodes.get('addBtn').click();
  nodes.get('aDocument').value=docId;
  nodes.get('aDocument').change();
  assert.equal(nodes.get('aTitle').disabled,true);
  nodes.get('aFile').files=[];
  await nodes.get('addForm').submit({preventDefault(){}});
  assert.equal(written.document_id,docId);
  assert.equal(written.document,undefined);
  assert.equal(written.use.purpose_text,null);
  assert.equal(written.use.reading_state_text,null);
  assert.equal(written.artifacts.length,0);
});
