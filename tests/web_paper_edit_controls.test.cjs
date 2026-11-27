// Draft AC5/AC7 coverage for record identity, original input controls and verified saves.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {webcrypto}=require('node:crypto');
const vm=require('node:vm');

function view() {
  const messages=[], nodes=new Map();
  class Control extends EventTarget {
    constructor(){super();this.value='';this.isConnected=true;this.classList={toggle(){},add(){}};}
    focus(){} closest(){return null;} setAttribute(){} removeAttribute(){} setCustomValidity(){}
  }
  const node=id=>nodes.get('#'+id);
  for(const id of ['panel','pin','pEdit','pClose','pState','pRead','lkStart','pTitle','pMemo','pLink','pTag','pDate','pDel','pSave','pCancel'])
    nodes.set('#'+id,new Control());
  const c=vm.createContext({crypto:webcrypto,URL,structuredClone,
    $:id=>nodes.get(id)||null,$$:()=>[],document:{},toast:msg=>messages.push(msg),
    esc:v=>String(v??''),stateOpts:()=>'',tagBy:id=>({id,color:'#abc',name:id}),NOTAG:{name:'태그 없음'},accountPdfAttachHtml:()=>'',short:s=>s,
    S:{source:'account',taskId:'A',tags:[{id:'tag',name:'태그'}],links:[],panel:'detail',sel:'use',papers:[]},
    STATES:{reading:{t:'읽는 중'}},paperResourcePdfUrl:()=>'',safeExternalUrl:t=>t});
  for(const file of ['import','account-graph','panel'])vm.runInContext(readFileSync('web/js/'+file+'.js','utf8'),c);
  c.renderAll=()=>c.renderPanel();
  c.paperBy=id=>c.S.papers.find(p=>p.id===id);
  const workspace={current:()=>true,extra:()=>({})};
  c.accountWorkspace=workspace;workspace.papers=c.createAccountPaperOperations(workspace);
  return {c,nodes,node,messages,workspace};
}
const row={document_use_id:'use',document_id:'doc',document:{title:'이전 제목'},use:{purpose_text:'보존할 근거'},date:null,artifacts:[]};
const pause=()=>new Promise(ok=>setImmediate(ok));

test('original paper Save treats a title and tag as one acknowledged edit and repeats its identity after a lost response',async()=>{
  const {c,node,workspace,messages}=view(), calls=[],commit=new Map();
  const paper=c.accountPaperFromRow(row,{});
  c.S.papers=[paper];
  let fail, release;
  workspace.editPaper=async(id,patch,options)=>{
    calls.push({id,patch,fields:options.paperFields,requestId:options.requestId,task:options.task});
    if(!commit.has(options.requestId))commit.set(options.requestId,{tag:patch.tag,title:options.paperFields.title});
    if(calls.length===1)await new Promise((yes,no)=>{fail=no;});
    if(calls.length===2)await new Promise(yes=>{release=yes;});
  };
  c.renderPanel();
  node('pEdit').dispatchEvent(new Event('click'));
  node('pTitle').value='새 제목';node('pTitle').dispatchEvent(new Event('change'));
  node('pTag').value='tag';node('pMemo').value='보존할 근거';
  node('pSave').dispatchEvent(new Event('click'));
  assert.equal(calls.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].fields)),{title:'새 제목'});
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].patch)),{tag:'tag'});
  assert.equal(paper.title,'이전 제목');assert.equal(paper.tag,'');
  fail(Error('저장 확인 실패'));await pause();
  assert.deepEqual(messages,['저장 확인 실패']);
  assert.equal(node('pTitle').value,'새 제목');
  node('pSave').dispatchEvent(new Event('click'));
  assert.equal(calls[1].requestId,calls[0].requestId);
  release();await pause();
  assert.equal(paper.title,'새 제목');assert.equal(paper.tag,'tag');assert.equal(commit.size,1);
  const saved=commit.get(calls[1].requestId);
  const fresh=view().c.accountPaperFromRow({...row,document:{title:saved.title}},{tag:saved.tag});
  assert.equal(fresh.title,'새 제목');assert.equal(fresh.tag,'tag');assert.equal(fresh.memo,'보존할 근거');
});

