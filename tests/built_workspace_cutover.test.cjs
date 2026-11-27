// Draft browser regression for SPEC AC4/AC5/AC6. Use the shipped root, DOM and controls.
// Build with SUPABASE_URL=http://localhost SUPABASE_PUBLISHABLE_KEY=sb_publishable_fixture npm run build.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright-core');

const root = path.resolve(__dirname,'../dist');
const origin = 'http://localhost';
const service = '/functions/v1/researchtrail';
function task(id) { return {task_id:id,task:{goal_text:id}}; }
function paper(id,title,artifacts=[]) {
  return {document_use_id:id,document_id:id,document:{title},use:{},date:null,artifacts};
}

test('root login, eligible project restore, shared controls, device work and a new account',async t=>{
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
  t.after(()=>browser.close());
  const ctx = await browser.newContext({viewport:{width:1280,height:800}});
  const tasks={A:[task('first'),task('second')],B:[]};
  const papers={first:[],second:[paper('source','계정 연구 자료',[
    {artifact_id:'paper-pdf',label_text:'판본.pdf',pdf:{available:true,sha256:'00001234'}},
    {artifact_id:'url',label_text:'출판사 원문',access_locator_text:'https://example.invalid/article'}
  ])]};
  const records=[], actions=[], writes=[], scopes=[], oldDocuments=[], exchanges=[];
  let nextAccount='A';
  await ctx.route('**/*',async route=>{
    const req=route.request(), url=new URL(req.url());
    if(url.origin!==origin) return route.abort();
    if(url.pathname==='/js/browser-config.js') return route.fulfill({contentType:'text/javascript',
      body:"window.RESEARCHTRAIL_CONFIG={SUPABASE_URL:'http://localhost',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'}"});
    if(url.pathname==='/auth/v1/authorize') {
      assert.equal(url.searchParams.get('provider'),'google');
      assert.ok(url.searchParams.get('code_challenge'));
      const callback=new URL(url.searchParams.get('redirect_to'));
      callback.searchParams.set('code',nextAccount);
      return route.fulfill({status:302,headers:{location:callback.href}});
    }
    if(url.pathname==='/auth/v1/token') {
      const {auth_code:id,code_verifier:verifier}=req.postDataJSON();
      assert.equal(url.searchParams.get('grant_type'),'pkce');
      assert.ok(verifier); exchanges.push(id);
      return route.fulfill({json:{user:{id},access_token:id,token_type:'bearer',refresh_token:'fixture-'+id,expires_in:3600}});
    }
    if(url.pathname==='/auth/v1/logout') return route.fulfill({status:204});
    if(!url.pathname.startsWith(service+'/')){
      if(url.pathname==='/views/account-projects.html' && req.isNavigationRequest()) oldDocuments.push(req.url());
      return route.fulfill({path:path.join(root,url.pathname==='/'?'index.html':url.pathname.slice(1))});
    }
    const who=req.headers().authorization?.slice(7);
    const [,resource,id,kind,artifact,operation]=url.pathname.slice(service.length).split('/');
    const json=data=>route.fulfill({json:data});
    if(!tasks[who]) return route.fulfill({status:401,json:{}});
    if(req.method()!=='GET') writes.push({who,id,kind,body:req.postDataJSON()});
    if(resource==='documents') return json({documents:[]});
    if(!id && req.method()==='GET') return json({tasks:tasks[who]});
    if(!id) {
      const created=task(req.postDataJSON().goal_text);
      tasks[who].push(created); papers[created.task_id]=[]; return json(created);
    }
    scopes.push([who,id]);
    if(!tasks[who].some(t=>t.task_id===id)) return route.fulfill({status:403,json:{}});
    if(kind==='papers' && req.method()==='GET') return json({papers:papers[id]});
    if(kind==='papers') {
      const row=paper('added',req.postDataJSON().document.title);
      papers[id].push(row); return json(row);
    }
    if(kind==='paper-links') return json({links:[]});
    if(kind==='resume') return json({task_id:id,task:{goal_text:id},records:records.filter(r=>r.task_id===id),
      next_actions:actions.filter(a=>a.task_id===id),context:{document_contexts:papers[id],questions:[],decisions:[]}});
    if(kind==='records'){
      if(req.postDataJSON().record.content_text==='계정 전용 초안') return route.fulfill({status:503,json:{error:{code:'STORAGE_FAILURE'}}});
      const saved={record_id:'r1',task_id:id,record:req.postDataJSON().record,context_refs:{document_ids:[],artifact_ids:[]}};
      records.push(saved); return json(saved);
    }
    if(kind==='next-actions') {
      const body=req.postDataJSON();
      const saved={...body,task_id:id,next_action_id:'action1',saved_action:body.reviewed_action};
      actions.push(saved); return json(saved);
    }
    if(artifact==='paper-pdf' && operation==='pdf') {
      const {syntheticPdf}=await import('./fixtures/synthetic-pdf.mjs');
      return route.fulfill({contentType:'application/pdf',body:Buffer.from(syntheticPdf())});
    }
    if(artifact==='paper-pdf' && operation==='reader') return json({last_page:1,highlights:[]});
    return route.fulfill({status:404,json:{}});
  });

  const page=await ctx.newPage();
  page.setDefaultTimeout(8000);
  await page.addInitScript(()=>{
    if(window!==window.top || localStorage.getItem('researchtrail.v5')) return;
    localStorage.setItem('researchtrail.v5',JSON.stringify({name:'기기 자료',tags:[],
      papers:[{id:'local',title:'이 기기의 논문',date:'2026-01-01',memo:'기기 기록',hl:[]}]}));
  });
  const ui=page.frameLocator('#authWorkspace iframe'), el=s=>ui.locator(s);
  const textVisible=async (selector,text)=>el(selector).filter({hasText:text}).first().waitFor();
  const select=()=>el('#workspaceTask').inputValue();
  await page.goto(origin);
  await page.locator('#authLogin').click();
  await el('#workspaceTask option[value="second"]').waitFor({state:'attached'});
  assert.equal(await select(),'first');
  await el('#workspaceTask').selectOption('second');
  await textVisible('#undatedPapers','계정 연구 자료');
  await el('#vDot').click();
  await el('#dotwrap').waitFor();
  assert.equal(await el('#vList').getAttribute('aria-pressed'),'false');
  await el('#vList').click();
  await el('[data-list-paper="source"]').click();
  assert.equal(await el('#accountPaperDetail a').getAttribute('href'),'https://example.invalid/article');
  await el('[data-open-pdf="paper-pdf"]').click();
  await el('#accountPdfText span').first().waitFor();
  assert.equal(writes.length,0);
  await el('#rNote').fill('계정 전용 메모');
  await el('#memoFinish').click();
  await textVisible('#memoStatus','이제 닫아도');
  assert.equal(records[0].record.content_text,'계정 전용 메모');
  await el('[data-review-record="r1"][data-mode="manual"]').click();
  await el('#naCand').fill('원문 대조하기');
  assert.equal(actions.length,0);
  await el('#naOk').click();
  await textVisible('#accountActions','원문 대조하기');
  assert.equal(actions.length,1);
  await el('#rdBack').click();
  await el('#addBtn').click();
  await el('#aTitle').fill('추가한 논문');
  await el('#addForm button[type=submit]').click();
  await textVisible('#paperListRows','추가한 논문');
  await page.reload();
  await textVisible('#undatedPapers','추가한 논문');
  assert.equal(await select(),'second');
  const fresh=await ctx.newPage();
  await fresh.goto(origin);
  const independent=fresh.frameLocator('#authWorkspace iframe');
  await independent.locator('#workspaceTask option[value="second"]').waitFor({state:'attached'});
  assert.equal(await independent.locator('#workspaceTask').inputValue(),'first');
  await fresh.close();
  await el('#workspaceRecords').click();
  await el('#rNote').fill('계정 전용 초안');
  await page.locator('#authOpenLocal').click();
  await el('#vList').click();
  await textVisible('#paperList','이 기기의 논문');
  assert.doesNotMatch(await ui.locator('body').innerText(),/계정 전용|추가한 논문|계정 연구 자료/);
  await page.locator('#authBack').click();
  await textVisible('#undatedPapers','계정 연구 자료');
  await page.locator('#authLogout').click();
  await el('#vList').click();
  await textVisible('#paperList','이 기기의 논문');
  assert.doesNotMatch(await ui.locator('body').innerText(),/계정 전용|추가한 논문/);
  assert.doesNotMatch(await page.evaluate(()=>localStorage.getItem('researchtrail.v5')),/계정 전용|추가한 논문/);
  nextAccount='B';
  await page.locator('#authLogin').click();
  await textVisible('#workspaceStatus','아직 계정 프로젝트가 없어요');
  assert.equal(await el('#addBtn').isDisabled(),true);
  assert.equal(writes.filter(w=>w.who==='B').length,0);
  await el('#workspaceNew').click();
  await el('#workspaceName').fill('새 과업');
  await el('#workspaceCreateForm button[type=submit]').click();
  await textVisible('#workspaceStatus','등록한 논문이 없어요');
  assert.equal(await select(),'새 과업');
  assert.ok(scopes.every(([who,id])=>who==='A' || id==='새 과업'));
  assert.ok(writes.every(w=>!JSON.stringify(w.body).includes('이 기기의 논문')));
  assert.deepEqual(oldDocuments,[]);
  tasks.A=tasks.A.filter(t=>t.task_id!=='second');
  await page.locator('#authLogout').click();
  nextAccount='A';
  const begin=scopes.length;
  await page.locator('#authLogin').click();
  await textVisible('#workspaceStatus','등록한 논문이 없어요');
  assert.equal(await select(),'first');
  assert.ok(scopes.slice(begin).every(([,id])=>id==='first'));
  assert.deepEqual(exchanges,['A','B','A']);
});
