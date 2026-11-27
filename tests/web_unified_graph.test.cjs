// Draft regression for Prompt 3 / AC5 and AC6. Two clients have separate UI and storage.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto,randomUUID}=require('node:crypto');

function server(){
  const initial=randomUUID(), tasks=new Map(), receipts=new Map(), calls=[];
  function task(id,name){tasks.set(id,{task_id:id,task:{goal_text:name},papers:[],links:[]});}
  task(initial,'처음 과업');
  const api={initial,tasks,calls,lose:'',hold:null};
  async function request(path,body,options={}){
    const [,root,id,kind,item,sub]=path.split('/');
    const method=options.method||(body?'POST':'GET');
    calls.push({path,method,body});
    if(root==='documents')return {documents:[]};
    const t=tasks.get(id);
    if(!body){
      if(kind==='paper-links' && api.hold?.id===id){
        const response=structuredClone({links:t.links}); await api.hold.promise; return response;
      }
      return structuredClone(!id?{tasks:[...tasks.values()]}:kind==='paper-links'?{links:t.links}:{papers:t.papers});
    }
    const key=body.request_id;
    let result=receipts.get(key);
    if(!result){
      if(sub==='pdf'){
        assert.equal(options.pdf,true);
        const paper=t.papers.find(p=>p.document_use_id===item);
        const edition={artifact_id:randomUUID(),label_text:body.name,pdf:{available:true}};
        paper.artifacts.push(edition);return edition;
      }
      assert.ok(key);
      if(!id){
        const created=randomUUID();task(created,body.goal_text);result=tasks.get(created);
      }else if(kind==='papers'){
        result={...body,task_id:id,document_use_id:randomUUID(),document_id:randomUUID(),artifacts:[]};
        t.papers.unshift(result);
      }else if(!item){
        assert.ok(t.papers.some(p=>p.document_use_id===body.from_document_use_id));
        assert.ok(t.papers.some(p=>p.document_use_id===body.to_document_use_id));
        result={...body,task_id:id,link_id:randomUUID()};t.links.push(result);
      }else{
        const i=t.links.findIndex(l=>l.link_id===item);assert.notEqual(i,-1);
        if(method==='PATCH')t.links[i].reason_text=body.reason_text;else {assert.equal(method,'DELETE');t.links.splice(i,1);}
        result={task_id:id,link_id:item};
      }
      receipts.set(key,result);
    }
    if(api.waitForWrite?.method===method && kind==='paper-links') await api.waitForWrite.promise;
    if(api.lose===kind){api.lose='';throw Error('저장 응답 지연');}
    return structuredClone(result);
  }
  return Object.assign(api,{request});
}

function client(api,guestStorage){
  const nodes=new Map(),localWrites=[];
  function node(s){
    if(!nodes.has(s))nodes.set(s,{
      innerHTML:'',value:'',files:[],style:{setProperty(){}},dataset:{},clientWidth:820,clientHeight:600,
      isConnected:true,scrollLeft:0,scrollTop:0,options:[],classList:{add(){},remove(){},toggle(){}},
      setAttribute(){}, removeAttribute(){},focus(){},remove(){},replaceChildren(){this.innerHTML='';},insertAdjacentHTML(){},
      showModal(){this.open=true;},close(){this.open=false;},getBoundingClientRect(){return {left:0,right:820,width:820,height:600};},
      querySelector(){return null;},querySelectorAll(selector){
        if(selector!=='[data-edit-link],[data-remove-link]')return [];
        return Array.from(node('#workspacePaperActions').innerHTML.matchAll(/data-(edit|remove)-link="([^"]+)"/g),([,action,id])=>{
          const button=node(action+'-'+id);button.dataset[action+'Link']=id;return button;
        });
      },
      addEventListener(type,fn){this[type]=fn;}
    });
    return nodes.get(s);
  }
  const c=vm.createContext({window:{name:'',addEventListener(){}},location:{search:guestStorage?'':'?workspace=account'},URL,URLSearchParams,
    setTimeout,clearTimeout,requestAnimationFrame:()=>1,cancelAnimationFrame(){},crypto:webcrypto,
    document:{body:{appendChild(){}},querySelector:node,querySelectorAll:()=>[],getElementById:id=>id==='app'?node('#app'):null,
      addEventListener(){},removeEventListener(){},createElement:()=>node(Symbol())},Option:function(){},
    localStorage:{getItem:k=>guestStorage?.get(k)??null,setItem(k,v){localWrites.push(k);guestStorage?.set(k,v);}},
    sessionStorage:{getItem:()=>null,setItem(){}},
    screens:{main:''},screensReady:Promise.resolve()});
  for(const name of ['core','frame','timeline','import','panel','paper-list','helpers','projects','graph',
    'account-projects','account-pdfs','account-save-status','account-graph','main']){
    vm.runInContext(fs.readFileSync('web/js/'+name+'.js','utf8'),c);
  }
  const read=path=>api.request(path);
  const start=()=>c.startAccountTimeline(read,{accountId:'fixture',projectUrl:'https://test.invalid',current:()=>true,write:api.request});
  return {c,node,localWrites,start,select(id){node('#workspaceTask').value=id;return node('#workspaceTask').change();},
    submit(id){return node('#'+id).submit({preventDefault(){}});}};
}