test('an edit from a previous project never writes against the newly selected project',async()=>{
  const {c,workspace}=view(),p=c.accountPaperFromRow(row,{});
  p.accountTaskId='A';c.S.taskId='B';let count=0;workspace.editPaper=async()=>{count++;};
  await assert.rejects(workspace.papers.update(p,{title:'다른 프로젝트'}),/프로젝트/);
  assert.equal(count,0);
});

test('PDF link suggestions belong to the selected edition, including inside the original detail editor',async()=>{
  const {c}=view(),p=c.accountPaperFromRow({...row,artifacts:[
    {artifact_id:'v1',pdf:{available:true}},{artifact_id:'v2',pdf:{available:true}},
    {artifact_id:'pending',can_attach_pdf:true,label_text:'첨부 전.pdf'}
  ]},{selectedArtifactId:'v1'});
  p.link='https://arxiv.org/abs/2501.00001v2';c.S.papers=[p];
  let release;
  c.findPaperResources=async paper=>paper.artifactId==='v1'?new Promise(ok=>{release=ok;}):
    [{kind:'code',url:'https://test.invalid/new',page:2}];
  const old=c.scanPaperResources(p);
  p.artifactId='v2';
  release([{kind:'code',url:'https://test.invalid/old',page:9}]);await old;
  assert.equal(c.paperResourceScan(p).candidates.length,0);
  const draft={...p};c.PEDIT=p.id;c.PSNAP={draft};
  await c.scanPaperResources(draft);
  assert.deepEqual(JSON.parse(JSON.stringify(c.paperResourceScan(draft).candidates)),
    [{kind:'code',url:'https://test.invalid/new',page:2,artifact_id:'v2'}]);
  p.artifactId='pending';p.pdf=false;let reads=0;
  c.paperResourcePdfUrl=()=>p.link;
  c.findPaperResources=async()=>{reads++;return [];};
  await c.scanPaperResources(p);
  assert.equal(reads,0);assert.equal(c.paperResourceScan(p).status,'missing');
});

test('DOI and arXiv controls retain an explicit arXiv edition through to the PDF URL',()=>{
  const {c}=view();
  for(const input of ['arxiv:2501.00001v2','https://arxiv.org/pdf/2501.00001v2.pdf','https://arxiv.org/abs/2501.00001v2']){
    const ref=c.parseRef(input);
    assert.equal(ref.id,'2501.00001');
    assert.equal(c.pdfUrlOf(c.explicitPaperLocator(input,ref)),'https://arxiv.org/pdf/2501.00001v2');
  }
  assert.equal(c.pdfUrlOf('10.1000/synthetic'),'');
});

test('a destructive tag removal uses the exact members from the confirmation and does not wait for unrelated saves',async()=>{
  const {c,workspace}=view(), requests=[];
  c.document.addEventListener=()=>{};
  vm.runInContext(readFileSync('web/js/frame.js','utf8'),c);
  workspace.removeTag=async(...args)=>requests.push(args);
  workspace.select=async()=>{};
  workspace.flush=()=>{throw Error('an unrelated failed memo must not block tag removal');};
  c.S.papers=[{id:'confirmed',tag:'tag'},{id:'joined-after-dialog',tag:'tag'}];
  assert.equal(await c.applyTagDeletion('tag',true,['confirmed']),true);
  assert.deepEqual(requests,[['A','tag',true,['confirmed']]]);
});

