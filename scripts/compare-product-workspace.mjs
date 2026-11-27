// Offline browser comparison of a pinned device workspace with the signed-in product build.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {chromium} from 'playwright-core';
import {referenceCommit,project,pdf,makeAccount} from '../tests/fixtures/product-visual.mjs';

const git=promisify(execFile);
const root=path.resolve(import.meta.dirname,'..');
const dist=path.join(root,'dist');
const sourceOnly=process.argv.includes('--source-only');
const output=path.resolve(process.argv.slice(2).find(arg=>!arg.startsWith('--')) || 'workspace-comparison');
const origin='http://localhost', prefix='/functions/v1/researchtrail/';
const sizes={desktop:{width:1440,height:900},mobile:{width:390,height:844}};
const htmlType='text/html; charset=utf-8';
const types={'.html':htmlType,'.js':'application/javascript','.css':'text/css','.png':'image/png','.pdf':'application/pdf','.json':'application/json'};
const shared=['.side','.bar','#tName','#homeBtn','#topFind','#tagAdd','#vCard','#vDot','#vList','#mNav','#mMenu'];
const screens={
  timeline:[...shared,'#scroller','#mtl','.card[data-id="ref1"]','[data-mtl-paper="ref1"]','#fcard','#rbar'],
  graph:[...shared,'#dotsvg','.dn[data-id="ref1"]','#relayout','#fdot'],
  list:[...shared,'#paperList','#paperListRows','[data-list-paper="ref1"]','#paperListState'],
  detail:[...shared,'#panel','#pState','#pClose','#pRead'],
  reader:['#reader','#rdBack','#rdTitle','#rdsrc','#rdnotes','#pvPrev','#pvNum','#pvNext','#pvCap','[data-rtab="chat"]','[data-mtab="pdf"]','[data-mtab="chat"]']
};
const sourceFiles=['views/main.html','views/reader.html','js/frame.js','js/timeline.js','js/timeline-mobile.js',
  'js/graph.js','js/paper-list.js','js/panel.js','js/reader.js','js/pdf-viewer.js','js/records-compact.js',
  ...['navigation','timeline','graph','paper-list','paper-panel','reader','pdf-viewer','reading-records','chat','account'].map(s=>'styles/'+s+'.css')];
const cache=new Map();
async function baseline(name){
  const full='web/'+name;
  if(!cache.has(full))cache.set(full,git('git',['show',referenceCommit+':'+full],{cwd:root,encoding:'buffer',maxBuffer:24*1024*1024}).then(r=>r.stdout));
  return cache.get(full);
}
const known=new Set((await git('git',['ls-tree','-rz','--name-only',referenceCommit,'web'],{cwd:root})).stdout.split('\0').filter(Boolean));
const head=(await git('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim();
await mkdir(output,{recursive:true});
const reportFiles=[];
for(const file of sourceFiles){
  const [before,after]=await Promise.all([baseline(file),readFile(path.join(root,'web',file))]);
  const tags=text=>Array.from(text.toString().matchAll(/\bid="([^"]+)"|\bdata-mtab="([^"]+)"/g),m=>m[1] || 'data-mtab='+m[2]);
  const a=new Set(tags(before)),b=new Set(tags(after));
  reportFiles.push({path:file,identical:before.equals(after),...(file.endsWith('.html')?{
    removedTemplateControls:[...a].filter(id=>!b.has(id)),addedTemplateControls:[...b].filter(id=>!a.has(id))}:{})});
}
await writeFile(path.join(output,'source-comparison.json'),JSON.stringify({baseline:referenceCommit,signedInWorkingTreeHead:head,files:reportFiles},null,2)+'\n');
if(sourceOnly){
  console.log('Compared '+reportFiles.length+' template, renderer and stylesheet files. See '+path.join(output,'source-comparison.json'));
  process.exit(0);
}
await readFile(path.join(dist,'browser.html')); // Account build is required.
await readFile(path.join(dist,'vendor/supabase/supabase.js'));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});

