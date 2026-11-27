// Capture markup emitted by the actual view functions without a browser or synthetic geometry claims.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {makeAccount,project,referenceCommit} from '../tests/fixtures/product-visual.mjs';

const root=path.resolve(import.meta.dirname,'..');
const git=promisify(execFile);
async function source(mode,file){
  return mode==='device'?(await git('git',['show',referenceCommit+':web/'+file],{cwd:root,encoding:'utf8'})).stdout:
    readFileSync(path.join(root,'web',file),'utf8');
}
async function render(mode,mobile){
  const width=mobile?390:1440,height=mobile?844:900;
  const nodes=new Map(), stop=Symbol(), fragments={};
  let watch=null;
  function node(selector){
    if(!nodes.has(selector))nodes.set(selector,{
      dataset:{},style:{},classList:{toggle(){},add(){},remove(){}},parentNode:{insertBefore(){}},
      clientWidth:width,clientHeight:height,
      addEventListener(){},setAttribute(){},querySelector(){return null;},querySelectorAll(){return [];},
      set innerHTML(html){this.markup=html;if(selector===watch)throw stop;}
    });
    return nodes.get(selector);
  }
  const window={addEventListener(){},matchMedia:q=>({matches:/max-width:\s*600px/.test(q)&&mobile,addEventListener(){}})};
  const ctx=vm.createContext({console,URL,window,localStorage:{getItem:()=>null},
    document:{getElementById:id=>node('#'+id),querySelector:node,querySelectorAll:()=>[],addEventListener(){}}});
  const shared=['core','helpers','frame','timeline','timeline-mobile','panel','import','pdf-viewer','records-compact','reader','paper-list','graph'];
  for(const name of [...shared,...(mode==='account'?['account-pdfs','account-graph','product-reader']:[])])
    vm.runInContext(await source(mode,'js/'+name+'.js'),ctx,{filename:name+'.js'});
  Object.assign(ctx.S,structuredClone(project),{source:mode==='device'?'browser-local':'account',example:false,view:'card',panel:'detail',
    sel:'ref1',reader:'ref1',bands:true,taskId:mode==='account'?'visual-project':null});
  if(mode==='account'){
    const respond=makeAccount();
    async function get(suffix){
      let data;
      await respond({request:()=>({method:()=>'GET',headers:()=>({authorization:'Bearer visual-session'})}),fulfill:r=>{data=r.json;}},'tasks/visual-project/'+suffix);
      return data;
    }
    const rows=(await get('papers')).papers, extra=await get('workspace');
    ctx.accountWorkspace={papers:{},current:()=>true,extra:()=>({}),readingPages:extra.reading_pages};
    ctx.S.papers=rows.map(p=>ctx.accountPaperFromRow(p,extra.papers[p.document_use_id].data));
    ctx.S.tags=extra.project.data.tags;
    ctx.S.links=(await get('paper-links')).links.map(l=>({id:l.link_id,from:l.from_document_use_id,to:l.to_document_use_id,reason:l.reason_text}));
  }
  for(const p of ctx.S.papers){p.hl=[];p.page=p.pdf?'1':'';}
  ctx.todayStr=()=>'2026-11-27';ctx.rng=()=>[ctx.dnum('2026-11-01'),ctx.dnum('2026-12-01')];ctx.RD.id='ref1';
  async function take(screen,selector,fn){
    watch=selector;
    let observed=false;
    try{await fn();}catch(e){if(e!==stop)throw Error(mode+'/'+screen+': '+e.message,{cause:e});observed=true;}finally{watch=null;}
    assert.ok(observed,'Renderer did not write '+screen+' '+selector);
    (fragments[screen]||={})[selector]=node(selector).markup;
  }
  if(mobile){
    ctx.S.reader=null;await take('timeline','#mtl',()=>ctx.renderMobileTimeline());ctx.S.reader='ref1';
  }else await take('timeline','#canvas',()=>ctx.renderCards());
  await take('graph','#dotsvg',()=>ctx.renderDots());
  await take('list','#paperList',()=>ctx.renderPaperList());
  await take('list','#paperListRows',()=>ctx.renderPaperListRows());
  fragments.list['#paperListState']=node('#paperListState').markup;
  await take('detail','#pin',()=>ctx.renderPanel());
  fragments.reader={template:await source(mode,'views/reader.html')};
  await take('reader','#rdnotes',()=>ctx.renderRNotes());
  ctx.loadPdfJs=async()=>{};ctx.pdfjsLib={getDocument:()=>({promise:Promise.resolve({numPages:34})})};
  await take('reader','#rdsrc',()=>ctx.openPv(ctx.S.papers[0],{},'1'));
  ctx.document.getElementById=id=>id==='rRecords'?node('#rRecords'):null;
  ctx.document.createElement=()=>node('#rCompose');
  await take('reader','#rCompose',()=>ctx.rcCompose());
  return fragments;
}

