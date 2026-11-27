// Signed-in form, catalog and PDF reader with independent client state.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto,randomUUID}=require('node:crypto');
const task=randomUUID(),use=randomUUID(),doc=randomUUID(),artifact=randomUUID();
const bytes='%PDF-1.4\n synthetic\n%%EOF\n';
const makeFile=(data=bytes,name='합성.pdf',type='application/pdf')=>new File([data],name,{type});

function client(transport){
  const nodes=new Map();
  function make(id){
    const handlers={};
    const node={value:'',files:[],style:{},dataset:{},hidden:false,textContent:'',disabled:false,
      focus(){},setAttribute(){},removeAttribute(){},querySelectorAll:()=>[],getContext:()=>({}),addEventListener(e,f){handlers[e]=f;},
      emit(e,target=this){return handlers[e]?.({target,preventDefault(){}});},
      set innerHTML(html){this.html=html;for(const [,id] of html.matchAll(/id="([^"]+)"/g))make(id);}};
    nodes.set(id,node);return node;
  }
  const html=fs.readFileSync('web/views/account-projects.html','utf8');
  for(const [,id] of html.matchAll(/id="([^"]+)"/g))make(id);
  const ctx=vm.createContext({document:{getElementById:id=>nodes.get(id),querySelector:s=>nodes.get(s.slice(1))},
    window:{addEventListener(){}},URL,TextDecoder,crypto:webcrypto,location:{search:''},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}}});
  for(const [,src] of html.matchAll(/<script src="(js\/[^"]+)"/g))vm.runInContext(fs.readFileSync('web/'+src,'utf8'),ctx);
  return {nodes,ctx,start:()=>ctx.startAccountProjects(transport,{accountId:'fixture',projectUrl:'synthetic',current:()=>true})};
}

test('account form rejects invalid PDFs before registration, retains the paper on retry and opens the exact artifact in a fresh client',async()=>{
  const calls=[],stored=[];
  let fail=true, selected;
  const api=async(path,body)=>{
    calls.push(path);
    if(path==='/tasks')return {tasks:[{task_id:task,task:{goal_text:'합성'}}]};
    if(path==='/documents')return {documents:[]};
    if(path.endsWith('/resume'))return {task_id:task,task:{goal_text:'합성'},records:[],next_actions:[],
      context:{questions:[],decisions:[],document_contexts:stored}};
    if(path.endsWith('/papers')&&body){
      assert.deepEqual(JSON.parse(JSON.stringify(body.artifacts)),[{access_locator_text:'https://doi.org/10.1234/example'}]);
      stored.push({document_use_id:use,document_id:doc,document:{title:'합성'},use:body.use,artifacts:body.artifacts.slice()});
      return {document_use_id:use};
    }
    if(path.endsWith('/papers/'+use+'/pdf')){
      if(fail){fail=false;throw Error('업로드 중단');}
      selected=await body.arrayBuffer();
      stored[0].artifacts.push({artifact_id:artifact,label_text:body.name,pdf:{available:true,size_bytes:body.size}});
      return {artifact_id:artifact};
    }
    assert.equal(path,'/tasks/'+task+'/artifacts/'+artifact+'/pdf');
    return new Blob([selected],{type:'application/pdf'});
  };
  const a=client(api);await a.start();await a.nodes.get('addBtn').emit('click');
  a.nodes.get('aTitle').value='합성';a.nodes.get('aSrc').value='10.1234/example';
  const file=a.nodes.get('aFile'),form=a.nodes.get('addForm');
  for(const bad of [makeFile('text'),makeFile(bytes,'bad.txt'),makeFile(bytes,'type.pdf','image/png'),makeFile(new Uint8Array(10485761))]){
    file.files=[bad];await form.emit('submit');assert.equal(a.nodes.get('aErr').hidden,false);
  }
  assert.equal(calls.filter(p=>p.endsWith('/papers')).length,0);
  file.files=[makeFile()];await form.emit('submit');assert.equal(a.nodes.get('aErr').hidden,false);
  await form.emit('submit');
  assert.equal(calls.filter(p=>p.endsWith('/papers')).length,1);
  const b=client(api);await b.start();const list=b.nodes.get('accountPapers');
  assert.match(list.html,/https:\/\/doi\.org\/10\.1234\/example/);assert.match(list.html,new RegExp(artifact));
  let rendered;
  b.ctx.loadPdfJs=async()=>{};
  b.ctx.pdfjsLib={getDocument:({data})=>{rendered=Buffer.from(data);return {promise:Promise.resolve({numPages:1,getPage:async()=>({
    getViewport:()=>({width:100,height:120}),render:()=>({promise:Promise.resolve()})})}),destroy:async()=>{}};}};
  await list.emit('click',{closest:()=>({dataset:{openPdf:artifact}})});
  assert.deepEqual(rendered,Buffer.from(bytes));
  assert.ok(calls.every(c=>!c.includes('/records')&&!c.includes('/next-actions')));
});

