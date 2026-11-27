// Draft AC4/AC5/AC6 and SPEC §4.2 regression. Serve the account build through the PKCE callback.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {mkdir}=require('node:fs/promises');
const {randomUUID,createHash} = require('node:crypto');
const {chromium} = require('playwright-core');
const {fixture} = require('./fixtures/account-chat-api.cjs');
const {runProductQuestionChecks} = require('./fixtures/product-question-checks.cjs');

const root = path.resolve(__dirname, '../dist');
const origin = 'http://localhost';
const service = '/functions/v1/researchtrail';
const owner = 'synthetic-product-owner';
const title = '두 번째 기기에서 열 논문';
const purpose = '합성 자료에서 방법 확인';
const memo = '  다음 읽기 때 두 번째 쪽 대조  ';
const names = {A:'공동 연구', B:'첫 프로젝트'};

function merge(data,patch) {
  for (const [key,value] of Object.entries(patch)) {
    if (value === null) delete data[key];
    else if (value && typeof value === 'object' && !Array.isArray(value)) data[key]=merge({...data[key]},value);
    else data[key]=value;
  }
  return data;
}
function mockAccount() {
  const qa=fixture(), projects={B:names.B,A:names.A};
  let selection={revision:0,task_id:null};
  const papers={A:qa.papers.map(row=>({...row,use:{reading_state_text:'읽는 중'}})),B:[]};
  const meta=Object.fromEntries(['B','A'].map(task=>[task,{
    project:{version:1,data:{tourSeen:true}}, papers:{}, artifacts:{}
  }]));
  const writes=[],files=[],auth=[],unexpected=[],links={A:[],B:[]},records={A:[],B:[]},reader=new Map();
  let failHighlight=true,failMemo=true;
  const paperStarted=Promise.withResolvers(),paperReceipt=Promise.withResolvers();
  async function routeRequest(route) {
    const req=route.request(),url=new URL(req.url()),method=req.method();
    const json=data=>route.fulfill({json:data});
    if (url.origin!==origin) return route.abort();
    if (url.pathname==='/js/browser-config.js') return route.fulfill({contentType:'text/javascript',
      body:"window.RESEARCHTRAIL_CONFIG={SUPABASE_URL:'http://localhost',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'}"});
    if (url.pathname==='/auth/v1/authorize') {
      assert.equal(url.searchParams.get('provider'),'google');
      assert.ok(url.searchParams.get('code_challenge'));
      const callback=new URL(url.searchParams.get('redirect_to'));
      callback.searchParams.set('code',owner);
      return route.fulfill({status:302,headers:{location:callback.href}});
    }
    if (url.pathname==='/auth/v1/token') {
      assert.equal(url.searchParams.get('grant_type'),'pkce');
      const {auth_code,code_verifier}=req.postDataJSON();
      assert.equal(auth_code,owner);
      assert.ok(code_verifier); auth.push(auth_code);
      return json({user:{id:owner},access_token:owner,refresh_token:'fixture',token_type:'bearer',expires_in:3600});
    }
    if (url.pathname==='/favicon.ico') return route.fulfill({status:204});
    if (url.pathname==='/auth/v1/logout') return route.fulfill({status:204});
    if (!url.pathname.startsWith(service+'/')) return route.fulfill({path:path.join(root,url.pathname==='/'?'index.html':url.pathname.slice(1))});
    assert.equal(req.headers().authorization,'Bearer '+owner);
    const apiPath=url.pathname.slice(service.length);
    const [,resource,task,kind,id,action]=apiPath.split('/');
    if (kind==='papers' && action==='pdf' && method==='POST') {
      const bytes=req.postDataBuffer(), row=papers[task].find(row=>row.document_use_id===id);
      const artifact_id=randomUUID(),label_text=decodeURIComponent(req.headers()['x-pdf-name']);
      row.artifacts.push({artifact_id,label_text,pdf:{available:true,sha256:createHash('sha256').update(bytes).digest('hex')}});
      qa.files[artifact_id]=bytes;
      writes.push({apiPath,method,body:{artifact_id,label_text}});
      return json({task_id:task,document_use_id:id,artifact_id});
    }
    const body=method==='GET'?null:req.postDataJSON();
    if (body) writes.push({apiPath,body,method});
    if (resource==='documents' && method==='GET') return json({documents:[]});
    if (resource==='tasks' && !task && method==='GET') return json({selection,tasks:Object.keys(projects).map(task_id=>({
      task_id,task:{goal_text:projects[task_id]},paper_count:papers[task_id].length
    }))});
    if (resource==='tasks' && !task && method==='POST') {
      const created=randomUUID();
      projects[created]=body.goal_text;
      papers[created]=[];links[created]=[];records[created]=[];
      meta[created]={project:{version:0,data:{}},papers:{},artifacts:{}};
      return json({task_id:created,task:{goal_text:body.goal_text}});
    }
    if (!Object.hasOwn(meta,task)) throw Error('Unrecognized synthetic project');
    if (kind==='active-project') {
      assert.equal(method,'PATCH');
      if(body.revision>selection.revision || (body.revision===selection.revision && body.request_id>selection.request_id))
        selection={revision:body.revision,task_id:task,request_id:body.request_id};
      return json(selection);
    }
    if (kind==='resume') return json({task_id:task,task:{goal_text:projects[task]},records:records[task],next_actions:[],
      context:{document_contexts:papers[task],questions:[],decisions:[]}});
    if (kind==='papers' && method==='GET') return json({papers:papers[task]});
    if (kind==='paper-links') {
      if (method==='GET') return json({links:links[task]});
      assert.ok(papers[task].some(row=>row.document_use_id===body.from_document_use_id));
      assert.ok(papers[task].some(row=>row.document_use_id===body.to_document_use_id));
      const link={link_id:randomUUID(),from_document_use_id:body.from_document_use_id,to_document_use_id:body.to_document_use_id,reason_text:body.reason_text};
      links[task].push(link);
      return json(link);
    }
    if (kind==='records' && method==='POST') {
      if (failMemo) {
        failMemo=false;
        return route.fulfill({status:503,json:{error:{code:'STORAGE_FAILURE'}}});
      }
      const ref=body.context.document_contexts[0],record_id=randomUUID();
      const record={record_id,task_id:task,record:body.record,created_at:new Date().toISOString(),
        context_refs:{document_ids:[ref.document_ref.document_id],artifact_ids:[ref.artifact_ref.artifact_id]}};
      records[task].unshift(record);
      (meta[task].record_requests||={})[record_id]=body.request_id;
      return json(record);
    }
    if (kind==='artifacts' && action==='reader') {
      const key=task+'/'+id;
      if (!reader.has(key)) reader.set(key,{last_page:1,highlights:[]});
      const state=reader.get(key);
      if (body?.last_page) state.last_page=body.last_page;
      if (body?.highlight) {
        if (failHighlight) {
          failHighlight=false;
          return route.fulfill({status:503,json:{error:{code:'STORAGE_FAILURE'}}});
        }
        state.highlights.push(body.highlight);
      }
      if (body?.link) state.highlights.find(mark=>mark.id===body.link.id).record_id=body.link.record_id;
      return json(state);
    }
    if (kind==='papers' && method==='POST') {
      paperStarted.resolve();
      await paperReceipt.promise;
      const row={document_use_id:task==='A'?'added':randomUUID(),document_id:randomUUID(),document:body.document,
        use:body.use,date:body.date,artifacts:body.artifacts};
      papers[task].push(row);
      return json({...row,task_id:task,artifact_ids:[]});
    }
    if (kind==='workspace') {
      if (method==='GET') {
        const reader_highlights={},reading_pages={};
        for(const paper of papers[task])for(const artifact of paper.artifacts){
          const state=reader.get(task+'/'+artifact.artifact_id);
          if(state){reader_highlights[artifact.artifact_id]=state.highlights;reading_pages[artifact.artifact_id]=state.last_page;}
        }
        return json({...meta[task],reader_highlights,reading_pages});
      }
      assert.equal(method,'PATCH');
      const {target,id,version,patch}=body;
      const head=target==='project'?meta[task].project:(meta[task][target+'s'][id]||={version:0,data:{}});
      if (head.version!==version) return route.fulfill({status:409,json:{error:{code:'STORAGE_FAILURE'}}});
      head.data=merge(head.data,patch);
      head.version++;
      if(body.paper_fields){
        const row=papers[task].find(p=>p.document_use_id===id), fields=body.paper_fields;
        if('title' in fields)row.document.title=fields.title;
        if('date' in fields)row.date=fields.date;
        if('access_locator_text' in fields)row.access_locator_text=fields.access_locator_text;
        for(const name of ['purpose_text','reading_state_text'])if(name in fields)row.use[name]=fields[name];
        return json({...head,paper_fields:fields});
      }
      return json(head);
    }
    if (kind==='artifacts' && action==='pdf') {
      assert.equal(method,'GET');
      files.push({task,id});
      return route.fulfill({contentType:'application/pdf',body:qa.files[id]});
    }
    if (kind==='rag-index' || kind==='artifacts' && ['rag-index','ask'].includes(action)) {
      try {return await json(await qa.request(apiPath,body));}
      catch(error) {
        if (!/^Synthetic /.test(error.message)) throw error;
        return route.fulfill({status:503,json:{error:{code:'STORAGE_FAILURE',message:'합성 요청 실패'}}});
      }
    }
    throw Error('Unrecognized synthetic route '+method+' '+apiPath);
  }
  return {qa,papers,projects,meta,writes,files,auth,unexpected,links,records,reader,paperStarted,paperReceipt,
    route:async route=>{
      try {await routeRequest(route);}
      catch(error) {unexpected.push(error.message);await route.abort().catch(()=>{});}
    }};
}
async function startClient(browser,server) {
  const context=await browser.newContext({viewport:{width:1320,height:900}});
  await context.route('**/*',server.route);
  await context.addInitScript(()=>{
    if(window!==window.top || localStorage.getItem('researchtrail.v5'))return;
    localStorage.setItem('researchtrail.tour','1');
    localStorage.setItem('researchtrail.v5',JSON.stringify({name:'기기 자료',tags:[],papers:[
      {id:'local',date:'2026-01-01',title:'이 기기의 논문',memo:'기기 기록',hl:[],tag:'',state:'reading'}
    ]}));
  });
  const page=await context.newPage();
  page.setDefaultTimeout(12000);
  const ui=page.frameLocator('#authWorkspace iframe'),el=selector=>ui.locator(selector);
  await page.goto(origin);
  await el('#tName').filter({hasText:'기기 자료'}).waitFor();
  return {context,page,el};
}
async function visitProject(client,task,title=names[task]) {
  const {el}=client;
  await el('#tName').click();
  await el('[data-pj-go="'+task+'"]').click();
  await el('#tName').filter({hasText:title}).waitFor();
}
async function login({page,el},expected=names.B) {
  await page.locator('#authLogin').click();
  await el('#tName').filter({hasText:expected}).waitFor();
}
async function productControls(el) {
  const selectors=['.side #homeBtn','.side #addBtn','.side #vCard','.side #vDot','.side #vList','.side #vFind','.side #tagAdd','#tName'];
  return Promise.all(selectors.map(selector=>el(selector).evaluate(node=>[node.tagName,node.id,node.getAttribute('aria-label')])));
}
async function captureProduct(page,name) {
  const directory=process.env.RESEARCHTRAIL_CAPTURE_DIR;
  if (!directory) return;
  await mkdir(directory,{recursive:true});
  await page.locator('#authWorkspace iframe').screenshot({path:path.join(directory,name+'.png'),animations:'disabled'});
}
async function savedGuestPaper(page) {
  return page.evaluate(()=>{
    const papers=JSON.parse(localStorage.getItem('researchtrail.v5')).papers;
    return papers.map(({id,title,memo})=>[id,title,memo]);
  });
}

