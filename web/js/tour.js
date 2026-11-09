'use strict';
/* ---------- 처음 접속 안내: 화면을 어둡게 하고 기능마다 네모 칸으로 짚어 설명 ---------- */
var TOUR=null;
function tourSeen(){try{return localStorage.getItem('researchtrail.tour')==='1'}catch(e){return false}}
function tourMark(){try{localStorage.setItem('researchtrail.tour','1')}catch(e){}}
/* st: 이 단계를 보여 줄 때 앱이 있어야 할 화면 (timeline / detail=카드 옆 패널 / reader=읽기 화면) */
var TOUR_STEPS=[
  {core:1,st:'timeline',sel:'#addBtn',t:'논문 추가',d:'링크나 DOI를 붙이거나 PDF를 올려서 논문을 추가해요. 타임라인의 빈 곳을 더블클릭해도 돼요.'},
  {core:1,st:'timeline',sel:'.card.go',alt:'.card',t:'논문 카드',d:'카드 하나가 논문 한 편이에요. 가로 위치는 저장한 날짜예요. 지금 보이는 건 연습용 빈 카드예요.',need:'card'},
  {st:'timeline',sel:'#rbub',t:'다시 오셨네요',d:'다시 돌아오면 어디까지 읽었는지, 마지막 판단과 다음 할 일을 알려 줘요. 바로 이어 읽을 수 있어요.',optional:true},
  {core:1,st:'detail',sel:'#panel',t:'카드를 누르면 열리는 패널',d:'위쪽 버튼으로 읽기 화면을 열어요. 읽은 정도, 저장 이유, 태그를 고치고, 다른 논문과의 연결도 여기서 추가해요. 맨 아래에서 논문을 삭제할 수 있어요.',need:'card'},
  {core:1,st:'reader',sel:'#rdsrc',t:'읽기 화면 · 원문',d:'PDF를 올리거나 arXiv 링크를 붙이면 여기서 바로 읽어요. 문장을 드래그해 형광펜을 남기고, 하이라이트 아래에 메모를 적어요. 작은 복사 아이콘으로 AI에게 물어볼 질문을 복사할 수 있고, 위쪽 "영역 캡처"로 수식·그림도 저장해요.',need:'card'},
  {core:1,st:'reader',sel:'#rdnotes',t:'읽기 화면 · 읽기 기록',d:'읽던 쪽은 자동으로 기록돼요. 하이라이트·캡처 아래에 메모를 남기거나 "+ 메모 추가"를 눌러요. 기록 한 건을 선택해 "다음 할 일 찾기 →"를 누르면 규칙 기반으로 다음 할 일을 제안하고, 확인해야 다음 할 일로 저장돼요.',need:'card'},
  {st:'reader',sel:'#rdBack',t:'타임라인으로 돌아가기',d:'돌아오면 읽던 쪽과 메모가 그대로 남아 있어요. 다음에 열면 이어 읽을 수 있어요.',need:'card'},
  {st:'timeline',sel:'nav.sgp',t:'세 가지 보기',d:'타임라인은 읽은 순서, 연결 그래프는 논문 사이의 관계, 내용 찾기는 표시해 둔 수식·그림·메모의 위치를 다시 찾는 곳이에요.'},
  {st:'timeline',sel:'.sgt',t:'태그',d:'태그로 논문을 묶어요. + 를 누르면 새 태그를 만들 수 있고, 태그를 누르면 해당 논문만 보이고, 다시 누르거나 "전체"를 누르면 돌아와요. "태그 구분 없이 보기"를 켜면 줄을 합쳐 볼 수 있어요.'},
  {st:'timeline',sel:'#fcard',t:'기간 조절',d:'1주·1달·전체로 보는 기간을 바꾸고, 아래 막대로 다른 시기로 이동해요.'},
  {core:1,st:'timeline',sel:null,t:'이제 직접 해 보세요',d:'연습용 카드는 패널 맨 아래 "삭제"로 지울 수 있어요. 첫 논문을 추가하며 시작해 보세요. 오른쪽 위 "사용법"을 누르면 태그·보기 방식까지 포함한 전체 안내를 다시 볼 수 있어요.'}
];
function tutPaper(){return S.papers.filter(function(p){return p.tut})[0]||S.papers.slice().sort(function(a,b){return String(b.date).localeCompare(String(a.date))})[0]||null}
/* 처음 시작할 때 오늘 날짜로 연습용 빈 카드를 하나 만든다 (안내용, 지워도 됨) */
function addTutCard(){
  if(S.papers.length)return null;
  var p={id:nid('p'),tag:'',date:todayStr(),title:'연습용 카드 · 눌러서 열어 보세요',memo:'사용법을 익히는 빈 카드예요. 다 써 봤으면 지워도 돼요.',link:'',state:'skim',tut:true};
  S.papers.push(p);
  renderAll();
  S.focusTodayOnce=true;
  focusStart();
  if(typeof save==='function')save();
  return p;
}
function tourEnsure(st){
  var p=tutPaper();
  if(st==='timeline'){if(S.reader||S.panel!=='none'){S.reader=null;S.sel=null;S.panel='none';S.linking=null;renderAll()}}
  else if(st==='detail'&&p){if(S.reader||S.panel!=='detail'||S.sel!==p.id)select(p.id)}
  else if(st==='reader'&&p){if(S.reader!==p.id)openReader(p.id)}
}
function tourStart(mode){
  var short=(mode==='short');
  tourEnd(true);
  var has=!!tutPaper();
  var steps=TOUR_STEPS.filter(function(s){
    if(short&&!s.core)return false;
    if(s.need==='card'&&!has)return false;
    if(!s.sel)return true;
    if(s.st&&s.st!=='timeline')return true;
    var e=$(s.sel)||(s.alt&&$(s.alt));return e&&e.offsetParent!==null||(e&&getComputedStyle(e).position==='fixed')});
  if(!steps.length)return;
  var ov=document.createElement('div');ov.id='tour';ov.className='tour';
  ov.innerHTML='<div class="tour-hole" id="tHole"></div><div class="tour-tip" id="tTip" role="dialog" aria-modal="true" aria-label="처음 안내"></div>';
  document.body.appendChild(ov);
  TOUR={i:0,steps:steps,ov:ov};
  document.addEventListener('keydown',tourKey,true);
  window.addEventListener('resize',tourDraw);
  tourDraw();
}
function tourEnd(quiet){
  if(!TOUR)return;
  document.removeEventListener('keydown',tourKey,true);window.removeEventListener('resize',tourDraw);
  TOUR.ov.remove();TOUR=null;if(!quiet){if(!S.example)tourMark();tourEnsure('timeline')}
}
function tourKey(e){
  if(!TOUR)return;
  if(e.key==='Escape'){e.stopPropagation();tourEnd()}
  else if(e.key==='ArrowRight'||e.key==='Enter'){e.preventDefault();e.stopPropagation();tourGo(1)}
  else if(e.key==='ArrowLeft'){e.preventDefault();e.stopPropagation();tourGo(-1)}
}
function tourGo(d){
  if(!TOUR)return;var n=TOUR.i+d;
  if(n>=TOUR.steps.length){tourEnd();return}
  if(n<0)return;
  TOUR.i=n;tourDraw();
}
function tourDraw(){
  if(!TOUR)return;
  var s0=TOUR.steps[TOUR.i];
  if(s0.st){var before=(S.reader||'')+'|'+S.panel+'|'+S.sel;tourEnsure(s0.st);if(before!==(S.reader||'')+'|'+S.panel+'|'+S.sel){clearTimeout(TOUR.tm);TOUR.tm=setTimeout(function(){if(TOUR)tourDraw2()},90);return}}
  tourDraw2();
}
function tourDraw2(){
  if(!TOUR)return;
  var s=TOUR.steps[TOUR.i],el=s.sel?($(s.sel)||(s.alt&&$(s.alt))):null,hole=$('#tHole'),tip=$('#tTip'),last=TOUR.i===TOUR.steps.length-1;
  if(el&&el.scrollIntoView&&/card/.test(s.sel))el.scrollIntoView({block:'center',inline:'center'});
  tip.innerHTML='<div class="tt-n">'+(TOUR.i+1)+' / '+TOUR.steps.length+'</div><div class="tt-t">'+esc(s.t)+'</div><div class="tt-d">'+esc(s.d)+'</div>'+
    '<div class="tt-b"><button type="button" class="btn ghost sm" id="tSkip">건너뛰기</button><span class="sp"></span>'+(TOUR.i>0?'<button type="button" class="btn sm" id="tPrev">이전</button>':'')+'<button type="button" class="btn pri sm" id="tNext">'+(last?'시작하기':'다음')+'</button></div>';
  $('#tSkip').onclick=function(){tourEnd()};$('#tNext').onclick=function(){tourGo(1)};var pv=$('#tPrev');if(pv)pv.onclick=function(){tourGo(-1)};
  var W=window.innerWidth,H=window.innerHeight,tw=tip.offsetWidth||300,th=tip.offsetHeight||150,x,y;
  if(!el){
    hole.style.cssText='left:50%;top:50%;width:0;height:0;border-color:transparent';
    tip.style.left=Math.max(12,(W-tw)/2)+'px';tip.style.top=Math.max(12,(H-th)/2)+'px';
  }else{
    var r=el.getBoundingClientRect(),pd=6,L=r.left-pd,T=r.top-pd,Wd=r.width+pd*2,Ht=r.height+pd*2;
    hole.style.cssText='left:'+L+'px;top:'+T+'px;width:'+Wd+'px;height:'+Ht+'px';
    if(L+Wd+16+tw<=W-12){x=L+Wd+16;y=T}
    else if(T+Ht+16+th<=H-12){x=L;y=T+Ht+16}
    else if(T-16-th>=12){x=L;y=T-16-th}
    else{x=Math.max(12,L-16-tw);y=T}
    tip.style.left=Math.max(12,Math.min(W-tw-12,x))+'px';tip.style.top=Math.max(12,Math.min(H-th-12,y))+'px';
  }
  $('#tNext').focus();
}
function maybeTour(){if(tourSeen())return;setTimeout(function(){if(!tourSeen()&&$('#addBtn')&&!S.reader)tourStart()},700)}

/* 처음 한 번만: 연습용 카드를 만들고 사용법을 바로 띄운다. 끝까지 보거나 건너뛰면 다시 자동으로 뜨지 않는다 */
function firstRunTour(){if(tourSeen())return;addTutCard();setTimeout(function(){if(!tourSeen())tourStart('short')},450)}
