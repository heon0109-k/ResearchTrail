// Draft AC5/AC7 regressions for the product panel's authenticated data operations.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');

function client() {
  const S={source:'account',taskId:'task',papers:[],links:[]}, calls=[];
  const c=vm.createContext({S,crypto:webcrypto,URL,STATES:{reading:{t:'읽는 중'},done:{t:'다 읽음'}},
    safeExternalUrl:value=>value||'',paperBy:id=>S.papers.find(p=>p.id===id),renderAll(){},structuredClone});
  vm.runInContext(readFileSync('web/js/account-graph.js','utf8'),c);
  const workspace={current:()=>true,extra:()=>({}),mutate:async(label,path,body,options={})=>{
    calls.push({path,body,method:options.method||'POST'});
    if(path.endsWith('/papers')) return {task_id:'task',document_use_id:'u',document_id:'d',artifact_ids:[]};
    if(path.endsWith('/paper-links')) return {link_id:'l',from_document_use_id:body.from_document_use_id,to_document_use_id:body.to_document_use_id,reason_text:body.reason_text};
    return {document_use_id:'u'};
  },patchExtra:async(target,id,patch)=>{calls.push({target,id,patch});},refresh:async()=>{}};
  const ops=c.createAccountPaperOperations(workspace);
  return {S,c,workspace,ops,calls};
}
const fromOwner={document_id:'d',document_use_id:'u',document:{title:'합성 논문'},use:{purpose_text:'합성 이유'},date:null,
  artifacts:[{artifact_id:'one',label_text:'paper.pdf',pdf:{available:true,sha256:'hash1'}},
    {artifact_id:'two',label_text:'paper.pdf',pdf:{available:true,sha256:'hash2'}}]};
test('a real workspace row retains both same-name editions and reads metadata without inventing an edition or a date',()=>{
  const {c}=client(), p=c.accountPaperFromRow(fromOwner,{tag:'t',resources:[],id:'spoof'});
  assert.equal(p.id,'u');
  assert.equal(p.tag,'t');
  assert.equal(p.date,null);
  assert.ok(!p.artifactId);
  assert.deepEqual(p.artifacts.map(a=>a.artifact_id),['one','two']);
});
test('registration sends paper settings atomically and retries the identical registration after a lost acknowledgement',async()=>{
  const {ops,workspace}=client(), attempts=[];
  workspace.mutate=async(label,path,body)=>{
    attempts.push(body);
    if(attempts.length===1)throw Error('lost acknowledgement');
    return {task_id:'task',document_use_id:'u'};
  };
  const p={title:'합성 논문',tag:'t',memo:'이유',date:'2026-11-27',link:''}, job={};
  await assert.rejects(ops.register(p,null,job));
  assert.equal(await ops.register(p,null,job),'u');
  assert.equal(attempts.length,2);
  assert.ok(attempts[0].request_id);
  assert.deepEqual(attempts[0],attempts[1]);
  assert.equal(attempts[0].workspace_data.tag,'t');
  assert.equal(attempts[0].document.title,p.title);
});

