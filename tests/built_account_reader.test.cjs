// Draft UI regressions for AC4, AC5 and AC7. Each browser context has its own tab storage.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright-core');

const root = path.resolve(__dirname, '../dist');
const origin = 'http://localhost';
const editions = ['one', 'two'].map(id => ({artifact_id:id, label_text:'paper.pdf',
  pdf:{available:true, sha256:id.repeat(12), document_use_id:'paper'}}));
const papers = [{document_id:'doc', document_use_id:'paper', document:{title:'논문 A'}, use:{},
  date:null, artifacts:editions}];
const tasks = ['A','B'].map(id => ({task_id:id, task:{goal_text:'프로젝트 '+id}}));

function fixture() {
  const records = {A:[], B:[]}, actions = {A:[], B:[]}, states = new Map(), writes = [], receipts = new Map();
  const api = {writes, records, actions, states, fail:'', delay:''};
  api.route = async (route, pathname) => {
    const req = route.request();
    assert.equal(req.headers().authorization,'Bearer fixture');
    const parts = pathname.split('/');
    const [, , task, kind, artifact, operation] = parts;
    const reply = json => route.fulfill({json});
    if (!task) return reply({tasks});
    if (kind === 'papers') return reply({papers:task === 'A' ? papers : []});
    if (kind === 'paper-links') return reply({links:[]});
    if (kind === 'resume') return reply({task_id:task, task:{goal_text:'프로젝트 '+task},
      records:records[task], next_actions:actions[task], context:{questions:[], decisions:[],
        document_contexts:task === 'A' ? papers : []}});
    if (operation === 'pdf' && artifact==='one') {
      const {syntheticPdf}=await import('./fixtures/synthetic-pdf.mjs');
      return route.fulfill({body:Buffer.from(syntheticPdf()),contentType:'application/pdf'});
    }
    if (operation === 'pdf') return route.fulfill({path:path.join(root,'assets/papers/bert-naacl2019.pdf'),contentType:'application/pdf'});
    const key=task+'/'+artifact;
    if (!states.has(key)) states.set(key,{last_page:artifact === 'two' ? 2 : 1, highlights:[]});
    const state = states.get(key);
    if (req.method() === 'GET') return reply(state);
    const body = req.postDataJSON();
    const type = operation === 'reader' ? Object.keys(body)[0] : kind;
    writes.push({task,artifact,type,body});
    let ack;
    if (kind === 'records') {
      if (!receipts.has(body.request_id)) {
        const link = body.context?.document_contexts[0];
        const row = {record_id:'record-'+writes.length, record:body.record, revises_record_id:body.revises_record_id,
          context_refs:{document_ids:link?[link.document_ref.document_id]:[],
            artifact_ids:link?.artifact_ref?[link.artifact_ref.artifact_id]:[]}};
        records[task].unshift(row); receipts.set(body.request_id,row);
      }
      ack = receipts.get(body.request_id);
    } else if (kind === 'next-actions') {
      if (!receipts.has(body.request_id)) {
        const action = {...body,next_action_id:'action-'+writes.length,saved_action:body.reviewed_action};
        actions[task].push(action); receipts.set(body.request_id,action);
      }
      ack = receipts.get(body.request_id);
    } else {
      if (body.last_page) state.last_page=body.last_page;
      if (body.highlight && !state.highlights.some(h=>h.id===body.highlight.id)) state.highlights.push(body.highlight);
      if (body.link) state.highlights.find(h=>h.id===body.link.id).record_id=body.link.record_id;
      ack = structuredClone(state);
    }
    if (api.delay === type) { api.delay=''; await api.held; }
    if (api.fail === type) { api.fail=''; return route.fulfill({status:503,json:{error:{code:'STORAGE_FAILURE'}}}); }
    return reply(ack);
  };
  return api;
}

async function client(browser,api) {
  const ctx=await browser.newContext({viewport:{width:1200,height:850}});
  const page=await ctx.newPage();
  page.setDefaultTimeout(6000);
  await ctx.route('**/*',route=>{
    const url=new URL(route.request().url());
    if (url.origin!==origin) return route.abort();
    if (url.pathname === '/js/browser-config.js') return route.fulfill({contentType:'text/javascript',
      body:"window.RESEARCHTRAIL_CONFIG={SUPABASE_URL:'http://localhost',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'}"});
    if (url.pathname === '/vendor/supabase/supabase.js') return route.fulfill({contentType:'text/javascript',
      body:"window.supabase={createClient:()=>({auth:{onAuthStateChange(fn){fn('INITIAL_SESSION',{user:{id:'fixture'},access_token:'fixture'})},initialize:async()=>({})}})}"});
    if (url.pathname.startsWith('/functions/v1/researchtrail/')) {
      // The API double receives the exact authenticated route from the shipped parent transport.
      const publicPath=url.pathname.slice('/functions/v1/researchtrail'.length);
      return api.route(route,publicPath);
    }
    const browserEntry=fs.existsSync(path.join(root,'browser.html'))?'browser.html':'index.html';
    const file=url.pathname==='/'?'views/account.html':url.pathname==='/browser.html'?browserEntry:url.pathname.slice(1);
    const asset=path.join(root,file);
    return fs.existsSync(asset) ? route.fulfill({path:asset}) : route.abort();
  });
  await page.goto(origin+'/?workspace=timeline');
  const ui=page.frameLocator('#authWorkspace iframe'), el=s=>ui.locator(s);
  const shows=text=>el('#memoStatus').filter({hasText:text}).waitFor({state:'visible'});
  async function open(edition='two',list=false) {
    if (list) await el('#vList').click();
    await el(list?'[data-list-paper="paper"]':'[data-paper="paper"]').click();
    await el('[data-open-pdf="'+edition+'"]').click();
    await el('#accountPdfText span').first().waitFor();
    await el('#accountMemos').waitFor();
  }
  return {page,ui,el,shows,open,ctx};
}

