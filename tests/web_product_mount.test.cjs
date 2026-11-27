// Draft AC5 and AC7. The authenticated loader runs real storage/row adapters here.
// The built browser test covers the actual markup and pointer/keyboard interactions.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');

function client(database,tab=new Map()){
  const nodes=new Map(), writes=[], mounts=[];
  function element(){return {replaceChildren(){},appendChild(){},setAttribute(){},querySelector:node};}
  function node(key){if(!nodes.has(key))nodes.set(key,element());return nodes.get(key);}
  const S={source:'account'};
  function reset(){Object.assign(S,{papers:[],tags:[],links:[],bands:true,zoom:'month',resumeOpen:true,judge:'',why:false,filterTag:null,next:''});}
  reset();
  const w=vm.createContext({S,app:element(),$:node,document:{body:element(),createElement:element,createTextNode:t=>t},
    screensReady:Promise.resolve(),crypto:webcrypto,structuredClone,PAL:['#000000'],STATES:{},
    reset,showMain(){mounts.push(S.taskId);},renderAll(){},accountHydratePaperRecords(){},
    createAccountProjectMenu:config=>config,projAccountMenu:null,
    createAccountSaveStatus:()=>({focus(){},track(){},projects(){}}),
    sessionStorage:{get length(){return tab.size;},key:i=>[...tab.keys()][i],getItem:k=>tab.get(k)??null,
      setItem:(k,v)=>tab.set(k,v),removeItem:k=>tab.delete(k)},
    localStorage:{getItem(){throw Error('guest read');},setItem(){throw Error('guest write');}}
  });
  for(const file of ['workspace-store','account-graph','main'])
    vm.runInContext(fs.readFileSync('web/js/'+file+'.js','utf8'),w);
  async function get(path){
    if(path==='/tasks?view=workspace')return {tasks:Object.keys(database).map(task_id=>({task_id,task:{goal_text:task_id}}))};
    const [, ,id,kind]=path.split('/');
    const d=database[id];
    if(d.wait)await d.wait;
    if(kind==='papers?view=workspace')return {papers:[{document_use_id:id+'-use',document_id:id+'-doc',document:{title:id},use:{},artifacts:[]}]};
    if(kind==='paper-links')return {links:[]};
    if(kind==='resume')return {task_id:id,records:[],next_actions:[]};
    if(kind==='workspace')return structuredClone(d.state);
    throw Error('Unexpected read '+path);
  }
  async function write(path,body){
    if(!body)return get(path);
    const [, ,id,kind]=path.split('/');
    assert.equal(kind,'workspace');
    writes.push({id,body:structuredClone(body)});
    const head=database[id].state.project;
    assert.equal(head.version,body.version);
    Object.assign(head.data,body.patch);head.version++;
    return structuredClone(head);
  }
  const start=()=>w.startAccountTimeline(get,{current:()=>true,write,accountId:'owner',projectUrl:'fixture'});
  return {S,w,start,writes,mounts};
}
test('both account clients mount the product frame without a write, share accepted tags and ignore a late project read',async()=>{
  const database=Object.fromEntries(['A','B'].map(k=>[k,{state:{project:{data:{},version:0}}}]));
  const a=client(database), b=client(database);
  await a.start();await b.start();
  assert.deepEqual(a.mounts,['A']);assert.equal(a.S.papers[0].id,'A-use');assert.equal(a.writes.length,0);
  a.S.tags.push({id:'tag',name:'실험',color:'#123abc'});
  assert.equal(a.w.accountWorkspace.saveChanges(),false);
  await a.w.accountWorkspace.flush();
  assert.equal(a.writes.length,1);
  await b.w.accountWorkspace.select('A');
  assert.equal(b.S.tags[0].name,'실험');assert.equal(b.writes.length,0);
  let release;
  database.B.wait=new Promise(resolve=>{release=resolve;});
  const late=a.w.accountWorkspace.select('B');
  await a.w.accountWorkspace.select('A');release();await late;
  assert.equal(a.S.taskId,'A');assert.equal(a.S.papers[0].id,'A-use');
  assert.deepEqual(a.mounts,['A','A']);
});