const views={timeline:'타임라인',graph:'그래프',list:'논문 목록',detail:'상세 패널',reader:'PDF 리더'};
const probe={
 timeline:['합성 실험의 측정 방법','측정 결과 비교','읽는 중'],graph:['합성 실험의 측정 방법','측정 결과 비교','실험 방법 비교'],
 list:['합성 실험의 측정 방법','측정 결과 비교','읽는 중'],detail:['합성 실험의 측정 방법','두 측정 방법을 비교하려고 저장함','이어 읽기','실험 방법 비교'],
 reader:['이전 쪽','다음 쪽','질문하기','메모','reading-sample.pdf']
};
function inspect(view,fragments){
  const html=Object.values(fragments).join('\n');
  // Only count explicit control opening tags in the captured insertion regions.
  const controls=Array.from(html.matchAll(/<(?:button|input|select|textarea)\b[^>]*>|<(?:g|div)\b[^>]*\brole="button"[^>]*>/g),m=>m[0]);
  const ids=new Set(controls.flatMap(t=>Array.from(t.matchAll(/(?:\bid|\bdata-(?:mtab|rtab|list-paper|mtl-paper|id))="([^"]*)"/g),m=>m[1])));
  const messages=['계정 저장 상태','이 판본에 저장','reading-sample.pdf'].filter(text=>html.includes(text));
  if(html.includes('id="accountReaderNotice"'))messages.push('#accountReaderNotice');
  return {controls:controls.length,ids,labels:probe[view].filter(text=>html.includes(text)),messages};
}
const labels = items=>items.length?items.join(' · '):'—';
let body='# 제품 화면의 렌더 함수 출력 비교\n\n';
body+='기준 커밋 `'+referenceCommit.slice(0,7)+'`의 브라우저 로컬 함수와 현재 작업 트리의 계정 함수를 각각 실행했다. 두 경로에 같은 합성 논문 두 편, 태그 두 개, 같은 날짜·읽기 상태·링크·PDF 파일명을 사용했다. 계정 경로는 인증 응답 대역의 논문 행을 실제 계정 어댑터로 읽었다.\n\n';
body+='표의 수는 캡처한 HTML에 있는 button, input, select, textarea 및 버튼 역할을 가진 div/g의 개수다. 공통 문구는 양쪽 HTML에 실제로 있었던 검사 대상 문구다. CSS로 감춘 요소도 포함한다. 데스크톱(1440 × 900)과 휴대폰(390 × 844)은 렌더 함수의 분기 입력이며, 브라우저가 계산한 크기나 PNG가 아니다. 리더는 실제 PDF 파일 대신 34쪽짜리 PDF.js 문서 대역을 사용해 원래 도구 모음 함수를 실행했다.\n\n';
body+='| 입력 | 화면 | 브라우저 로컬 | 로그인 계정 | 공통 문구 | 계정에서만 생성된 컨트롤 ID 또는 데이터 키 | 로컬에서만 생성된 키 | 계정에서만 생성된 안내·파일명 |\n|---|---|---:|---:|---|---|---|---|\n';
for(const mobile of [false,true]){
  const [device,account]=await Promise.all(['device','account'].map(m=>render(m,mobile)));
  for(const [view,title] of Object.entries(views)){
    const a=inspect(view,device[view]), b=inspect(view,account[view]);
    assert.ok(a.controls && b.controls && a.labels.some(x=>b.labels.includes(x)),view+' fixture did not render.');
    const delta=(x,y)=>[...x].filter(k=>!y.has(k)).map(k=>'`'+k+'`');
    body+='| '+(mobile?'휴대폰':'데스크톱')+' | '+title+' | '+a.controls+' | '+b.controls+' | '+labels(a.labels.filter(x=>b.labels.includes(x)))+' | '+labels(delta(b.ids,a.ids))+' | '+labels(delta(a.ids,b.ids))+' | '+labels(b.messages.filter(m=>!a.messages.includes(m)))+' |\n';
  }
}
body+='\n각 화면에서 캡처한 영역은 데스크톱 타임라인의 #canvas, 모바일의 #mtl, 그래프 #dotsvg, 목록 #paperList와 상태 및 행, 상세 #pin, 리더 템플릿과 #rdnotes·#rdsrc·#rCompose이다. PDF 내부의 실제 글자·색·좌표나 모바일에서 최종적으로 보이는 컨트롤은 브라우저 렌더 비교가 필요하다.\n';
const out=process.argv[2];if(out)writeFileSync(out,body);else process.stdout.write(body);
