// Draft AC5. Two product mounts have separate tab storage and one mocked account.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const vm=require('node:vm');
const fs=require('node:fs');

async function setupClient(server,tab=new Map()) {
  const nodes=new Map(), events=[];
  function element(){return {replaceChildren(){},appendChild(){},setAttribute(){},querySelector:node};}
  function node(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);}
  const S={source:'account'},reset=()=>Object.assign(S,{papers:[],tags:[],links:[],zoom:'month',filterTag:null});
  const w=vm.createContext({S,app:element(),$:node,document:{body:element(),createElement:element,createTextNode:s=>s},
    crypto:webcrypto,structuredClone,PAL:[],screensReady:Promise.resolve(),reset,showMain(){},renderAll(){},
    accountHydratePaperRecords(){},createAccountPaperOperations:()=>({}),accountPaperFromRow:p=>p,
    createAccountProjectMenu:c=>c,projAccountMenu:null,
    createAccountSaveStatus:()=>({projects(){},focus(){},track(key,task,label,phase){events.push({key,task,label,phase});}}),
    sessionStorage:{get length(){return tab.size;},key:i=>[...tab.keys()][i],setItem:(k,v)=>tab.set(k,v),
      removeItem:k=>tab.delete(k),getItem:k=>tab.get(k)??null}});
  for(const file of ['workspace-store','main'])vm.runInContext(fs.readFileSync('web/js/'+file+'.js','utf8'),w);
  await w.startAccountTimeline(server.get,{current:()=>true,write:server.write,accountId:'owner',projectUrl:'fixture'});
  return {S,picker:w.projAccountMenu,api:w.accountWorkspace,events,tab,status:node('#workspaceStatus')};
}
function fakeServer(){
  const server={tasks:['A','B','C'],selection:{task_id:null,revision:0},writes:[]};
  server.get=async path=>{
    if(path==='/tasks?view=workspace')return {selection:structuredClone(server.selection),tasks:server.tasks.map(task_id=>({task_id,task:{goal_text:task_id}}))};
    const [, ,task,kind]=path.split('/');
    if(kind==='workspace')return {project:{version:0,data:{}}};
    if(kind==='paper-links')return {links:[]};
    if(kind==='papers?view=workspace')return {papers:[]};
    if(kind==='resume')return {task_id:task,records:[],next_actions:[]};
    throw Error('Unknown read '+path);
  };
  server.write=async(path,body,options)=>{
    if(!body)return server.get(path);
    assert.ok(path.endsWith('/active-project'));
    assert.equal(options.method,'PATCH');
    const task=path.split('/')[2], choice={task_id:task,revision:body.revision,request_id:body.request_id};
    server.writes.push(choice);
    if(task===server.slowTask)await server.gate.promise;
    if(task===server.failTask)throw Error('connection interrupted');
    if (choice.revision>server.selection.revision ||
      (choice.revision===server.selection.revision && choice.request_id>server.selection.request_id))server.selection=choice;
    return structuredClone(server.selection);
  };
  return server;
}

test('last explicit choice restores on a new client and remains separate from the current tab and archive fallback',async()=>{
  const server=fakeServer(),a=await setupClient(server),b=await setupClient(server);
  assert.equal(a.S.taskId,'A');assert.equal(b.S.taskId,'A');assert.equal(server.writes.length,0);
  await a.picker.select('B');
  await a.api.flush();
  assert.equal(server.selection.task_id,'B');
  assert.equal((await setupClient(server)).S.taskId,'B');
  assert.equal((await setupClient(server,b.tab)).S.taskId,'A');
  await b.api.reloadTasks();assert.equal(b.S.taskId,'A');
  server.tasks=['A','C'];
  server.selection={...server.selection,task_id:null};
  await a.api.reloadTasks();
  assert.equal(a.S.taskId,'A');
  server.tasks=[];
  await a.api.reloadTasks();
  assert.equal(a.S.taskId,null);assert.equal(server.writes.length,1);
});

test('a delayed choice and a failed choice cannot revive older preferences or block newer confirmed work',async()=>{
  const server=fakeServer(),a=await setupClient(server);
  server.slowTask='B';server.gate=Promise.withResolvers();
  await a.picker.select('B');
  await a.picker.select('C');
  await a.api.flush();
  assert.equal(server.selection.task_id,'C');
  server.gate.resolve();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(server.selection.task_id,'C');assert.equal(a.S.taskId,'C');
  assert.deepEqual(server.writes.map(r=>r.revision),[1,2]);
  server.slowTask=null;server.failTask='B';
  await a.picker.select('B');
  await assert.rejects(a.api.flush());
  assert.ok(a.events.some(event=>event.task==='B' && event.phase==='failed'));
  await a.picker.select('A');
  await a.api.flush();
  const restored=await setupClient(server,a.tab);
  assert.equal(restored.S.taskId,'A');
  assert.equal(restored.events.some(event=>event.phase==='failed'),false);
  assert.equal(server.selection.task_id,'A');
  assert.deepEqual(server.writes.map(r=>r.revision),[1,2,3,4]);
});

test('selecting the same project again after recovery supersedes its earlier failed preference',async()=>{
  const server=fakeServer(),client=await setupClient(server);
  server.failTask='B';
  await client.picker.select('B');
  await assert.rejects(client.api.flush());
  server.failTask=null;
  await client.picker.select('B');
  await client.api.flush();
  assert.equal(server.selection.task_id,'B');
  assert.deepEqual(server.writes.map(({task_id,revision})=>[task_id,revision]),[['B',1],['B',2]]);
  assert.equal((await setupClient(server)).S.taskId,'B');
});

test('a stale tab keeps its open project and can explicitly choose it again after a different device saved a newer choice',async()=>{
  const server=fakeServer(),client=await setupClient(server);
  server.selection={task_id:'C',revision:5,request_id:webcrypto.randomUUID()};
  await client.picker.select('B');
  await client.api.flush();
  assert.equal(client.S.taskId,'B');
  assert.equal(server.selection.task_id,'C');
  assert.equal(client.events.some(event=>event.task==='B' && event.phase==='saved'),false);
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(client.status.textContent,/다른 기기.*다시 선택/);
  await client.picker.select('B');
  await client.api.flush();
  assert.equal(server.selection.task_id,'B');
  assert.deepEqual(server.writes.map(r=>r.revision),[1,6]);
});