test('failed memo remains visible in B after refresh and retries with its original association',async t=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
  t.after(()=>browser.close());
  const api=fixture(), {page,el,shows,open}=await client(browser,api);
  await open();
  assert.equal(await el('#memoPaper').inputValue(),'doc');
  assert.equal(await el('#memoPaper').isDisabled(),true);
  api.fail='records';
  await el('#rNote').fill('첫 번째 메모'); await el('#memoFinish').click();
  await shows(/메모 저장을 확인하지 못/);
  await el('#workspaceTask').selectOption('B');
  await page.reload();
  await shows(/프로젝트 A.*메모/);
  assert.doesNotMatch(await el('#memoStatus').innerText(),/닫아도/);
  await el('#workspaceRecords').click();
  await el('#rNote').fill('프로젝트 메모'); await el('#memoFinish').click();
  await shows(/메모를 계정에 저장/);
  assert.doesNotMatch(await el('#memoStatus').innerText(),/닫아도/);
  assert.deepEqual(api.records.B[0].context_refs,{document_ids:[],artifact_ids:[]});
  await el('#workspaceTask').selectOption('A');
  await open();
  await el('#memoRetry').click(); await shows(/닫아도/);
  const attempts=api.writes.filter(w=>w.task==='A' && w.type==='records');
  assert.deepEqual(attempts[1].body,attempts[0].body);
  assert.deepEqual(api.records.A[0].context_refs,{document_ids:['doc'],artifact_ids:['two']});
  assert.equal(api.records.A.length,1);
  await el('#rdBack').click(); await el('#workspaceRecords').click();
  await el('#rNote').fill('논문 선택 후 저장');
  await el('#memoPaper').click(); await el('#memoPaper').selectOption('doc');
  assert.equal(api.records.A.length,1);
  await el('#memoFinish').click(); await shows(/닫아도/);
  assert.deepEqual(api.records.A[0].context_refs,{document_ids:['doc'],artifact_ids:[]});
});

test('exact-edition highlights, memo corrections, confirmed actions and last page reopen on another client',async t=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
  t.after(()=>browser.close());
  const api=fixture(), a=await client(browser,api), b=await client(browser,api);
  await a.open('two',true);
  assert.match(await a.el('#pdfPageStatus').innerText(),/^2 \//);
  let release;
  api.delay='records';
  api.held=new Promise(resolve=>{release=resolve;});
  await a.el('#rNote').fill('원래 메모'); await a.el('#memoFinish').click(); await a.shows(/저장하는 중/);
  await a.el('#rNote').fill('정정 메모');
  release(); await a.shows(/작성 중/);
  assert.doesNotMatch(await a.el('#memoStatus').innerText(),/닫아도/);
  await a.el('#memoFinish').click(); await a.shows(/닫아도/);
  const [newer,older]=api.records.A;
  assert.equal(newer.revises_record_id,older.record_id);
  await a.el('[data-review-record="'+newer.record_id+'"][data-mode="manual"]').click();
  await a.el('#naCand').fill('표 대조하기');
  assert.equal(api.actions.A.length,0);
  api.fail='next-actions';
  await a.el('#naOk').click(); await a.shows(/다음 작업 저장을 확인하지 못/);
  assert.doesNotMatch(await a.el('#memoStatus').innerText(),/닫아도/);
  await a.el('#rdBack').click(); await a.open('two',true);
  await a.el('[data-review-record="'+newer.record_id+'"][data-mode="candidate"]').click();
  await a.el('#naOk').click(); await a.shows(/닫아도/);
  const confirmations=api.writes.filter(w=>w.type==='next-actions');
  assert.deepEqual(confirmations[0].body,confirmations[1].body);
  assert.equal(api.actions.A.length,1);
  await a.el('#accountPdfNext').click();
  await a.el('#pdfReadingLocator').filter({hasText:'3쪽'}).waitFor(); await a.shows(/닫아도/);
  await a.el('#pdfMemoRef').focus(); await a.el('#pdfMemoRef').selectOption(newer.record_id);
  const line=a.el('#accountPdfText span').filter({hasText:/[A-Za-z]{3}/}).first();
  await line.dblclick();
  api.fail='highlight';
  await a.el('#pdfMarkButton').click(); await a.shows(/하이라이트.*확인하지 못/);
  assert.doesNotMatch(await a.el('#memoStatus').innerText(),/닫아도/);
  await a.el('#rdBack').click(); await a.page.reload(); await a.open('two',true);
  await a.el('#pdfReaderRetry').click(); await a.shows(/닫아도/);
  const writes=api.writes.filter(w=>w.type==='highlight');
  assert.deepEqual(writes[0].body,writes[1].body);
  assert.equal(api.states.get('A/two').highlights.length,1);
  assert.equal(writes[0].body.highlight.record_id,newer.record_id);
  const count=api.writes.length;
  await b.page.reload(); await b.open('two');
  assert.match(await b.el('#pdfPageStatus').innerText(),/^3 \//);
  assert.match(await b.el('#pdfMarks').innerText(),/연결한 메모 · 정정 메모/);
  assert.ok(await b.el('#accountPdfOverlay').locator('*').count());
  assert.match(await b.el('#accountRecords').innerText(),/원래 메모/);
  assert.match(await b.el('#accountActions').innerText(),/표 대조하기/);
  await b.el('#rdBack').click(); await b.open('one');
  assert.equal(await b.el('#pdfPageStatus').innerText(),'1 / 1쪽');
  assert.equal(await b.el('#accountPdfOverlay').innerHTML(),'');
  assert.equal(api.writes.length,count);
});