test('Google callback uses the original workspace controls and saves the selected edition across two independent clients',
  {timeout:120000},async t=>{
    const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
    t.after(()=>browser.close());
    const server=mockAccount();
    const first=await startClient(browser,server);
    const {page,el}=first;
    const controls=await productControls(el);
    const guest=[['local','이 기기의 논문','기기 기록']];
    assert.deepEqual(await savedGuestPaper(page),guest);
    await login(first);
    assert.deepEqual(await productControls(el),controls);
    assert.equal(server.writes.some(w=>w.apiPath.endsWith('/active-project')),false);
    assert.equal(await el('#workspaceTask, #accountPaperDetail').count(),0);
    await visitProject(first,'A');
    await el('#undatedPapers .card[data-id="draft"]').waitFor();
    await captureProduct(page,'01-timeline');
    await el('#vDot').click();
    await el('#dotsvg .dn[data-id="draft"]').waitFor();
    await captureProduct(page,'02-graph');
    await el('#vList').click();
    await el('[data-list-paper="draft"]').waitFor();
    await captureProduct(page,'03-list');
    assert.equal(await el('[data-list-paper="local"]').count(),0);
    await el('#vCard').click();
    await el('#undatedPapers .card[data-id="draft"]').click();
    await el('#panel #pEdition').selectOption('draft');
    await captureProduct(page,'04-detail');
    await el('#panel #pRead').click();
    await el('.pgbox[data-n="1"] .textLayer span').first().waitFor();
    await captureProduct(page,'05-reader');
    await runProductQuestionChecks(page,el,server.qa);
    const pageTwo=el('.pgbox[data-n="2"] .textLayer span').filter({hasText:'Draft passage 2'}).first();
    await pageTwo.dblclick();
    await el('#hlbar [data-a="hl"]').click();
    const retry=el('.product-retries button').filter({hasText:'하이라이트 다시 저장'});
    await retry.waitFor();
    assert.doesNotMatch(await el('#memoStatus').innerText(),/이제 닫아도/);
    await el('#rdBack').click();
    await el('#vList').click();
    await el('[data-list-paper="draft"]').click();
    await el('#pvTot').waitFor();
    await retry.click();
    await el('#memoStatus').filter({hasText:'이제 닫아도 돼요'}).waitFor();
    const attempts=server.writes.filter(w=>w.body.highlight);
    assert.equal(attempts.length,2);
    assert.deepEqual(attempts[0],attempts[1]);
    const [anchor]=server.reader.get('A/draft').highlights;
    assert.equal(anchor.page,2);
    assert.ok('Draft passage 2'.includes(anchor.text) && anchor.text.length>0);
    assert.ok(anchor.rects.length>0);

    await el('#rCompose textarea').fill(memo);
    await el('#rCompose .rq-save').click();
    await el('#memoStatus').filter({hasText:/메모 저장을 확인하지 못했어요/}).waitFor();
    await el('#rdBack').click();
    await visitProject(first,'B');
    await page.reload();
    await el('#tName').filter({hasText:names.B}).waitFor();
    await el('#memoStatus').filter({hasText:/공동 연구.*메모 저장을 확인하지 못했어요/}).waitFor();
    assert.doesNotMatch(await el('#memoStatus').innerText(),/이제 닫아도/);
    await visitProject(first,'A');
    await el('#vList').click();
    await el('[data-list-paper="draft"]').click();
    await el('#accountReaderNotice button').filter({hasText:'메모 다시 저장'}).click();
    await el('#memoStatus').filter({hasText:'이제 닫아도 돼요'}).waitFor();
    assert.equal(server.records.A.length,1);
    assert.equal(server.records.A[0].record.content_text,memo);
    assert.deepEqual(server.records.A[0].context_refs,{document_ids:['draft'],artifact_ids:['draft']});
    const memos=server.writes.filter(w=>w.apiPath==='/tasks/A/records');
    assert.equal(memos.length,2);
    assert.deepEqual(memos[0],memos[1]);
    await el('#rdBack').click();
    await el('#tagAdd').click();
    await el('#tagNew').fill('실험');
    const tagAck=page.waitForResponse(r=>r.url().endsWith('/tasks/A/workspace') && r.request().method()==='PATCH' &&
      r.request().postDataJSON()?.patch?.tags?.some(tag=>tag.name==='실험'));
    await el('#tagNew').press('Enter');
    await tagAck;
    await el('#addBtn').click();
    await el('#aTitle').fill(title);
    await el('#aMemo').fill(purpose);
    await el('#addForm button[type="submit"]').click();
    await server.paperStarted.promise;
    await el('#memoStatus').filter({hasText:'논문 등록 저장 중'}).waitFor();
    assert.doesNotMatch(await el('#memoStatus').innerText(),/이제 닫아도/);
    assert.equal(server.papers.A.some(row=>row.document.title===title),false);
    server.paperReceipt.resolve();
    await el('#panel #pRead').waitFor();
    await el('#memoStatus').filter({hasText:'이제 닫아도 돼요'}).waitFor();
    assert.deepEqual(server.papers.A.find(row=>row.document_use_id==='added').use.purpose_text,purpose);
    await el('#vCard').click();
    await el('.card[data-id="added"]').click();
    await el('#lkStart').click();
    await el('#undatedPapers .card[data-id="draft"]').click();
    await el('#lkWhy').fill('두 자료의 실험 방법 비교');
    await el('#lkOk').click();
    await el('#panel').filter({hasText:'두 자료의 실험 방법 비교'}).waitFor();
    assert.deepEqual(server.links.A.map(({from_document_use_id,to_document_use_id,reason_text})=>
      [from_document_use_id,to_document_use_id,reason_text]),[['added','draft','두 자료의 실험 방법 비교']]);
    assert.deepEqual(server.papers.B,[]);
    assert.deepEqual(await savedGuestPaper(page),guest);

    const second=await startClient(browser,server);
    await login(second,names.A);
    await second.page.reload();
    await second.el('#tName').filter({hasText:names.A}).waitFor();
    await second.el('#chips').filter({hasText:'실험'}).waitFor();
    await second.el('#vDot').click();
    await second.el('#dotsvg .de').waitFor();
    await second.el('#vList').click();
    await second.el('[data-list-paper="added"]').filter({hasText:title}).waitFor();
    await second.el('[data-list-paper="draft"]').click();
    await second.el('#pvTot').filter({hasText:'34'}).waitFor();
    await second.page.waitForFunction(()=>document.querySelector('#authWorkspace iframe').contentDocument.querySelector('#pvNum')?.value==='2');
    await second.el('#rRecords .rc-preview').filter({hasText:memo.trim()}).waitFor();
    await second.el('#rRecords [data-rid="'+anchor.id+'"]').waitFor();
    assert.ok(server.files.length>=4 && server.files.every(f=>f.task==='A' && f.id==='draft'));
    assert.equal(server.reader.get('A/draft').last_page,2);
    assert.equal(server.writes.some(w=>w.body.last_page===1),false);
    assert.equal(server.writes.some(w=>JSON.stringify(w.body).includes('기기 기록')),false);
    assert.deepEqual(server.auth,[owner,owner]);
    assert.deepEqual(server.writes.filter(w=>w.apiPath.endsWith('/active-project')).map(w=>w.apiPath),
      ['/tasks/A/active-project','/tasks/B/active-project','/tasks/A/active-project']);
    await page.locator('#authLogout').click();
    await el('#tName').filter({hasText:'기기 자료'}).waitFor();
    await el('#vList').click();
    await el('[data-list-paper="local"]').filter({hasText:'이 기기의 논문'}).waitFor();
    assert.equal(await el('[data-list-paper]').count(),1);
    assert.deepEqual(await savedGuestPaper(page),guest);
    assert.deepEqual(server.unexpected,[]);
});


