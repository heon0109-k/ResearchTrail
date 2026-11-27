// Draft regression for SPEC §4.2, using the signed-in root and shipped reader controls.
// Build with SUPABASE_URL=http://localhost SUPABASE_PUBLISHABLE_KEY=sb_publishable_fixture npm run build.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright-core');
const {fixture}=require('./fixtures/account-chat-api.cjs');

test('signed-in reader consents, indexes only the selected edition, retries, cites and discards late answers',async t=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
  t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1280,height:850}});
  page.setDefaultTimeout(7000);
  const api=fixture(), unexpected=[], logs=[];
  const root=path.resolve(__dirname,'../dist'), origin='http://localhost';
  page.on('console',msg=>logs.push(msg.text()));
  await page.route('**/*',async route=>{
    const req=route.request(), url=new URL(req.url());
    if(url.origin==='https://fonts.googleapis.com') return route.fulfill({body:'',contentType:'text/css'});
    if(url.origin!==origin || url.pathname.startsWith('/api/')){unexpected.push(url.pathname);return route.abort();}
    if(url.pathname==='/vendor/supabase/supabase.js') return route.fulfill({contentType:'text/javascript',
      body:"window.supabase={createClient:()=>({auth:{onAuthStateChange(fn){fn('INITIAL_SESSION',{user:{id:'user'},access_token:'session'})},initialize:async()=>({})}})}"});
    const service='/functions/v1/researchtrail';
    if(!url.pathname.startsWith(service+'/')){
      const file=path.join(root,url.pathname==='/'?'index.html':url.pathname.slice(1));
      return fs.existsSync(file)?route.fulfill({path:file}):route.abort();
    }
    assert.equal(req.headers().authorization,'Bearer session');
    assert.equal(req.headers().apikey,'sb_publishable_fixture');
    const resource=url.pathname.slice(service.length);
    if(resource.endsWith('/pdf')) return route.fulfill({body:api.files[resource.split('/')[4]],contentType:'application/pdf'});
    try { return await route.fulfill({json:await api.request(resource,req.postDataJSON())}); }
    catch { return route.fulfill({status:503,json:{error:{code:'STORAGE_FAILURE'}}}); }
  });
  await page.goto(origin);
  const frame=page.frameLocator('#authWorkspace iframe'), el=s=>frame.locator(s);
  async function open(edition) {
    await el('[data-list-paper="'+(edition==='published'?'draft':edition)+'"]').click();
    await el('[data-open-pdf="'+edition+'"]').click();
    await el('#pdfPageStatus').filter({hasText:/1 \/|2 \//}).waitFor();
  }
  const chat=()=>el('[data-rtab="chat"]').click();
  const status=re=>el('#rChat [role="status"]').filter({hasText:re}).waitFor();
  const press=name=>frame.getByRole('button',{name,exact:true}).click();
  const accept=()=>el('[data-chat-action="consent"]').click();
  const asks=()=>api.rag().filter(c=>c.path.endsWith('/ask'));
  await el('#vList').click(); await open('draft');
  assert.equal(api.rag().length,0);
  await chat(); await status(/동의/);
  assert.match(await el('#rChat').innerText(),/추출한.*구절.*임베딩 서비스/);
  await press('동의하지 않음'); await status(/보내지 않았어요/);
  assert.equal(api.rag().filter(c=>c.body).length,0);
  await press('동의 안내 보기'); await accept();
  await status(/색인.*실패|색인.*못했어요/);
  await press('색인 다시 시도'); await status(/준비됐어요/);
  assert.equal(api.chunks.length,34);
  assert.deepEqual(api.rag().filter(c=>c.path.endsWith('/chunks')).map(c=>c.body.chunks[0].page),[1,33,33]);
  assert.deepEqual(api.rag().find(c=>c.path.endsWith('/begin')).body,{
    consent:true,chunker:'pages-1600-320',pdf_sha256:api.papers[0].artifacts[0].pdf.sha256});
  assert.equal(api.chunks[1].text,'Draft passage 2');
  await el('.chat-effort summary').click(); await frame.getByText('꼼꼼하게',{exact:true}).click();
  const q='합성 질문'; await el('#chatQ').fill(q); await press('질문 보내기');
  await el('#rChat [role="alert"]').waitFor(); assert.equal(await el('#chatQ').inputValue(),q);
  await el('#chatQ').press('Enter'); await el('.chat-pg').waitFor();
  assert.deepEqual(asks().map(c=>[c.path,c.body.answer_depth,c.body.scope,c.body.history]),[
    ['/tasks/A/artifacts/draft/ask','medium','open_pdf',[]],['/tasks/A/artifacts/draft/ask','medium','open_pdf',[]]]);
  assert.ok(asks().every(c=>c.body.consent && c.body.current_page===1));
  assert.match(await el('#chatList').innerText(),/Draft passage 2/);
  await page.setViewportSize({width:390,height:800});
  await el('.chat-pg').click(); await el('#pdfPageStatus').filter({hasText:'2 / 34'}).waitFor();
  assert.equal(await el('[data-mtab="pdf"]').getAttribute('aria-selected'),'true');
  assert.equal(api.position,2);
  await page.setViewportSize({width:1280,height:850});
  await chat(); await el('#chatQ').fill('missing'); await press('질문 보내기');
  await el('#chatList').filter({hasText:/근거를 찾지 못/}).waitFor();
  assert.equal(asks().at(-1).body.history.length,2);
  let release; api.wait=new Promise(r=>{release=r});
  await el('#chatQ').fill('늦은 질문'); await press('질문 보내기'); await status(/답변을 준비/);
  await el('#rdBack').click(); await open('other'); await chat(); await status(/저장된 색인/);
  await accept(); await status(/준비됐어요/);
  const completed=page.waitForResponse(r=>r.url().endsWith('/draft/ask'));
  release(); await (await completed).finished();
  await el('#rChat').evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert.doesNotMatch(await el('#rChat').innerText(),/합성 답변|늦은 질문|Draft passage/);
  assert.equal(api.rag().some(c=>c.path.includes('/other/rag-index/')),false);
  await el('#rdBack').click(); await open('blank'); await chat(); await accept(); await status(/추출할 수 있는 텍스트가 없/);
  assert.equal(api.rag().some(c=>c.path.includes('/blank/rag-index/')),false);
  assert.deepEqual(unexpected,[]);
  assert.doesNotMatch(logs.join('\n'),/합성 질문|합성 답변|Draft passage/);
  const contents=await el('#rChat').evaluate(()=>JSON.stringify([localStorage,sessionStorage]));
  assert.doesNotMatch(contents,/합성 질문|늦은 질문|합성 답변/);
});
