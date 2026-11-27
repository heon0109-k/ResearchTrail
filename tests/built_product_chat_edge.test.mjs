// Built PKCE login -> original shared timeline/detail/reader -> verified Edge response.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {chatEdge,owner,token,origin,functionPath,use,edition,question} from './fixtures/product-chat-edge.mjs';

test('the built question tab calls researchtrail and opens its verified citation in the exact PDF', {timeout:60000},async t=>{
  const backend=chatEdge(),blocked=[];
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
  t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:1320,height:900}});
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==origin){blocked.push(url.origin);return route.abort();}
    if(url.pathname==='/js/browser-config.js')return route.fulfill({contentType:'text/javascript',
      body:"window.RESEARCHTRAIL_CONFIG={SUPABASE_URL:'http://localhost',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};"});
    if(url.pathname==='/auth/v1/authorize'){
      assert.ok(url.searchParams.get('code_challenge'));
      assert.equal(url.searchParams.get('provider'),'google');
      const back=new URL(url.searchParams.get('redirect_to'));back.searchParams.set('code','test-code');
      return route.fulfill({status:302,headers:{location:back.href}});
    }
    if(url.pathname==='/auth/v1/token'){
      assert.equal(req.postDataJSON().auth_code,'test-code');assert.ok(req.postDataJSON().code_verifier);
      return route.fulfill({json:{user:{id:owner},access_token:token,refresh_token:'synthetic-refresh',token_type:'bearer',expires_in:3600}});
    }
    if(url.pathname==='/favicon.ico')return route.fulfill({status:204});
    if(url.pathname.startsWith(functionPath+'/')){
      const result=await backend.handle(new Request(req.url(),{method:req.method(),headers:req.headers(),body:req.postDataBuffer()||undefined}));
      return route.fulfill({status:result.status,headers:Object.fromEntries(result.headers),body:Buffer.from(await result.arrayBuffer())});
    }
    if(url.pathname.startsWith('/api/'))throw Error('Signed-in request reached device AI.');
    return route.fulfill({path:path.resolve('dist',url.pathname.slice(1)||'index.html')});
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);
  await page.goto(origin);await page.locator('#authLogin').click();
  const ui=page.frameLocator('#authWorkspace iframe'),el=s=>ui.locator(s);
  await el('#tName').filter({hasText:'질문 실험'}).waitFor();
  await el('.card[data-id="'+use+'"]').click();
  await el('#pEdition').selectOption(edition);await el('#pRead').click();
  await el('.pgbox[data-n="1"] .textLayer span').first().waitFor();
  const tab=ui.getByRole('tab',{name:'질문하기'});await tab.click();
  assert.equal(await tab.getAttribute('aria-selected'),'true');
  assert.equal(backend.calls.some(c=>c.host==='api.openai.com'),false);
  await el('#chatSaveKey').click();await el('#chatMsg').filter({hasText:'동의해 주세요'}).waitFor();
  await el('#chatConsent').check();await el('#chatSaveKey').click();
  await el('.chat-effort summary').click();await el('[name=chatEffort][value=medium]').check();
  await el('#rChat [role=status]').filter({hasText:'준비됐어요'}).first().waitFor();
  await el('#chatQ').fill(question);await el('#chatQ').press('Enter');
  const cite=el('#chatList button[data-chat-action=cite]');await cite.waitFor();
  assert.match(await el('#chatList').innerText(),/두 번째 쪽의 합성 답변/);
  await cite.click();await el('.pgbox[data-n="2"] .textLayer span').filter({hasText:'Draft passage 2'}).waitFor();
  await page.waitForFunction(()=>document.querySelector('#authWorkspace iframe')?.contentDocument.querySelector('#pvNum')?.value==='2');
  assert.equal(backend.edge.filter(r=>r.path.endsWith('/pdf')).at(-1).path.split('/').at(-2),edition);
  assert.equal(blocked.includes('https://api.openai.com'),false);
  backend.verify();
});
