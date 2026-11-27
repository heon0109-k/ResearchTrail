// Explicit disposable-stack verification. Creates one synthetic Auth user and one project.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {access} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {fixture} from './fixtures/account-chat-api.cjs';
import {runProductPersistenceJourney} from './fixtures/product-persistence-journey.mjs';

const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'dist');
function settingsFromLocalStack() {
  let status;
  try {status=JSON.parse(execFileSync(path.join(root,'node_modules/.bin/supabase'),['status','-o','json'],
    {encoding:'utf8',stdio:['ignore','pipe','ignore']}));}
  catch {throw Error('Disposable local Supabase is unavailable. Check local Docker and supabase status.');}
  const gateway=new URL(status.API_URL);
  assert.ok(['127.0.0.1','[::1]','localhost'].includes(gateway.hostname)&&gateway.protocol==='http:'&&
    gateway.pathname==='/'&&!gateway.username&&!gateway.password&&!gateway.search&&!gateway.hash,'Expected a loopback Supabase gateway.');
  assert.ok(status.PUBLISHABLE_KEY?.startsWith('sb_publishable_'),'Expected a local publishable key.');
  return {SUPABASE_URL:gateway.origin,SUPABASE_PUBLISHABLE_KEY:status.PUBLISHABLE_KEY};
}
async function run() {
  const settings=settingsFromLocalStack(),origin=settings.SUPABASE_URL;
  const headers={apikey:settings.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'};
  assert.ok((await fetch(origin+'/auth/v1/health',{headers,redirect:'error'})).ok,'Loopback Auth is unavailable.');
  await access(path.join(dist,'browser.html'));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
  try {
    const credentials={email:'rt-product-'+randomUUID()+'@example.test',password:randomUUID()+randomUUID()};
    const signUp=await fetch(origin+'/auth/v1/signup',{method:'POST',headers,body:JSON.stringify(credentials),redirect:'error'});
    assert.ok(signUp.ok&&(await signUp.json()).access_token,'Local synthetic signup requires email confirmation disabled.');
    const denied=[];
    async function client() {
      const context=await browser.newContext({viewport:{width:1320,height:900},serviceWorkers:'block'}),page=await context.newPage();
      page.setDefaultTimeout(15000);
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(url.origin!==origin)return route.abort();
        if(url.pathname==='/session-fixture.html')return route.fulfill({contentType:'text/html',
          body:'<!doctype html><script src="/vendor/supabase/supabase.js"></script>'});
        if(url.pathname==='/js/browser-config.js')return route.fulfill({contentType:'text/javascript',
          body:'window.RESEARCHTRAIL_CONFIG=Object.freeze('+JSON.stringify(settings)+');'});
        if(url.pathname.startsWith('/auth/v1/')||url.pathname.startsWith('/functions/v1/researchtrail/')){
          if(/\/(ask|rag-index|memo-summary)(\/|$)/.test(url.pathname)&&request.method()!=='GET'){
            denied.push(url.pathname);return route.abort();
          }
          return route.fulfill({response:await route.fetch({maxRedirects:0})});
        }
        const file=path.resolve(dist,'.'+(url.pathname==='/'?'/index.html':url.pathname));
        if(!file.startsWith(dist+path.sep))return route.abort();
        try {await access(file);} catch {return route.abort();}
        return route.fulfill({path:file});
      });
      await page.goto(origin+'/session-fixture.html');
      assert.ok(await page.evaluate(async ({settings,credentials})=>{
        const auth=window.supabase.createClient(settings.SUPABASE_URL,settings.SUPABASE_PUBLISHABLE_KEY).auth;
        const result=await auth.signInWithPassword(credentials);return !result.error&&!!result.data.session;
      },{settings,credentials}),'A separate browser context must sign in with its own local session.');
      await page.goto(origin);await page.locator('#authWorkspace iframe[title="계정 타임라인"]').waitFor();
      const ui=page.frameLocator('#authWorkspace iframe'),el=s=>ui.locator(s);
      await el('#tName').waitFor();return {page,el};
    }
    const [first,second]=await Promise.all([client(),client()]);
    await runProductPersistenceJourney({first,second,pdf:fixture().files.draft});assert.deepEqual(denied,[]);
    console.log('PASS: the second original browser restored both papers, their graph link, exact private PDF bytes, highlight with linked memo and last-read page.');
  } finally {await browser.close();}
}
// Browser/network errors sometimes include Auth bodies. Only expose the named preflight blockers.
run().catch(e=>{
  const expected=['Disposable local Supabase is unavailable. Check local Docker and supabase status.',
    'Expected a loopback Supabase gateway.','Expected a local publishable key.','Loopback Auth is unavailable.',
    'Local synthetic signup requires email confirmation disabled.','A separate browser context must sign in with its own local session.'];
  console.error(expected.includes(e.message)?e.message:
    e.code==='ENOENT'?'Build the signed-in static site before running the local release journey.':
      'Local release verification failed at '+(e.stack||'').split('\n').find(line=>line.includes('product-persistence-journey.mjs')||line.includes('local_product_workspace_release.mjs'))?.trim());
  process.exitCode=1;
});