test('registration, PDF and graph persist between clients; retries, equal titles and late reads stay isolated',async()=>{
  const api=server(), a=client(api);
  await a.start();
  async function add(retry,pdf){
    await a.node('#addBtn').click();
    a.node('#aTitle').value='동명 논문';
    a.node('#aDate').value='2026-11-01';
    a.node('#aFile').files=pdf?[new File(['%PDF-1.4\n synthetic\n%%EOF\n'],'합성.pdf',{type:'application/pdf'})]:[];
    if(retry)api.lose='papers';
    await a.submit('addForm');
    if(retry)await a.submit('addForm');
  }
  await add(true,true);await add(false,false);
  const t=api.tasks.get(api.initial), [p,q]=t.papers;
  assert.equal(t.papers.length,2);
  assert.equal(q.artifacts.length,1);
  assert.match(a.node('#canvas').innerHTML,new RegExp(q.document_use_id));
  a.c.setView('dot');a.c.onPick(p.document_use_id);
  a.node('#lkStart').click();a.c.onPick(q.document_use_id);
  a.node('#lkWhy').value='평가 지표를 비교';api.lose='paper-links';
  await a.submit('workspaceLinkForm');await a.submit('workspaceLinkForm');
  assert.equal(t.links.length,1);
  assert.equal(t.links[0].from_document_use_id,p.document_use_id);
  assert.equal(t.links[0].to_document_use_id,q.document_use_id);
  await a.node('#workspaceNew').click();a.node('#workspaceName').value='다른 프로젝트';
  await a.submit('workspaceCreateForm');
  const other=a.c.S.taskId;
  assert.notEqual(other,api.initial);
  assert.equal(a.c.S.links.length,0);
  const b=client(api);await b.start();b.c.setView('dot');
  assert.match(b.node('#dotsvg').innerHTML,/평가 지표를 비교/);
  assert.equal(b.c.S.papers.find(x=>x.id===q.document_use_id).artifacts[0].artifact_id,q.artifacts[0].artifact_id);
  const link=t.links[0].link_id;
  b.c.onPick(p.document_use_id);
  b.node('edit-'+link).click();b.node('#lkWhy').value='후속 실험 비교';
  api.lose='paper-links';
  await b.submit('workspaceLinkForm');await b.submit('workspaceLinkForm');
  assert.equal(t.links[0].reason_text,'후속 실험 비교');
  assert.match(b.node('#dotsvg').innerHTML,/후속 실험 비교/);
  let release;
  api.hold={id:api.initial,promise:new Promise(resolve=>{release=resolve;})};
  const late=a.select(api.initial);await a.select(other);release();await late;
  assert.equal(a.c.S.taskId,other);assert.equal(a.c.S.papers.length,0);
  assert.doesNotMatch(a.node('#dotsvg').innerHTML,/평가 지표를 비교/);
  b.c.onPick(q.document_use_id);b.node('remove-'+link).click();
  let deliver;
  api.waitForWrite={method:'DELETE',promise:new Promise(resolve=>{deliver=resolve;})};
  const delayedWrite=b.submit('workspaceLinkForm');
  await b.select(other);
  deliver();await delayedWrite;
  assert.equal(b.c.S.taskId,other);assert.equal(b.c.S.links.length,0);
  assert.doesNotMatch(b.node('#dotsvg').innerHTML,/동명 논문/);
  assert.equal(t.links.length,0);assert.equal(t.papers.length,2);
  await a.select(api.initial);
  assert.equal(a.c.S.links.length,0);
  assert.doesNotMatch(a.node('#dotsvg').innerHTML,/class="de[ "]/);
  for(const method of ['POST','PATCH']){
    const attempts=api.calls.filter(call=>call.path.includes('paper-links') && call.method===method);
    assert.equal(attempts.length,2);
    assert.equal(attempts[0].body.request_id,attempts[1].body.request_id);
  }
  assert.deepEqual(a.localWrites,[]);assert.deepEqual(b.localWrites,[]);
});