test('a project created through the original picker reopens its two registered papers, link, private edition, memo and page',
  {timeout:90000},async t=>{
    const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
    t.after(()=>browser.close());
    const server=mockAccount();
    server.paperReceipt.resolve();
    const first=await startClient(browser,server),{el}=first;
    await login(first);
    const projectName='새 프로젝트 합성 검증';
    await el('#tName').click();
    await el('[data-pj-new]').click();
    await el('#pjmNew').fill(projectName);
    await el('#pjmNew').press('Enter');
    await el('#tName').filter({hasText:projectName}).waitFor();
    const task=Object.keys(server.projects).find(id=>server.projects[id]===projectName);
    assert.ok(task);
    for(const [name,hasPdf] of [['합성 원문',true],['후속 자료',false]]) {
      await el('#addBtn').click();
      await el('#aTitle').fill(name);
      await el('#aMemo').fill(name+' 확인');
      if(hasPdf) await el('#aFile').setInputFiles({name:'합성.pdf',mimeType:'application/pdf',buffer:server.qa.files.draft});
      await el('#addForm button[type=submit]').click();
      await el('#panel #pRead').waitFor();
    }
    const [original,linked]=server.papers[task], edition=original.artifacts[0];
    assert.deepEqual(server.papers[task].map(row=>row.document.title),['합성 원문','후속 자료']);
    assert.ok(server.qa.files[edition.artifact_id].equals(server.qa.files.draft));
    await el('#lkStart').click();
    await el('.card[data-id="'+original.document_use_id+'"]').press('Enter');
    await el('#lkWhy').fill('실험 조건 대조');
    await el('#lkOk').click();
    await el('#panel').filter({hasText:'실험 조건 대조'}).waitFor();
    assert.deepEqual(server.links[task].map(l=>[l.from_document_use_id,l.to_document_use_id]),[[linked.document_use_id,original.document_use_id]]);
    await el('#vList').click();
    await el('[data-list-paper="'+original.document_use_id+'"]').click();
    await el('#pvTot').filter({hasText:'34'}).waitFor();
    const pageSaved=first.page.waitForResponse(r=>r.url().endsWith('/'+edition.artifact_id+'/reader') && r.request().method()==='POST' &&
      r.request().postDataJSON()?.last_page===2);
    await el('#pvNext').click();
    await pageSaved;
    await el('#rCompose textarea').fill(memo);
    await el('#rCompose .rq-save').click();
    const retry=el('#accountReaderNotice button').filter({hasText:'메모 다시 저장'});
    await retry.click();
    await el('#memoStatus').filter({hasText:'이제 닫아도 돼요'}).waitFor();
    assert.deepEqual(server.records[task][0].context_refs,{document_ids:[original.document_id],artifact_ids:[edition.artifact_id]});
    const second=await startClient(browser,server);
    await login(second,projectName);
    await second.page.reload();
    await second.el('#tName').filter({hasText:projectName}).waitFor();
    await second.el('#vList').click();
    for(const row of server.papers[task])
      await second.el('[data-list-paper="'+row.document_use_id+'"]').filter({hasText:row.document.title}).waitFor();
    await second.el('[data-list-paper="'+original.document_use_id+'"]').click();
    await second.el('#rRecords .rc-preview').filter({hasText:memo.trim()}).waitFor();
    await second.page.waitForFunction(()=>document.querySelector('#authWorkspace iframe').contentDocument.querySelector('#pvNum')?.value==='2');
    assert.deepEqual(server.files.map(f=>[f.task,f.id]),[[task,edition.artifact_id],[task,edition.artifact_id]]);
    assert.deepEqual(server.unexpected,[]);
});