async function start(mode,viewport){
  const context=await browser.newContext({viewport,screen:viewport,locale:'ko-KR',timezoneId:'Asia/Seoul',
    isMobile:viewport.width<600,hasTouch:viewport.width<600,deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
  const errors=[],account=makeAccount(),session='visual-session';
  const serve=async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.origin!==origin)return route.abort();
    if(u.pathname==='/favicon.ico')return route.fulfill({status:204});
    if(u.pathname==='/js/browser-config.js')return route.fulfill({contentType:types['.js'],
      body:"window.RESEARCHTRAIL_CONFIG={SUPABASE_URL:'http://localhost',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'}"});
    if(u.pathname==='/auth/v1/authorize'){
      assert.equal(mode,'account');
      assert.equal(u.searchParams.get('provider'),'google');
      assert.ok(u.searchParams.get('code_challenge'));
      const callback=new URL(u.searchParams.get('redirect_to'));
      assert.equal(callback.origin,origin);callback.searchParams.set('code','synthetic-callback');
      return route.fulfill({status:302,headers:{location:callback.href}});
    }
    if(u.pathname==='/auth/v1/token'){
      assert.equal(mode,'account'); assert.equal(u.searchParams.get('grant_type'),'pkce');
      const data=req.postDataJSON(); assert.equal(data.auth_code,'synthetic-callback'); assert.ok(data.code_verifier);
      return route.fulfill({json:{user:{id:'visual-owner'},access_token:session,refresh_token:'fixture',token_type:'bearer',expires_in:3600}});
    }
    if(u.pathname.startsWith(prefix)){
      assert.equal(mode,'account');
      return account(route,u.pathname.slice(prefix.length));
    }
    if(mode==='account' || u.pathname==='/vendor/supabase/supabase.js'){
      const file=path.resolve(dist,'.'+(u.pathname==='/'?'/index.html':u.pathname));
      assert.ok(file.startsWith(dist+path.sep));return route.fulfill({path:file});
    }
    // The pinned build renames its local root to browser.html and serves the Auth wrapper at /.
    const name=u.pathname==='/'?'views/account.html':u.pathname==='/browser.html'?'index.html':u.pathname.slice(1);
    assert.ok(known.has('web/'+name),'Unknown pinned file: '+name);
    return route.fulfill({body:await baseline(name),contentType:types[path.extname(name)] || 'application/octet-stream'});
  };
  await context.route('**/*',async route=>{
    try{await serve(route);}catch(e){errors.push(e.message);await route.abort().catch(()=>{});}
  });
  await context.addInitScript(project=>{
    if(window!==window.top || localStorage.getItem('researchtrail.v5'))return;
    localStorage.setItem('researchtrail.v5',JSON.stringify(project));
    localStorage.setItem('researchtrail.tour','1');
  },project);
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(15000);
  await page.clock.setFixedTime(new Date('2026-11-27T03:00:00Z'));
  await page.goto(origin);
  const top=page.frameLocator('#authWorkspace iframe');
  const el=selector=>top.locator(selector);
  await el('#tName').filter({hasText:project.name}).waitFor();
  if(mode==='account'){
    await page.locator('#authLogin').click();
    await page.locator('#authMode').filter({hasText:'계정에 저장'}).waitFor();
    await el('#tName').filter({hasText:project.name}).waitFor();
  }
  const frame=page.frames().find(f=>f.url().includes('/browser.html'));
  assert.ok(frame,'Workspace iframe was absent');
  if(mode==='account')assert.ok(frame.url().includes('workspace=account'));
  else await frame.evaluate(async bytes=>{await idbPut('ref1',new Blob([new Uint8Array(bytes)],{type:'application/pdf'}));},Array.from(pdf));
  assert.deepEqual(await frame.evaluate(()=>({name:S.name,papers:S.papers.map(p=>[p.id,p.title,p.date,p.state,p.memo,p.tag]),
    links:S.links.map(l=>[l.from,l.to,l.reason]),tags:S.tags.map(t=>[t.id,t.name,t.color])})),
    {name:project.name,papers:project.papers.map(p=>[p.id,p.title,p.date,p.state,p.memo,p.tag]),links:project.links.map(l=>[l.from,l.to,l.reason]),
      tags:project.tags.map(t=>[t.id,t.name,t.color])},'Underlying research data must match before taking pictures.');
  return {page,el,frame,context,errors};
}