test('browser-only graph controls save a local link and its reason and restore them after reopening',()=>{
  const api=server(), storage=new Map(), {c,node}=client(api,storage);
  c.S.papers=['x','y'].map(id=>({id,title:'동명 논문',tag:'',date:'2026-11-01',memo:'합성 메모'}));
  c.S.view='dot';
  c.renderAll=()=>{c.renderPanel();c.renderDots();c.save();};
  c.onPick('x');node('#lkStart').click();c.onPick('y');
  node('#lkWhy').value='브라우저 전용 연결';node('#lkOk').click();
  assert.match(node('#dotsvg').innerHTML,/브라우저 전용 연결/);
  const b=client(api,storage);b.c.showMain=()=>{};
  assert.equal(b.c.load(),true);b.c.renderDots();
  assert.match(b.node('#dotsvg').innerHTML,/브라우저 전용 연결/);
  assert.deepEqual(Array.from(b.c.S.links,l=>[l.from,l.to]),[['x','y']]);
  assert.equal(api.calls.length,0);
});

test('a private PDF retry reuses the registered paper and the original file',async()=>{
  const api=server(), request=api.request;
  const uploads=[];
  api.request=async(path,body,options)=>{
    if(path.endsWith('/pdf')){
      uploads.push([path, body, options]);
      if(uploads.length===1)throw Error('합성 업로드 중단');
    }
    return request(path,body,options);
  };
  const a=client(api);await a.start();await a.node('#addBtn').click();
  const file=new File(['%PDF-1.4\n private fixture\n%%EOF\n'],'비공개.pdf',{type:'application/pdf'});
  a.node('#aTitle').value='합성 논문';
  a.node('#aFile').files=[file];
  await a.submit('addForm');
  assert.equal(api.tasks.get(api.initial).papers.length,1);
  assert.match(a.node('#aErr').textContent,/PDF 업로드/);
  assert.equal(a.node('#pdfUploadRetry').hidden,false);
  await a.node('#pdfUploadRetry').click();
  assert.equal(uploads.length,2);
  assert.equal(uploads[0][0],uploads[1][0]);assert.equal(uploads[1][1],file);
  assert.equal(a.c.S.papers.length,1);assert.equal(a.c.S.papers[0].artifacts.length,1);
  assert.equal(api.calls.filter(c=>c.path.endsWith('/papers')&&c.method==='POST').length,1);
});

test('the authenticated timeline forwards explicit writes with the active session and keeps reads GET-only',async()=>{
  const nodes=new Map();
  function element(){return {addEventListener(type,fn){this[type]=fn;},replaceChildren(){this.firstElementChild=null;},
    appendChild(child){this.firstElementChild=child;}};}
  for(const [,id] of fs.readFileSync('web/views/account.html','utf8').matchAll(/id="([^"]+)"/g)) nodes.set(id,element());
  let notify, get, session;
  const requests=[];
  const auth={onAuthStateChange(fn){notify=fn;},initialize:async()=>({})};
  const window={location:{search:'?workspace=timeline'},supabase:{createClient:()=>({auth})},addEventListener(){},
    RESEARCHTRAIL_CONFIG:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_PUBLISHABLE_KEY:'fixture'}};
  vm.runInNewContext(fs.readFileSync('web/js/account.js','utf8'),{document:{getElementById:id=>nodes.get(id),createElement:element},
    window,URLSearchParams,AbortController,fetch:async(url,init)=>{requests.push(init);return Response.json({});}});
  notify('INITIAL_SESSION',{user:{id:'a'},access_token:'fixture-a'});
  const frame=nodes.get('authWorkspace').firstElementChild;
  frame.contentWindow={startAccountTimeline(read,account){get=read;session=account;}};frame.load();
  await get('/tasks',{unexpected:'ignored'});
  const file=new File(['%PDF-1.4\n fixture\n%%EOF\n'],'합성.pdf',{type:'application/pdf'});
  await session.write('/tasks/t/papers',{request_id:'fixture'});
  await session.write('/tasks/t/papers/u/pdf',file,{pdf:true});
  await session.write('/tasks/t/paper-links/l',{reason_text:'수정'},{method:'PATCH'});
  await session.write('/tasks/t/paper-links/l',{request_id:'fixture'},{method:'DELETE'});
  assert.deepEqual(requests.map(r=>r.method),['GET','POST','POST','PATCH','DELETE']);
  assert.ok(requests.every(r=>r.headers.Authorization==='Bearer fixture-a'));
  assert.equal(requests[0].body,undefined);
  assert.equal(requests[2].body,file);
  assert.equal(requests[2].headers['X-PDF-Name'],encodeURIComponent(file.name));
  notify('SIGNED_IN',{user:{id:'b'},access_token:'fixture-b'});
  await assert.rejects(session.write('/tasks',{}));
  assert.equal(requests.length,5);
});
