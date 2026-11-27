// Draft AC5/AC7 release journey. Run explicitly on a disposable local Supabase stack.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {access} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {fixture} from './fixtures/account-chat-api.cjs';

const dist = path.resolve(import.meta.dirname, '../dist');
const api = '/functions/v1/researchtrail';
const taskPath = api + '/tasks';
const files = fixture().files;

function localSettings() {
  const cli = path.resolve(import.meta.dirname, '../node_modules/.bin/supabase');
  let status;
  try {
    status = JSON.parse(execFileSync(cli, ['status','-o','json'], {encoding:'utf8', stdio:['ignore','pipe','ignore']}));
  } catch {
    throw Error('Disposable local Supabase is unavailable. Check local Docker and supabase status.');
  }
  const base = new URL(status.API_URL);
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(base.hostname) && base.protocol === 'http:' &&
    base.pathname === '/' && !base.username && !base.password && !base.search && !base.hash, 'Expected a loopback gateway.');
  assert.ok(status.PUBLISHABLE_KEY?.startsWith('sb_publishable_'), 'Expected a local publishable key.');
  return {SUPABASE_URL:base.origin, SUPABASE_PUBLISHABLE_KEY:status.PUBLISHABLE_KEY};
}

async function run() {
  const settings = localSettings(), origin = settings.SUPABASE_URL;
  const authHeaders = {apikey:settings.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'};
  const health = await fetch(origin+'/auth/v1/health',{headers:authHeaders,redirect:'error'});
  assert.ok(health.ok, 'Local Auth health check failed.');
  await access(path.join(dist, 'browser.html'));
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});

  async function newUser() {
    const credentials = {email:'rt-ui-'+randomUUID()+'@example.test', password:randomUUID()+randomUUID()};
    const signup = await fetch(origin+'/auth/v1/signup', {method:'POST',headers:authHeaders,
      body:JSON.stringify(credentials),redirect:'error'});
    assert.ok(signup.ok && (await signup.json()).access_token, 'Local synthetic signup needs email confirmations disabled.');
    return credentials;
  }
  async function client(credentials) {
    const ctx = await browser.newContext({viewport:{width:1280,height:850}, serviceWorkers:'block'});
    const page = await ctx.newPage(), attempts = [], pageWrites = [];
    let dropRecordAck = false;
    page.setDefaultTimeout(12000);
    await ctx.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/session-fixture.html') return route.fulfill({contentType:'text/html',
        body:'<!doctype html><script src="/vendor/supabase/supabase.js"></script>'});
      if (url.pathname === '/js/browser-config.js') return route.fulfill({contentType:'text/javascript',
        body:'window.RESEARCHTRAIL_CONFIG=Object.freeze('+JSON.stringify(settings)+');'});
      if (url.pathname.startsWith(api+'/') || url.pathname.startsWith('/auth/v1/')) {
        // This persistence run never forwards indexing or question generation to a provider.
        if (/\/(?:ask|rag-index)(?:\/|$)/.test(url.pathname) && req.method() !== 'GET') return route.abort();
        if (req.method() === 'POST' && url.pathname.endsWith('/reader') && req.postDataJSON().last_page) {
          pageWrites.push(req.postDataJSON().last_page);
        }
        const response = await route.fetch({maxRedirects:0});
        if (req.method() === 'POST' && url.pathname.endsWith('/records')) {
          attempts.push(req.postDataJSON());
          if (response.ok() && dropRecordAck) {
            dropRecordAck = false;
            return route.fulfill({status:503,json:{error:{code:'STORAGE_FAILURE'}}});
          }
        }
        return route.fulfill({response});
      }
      const asset = path.resolve(dist, '.'+(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!asset.startsWith(dist+path.sep)) return route.abort();
      try { await access(asset); } catch { return route.abort(); }
      return route.fulfill({path:asset});
    });
    await page.goto(origin+'/session-fixture.html');
    const signedIn = await page.evaluate(async ({settings,credentials}) => {
      localStorage.setItem('researchtrail.v5',JSON.stringify({name:'이 기기 합성 과업',tags:[],
        papers:[{id:'guest',title:'이 기기의 합성 논문',date:'2026-01-01',memo:'기기 기록',hl:[]}]}));
      const auth = window.supabase.createClient(settings.SUPABASE_URL,settings.SUPABASE_PUBLISHABLE_KEY).auth;
      const {data,error} = await auth.signInWithPassword(credentials);
      return !error && !!data.session;
    },{settings,credentials});
    assert.ok(signedIn,'Independent local password sign-in failed.');
    await page.goto(origin);
    const frame = page.frameLocator('#authWorkspace iframe'), el = selector => frame.locator(selector);
    const message = re => el('#memoStatus').filter({hasText:re}).waitFor();
    const response = (method,pathname) => page.waitForResponse(r => r.request().method() === method &&
      new URL(r.url()).pathname === pathname);
    return {page,el,message,response,attempts,pageWrites,dropAck(){ dropRecordAck=true; }};
  }
  async function receipt(response) {
    assert.ok(response.ok(),'Workspace request returned HTTP '+response.status());
    return response.json();
  }
  const upload = bytes => ({name:'same.pdf',mimeType:'application/pdf',buffer:bytes});
  const paperRow = id => '[data-list-paper="'+id+'"]';
  const openPdf = id => '[data-open-pdf="'+id+'"]';
  try {
    const owner = await newUser(), a = await client(owner), b = await client(owner);
    await b.el('#workspaceStatus').filter({hasText:'아직 계정 프로젝트가 없어요'}).waitFor();
    await a.el('#workspaceNew').click();
    await a.el('#workspaceName').fill('합성 재개 과업');
    const [created] = await Promise.all([a.response('POST',taskPath),a.el('#workspaceCreateForm button[type=submit]').click()]);
    const {task_id} = await receipt(created), task = taskPath+'/'+task_id;
    await a.el('#workspaceStatus').filter({hasText:'등록한 논문이 없어요'}).waitFor();

    async function register(title) {
      await a.el('#addBtn').click();
      await a.el('#aTitle').fill(title);
      const [res] = await Promise.all([a.response('POST',task+'/papers'),a.el('#addForm button[type=submit]').click()]);
      await a.el('#accountPaperDetail').waitFor({state:'hidden'});
      return receipt(res);
    }
    const first = await register('합성 논문 A'), second = await register('합성 논문 B');
    const id = first.document_use_id, other = second.document_use_id;
    await a.el('#vList').click();
    await a.el(paperRow(id)).click();
    async function attach(bytes) {
      const [response] = await Promise.all([a.response('POST',task+'/papers/'+id+'/pdf'),
        a.el('[data-attach-pdf="'+id+'"]:not([data-artifact-id])').setInputFiles(upload(bytes))]);
      const {artifact_id} = await receipt(response);
      await a.el(openPdf(artifact_id)).waitFor();
      return artifact_id;
    }
    const edition = await attach(files.draft), sibling = await attach(files.published);
    assert.notEqual(edition,sibling);
    await a.el('#lkStart').click();
    await a.el(paperRow(other)).click();
    const reason = '후속 실험 대조';
    await a.el('#lkWhy').fill(reason);
    const [linked] = await Promise.all([a.response('POST',task+'/paper-links'),a.el('#workspaceLinkForm button[type=submit]').click()]);
    const link = await receipt(linked);
    assert.deepEqual([link.from_document_use_id,link.to_document_use_id,link.reason_text],[id,other,reason]);
    await a.el(paperRow(id)).click();
    await a.el(openPdf(edition)).click();
    await a.el('#accountPdfText span').filter({hasText:'Draft passage 1'}).waitFor();
    const memo = '  합성 원문 메모  ';
    a.dropAck();
    await a.el('#rNote').fill(memo);
    await a.el('#memoFinish').click();
    await a.message(/메모 저장을 확인하지 못/);
    assert.doesNotMatch(await a.el('#memoStatus').innerText(),/닫아도/);
    const [retried] = await Promise.all([a.response('POST',task+'/records'),a.el('#memoRetry').click()]);
    const {record_id} = await receipt(retried);
    await a.message(/닫아도/);
    assert.equal(a.attempts.length,2);
    assert.ok(a.attempts[0].request_id);
    assert.deepEqual(a.attempts[0],a.attempts[1]);
    const reader = task+'/artifacts/'+edition+'/reader';
    await a.el('#accountPdfNext').click();
    await a.el('#pdfReadingLocator').filter({hasText:'2쪽'}).waitFor();
    await a.message(/닫아도/);
    await a.el('#pdfMemoRef').focus();
    await a.el('#pdfMemoRef').selectOption(record_id);
    await a.el('#accountPdfText span').filter({hasText:'Draft passage 2'}).dblclick();
    const [marked] = await Promise.all([a.response('POST',reader),a.el('#pdfMarkButton').click()]);
    const mark = marked.request().postDataJSON().highlight;
    assert.equal(mark.record_id,record_id);
    assert.equal(mark.page,2);
    assert.ok(mark.text.trim() && 'Draft passage 2'.includes(mark.text.trim()));
    assert.ok(mark.rects.length && mark.rects.every(rect => rect.length===4 &&
      rect.every(v=>Number.isFinite(v) && v>=0 && v<=1) && rect[2]>0 && rect[3]>0));
    assert.deepEqual((await receipt(marked)).highlights,[mark]);
    await a.message(/닫아도/);

    const [catalog,links] = await Promise.all([b.response('GET',task+'/papers'),b.response('GET',task+'/paper-links'),b.page.reload()]);
    const rows = (await receipt(catalog)).papers;
    assert.deepEqual(rows.map(p=>p.document_use_id).sort(),[id,other].sort());
    const editions = rows.find(p=>p.document_use_id===id).artifacts;
    const expectedHash = bytes => createHash('sha256').update(bytes).digest('hex');
    assert.deepEqual(editions.map(e=>[e.artifact_id,e.label_text,e.pdf.sha256]).sort(),
      [[edition,'same.pdf',expectedHash(files.draft)],[sibling,'same.pdf',expectedHash(files.published)]].sort());
    const {task_id:ignored,...storedLink} = link;
    assert.deepEqual((await receipt(links)).links,[storedLink]);
    await b.el('#vList').click();
    await b.el(paperRow(other)).waitFor();
    await b.el(paperRow(id)).click();
    await b.el('#workspacePaperActions').filter({hasText:reason}).waitFor();
    const [restored,resume,download] = await Promise.all([b.response('GET',reader),b.response('GET',task+'/resume'),
      b.response('GET',task+'/artifacts/'+edition+'/pdf'),b.el(openPdf(edition)).click()]);
    assert.ok(download.ok());
    assert.deepEqual(await download.body(),files.draft);
    assert.deepEqual(await receipt(restored),{last_page:2,highlights:[mark]});
    const {records} = await receipt(resume);
    assert.equal(records.length,1);
    assert.equal(records[0].record_id,record_id);
    assert.equal(records[0].record.content_text,memo);
    assert.deepEqual(records[0].context_refs.artifact_ids,[edition]);
    assert.deepEqual(records[0].context_refs.document_ids,[first.document_id]);
    await b.el('#accountPdfText span').filter({hasText:'Draft passage 2'}).waitFor();
    assert.match(await b.el('#pdfPageStatus').innerText(),/^2 \/ 34/);
    await b.el('#accountPdfOverlay > *').first().waitFor();
    await b.el('#pdfMarks').filter({hasText:'합성 원문 메모'}).waitFor();
    await b.el('#rdBack').click();
    await b.el(paperRow(id)).click();
    const [separate,siblingPdf] = await Promise.all([b.response('GET',task+'/artifacts/'+sibling+'/reader'),
      b.response('GET',task+'/artifacts/'+sibling+'/pdf'),b.el(openPdf(sibling)).click()]);
    assert.ok(siblingPdf.ok());
    assert.deepEqual(await siblingPdf.body(),files.published);
    assert.deepEqual(await receipt(separate),{last_page:null,highlights:[]});
    await b.el('#accountPdfText span').filter({hasText:'Other edition'}).waitFor();
    assert.match(await b.el('#pdfPageStatus').innerText(),/^1 \/ 1/);
    assert.equal(await b.el('#accountPdfOverlay > *').count(),0);
    assert.deepEqual(b.pageWrites,[], 'Opening either edition must preserve its saved position.');
    await b.page.locator('#authLogout').click();
    await b.el('#vList').click();
    await b.el('#paperList').filter({hasText:'이 기기의 합성 논문'}).waitFor();
    assert.doesNotMatch(await b.el('body').innerText(),/합성 논문 [AB]|합성 원문 메모/);
    const foreign = await client(await newUser());
    await foreign.el('#workspaceStatus').filter({hasText:'아직 계정 프로젝트가 없어요'}).waitFor();
    assert.equal(await foreign.el('#addBtn').isDisabled(),true);
    console.log('PASS: two owner browsers restored both papers, link, edition, retried memo, highlight and page. Guest work survived logout and a new account opened empty.');
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error.message); process.exitCode=1; });
