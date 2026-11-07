'use strict';
/* ---------- main frame ---------- */
function iconCard(){return '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="1" y="1.5" width="8" height="4.5"/><rect x="5" y="8" width="8" height="4.5"/></svg>'}
function iconDot(){return '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" stroke="currentColor" stroke-width="1"><path d="M3 4 L8 3 L10 10 L4 10 Z" fill="none"/><circle cx="3" cy="4" r="1.8"/><circle cx="8" cy="3" r="1.8"/><circle cx="10" cy="10" r="1.8"/><circle cx="4" cy="10" r="1.8"/></svg>'}
function showMain(){
  app.innerHTML='<div class="app"><aside class="side">'+
  '<button class="brandbtn" id="homeBtn" type="button" title="소개 페이지">ResearchTrail<i class="dot">.</i></button>'+
  '<button class="btn pri add" id="addBtn" type="button" title="타임라인 빈 곳을 더블클릭해도 추가할 수 있어요">+ 논문 추가</button>'+
  '<nav class="sgp" aria-label="보기 방식"><div class="sl">보기</div><button class="nv" id="vCard" type="button">'+iconCard()+'타임라인</button><button class="nv" id="vDot" type="button">'+iconDot()+'연결 그래프</button><button class="nv" id="vFind" type="button">'+iconFind()+'내용 찾기</button></nav>'+
  '<div class="sgp sgt"><div class="sl sh"><span>태그</span><button type="button" class="tadd" id="tagAdd" aria-label="태그 추가" title="태그 추가">+</button></div><div class="chips" id="chips"></div><div id="bandsw"><button class="tog" id="bBand" type="button" aria-pressed="true"><i></i>태그별로 나눠 보기</button></div></div>'+
  '<button class="tog" id="bWhy" type="button" aria-pressed="false" hidden><i></i>이유 보기</button>'+
  '<div class="me"><button type="button" class="mebtn" id="meBtn" aria-haspopup="true" aria-expanded="false"></button><div class="mepop" id="mePop" hidden></div></div>'+
  '</aside><div class="main"><header class="bar"><h1 id="tName"></h1><span id="exTag" class="tagex" hidden>예시</span><span class="sp"></span><button type="button" class="btn ghost sm" id="tourBtn" title="화면 기능 소개 다시 보기">사용법</button><button type="button" class="btn own" id="ownBtn" hidden>내 타임라인 시작</button></header><div class="rbar" id="rbar" hidden></div>'+
  '<div class="work"><div class="viewport"><div class="emptybox" id="emptyBox" hidden><p class="eb-hint">왼쪽 위 <b>+ 논문 추가</b>로 시작하거나, 타임라인의 빈 곳을 더블클릭하세요.</p></div><div id="scroller"><div id="canvas"></div></div><div id="dotwrap" hidden><svg id="dotsvg" role="img" aria-label="논문 연결 그래프"></svg><div class="gh"><button type="button" class="ghb" id="ghB" aria-label="그래프 보는 법" aria-expanded="false">?</button><div class="ghp" id="ghP" role="tooltip"><div class="r"><i class="c rd"></i>읽는 중</div><div class="r"><i class="c dn"></i>다 읽음</div><div class="r"><i class="c sk"></i>읽을 예정</div><div class="r sz"><i class="c big"></i>연결이 많을수록 큼</div></div></div></div></div><aside class="panel" id="panel" aria-label="논문 패널"><div class="pin" id="pin"></div></aside></div>'+
  '<section class="reader" id="reader" hidden></section>'+
  '<footer class="foot" id="fcard"><div class="seg" id="zoomSeg" role="group" aria-label="확대 단계"><button data-z="week" type="button">1주</button><button data-z="month" type="button">1달</button><button data-z="quarter" type="button">3달</button><button data-z="all" type="button">전체</button></div><div class="mm" id="mm" aria-label="전체 기간 미니맵"></div><div class="rng" id="rng"></div></footer>'+
  '<footer class="foot" id="fdot" hidden><span style="font-size:12px;color:var(--mute)">같은 태그끼리 모이고, 연결된 논문은 선으로 이어져요.</span><span style="flex:1"></span><button class="btn" id="relayout" type="button">배치 다시 계산</button></footer>'+
  '</div></div>';
  wireMe();
  $('#tName').textContent=S.name;$('#exTag').hidden=!S.example;$('#ownBtn').hidden=!S.example;$('#ownBtn').textContent=RET?'내 타임라인으로 돌아가기':'내 타임라인 시작';
  $('#vCard').addEventListener('click',function(){setView('card')});
  $('#vDot').addEventListener('click',function(){setView('dot')});
  $('#vFind').addEventListener('click',openFind);
  $('#tourBtn').addEventListener('click',function(){tourStart()});
  var tn=$('#tName');tn.title='눌러서 이름 바꾸기';tn.addEventListener('click',function(){if(tn.isContentEditable)return;tn.contentEditable='true';tn.focus();var r=document.createRange();r.selectNodeContents(tn);var s=getSelection();s.removeAllRanges();s.addRange(r)});
  function tnDone(){if(!tn.isContentEditable)return;tn.contentEditable='false';S.name=(tn.textContent||'').trim().slice(0,60)||'내 타임라인';tn.textContent=S.name;save()}
  tn.addEventListener('blur',tnDone);tn.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();tn.blur()}else if(e.key==='Escape'){tn.textContent=S.name;tn.blur()}});
  $('#ownBtn').addEventListener('click',function(){if(TOUR)tourEnd(true);if(RET){RET=false;S.example=false;if(load()){showMain();renderAll();return}}startEmpty();firstRunTour()});
  $('#bBand').addEventListener('click',function(){S.bands=!S.bands;renderAll()});
  $('#bWhy').addEventListener('click',function(){S.why=!S.why;renderAll()});
  $('#addBtn').addEventListener('click',function(){openAdd(null)});
  $('#homeBtn').addEventListener('click',function(){showLanding()});
  $('#zoomSeg').addEventListener('click',function(e){var b=e.target.closest('button');if(b)setZoom(b.dataset.z)});
  $('#relayout').addEventListener('click',function(){D.pos.forEach(function(o){o.x=(Math.random()-.5)*400;o.y=(Math.random()-.5)*400;o.vx=o.vy=0});D.alpha=1;kick()});
  wireScroller();wireMinimap();wireDots();
  renderAll();
  var sc=$('#scroller');
  var last=S.papers.reduce(function(m,p){return Math.max(m,dnum(p.date))},-1e9);
  maybeBubble();renderAll();focusStart();
  var _st=0;sc.addEventListener('scroll',function(){clearTimeout(_st);_st=setTimeout(function(){if(S.view==='card'&&!S.reader){S.scroll={l:sc.scrollLeft,t:sc.scrollTop,z:S.zoom};save()}},250)});
}
function setView(v){S.reader=null;S.view=v;renderAll();if(v==='dot'){D.alpha=Math.max(D.alpha,.6);kick()}}
function openAdd(draft){S.reader=null;S.draft=Object.assign({},draft,{date:todayStr()});S.panel='add';S.sel=null;S.linking=null;renderAll();var t=$('#aTitle');if(t)t.focus()}