test('native change and click events on the shared panel await acknowledgement and open the selected edition',async()=>{
  const {c,S,workspace,ops,calls}=client(), nodes=new Map(), opened=[];
  class Control extends EventTarget {
    constructor(){super();this.value='';this.isConnected=true;this.classList={toggle(){}};}
    setAttribute(){} removeAttribute(){} focus(){}
  }
  for (const id of ['panel','pin','pEdit','pClose','pState','pRead','lkStart','pEdition']) nodes.set('#'+id,new Control());
  const p=c.accountPaperFromRow(fromOwner,{}); S.papers=[p]; S.panel='detail';S.sel=p.id;
  Object.assign(c,{accountWorkspace:{...workspace,papers:ops},document:{},$:key=>nodes.get(key)||null,$$:()=>[],
    esc:value=>String(value??''),tagBy:()=>({id:'',name:'태그 없음',color:'#ccc'}),stateOpts:()=>'',
    NOTAG:{name:'태그 없음'},accountPdfEditionLabel:a=>a.label_text,
    paperResourcePdfUrl:()=>'',paperResRoot:v=>v,openReader:(...args)=>opened.push(args)});
  S.tags=[];
  vm.runInContext(readFileSync('web/js/panel.js','utf8'),c);
  c.renderPanel();
  assert.match(nodes.get('#pin').innerHTML,/class="pb pv"/);
  assert.match(nodes.get('#pin').innerHTML,/id="pEdit"/);
  assert.match(nodes.get('#pin').innerHTML,/id="pRead"/);
  assert.match(nodes.get('#pin').innerHTML,/id="pEdition"/);
  let release;
  workspace.mutate=(label,path,body,options)=>new Promise(resolve=>{calls.push({path,body,method:options.method});release=resolve;});
  const state=nodes.get('#pState');
  state.value='done';state.dispatchEvent(new Event('change'));
  assert.equal(p.state,null); assert.equal(state.disabled,true);
  assert.equal(calls.at(-1).body.reading_state_text,'다 읽음');
  assert.equal(calls.at(-1).path,'/tasks/task/papers/u');
  release({document_use_id:'u'});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(p.state,'done');assert.equal(state.disabled,false);
  nodes.get('#pEdition').value='two';
  nodes.get('#pRead').dispatchEvent(new Event('click'));
  assert.deepEqual(opened,[['u','two']]);
  assert.equal(calls.at(-1).patch.selectedArtifactId,'two');
});

test('repeating a directed link after a lost response reuses its receipt and never inserts a duplicate',async()=>{
  const {ops,S,workspace}=client(), attempts=[];
  workspace.mutate=async(label,path,body)=>{
    attempts.push(body.request_id);
    if(attempts.length===1)throw Error('lost response');
    return {link_id:'l'};
  };
  await assert.rejects(ops.link('u','v','후속 연구'));
  assert.equal(S.links.length,0);
  await ops.link('u','v','후속 연구');
  assert.deepEqual(attempts,[attempts[0],attempts[0]]);
  assert.deepEqual([S.links[0].from,S.links[0].to,S.links[0].reason],['u','v','후속 연구']);
});

test('submitting the original timeline add form registers the authenticated paper and restores its server id',async()=>{
  const {c,S,workspace,ops,calls}=client(), nodes=new Map(), selected=[];
  class Control extends EventTarget {
    constructor(){super();this.value='';this.isConnected=true;this.files=[];this.classList={add(){},remove(){},toggle(){}};}
    setAttribute(){} removeAttribute(){} focus(){} querySelector(){return null;}
  }
  const node=id=>{if(!nodes.has(id))nodes.set(id,new Control());return nodes.get(id);};
  S.tags=[];S.hidden=new Set();S.panel='add';
  workspace.write=async()=>({documents:[]});
  Object.assign(c,{$:node,$$:()=>[],document:{removeEventListener(){}},accountWorkspace:{...workspace,papers:ops},
    tagBy:id=>({id,name:'태그 없음',color:'#ccc'}),NOTAG:{name:'태그 없음'},esc:v=>String(v??''),stateOpts:()=>'',todayStr:()=>'2026-11-27',
    parseRef:raw=>({type:'url',url:raw}),nid:()=>{throw Error('An account registration must use its server identity.');},
    select:id=>selected.push(id)});
  vm.runInContext(readFileSync('web/js/panel.js','utf8'),c);
  c.renderAddPanel(node('#pin'));
  assert.match(node('#pin').innerHTML,/id="addForm"/);
  assert.match(node('#pin').innerHTML,/id="aTag"/);
  assert.match(node('#pin').innerHTML,/타임라인에 추가/);
  for(const [id,value] of Object.entries({aTitle:'합성 논문',aMemo:'합성 이유',aTag:'t',aState:'reading',aDate:'2026-11-27',
    aSrc:'https://arxiv.org/abs/2501.00001v2'}))node('#'+id).value=value;
  node('#addForm').dispatchEvent(new Event('submit',{cancelable:true}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls[0].path,'/tasks/task/papers');
  assert.ok(calls[0].body.request_id);
  assert.equal(calls[0].body.artifacts[0].access_locator_text,'https://arxiv.org/abs/2501.00001v2');
  assert.equal(calls[0].body.workspace_data.tag,'t');
  assert.deepEqual(selected,['u']);
});

test('restoring the graph does no writes and an explicit move saves only the selected paper and view',async()=>{
  const {c,S,workspace,calls}=client();
  Object.assign(c,{$:()=>({clientWidth:800,clientHeight:500}),accountWorkspace:workspace});
  vm.runInContext(readFileSync('web/js/graph.js','utf8'),c);
  S.papers=[{id:'u'}];
  c.restoreAccountGraphLayout({x:4,y:5,k:1,fit:false,points:{u:{x:10,y:20},archived:{x:7,y:8}}});
  assert.equal(c.D.pos.get('u').x,10);assert.equal(c.D.pos.has('archived'),false);
  assert.equal(calls.length,0);
  c.D.tx=404;c.D.ty=255;c.D.k=1;c.D.fit=false;
  c.saveGraphGesture('u');
  assert.equal(calls.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].patch)),{graphLayout:{x:4,y:5,k:1,fit:false,points:{u:{x:10,y:20}}}});
});

