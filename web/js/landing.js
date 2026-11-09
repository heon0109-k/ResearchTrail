'use strict';
/* ---------- 시작 페이지: 처음 접속했을 때만 보이는 소개 (여백 많은 한 장, 트레일을 따라 내려가며 읽기) ---------- */
function landingSeen(){try{return localStorage.getItem('researchtrail.landing')==='1'}catch(e){return false}}
function landingMark(){try{localStorage.setItem('researchtrail.landing','1')}catch(e){}}
var RET=false; /* 내 기록이 있는 채로 예시를 열었는지 */
function hasMine(){if(S.papers.length&&!S.example)return true;try{var o=JSON.parse(localStorage.getItem(KEY)||'null');return !!(o&&o.papers&&o.papers.length&&!o.example)}catch(e){return false}}
function showLanding(){
  try{sessionStorage.setItem('researchtrail.screen','landing')}catch(e){}
  if(typeof S!=='undefined'&&S)S.bubble=null;
  var ch=curChar(),has=hasMine(),go=has?'내 타임라인으로':'시작하기';
  app.innerHTML='<div class="lp" id="lp">'+
  '<header class="lp-nav"><a class="lp-brand" href="#" data-go="top">ResearchTrail<i>.</i></a>'+
    '<span class="sp"></span><nav class="lp-menu"><a href="#" data-go="lpDemo">미리보기</a><a href="#" data-go="lpTrail">사용 흐름</a></nav>'+
    '<button type="button" class="btn pri sm" data-lp="start" style="border-radius:999px">'+go+'</button></header>'+
  '<section class="lp-hero"><div class="lp-hl">'+
    '<h1 class="lp-head">읽던 자리에서<br><em>바로 이어서.</em></h1>'+
    '<p class="lp-sub">읽은 논문을 타임라인으로 남기고, 다시 돌아오면 멈춘 쪽과 다음 할 일을 알려 줘요.</p>'+
    '<div class="lp-cta"><button type="button" class="btn pri lg" data-lp="start">'+go+'</button>'+'<button type="button" class="lp-link" data-lp="sample">예시 먼저 보기 →</button>'+'</div>'+
    '<p class="lp-note">가입 없이 · 기록은 이 브라우저에만 저장돼요</p></div>'+
    '<div class="lp-hr" aria-hidden="true"><svg class="lp-curve" viewBox="0 0 420 460" fill="none"><path d="M30 420 C 120 420, 120 300, 210 300 S 300 150, 390 120" stroke="#cfd8e3" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round"/><path d="M30 420 C 120 420, 120 300, 210 300" stroke="#2f9cf4" stroke-width="3" stroke-linecap="round"/></svg>'+
     '<div class="lp-fc a"><span class="k">11/2</span><b>From Local to Global</b><span>p.7에서 멈춤</span></div>'+
     '<div class="lp-fc b"><span class="hl">global sensemaking</span><span class="chip">개념·방법</span></div>'+
     '<div class="lp-fc c"><span class="k">다음 할 일</span><b>Table 2 비용 비교</b></div>'+
     '<div class="lp-fw">'+spr(ch.rows,3,'bob')+'</div></div></section>'+
  '<section class="lp-demo" id="lpDemo"><div class="lp-win"><div class="bar2"><i></i><i></i><i></i><span style="margin-left:8px">직접 눌러 보세요</span></div><div class="lp-fit" id="lpFit"><iframe name="rt-demo" src="about:blank" data-demo="1" title="ResearchTrail 미리보기" loading="lazy"></iframe></div></div><p class="lp-capt">예시 데이터예요. 카드를 눌러 읽기 화면도 열어 볼 수 있어요.</p></section>'+

  '<section class="lp-trail" id="lpTrail"><h2>읽다가 멈춘 날부터,<br>다시 돌아오는 날까지</h2><p class="lead">스크롤을 따라 캐릭터가 트레일을 걸어요.</p>'+
   '<div class="lp-path" id="lpPath"><div class="lp-line"><i id="lpFill"></i></div><div class="lp-walker" id="lpWalk">'+spr(ch.rows,2,'bob')+'</div>'+
    '<div class="lp-stop rv"><i class="dot"></i><div class="lp-t"><div class="d">11/2 · 읽다가</div><h3>멈춘 자리가<br>그대로 남아요</h3><p>논문을 열면 읽던 쪽이 자동으로 기록돼요. 저장한 이유와 함께 타임라인에 한 장의 카드로 쌓여요.</p></div><div class="lp-v"><div class="lp-ui"><span class="k">이어 읽을 논문</span><b>From Local to Global</b><div class="bar3"><i></i></div><span>26쪽 중 7쪽 · 읽는 중</span></div></div></div>'+
    '<div class="lp-stop rv"><i class="dot"></i><div class="lp-t"><div class="d">읽는 동안</div><h3>중요한 곳에<br>표시를 남겨요</h3><p>문장은 형광펜으로, 깨지기 쉬운 수식과 그림은 영역 캡처로 저장하고, 이해한 내용을 한 줄 적어 둬요.</p></div><div class="lp-v"><div class="lp-ui"><span><span class="hl">global sensemaking questions</span><span class="chip">개념·방법</span></span><div class="cap">Q = f(K, M)</div><span><em>내가 이해한 것</em>코퍼스 전체를 보고 답해야 하는 큰 질문</span></div></div></div>'+
    '<div class="lp-stop rv"><i class="dot"></i><div class="lp-t"><div class="d">11/9 · 일주일 뒤</div><h3>다시 오셨네요,<br>하고 맞아 줘요</h3><p>다시 돌아오면 남겨 둔 메모와 확인한 다음 할 일을 볼 수 있어요.</p></div><div class="lp-v"><div class="lp-ui"><span class="k">다시 오셨네요</span><b>p.7에서 멈췄어요</b><div class="q"><em>마지막 판단</em>검색을 항상 하지 않는 방식이 더 맞아 보임.</div><div class="n"><em>다음 할 일</em>Table 2에서 비용·성능 비교 확인하기</div></div></div></div>'+
    '<div class="lp-stop rv"><i class="dot"></i><div class="lp-t"><div class="d">메모를 쓰면</div><h3>다음 할 일은<br>내가 확인해서</h3><p>메모에서 다음 작업 후보를 제안해요. 고치거나 취소할 수 있고, 확인해야만 저장돼요.</p></div><div class="lp-v"><div class="lp-ui"><span class="badge">예시 응답</span><div class="row">Table 2에서 비용 비교를 확인해야 함</div><div class="bt"><i class="p">확인하고 저장</i><i>취소</i></div></div></div></div>'+
    '<div class="lp-stop rv"><i class="dot"></i><div class="lp-t"><div class="d">나중에</div><h3>표시해 둔 위치를<br>다시 찾아요</h3><p>모든 논문의 형광펜, 캡처, 메모에서 검색하고, 눌러서 그 쪽으로 바로 이동해요.</p></div><div class="lp-v"><div class="lp-ui"><div class="row">Welch</div><div class="row"><b>p.4</b><span class="chip">수식</span><br>주파수별 에너지 추정</div><div class="row"><b>p.9</b><span class="chip">그래프·표</span><br>Figure 3 캡처</div></div></div></div>'+
   '</div></section>'+

  '<section class="lp-end rv" id="lpEnd"><h2>이어 읽을 준비가<br>됐나요?</h2><p>가입 없이 쓸 수 있고, 기록은 이 브라우저에만 저장돼요.<br>논문 정보를 가져오거나 PDF 뷰어를 불러올 때는 인터넷이 필요해요.</p>'+
   '<div class="lp-cta c"><button type="button" class="btn pri lg" data-lp="start">'+go+'</button></div></section>'+
  '<footer class="lp-foot">ResearchTrail · 2026 AI 캡스톤디자인</footer></div>';
  $$('[data-lp]').forEach(function(b){b.addEventListener('click',function(){
    landingMark();
    if(b.dataset.lp==='sample'){RET=has;loadSample()}else if(has){if(S.example)load();showMain();renderAll()}else{startEmpty();firstRunTour()}
  })});
  var df=$('iframe[data-demo]');if(df){var cl=document.documentElement.cloneNode(true);var ap=cl.querySelector('#app');if(ap)ap.innerHTML='';
    df.srcdoc='<!doctype html>'+cl.outerHTML;}
  var fit=$('#lpFit'),full=null;
  function fitDemo(){if(!fit||!df)return;var sc=Math.min(1,fit.clientWidth/1100);fit.style.height=Math.round(620*sc)+'px';df.style.transform='scale('+sc+')'}
  fitDemo();window.addEventListener('resize',fitDemo);
  var lp=$('#lp');
  $$('[data-go]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();var t=a.dataset.go==='top'?null:document.getElementById(a.dataset.go);
    if(!t){lp.scrollTo({top:0,behavior:'smooth'});return}
    lp.scrollTo({top:t.getBoundingClientRect().top-lp.getBoundingClientRect().top+lp.scrollTop-70,behavior:'smooth'})})});
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{root:lp,threshold:.15});
    $$('.rv',lp).forEach(function(el){io.observe(el)});
  }
  /* 스크롤에 맞춰 캐릭터가 트레일을 따라 내려간다 */
  var path=$('#lpPath'),walk=$('#lpWalk'),fill=$('#lpFill'),stops=$$('.lp-stop',lp);
  function place(){
    if(!path||!document.body.contains(path))return;
    var pr=path.getBoundingClientRect(),lr=lp.getBoundingClientRect(),H=pr.height;
    var y=lr.top+lr.height*.5-pr.top;y=Math.max(0,Math.min(H-34,y));
    walk.style.top=y+'px';fill.style.height=(y+16)+'px';
    stops.forEach(function(s){var sr=s.getBoundingClientRect();s.classList.toggle('on',sr.top+sr.height/2-pr.top<=y+18)});
  }
  lp.addEventListener('scroll',place,{passive:true});window.addEventListener('resize',place);place();
}
