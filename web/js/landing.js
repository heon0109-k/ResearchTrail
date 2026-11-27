'use strict';
/* ---------- 시작 페이지: 처음 접속했을 때만 보이는 소개 (여백 많은 한 장, 트레일을 따라 내려가며 읽기) ---------- */
function landingSeen(){try{return localStorage.getItem('researchtrail.landing')==='1'}catch(e){return false}}
function landingMark(){try{localStorage.setItem('researchtrail.landing','1')}catch(e){}}
var RET=false; /* 내 기록이 있는 채로 예시를 열었는지 */
function hasMine(){if(S.papers.length&&!S.example)return true;try{var o=JSON.parse(localStorage.getItem(KEY)||'null');return !!(o&&o.papers&&o.papers.length&&!o.example)}catch(e){return false}}
/* 'Google로 시작하기': 계정 화면(배포본의 첫 화면) 안에 열려 있으면 그 화면의 Google 로그인을 바로 누르고,
   따로 열려 있으면 계정 화면으로 보낸다. 계정 설정이 없는 로컬 실행에서는 false → 예전처럼 이 브라우저에서 시작. */
/* 이 브라우저에 Google 로그인이 남아 있는지 (Supabase가 저장해 두는 sb-…-auth-token). 토큰 내용은 읽지 않는다. */
function landingSignedIn(){try{for(var i=0;i<localStorage.length;i++){if(/^sb-.+-auth-token$/.test(localStorage.key(i)||''))return true}}catch(e){}return false}
function landingGoogle(){
  try{
    var pd=window.parent!==window&&window.parent.document,b=pd&&pd.getElementById('authLogin');
    if(b&&!b.hidden&&!b.disabled){b.click();return true}
  }catch(e){}
  var c=window.RESEARCHTRAIL_CONFIG;
  if(c&&c.SUPABASE_URL){(window.top||window).location.assign(new URL('./',location.href).href);return true}
  return false;
}
/* '다른 계정으로 로그인': 계정 화면을 ?switch=1 로 다시 열면, 그쪽에서 이 브라우저의 로그인을 끊고 Google 계정 선택 창을 띄운다 */
function landingSwitch(){
  var u=new URL('./',location.href);u.searchParams.set('switch','1');
  (window.top||window).location.assign(u.href);
}
function showLanding(){
  try{sessionStorage.setItem('researchtrail.screen','landing')}catch(e){}
  if(typeof S!=='undefined'&&S)S.bubble=null;
  var ch=curChar(),has=hasMine(),go=has?'내 타임라인으로':'시작하기';
  app.innerHTML = screens.landing;
  $$('[data-lp="start"]').forEach(function(button){button.textContent=go});
  /* 처음 온 사람: 'Google 계정으로 시작하기'
     로그인한 적 있는 사람: 'Google 계정으로 계속하기' + 아래 '다른 계정으로 로그인'
     로그인 없이 이 브라우저에 타임라인만 있는 사람: '내 타임라인으로 →' */
  var signed=landingSignedIn();
  if(signed){
    $$('.landing-gt').forEach(function(t){t.textContent='Google 계정으로 계속하기'});
    $$('[data-lp="switch"]').forEach(function(x){x.hidden=false});
  }else if(has)$$('[data-lp="google"]').forEach(function(gb){
    gb.classList.add('is-return');gb.textContent='내 타임라인으로 →';gb.dataset.lp='start';
  });
  $('.landing-mascot').innerHTML=spr(ch.rows,3,'bob');
  $('#lpWalk').innerHTML=spr(ch.rows,2,'bob');
  $$('[data-lp]').forEach(function(b){b.addEventListener('click',function(){
    landingMark();
    if(b.dataset.lp==='google'&&landingGoogle())return;
    if(b.dataset.lp==='switch'){landingSwitch();return}
    if(b.dataset.lp==='sample'){RET=has;loadSample()}else if(has){if(S.example)load();showMain();renderAll()}else{startEmpty();firstRunTour()}
  })});
  var df=$('iframe[data-demo]');
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
  var path=$('#lpPath'),walk=$('#lpWalk'),fill=$('#lpFill'),stops=$$('.landing-stop',lp);
  function place(){
    if(!path||!document.body.contains(path))return;
    var pr=path.getBoundingClientRect(),lr=lp.getBoundingClientRect(),H=pr.height;
    var y=lr.top+lr.height*.5-pr.top;y=Math.max(0,Math.min(H-34,y));
    walk.style.top=y+'px';fill.style.height=(y+16)+'px';
    stops.forEach(function(s){var sr=s.getBoundingClientRect();s.classList.toggle('on',sr.top+sr.height/2-pr.top<=y+18)});
  }
  lp.addEventListener('scroll',place,{passive:true});window.addEventListener('resize',place);place();
}
