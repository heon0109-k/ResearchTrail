// Render the original browser workspace from a Git commit in an isolated browser profile.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';
import synthetic from '../tests/fixtures/account-chat-api.cjs';

const root=path.resolve(import.meta.dirname,'..');
const rev='0d9d5340bec110e24ac0eb26d6b42082dad2b109';
const out=path.resolve(process.argv[2] || 'workspace-reference');
const git=promisify(execFile);
const listing=await git('git',['ls-tree','-r','-z','--name-only',rev,'web'],{cwd:root,encoding:'utf8'});
const files=new Set(listing.stdout.split('\0'));
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.pdf':'application/pdf','.json':'application/json'};
const origin='https://workspace-reference.invalid';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
try{
  const context=await browser.newContext({viewport:{width:1440,height:900},locale:'ko-KR',reducedMotion:'reduce'});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    const name='web/'+(url.pathname.slice(1) || 'index.html');
    if(url.origin!==origin || !files.has(name))return route.abort();
    const {stdout:body}=await git('git',['show',rev+':'+name],{cwd:root,encoding:'buffer',maxBuffer:20*1024*1024});
    await route.fulfill({body,contentType:types[path.extname(name)] || 'application/octet-stream'});
  });
  await context.addInitScript(()=>{
    const papers=[
      {id:'ref1',title:'합성 실험의 측정 방법',date:'2026-11-25',tag:'method',state:'reading',memo:'두 측정 방법을 비교하려고 저장함',pdf:true,fname:'reading-sample.pdf',page:1},
      {id:'ref2',title:'측정 결과 비교',date:'2026-11-27',tag:'result',state:'skim',memo:'표의 정의를 확인하기'},
    ];
    localStorage.setItem('researchtrail.v5',JSON.stringify({name:'읽기 기록 예시',papers,zoom:'month',
      tags:[{id:'method',name:'방법',color:'#9970cf'},{id:'result',name:'결과',color:'#297d91'}],
      links:[{id:'link1',from:'ref1',to:'ref2',reason:'실험 방법 비교'}]}));
    localStorage.setItem('researchtrail.tour','1');
  });
  const page=await context.newPage();
  await page.clock.setFixedTime(new Date('2026-11-27T03:00:00Z'));
  await page.goto(origin);
  await page.locator('.card[data-id="ref1"]').waitFor();
  await page.evaluate(async bytes=>{
    await idbPut('ref1',new Blob([new Uint8Array(bytes)],{type:'application/pdf'}));
  },Array.from(synthetic.fixture().files.draft));
  await mkdir(out,{recursive:true});
  const save=async name=>{
    await page.evaluate(()=>document.fonts.ready.then(()=>true));
    await page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});
  };
  await save('01-timeline');
  await page.locator('#vDot').click();
  await page.locator('.dn[data-id="ref1"]').waitFor();
  await save('02-graph');
  await page.locator('#vList').click();
  await page.locator('[data-list-paper="ref1"]').waitFor();
  await save('03-list');
  await page.locator('#vCard').click();
  const bubble=page.locator('#rbX');
  if(await bubble.isVisible())await bubble.click();
  await page.locator('.card[data-id="ref1"]').press('Enter');
  await page.locator('#pRead').waitFor();
  await save('04-detail');
  await page.locator('#pRead').click();
  await page.locator('.pgbox .textLayer').filter({hasText:'Draft passage 1'}).first().waitFor();
  await save('05-reader');
  await writeFile(path.join(out,'source.txt'),rev+'\n');
  console.log('Captured five original product screens in '+out);
}finally{await browser.close();}