test('refresh before the registration acknowledgement preserves the outstanding private PDF and recovers its exact destination',async()=>{
  const storage=new Map();
  const sessionStorage={get length(){return storage.size;},key:i=>[...storage.keys()][i],getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  function load() {
    const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',addEventListener(){}});return nodes.get(id);};
    const c=vm.createContext({$:node,sessionStorage});
    vm.runInContext(readFileSync('web/js/account-save-status.js','utf8'),c);
    const saves=c.createAccountSaveStatus(async()=>({artifact_id:'edition'}),()=>true,{projectUrl:'synthetic',accountId:'alice'});
    saves.focus('task');
    return {saves,status:node('#memoStatus')};
  }
  const first=load(), file={name:'artificial.pdf'};
  first.saves.expectRegistrationPdf(first.saves.prepare('task','registration',file,'selected'),'registration','digest','합성 논문');
  const restored=load();
  assert.match(restored.status.textContent,/논문 등록을 다시 확인/);
  assert.doesNotMatch(restored.status.textContent,/이제 닫아도/);
  restored.saves.registrationSaved('task','registration',{document_use_id:'use'});
  const readyToReselect=load();
  assert.match(readyToReselect.status.textContent,/합성 논문.*artificial.pdf/);
  assert.doesNotMatch(readyToReselect.status.textContent,/이제 닫아도/);
  const upload=readyToReselect.saves.prepare('task','use/',file);upload.sha256='digest';
  assert.equal(await readyToReselect.saves.upload(upload,file,'use',undefined,async()=>{}),true);
  assert.match(readyToReselect.status.textContent,/이제 닫아도/);
  assert.equal(storage.size,0);
});

test('the list registers native search, sort and filter events under the original project before switching',()=>{
  const {c,S,workspace}=client(), calls=[], nodes=new Map();
  class Control extends EventTarget {
    constructor(){super();this.value='';this.dataset={};}
    closest(selector){return selector==='[data-list-state]'?{dataset:{listState:'done'}}:null;}
  }
  const node=id=>{if(!nodes.has(id))nodes.set(id,new Control());return nodes.get(id);};
  workspace.patchExtra=(target,id,patch,options)=>{
    calls.push({task:options.task,field:JSON.parse(JSON.stringify(patch.listControls))});
    return new Promise(()=>{});
  };
  Object.assign(c,{$:node,accountWorkspace:workspace,visible:()=>true,esc:String});
  vm.runInContext(readFileSync('web/js/paper-list.js','utf8'),c);
  c.restoreAccountPaperList();c.renderPaperList();c.wirePaperList();
  const query=node('#paperListQuery'),sort=node('#paperListSort');
  query.value='합성';query.dispatchEvent(new Event('input'));
  sort.value='title';sort.dispatchEvent(new Event('change'));
  node('#paperList').dispatchEvent(new Event('click'));
  S.taskId='other';c.restoreAccountPaperList();
  assert.deepEqual(calls,[{task:'task',field:{query:'합성'}},{task:'task',field:{sort:'title'}},{task:'task',field:{state:'done'}}]);
  assert.equal(S.listQuery,'');assert.equal(c.listSort,'recent');assert.equal(c.LIST_STATE,'all');
  S.taskId='task';c.restoreAccountPaperList({query:'합성',sort:'title',state:'done'});
  assert.equal(S.listQuery,'합성');assert.equal(c.listSort,'title');assert.equal(c.LIST_STATE,'done');
});