test('two already signed-in browser sessions share the project graph, original PDF bytes, linked memo, anchor and page after refresh',
  {timeout:120000},async t=>{
    const {runProductPersistenceJourney}=await import('./fixtures/product-persistence-journey.mjs');
    const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
    t.after(()=>browser.close());
    const server=mockAccount();
    server.paperReceipt.resolve();
    const first=await startClient(browser,server), second=await startClient(browser,server);
    await login(first);
    await login(second);
    const result=await runProductPersistenceJourney({first,second,pdf:server.qa.files.draft,allowRetry:true});
    const state=server.reader.get(result.task+'/'+result.edition);
    assert.equal(state.last_page,3);
    assert.ok(state.highlights.some(h=>h.id===result.anchor && h.record_id===result.record));
    assert.deepEqual(server.unexpected,[]);
});

test('an area captured from the actual PDF canvas can be found before opening the reader on a second client',
  {timeout:90000},async t=>{
    const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
    t.after(()=>browser.close());
    const server=mockAccount(),first=await startClient(browser,server),{el,page}=first;
    await login(first);await visitProject(first,'A');
    await el('.card[data-id="draft"]').click();
    await el('#pEdition').selectOption('draft');await el('#pRead').click();
    await el('#pvNum').fill('2');await el('#pvNum').press('Tab');
    const canvas=el('.pgbox[data-n="2"] canvas');
    await canvas.scrollIntoViewIfNeeded();await el('#pvCap').click();
    const box=await canvas.boundingBox(), viewport=await el('#pvs').boundingBox();
    const x=Math.max(box.x,viewport.x)+30,y=Math.max(box.y,viewport.y)+40;
    await page.mouse.move(x,y);await page.mouse.down();
    await page.mouse.move(x+110,y+70,{steps:8});await page.mouse.up();
    const card=el('#rRecords .reading-card:has(img.rv-img)').first();
    await card.waitFor();const id=await card.getAttribute('data-rid');
    const shot=await card.locator('img.rv-img').getAttribute('src');
    assert.match(shot,/^data:image\/(png|jpeg);base64,/);
    const text='도표의 합성 계정 메모';
    await card.locator('textarea[data-hm]').fill(text);await card.locator('textarea[data-hm]').press('Tab');
    await el('#accountReaderNotice button').filter({hasText:'메모 다시 저장'}).click();
    await el('#memoStatus').filter({hasText:'이제 닫아도 돼요'}).waitFor();
    const captured=server.meta.A.artifacts.draft.data.cards[id];
    assert.equal(captured.img,shot);assert.equal(captured.page,2);assert.equal(captured.rects.length,1);
    assert.deepEqual(server.records.A[0].context_refs.artifact_ids,['draft']);
    const pageWrite=page.waitForResponse(r=>r.url().endsWith('/artifacts/draft/reader') &&
      r.request().method()==='POST' && r.request().postDataJSON()?.last_page===3);
    await el('#pvNum').fill('3');await el('#pvNum').press('Tab');await pageWrite;
    assert.equal(server.reader.get('A/draft').last_page,3);

    const second=await startClient(browser,server);await login(second,names.A);
    await second.page.reload();await second.el('#tName').filter({hasText:names.A}).waitFor();
    await second.el('#vFind').click();await second.el('#fdQ').fill(text);
    const hit=second.el('#fdL [data-i]').filter({hasText:text});
    await hit.waitFor();assert.equal(await hit.locator('img').getAttribute('src'),shot);
    await hit.click();
    const restored=second.el('#rRecords [data-rid="'+id+'"]');
    await second.el('#pvTot').waitFor();await restored.locator('.rc-preview').filter({hasText:text}).waitFor();
    assert.equal(await restored.locator('.rv-img').getAttribute('src'),shot);
    await second.page.waitForFunction(()=>document.querySelector('#authWorkspace iframe').contentDocument.querySelector('#pvNum')?.value==='2');
    await restored.locator('.rv-meta').click();await restored.locator('[data-rv="del"]').click();await second.el('#dgOk').click();
    await restored.waitFor({state:'detached'});
    assert.equal(server.meta.A.artifacts.draft.data.cards[id].deleted,true);
    assert.equal(server.meta.A.artifacts.draft.data.cards[id].img,undefined);
    assert.equal(server.records.A.length,1);
    assert.deepEqual(server.unexpected,[]);
});