function select(id){S.reader=null;S.sel=id;S.panel=id?'detail':'none';S.linking=null;renderAll();if(id)ensureVisible(id)}
function onPick(id){
  if(S.linking){if(id!==S.linking.from){var er=linkError(S.linking.from,id);if(er){S.linking.to=null;S.linking.err=er}else{S.linking.to=id;S.linking.err=null}renderAll()}return}
  select(id);
}
function ensureVisible(id){
  if(S.view!=='card')return;var sc=$('#scroller');var p=L.pos[id];if(!p)return;
  var pw=S.panel!=='none'?372:0;var left=sc.scrollLeft+LABELW,right=sc.scrollLeft+sc.clientWidth-pw;
  if(p.x<left+8||p.x+p.w>right-8){sc.scrollLeft=Math.max(0,p.x-LABELW-(sc.clientWidth-pw-LABELW-p.w)/2)}
  var top=sc.scrollTop+AXISH,bot=sc.scrollTop+sc.clientHeight;
  if(p.y<top||p.y+p.h>bot){sc.scrollTop=Math.max(0,p.y-AXISH-20)}
}

function visible(p){return true}
function matches(p){return true}

function renderMe(){
  var b=$('#meBtn');if(!b)return;
  b.innerHTML='<span class="mesp">'+spr(curChar().rows,2,'')+'</span><span class="menm">'+esc(ME.nick||'내 캐릭터')+'<em>프로필 변경</em></span>';
}
function wireMe(){
  var b=$('#meBtn'),pop=$('#mePop');
  function draw(){pop.innerHTML='<div class="mt">프로필</div><div class="chpick" id="meCh">'+chPick(ME.c,3)+'</div><label class="field"><span>내 이름</span><input type="text" id="meNick" maxlength="12" placeholder="이름(선택)" autocomplete="off" value="'+esc(ME.nick)+'"></label>';
    $('#meCh').addEventListener('click',function(e){var x=e.target.closest('.chp');if(!x)return;ME.c=+x.dataset.c;saveMe();draw();renderAll()});
    $('#meNick').addEventListener('input',function(e){ME.nick=e.target.value.trim().slice(0,12);saveMe();renderMe()});
    $('#meNick').addEventListener('keydown',function(e){if(e.key==='Enter'){close()}})}
  function close(){pop.hidden=true;b.setAttribute('aria-expanded','false');b.focus()}
  b.addEventListener('click',function(){if(pop.hidden){draw();pop.hidden=false;b.setAttribute('aria-expanded','true')}else close()});
  document.addEventListener('mousedown',function(e){if(!pop.hidden&&!e.target.closest('.me')){pop.hidden=true;b.setAttribute('aria-expanded','false')}});
  pop.addEventListener('keydown',function(e){if(e.key==='Escape'){e.stopPropagation();close()}});
}
function renderAll(){
  var ex=$('#exTag');if(ex)ex.hidden=!S.example;var ob=$('#ownBtn');if(ob){ob.hidden=!S.example;ob.textContent=RET?'내 타임라인으로 돌아가기':'내 타임라인 시작'}
  renderMe();
  renderTagbar();renderPanel();
  var rd=!!(S.reader&&paperBy(S.reader));if(!rd)S.reader=null;
  $('.work').hidden=rd;$('#reader').hidden=!rd;
  $('.app').classList.toggle('reading',rd);
  if(rd){renderReader();$('#fcard').hidden=true;$('#fdot').hidden=true;$('#vCard').setAttribute('aria-pressed',false);$('#vDot').setAttribute('aria-pressed',false);renderTagbar();save();return}
  RD.id=null;killPv();
  var card=S.view==='card';
  $('#scroller').hidden=!card;$('#dotwrap').hidden=card;$('#fcard').hidden=!card;$('#fdot').hidden=card;$('#bandsw').hidden=!card||!S.tags.length;$('#bWhy').hidden=!card;
  $('#vCard').setAttribute('aria-pressed',card);$('#vDot').setAttribute('aria-pressed',!card);
  $('#bBand').setAttribute('aria-pressed',S.bands);$('#bWhy').setAttribute('aria-pressed',S.why);
  $$('#zoomSeg button').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.z===S.zoom)});
  var em=!S.papers.length;$('#emptyBox').hidden=!em;
  if(em){$('#fcard').hidden=true;$('#fdot').hidden=true;$('#canvas').innerHTML='';$('#bandsw').hidden=true}
  else if(card){renderCards();renderMinimap()}else{renderDots()}
  renderRbar();
  save();
}
var TAGEDIT=false;
document.addEventListener('click',function(e){var b=document.getElementById('ghB');if(!b)return;if(e.target.closest&&e.target.closest('#ghB')){b.setAttribute('aria-expanded',b.getAttribute('aria-expanded')==='true'?'false':'true')}else b.setAttribute('aria-expanded','false')});
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('#tagAdd');if(!b)return;if(TAGEDIT){commitTag();return}TAGEDIT=true;renderTagbar()});
function commitTag(){var i=$('#tagNew');if(!TAGEDIT)return;var v=i?i.value.trim():'';TAGEDIT=false;if(v)addTag(v);renderAll()}
function renderTagbar(){
  var h='';
  S.tags.forEach(function(t){
    var n=S.papers.filter(function(p){return p.tag===t.id}).length;
    h+='<span class="tchip" style="--c:'+t.color+'"><i></i>'+esc(t.name)+'<em>'+n+'</em></span>';
  });
  var u=S.papers.filter(function(p){return !p.tag}).length;
  if(u&&S.tags.length)h+='<span class="tchip" style="--c:'+NOTAG.color+'"><i></i>태그 없음<em>'+u+'</em></span>';
  if(TAGEDIT)h+='<input class="tnew" id="tagNew" maxlength="20" placeholder="새 태그 이름" aria-label="새 태그 이름">';
  $('#chips').innerHTML=h;
  var ti=$('#tagNew');if(ti){ti.focus();ti.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();commitTag()}else if(e.key==='Escape'){TAGEDIT=false;renderTagbar()}});ti.addEventListener('blur',function(){setTimeout(function(){if(TAGEDIT)commitTag()},120)})}
  var cnt={done:0,reading:0,skim:0};S.papers.forEach(function(p){cnt[p.state||'skim']++});
  var sl=$('#stl');if(sl)sl.innerHTML=['done','reading','skim'].map(function(k){return '<div class="stl st-'+k+'"><i></i>'+STATES[k].t+'<em>'+cnt[k]+'</em></div>'}).join('');
}


function iconFind(){return '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>'}

/* 처음 상태: 논문이 하나도 없는 빈 타임라인 */
function startEmpty(){clearStore();reset();S.name='내 타임라인';showMain()}