test('a pending attachment resumes from the catalog using the original bytes, while a DOI-only paper opens without a file request',async()=>{
  const crypto=require('node:crypto');
  const sha=crypto.createHash('sha256').update(bytes).digest('hex');
  const row={document_use_id:use,document_id:doc,document:{title:'합성'},use:{},artifacts:[
    {artifact_id:artifact,label_text:'합성.pdf',pdf:{available:false,sha256:sha,document_use_id:use}},
    {artifact_id:randomUUID(),access_locator_text:'https://doi.org/10.1234/example'}]};
  const calls=[];
  const api=async(path,body,options)=>{
    calls.push(path);
    if(path==='/tasks')return {tasks:[{task_id:task,task:{goal_text:'합성'}}]};
    if(path.endsWith('/resume'))return {task_id:task,records:[],next_actions:[],context:{questions:[],decisions:[],document_contexts:[row]}};
    assert.equal(path,'/tasks/'+task+'/papers/'+use+'/pdf');
    assert.equal(options.artifactId,artifact);
    assert.deepEqual(Buffer.from(await body.arrayBuffer()),Buffer.from(bytes));
    row.artifacts[0].pdf.available=true;
    return {artifact_id:artifact};
  };
  const c=client(api);await c.start();
  const list=c.nodes.get('accountPapers'),status=c.nodes.get('projectStatus');
  assert.match(list.html,/href="https:\/\/doi.org\/10.1234\/example"/);
  assert.match(list.html,new RegExp('data-expected-sha="'+sha+'"'));
  const input={files:[makeFile(bytes.replace('synthetic','another'))],dataset:{attachPdf:use,expectedSha:sha,artifactId:artifact}};
  await list.emit('change',input);
  assert.match(status.textContent,/처음 선택한 PDF/);
  assert.equal(calls.length,2);
  const field=c.nodes.get('rNote');field.value='합성 초안';field.emit('input');
  input.files=[makeFile()];await list.emit('change',input);
  assert.match(list.html,new RegExp('data-open-pdf="'+artifact+'"'));
  assert.equal(field.value,'합성 초안');
  assert.deepEqual(calls,['/tasks','/tasks/'+task+'/resume','/tasks/'+task+'/papers/'+use+'/pdf','/tasks/'+task+'/resume']);
});

test('closing the PDF on a task switch discards a late download',async()=>{
  const sibling=randomUUID();
  let release;
  const api=async path=>{
    if(path==='/tasks')return {tasks:[task,sibling].map(id=>({task_id:id,task:{goal_text:'합성'}}))};
    if(path.endsWith('/pdf'))return new Promise(resolve=>release=resolve);
    return {task_id:path.split('/')[2],records:[],next_actions:[],context:{questions:[],decisions:[],document_contexts:[]}};
  };
  const c=client(api);await c.start();
  let loaded=false;c.ctx.loadPdfJs=async()=>{loaded=true;};
  const opening=c.nodes.get('accountPapers').emit('click',{closest:()=>({dataset:{openPdf:artifact}})});
  await c.ctx.projAccountMenu.select(sibling);
  release(makeFile());await opening;
  assert.equal(loaded,false);assert.equal(c.nodes.get('accountPdfReader').hidden,true);
});

test('the signed-in transport sends raw PDF bytes with the selected artifact and returns a Blob on download',async()=>{
  const nodes=Object.fromEntries([...fs.readFileSync('web/views/account.html','utf8').matchAll(/id="([^"]+)"/g)]
    .map(([,id])=>[id,{addEventListener(){}}]));
  let notify,request;
  const workspace=nodes.authWorkspace;
  workspace.replaceChildren=()=>{workspace.firstElementChild=null;};
  workspace.appendChild=frame=>{workspace.firstElementChild=frame;};
  const document={getElementById:id=>nodes[id],createElement:()=>({
    addEventListener(type,fn){this[type]=fn;},contentWindow:{startAccountProjects(fn){request=fn;}}
  })};
  const window={location:{search:''},addEventListener(){},RESEARCHTRAIL_CONFIG:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_PUBLISHABLE_KEY:'synthetic'},
    supabase:{createClient:()=>({auth:{onAuthStateChange(fn){notify=fn;},initialize:async()=>({})}})}};
  const file=makeFile();
  const fetch=async(url,options)=>{
    assert.equal(options.headers.Authorization,'Bearer synthetic-session');
    if(options.method==='POST'){
      assert.equal(options.headers['Content-Type'],'application/pdf');
      assert.equal(decodeURIComponent(options.headers['X-PDF-Name']),file.name);
      assert.equal(options.headers['X-PDF-Artifact'],artifact);
      assert.equal(options.body,file);
      return Response.json({artifact_id:artifact},{status:201});
    }
    return new Response(file,{headers:{'content-type':'application/pdf'}});
  };
  vm.runInNewContext(fs.readFileSync('web/js/account.js','utf8'),{window,document,URLSearchParams,AbortController,fetch});
  notify('SIGNED_IN',{user:{id:'fixture'},access_token:'synthetic-session'});
  workspace.firstElementChild.load();
  const ack=await request('/tasks/'+task+'/papers/'+use+'/pdf',file,{pdf:true,artifactId:artifact});
  assert.equal(ack.artifact_id,artifact);
  const download=await request('/tasks/'+task+'/artifacts/'+artifact+'/pdf',undefined,{pdf:true});
  assert.deepEqual(Buffer.from(await download.arrayBuffer()),Buffer.from(bytes));
});

test('the UI accepts exactly 10 MiB and distinguishes same-name editions',async()=>{
  const c=client(async()=>{});
  const limit=10*1024*1024;
  const data=new Uint8Array(limit);
  data.set(Buffer.from('%PDF-1.4\n'));
  data.set(Buffer.from('%%EOF\n'),limit-6);
  await c.ctx.validateAccountPdf(makeFile(data));
  await assert.rejects(c.ctx.validateAccountPdf(makeFile('')),/0바이트/);
  for(const digit of ['a','b']){
    const a={artifact_id:randomUUID(),label_text:'같은.pdf',pdf:{available:true,sha256:digit.repeat(64)}};
    const button=c.ctx.accountPdfArtifactHtml(use,a,true);
    assert.match(button,new RegExp(a.artifact_id));
    assert.match(button,new RegExp('같은.pdf · '+digit.repeat(8)+' 열기'));
  }
});