test('a delayed private attachment adds its edition while preserving the newer explicit reader selection',async()=>{
  const {c,workspace}=view(), preferences=[];
  const p=c.accountPaperFromRow({...row,artifacts:[{artifact_id:'one',pdf:{available:true}},
    {artifact_id:'two',pdf:{available:true}}]},{selectedArtifactId:'one'});
  c.S.papers=[p];c.S.reader=p.id;
  c.validateAccountPdf=async()=>'synthetic-digest';
  let uploaded;
  workspace.saves={prepare:()=>({}),upload:async(job,file,use,artifact,after)=>{
    await new Promise(resolve=>{uploaded=resolve;});
    await after({artifact_id:'third'});
    return true;
  }};
  workspace.patchExtra=async(target,id,patch)=>{preferences.push(patch.selectedArtifactId);};
  const attachment=workspace.papers.attach(p,{name:'third.pdf',size:12});
  await pause();
  p.artifactId='two';await workspace.papers.selectEdition(p,'two');
  uploaded();const receipt=await attachment;
  assert.equal(receipt.artifact_id,'third');
  assert.deepEqual(Array.from(p.artifacts,a=>a.artifact_id),['one','two','third']);
  assert.equal(p.artifactId,'two');assert.deepEqual(preferences,['two']);
});

test('typing a different source prevents a delayed metadata response from filling the new paper form',async()=>{
  const {c,workspace}=view(), nodes=new Map();
  class Field extends EventTarget {
    constructor(){super();this.value='';this.isConnected=true;this.classList={toggle(){},add(){},remove(){}};}
    querySelector(){return null;}closest(){return null;}focus(){}setAttribute(){}removeAttribute(){}
  }
  const node=id=>{if(!nodes.has(id))nodes.set(id,new Field());return nodes.get(id);};
  let original;
  Object.assign(c,{$:node,document:{removeEventListener(){},addEventListener(){}},Event,
    setTimeout:()=>0,clearTimeout(){},todayStr:()=>'2026-11-27',fetchMeta:()=>new Promise(ok=>{original=ok;})});
  workspace.write=async()=>({documents:[]});
  node('#aSrcMsg').style={};
  c.S.panel='add';
  c.renderAddPanel(node('#pin'));
  const source=node('#aSrc');
  source.value='arxiv:2501.00001v1';source.dispatchEvent(new Event('change'));
  source.value='arxiv:2501.00002v3';source.dispatchEvent(new Event('input'));
  original({title:'이전 주소의 제목',authors:'이전 주소의 저자',year:2025});await pause();
  assert.equal(c.S.draftMeta,null);assert.equal(node('#aTitle').value,'');
  assert.equal(source.value,'arxiv:2501.00002v3');
});

test('an already-open paper editor reviews each newly refreshed competing title before saving its draft',async()=>{
  const {c,node,nodes,workspace}=view(), writes=[], dialogs=[];
  c.S.papers=[c.accountPaperFromRow(row,{})];
  c.ask=(title,body,action,confirm)=>dialogs.push({body,confirm});
  workspace.editPaper=async(id,patch,options)=>writes.push(options.paperFields);
  c.renderPanel();node('pEdit').dispatchEvent(new Event('click'));
  node('pTitle').value='내 제목';node('pTitle').dispatchEvent(new Event('input'));
  node('pMemo').value='보존할 근거';
  c.S.papers=[c.accountPaperFromRow({...row,document:{title:'다른 기기의 제목'}},{})];
  nodes.set('#pSave',new (node('pSave').constructor)());
  c.renderPanel();
  assert.match(node('pin').innerHTML,/내 제목/);
  node('pSave').dispatchEvent(new Event('click'));
  assert.equal(writes.length,0);
  assert.match(dialogs[0].body,/다른 기기의 제목.*내 제목/);
  c.S.papers=[c.accountPaperFromRow({...row,document:{title:'그다음 수정'}},{})];
  dialogs[0].confirm();
  assert.equal(writes.length,0);
  assert.match(dialogs[1].body,/그다음 수정.*내 제목/);
  dialogs[1].confirm();await pause();
  assert.deepEqual(JSON.parse(JSON.stringify(writes)),[{title:'내 제목'}]);
  assert.equal(c.S.papers[0].title,'내 제목');
});