async function capture(mode,format,viewport){
  const {page,frame,el,context,errors}=await start(mode,viewport);
  const metrics={};
  const mobile=format==='mobile';
  const nav=id=>mobile?el('#mNav button[data-for="'+id+'"]'):el('#'+id);
  const card=el(mobile?'[data-mtl-paper="ref1"]':'.card[data-id="ref1"]');
  const bubble=el('#rbX');
  async function screenshot(screen){
    await frame.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    const controls=await frame.evaluate(selectors=>{
      const round=v=>Math.round(v*10)/10;
      return Object.fromEntries(selectors.map(selector=>{
        const node=document.querySelector(selector);
        if(!node)return [selector,{visible:false}];
        const box=node.getBoundingClientRect(),style=getComputedStyle(node);
        if(!box.width||!box.height||style.visibility==='hidden'||style.display==='none')return [selector,{visible:false}];
        const label=node.getAttribute('aria-label')||node.getAttribute('title')||
          (node.matches('button,select,[role="button"]')?node.textContent.trim().replace(/\s+/g,' '):'');
        return [selector,{visible:true,x:round(box.x),y:round(box.y),w:round(box.width),h:round(box.height),label}];
      }));
    },screens[screen]);
    assert.deepEqual(errors,[],'Unexpected request or browser errors.');
    await page.screenshot({path:path.join(output,[format,screen,mode].join('-')+'.png'),animations:'disabled'});
    metrics[screen]=controls;
  }
  try{
    await card.waitFor();
    if(await bubble.isVisible())await bubble.click();
    await screenshot('timeline');
    // The force layout seeds starting offsets with Math.random. Seed immediately before opening it in both sessions.
    await frame.evaluate(()=>{let n=27;Math.random=()=>((n=(n*1664525+1013904223)>>>0)/4294967296);});
    await nav('vDot').click();
    await el('.dn[data-id="ref1"]').waitFor();
    await frame.waitForFunction(()=>D.raf===0);
    await screenshot('graph');
    await nav('vList').click();
    await el('[data-list-paper="ref1"]').waitFor();
    await screenshot('list');
    await nav('vCard').click();
    if(await bubble.isVisible())await bubble.click();
    if(mobile)await card.click();else await card.press('Enter');
    await el('#pRead').waitFor();
    await screenshot('detail');
    await el('#pRead').click();
    if(mobile){
      const pdfTab=el('[data-mtab="pdf"]');
      if(await pdfTab.isVisible())await pdfTab.click();
    }
    await el('.pgbox .textLayer').filter({hasText:'Draft passage 1'}).first().waitFor();
    await el('#pvNum').waitFor();
    assert.equal(await el('#pvNum').inputValue(),'1');
    await screenshot('reader');
    return metrics;
  }finally{await context.close();}
}
const escape=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pairs=[];
try{
  for(const [format,viewport] of Object.entries(sizes)){
    const local=await capture('device',format,viewport);
    const signed=await capture('account',format,viewport);
    for(const screen of Object.keys(screens)){
      const differences=[];
      for(const selector of screens[screen]){
        const a=local[screen][selector],b=signed[screen][selector];
        const maxDelta=a.visible&&b.visible?Math.max(...['x','y','w','h'].map(k=>Math.abs(a[k]-b[k]))):0;
        if(a.visible!==b.visible || a.label!==b.label || maxDelta>2)
          differences.push({selector,baseline:a,signedIn:b,maxDelta:Math.round(maxDelta*10)/10});
      }
      pairs.push({format,viewport,screen,differences,baseline:local[screen],signedIn:signed[screen]});
    }
  }
}finally{await browser.close();}
await writeFile(path.join(output,'geometry.json'),JSON.stringify({baselineCommit:referenceCommit,workingTreeHead:head,
  toleranceCssPx:2,pairs},null,2)+'\n');
const sheet=pairs.map(({format,screen,viewport,differences})=>{
  const stem=format+'-'+screen+'-';
  const figure=(mode,title)=>'<figure><figcaption>'+title+'</figcaption><a href="'+stem+mode+'.png"><img loading="lazy" src="'+stem+mode+'.png" alt="'+title+' '+screen+'"></a></figure>';
  return '<section><h2>'+format+' · '+screen+' · '+viewport.width+' × '+viewport.height+'</h2><div class="pair">'+
    figure('device','Before · device workspace')+figure('account','After · signed-in workspace')+'</div><details><summary>'+
    differences.length+' controls differ in visibility, label or bounds by more than 2 CSS px</summary><pre>'+
    escape(JSON.stringify(differences,null,2))+'</pre></details></section>';
}).join('');
await writeFile(path.join(output,'index.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workspace comparison</title><style>body{font:16px system-ui;margin:2rem}h1{font-size:1.6rem}.pair{display:grid;grid-template-columns:1fr 1fr;gap:1rem}figure{margin:0}img{width:100%;height:auto;border:1px solid #ddd}figcaption{margin-bottom:.4rem}section{margin:2rem 0}pre{overflow:auto}summary{cursor:pointer}</style><h1>Workspace comparison</h1><p>Left: browser-local product at '+referenceCommit+'. Right: authenticated working tree at '+head+'. Root auth controls are included in the pictures. Coordinates are relative to the workspace iframe. Click a picture for the original resolution.</p>'+sheet+'</html>\n');
console.log('Wrote 10 before/after pairs, per-control geometry and '+path.join(output,'index.html'));
