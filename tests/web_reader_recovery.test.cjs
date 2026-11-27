// Draft AC4/5/7 controller regressions. Exercise native EventTargets independently of the browser suite.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {randomUUID}=require('node:crypto');

function session(){
  const entries=new Map();
  return {get length(){return entries.size;},key:i=>[...entries.keys()][i],
    getItem:k=>entries.get(k) ?? null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
}
function frame(storage,request,accountId='account') {
  const nodes=new Map();
  function $(selector){
    if (!nodes.has(selector)) nodes.set(selector,Object.assign(new EventTarget(),{
      value:'',innerHTML:'',textContent:'',style:{},dataset:{},focus(){},hidden:false,
    }));
    return nodes.get(selector);
  }
  const account={current:()=>true,projectUrl:'fixture',accountId};
  const document=new EventTarget(), window=new EventTarget();
  const ctx=vm.createContext({$,document,window,crypto:{randomUUID},sessionStorage:storage,esc:s=>String(s || '')});
  for (const script of ['pdf-viewer','account-save-status','account-actions','account-pdfs','account-memos'])
    vm.runInContext(fs.readFileSync('web/js/'+script+'.js','utf8'),ctx);
  const saves=ctx.createAccountSaveStatus(request,account.current,account);
  saves.projects(['A','B'].map(id=>({task_id:id,task:{goal_text:'프로젝트 '+id}})));
  const memos=ctx.createAccountMemos(request,account,saves,()=>{});
  const pdf=ctx.createAccountPdfReader(request,account.current,memos.records,saves);
  function fire(id,type,props={}) { $(id).dispatchEvent(Object.assign(new Event(type),props)); }
  return {$,fire,pdf,saves,memos,status:()=>$('#memoStatus').textContent,
    open(task,scope){saves.focus(task);return memos.open(task,scope);},
    type(text){fire('#rNote','focus');$('#rNote').value=text;fire('#rNote','input');}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const scope={documentId:'d',artifactId:'edition',label:'선택한 판본'};
const snapshot=task=>({task_id:task,records:[],next_actions:[],context:{questions:[],decisions:[],
  document_contexts:[{document_id:'d',document:{title:'합성 논문'},artifacts:[]}]}});
test('an inactive paper memo and an unconfirmed highlight both survive refresh, account isolation and independent retry',async()=>{
  const storage=session(),writes=[],marks=[];
  let fail=true,rejectLink;
  const api=async(path,body)=>{
    if(path.endsWith('/resume'))return snapshot(path.split('/')[2]);
    if(body)writes.push({path,body:structuredClone(body)});
    if(path.endsWith('/records')){
      if(fail)throw Error('interrupted');
      return {record_id:'r'};
    }
    if(body?.link){
      if(fail)return new Promise((_,reject)=>{rejectLink=reject;});
      marks[0].record_id=body.link.record_id;
    }
    return {last_page:2,highlights:structuredClone(marks)};
  };
  const a=frame(storage,api);
  await a.open('A',scope);
  a.type('판본 메모');a.fire('#memoFinish','click');
  await tick();
  marks.push({id:'highlight',page:2,text:'선택',record_id:null,rects:[[0,0,.2,.1]]});
  await a.pdf.open('A','edition',scope.label,false);
  a.$('#pdfMemoRef').value='existing';
  const button={dataset:{linkMark:'highlight'}};
  // The delegated listener looks up the button from the click target.
  a.$('#pdfMarks').closest=()=>button;
  a.fire('#pdfMarks','click');await tick();
  assert.match(a.status(),/하이라이트 메모 연결 저장 중/);
  a.pdf.close();
  await a.open('B');
  rejectLink(Error('interrupted'));await tick();
  assert.match(a.status(),/프로젝트 A.*메모 저장을 확인하지 못/);
  const fresh=frame(storage,api);
  await fresh.open('B');
  assert.match(fresh.status(),/프로젝트 A.*하이라이트 메모 연결 저장을 확인하지 못/);
  assert.doesNotMatch(fresh.status(),/닫아도/);
  const otherAccount=frame(storage,api,'different');
  await otherAccount.open('B');assert.equal(otherAccount.status(),'');
  fail=false;
  await fresh.open('A',scope);
  fresh.fire('#memoRetry','click');await tick();
  assert.deepEqual(writes[0],writes[2]);
  assert.deepEqual(writes[2].body.context.document_contexts,[{document_ref:{document_id:'d'},use:{},artifact_ref:{artifact_id:'edition'}}]);
  assert.doesNotMatch(fresh.status(),/닫아도/);
  await fresh.pdf.open('A','different','동명 판본',false);
  assert.equal(fresh.$('#pdfReaderRetry').hidden,true);
  await fresh.pdf.open('A','edition',scope.label,false);
  assert.equal(fresh.$('#pdfReaderRetry').hidden,false);
  fresh.fire('#pdfReaderRetry','click');await tick();
  assert.deepEqual(writes[1],writes[3]);assert.equal(marks[0].record_id,'existing');
  assert.match(fresh.status(),/닫아도/);assert.equal(writes.length,4);
});
test('moving focus into the project paper selector leaves the association editable until completion',async()=>{
  const sent=[];
  const ui=frame(session(),async(path,body)=>{
    if(path.endsWith('/resume'))return snapshot('A');
    sent.push(structuredClone(body));return {record_id:'r'};
  });
  await ui.open('A');ui.type('선택할 논문');
  ui.fire('#rNote','change');ui.fire('#rNote','blur',{relatedTarget:ui.$('#memoPaper')});
  assert.equal(sent.length,0);assert.equal(ui.$('#memoPaper').disabled,false);
  ui.$('#memoPaper').value='d';ui.fire('#memoPaper','change');
  assert.match(ui.status(),/작성 중/);
  ui.fire('#memoFinish','click');await tick();
  assert.deepEqual(sent[0].context,{document_contexts:[{document_ref:{document_id:'d'},use:{}}]});
  assert.match(ui.status(),/닫아도/);
});
