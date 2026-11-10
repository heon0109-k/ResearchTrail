'use strict';
/* ---------- main frame ---------- */
function iconCard(){return '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="1" y="1.5" width="8" height="4.5"/><rect x="5" y="8" width="8" height="4.5"/></svg>'}
function iconDot(){return '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" stroke="currentColor" stroke-width="1"><path d="M3 4 L8 3 L10 10 L4 10 Z" fill="none"/><circle cx="3" cy="4" r="1.8"/><circle cx="8" cy="3" r="1.8"/><circle cx="10" cy="10" r="1.8"/><circle cx="4" cy="10" r="1.8"/></svg>'}
function iconList(){return '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M5 4h9M5 8h9M5 12h9M1 4h1M1 8h1M1 12h1"/></svg>'}
function showMain(){
  TAGMANAGE=false;
  app.innerHTML='<div class="app"><aside class="side">'+
  '<button class="brandbtn" id="homeBtn" type="button" title="소개 페이지">ResearchTrail<i class="dot">.</i></button>'+
  '<button class="btn pri add" id="addBtn" type="button" title="타임라인 빈 곳을 더블클릭해도 추가할 수 있어요">+ 논문 추가</button>'+
  '<nav class="sgp" aria-label="보기 방식"><div class="sl">보기</div><button class="nv" id="vCard" type="button">'+iconCard()+'타임라인</button><button class="nv" id="vList" type="button">'+iconList()+'논문 목록</button><button class="nv" id="vDot" type="button">'+iconDot()+'연결 그래프</button><button class="nv" id="vFind" type="button">'+iconFind()+'내용 찾기</button></nav>'+
  '<div class="sgp sgt"><div class="sl sh"><span>태그</span><button type="button" class="tag-edit" id="tagEdit" aria-label="태그 편집" title="태그 편집" aria-pressed="false"><svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 3.5l4 4M3 17l4.5-1 10-10a2.8 2.8 0 0 0-4-4l-10 10L3 17Z"/></svg></button></div><div class="chips" id="chips"></div></div>'+
  '<button class="tog" id="bWhy" type="button" aria-pressed="false" hidden><i></i>이유 보기</button>'+
  '<div class="me"><button type="button" class="mebtn" id="meBtn" aria-haspopup="true" aria-expanded="false"></button><div class="mepop" id="mePop" hidden></div></div>'+
  '</aside><div class="main"><header class="bar"><h1 id="tName"></h1><span id="exTag" class="tagex" hidden>예시</span><span class="sp"></span><button type="button" class="btn ghost sm" id="tourBtn" title="화면 기능 소개 다시 보기">사용법</button><button type="button" class="btn own" id="ownBtn" hidden>내 타임라인 시작</button></header><div class="rbar" id="rbar" hidden></div>'+
  '<div class="work"><div class="viewport"><div class="emptybox" id="emptyBox" hidden><p class="eb-hint">왼쪽 위 <b>+ 논문 추가</b>로 시작하거나, 타임라인의 빈 곳을 더블클릭하세요.</p></div><div id="bandsw"><button class="tog" id="bBand" type="button" aria-pressed="false"><i></i>태그 구분 없이 보기</button></div><section id="paperList" class="paper-list" aria-label="논문 목록" hidden></section><div id="timelineMonth" class="timeline-month" aria-label="현재 보이는 연도와 월" hidden></div><div id="scroller"><div id="canvas"></div></div><div id="dotwrap" hidden><svg id="dotsvg" role="img" aria-label="논문 연결 그래프"></svg><div class="gh"><button type="button" class="ghb" id="ghB" aria-label="그래프 보는 법" aria-expanded="false">?</button><div class="ghp" id="ghP" role="tooltip"><div class="r"><i class="c rd"></i>읽는 중</div><div class="r"><i class="c dn"></i>다 읽음</div><div class="r"><i class="c sk"></i>읽을 예정</div><div class="r sz"><i class="c big"></i>연결이 많을수록 큼</div></div></div></div></div><aside class="panel" id="panel" aria-label="논문 패널"><div class="pin" id="pin"></div></aside></div>'+
  '<section class="reader" id="reader" hidden></section>'+
  '<footer class="foot" id="fcard"><div class="seg" id="zoomSeg" role="group" aria-label="확대 단계"><button data-z="week" type="button">1주</button><button data-z="month" type="button">1달</button><button data-z="all" type="button">전체</button></div>'+
  '<div class="overview-controls" id="overviewControls" hidden><button type="button" id="overviewFit">화면 맞춤</button></div><div class="mm" id="mm" role="slider" tabindex="0" aria-label="타임라인 날짜 이동"></div><div class="rng" id="rng"></div></footer>'+
  '<footer class="foot" id="fdot" hidden><span style="font-size:12px;color:var(--mute)">같은 태그끼리 모이고, 연결된 논문은 선으로 이어져요.</span><span style="flex:1"></span><button class="btn" id="relayout" type="button">배치 다시 계산</button></footer>'+
  '</div></div>';
  $('#overviewFit').addEventListener('click',function(){adjustOverviewZoom(0)});
  wireMe();
  $('#tName').textContent=S.name;$('#exTag').hidden=!S.example;$('#ownBtn').hidden=!S.example;$('#ownBtn').textContent=RET?'내 타임라인으로 돌아가기':'내 타임라인 시작';
  $('#vCard').addEventListener('click',function(){setView('card')});
  $('#vList').addEventListener('click',function(){setView('list')});
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
  $('#mm').addEventListener('keydown',function(e){var step=e.key==='ArrowLeft'?-7:e.key==='ArrowRight'?7:0;if(!step)return;e.preventDefault();var sc=$('#scroller');scrollToDay(S.zoom==='all'?(L.a+L.b)/2+(S.overviewPan||0)*(L.b-L.a)+step:L.a+(sc.scrollLeft+(sc.clientWidth-LABELW)/2)/L.px+step)});
  $('#zoomSeg').addEventListener('click',function(e){var b=e.target.closest('button');if(b)setZoom(b.dataset.z)});
  $('#relayout').addEventListener('click',function(){D.pos.forEach(function(o){o.x=(Math.random()-.5)*400;o.y=(Math.random()-.5)*400;o.vx=o.vy=0});D.alpha=1;kick()});
  wireScroller();wireMinimap();wireDots();wirePaperList();
  var restoredScroll=S.restoreViewOnce&&S.scroll&&S.scroll.z===S.zoom?S.scroll:null;
  var restoredRange=restoredScroll&&restoredScroll.range;
  var hasRange=Array.isArray(restoredRange)&&restoredRange.length===2&&restoredRange.every(Number.isSafeInteger)&&restoredRange[0]<restoredRange[1];
  if(S.zoom!=='all'&&hasRange)S.timelineRange=restoredRange;
  renderAll();
  var sc=$('#scroller');
  if(S.restoreViewOnce){
    S.restoreViewOnce=false;renderAll();
    if(!S.reader&&S.view==='card'){
      if(restoredScroll&&(S.zoom==='all'||hasRange)&&Number.isFinite(restoredScroll.l)&&Number.isFinite(restoredScroll.t)){
        var offset=S.zoom==='all'?0:(restoredRange[0]-L.a)*L.px;
        sc.scrollLeft=restoredScroll.l+offset;sc.scrollTop=restoredScroll.t;updateMinimapWin();
      }else{
        S.focusTodayOnce=true;focusStart();
      }
    }
  }else{maybeBubble();renderAll();S.focusTodayOnce=true;focusStart()}
  var _st=0;sc.addEventListener('scroll',function(){clearTimeout(_st);_st=setTimeout(function(){if(sc.isConnected&&S.view==='card'&&!S.reader){S.scroll=timelineScrollState(sc);save()}},250)});
}
function setView(v){S.reader=null;if(v==='list'){S.bubble=null;S.panel='none';S.sel=null}S.view=v;renderAll();if(v==='dot'){D.alpha=Math.max(D.alpha,.6);kick()}}
function openAdd(draft){S.reader=null;S.draft=Object.assign({},S.filterTag!=null?{tag:S.filterTag}:{},draft,{date:todayStr()});S.panel='add';S.sel=null;S.linking=null;renderAll();var t=$('#aTitle');if(t)t.focus()}

function select(id){
  if(!id){closeDetailPanel();return}
  if(S.panel!=='detail'&&S.view==='card'&&!S.reader){
    S.detailScroll=timelineScrollState($('#scroller'));
    if(S.zoom==='all')S.detailScroll.fitViewport=L.fitViewport;
  }
  S.reader=null;S.sel=id;S.panel='detail';S.linking=null;
  renderAll();ensureVisible(id);
}
function closeDetailPanel(){
  var previous=S.detailScroll;
  S.reader=null;S.sel=null;S.panel='none';S.linking=null;
  renderAll();
  if(!previous||S.view!=='card'||previous.z!==S.zoom)return;
  var sc=$('#scroller');
  var offset=previous.range?(previous.range[0]-L.a)*L.px:0;
  sc.scrollLeft=previous.l+offset;
  sc.scrollTop=previous.t;
  L.skipRangeGrowthAt=sc.scrollLeft;
  updateMinimapWin();
  S.scroll=timelineScrollState(sc);
  save();
}
function onPick(id){
  if(S.linking){if(id!==S.linking.from){var er=linkError(S.linking.from,id);if(er){S.linking.to=null;S.linking.err=er}else{S.linking.to=id;S.linking.err=null}renderAll()}return}
  select(id);
}
function ensureVisible(id){
  if(S.view!=='card')return;var sc=$('#scroller');var p=L.pos[id];if(!p)return;
  if(S.zoom==='all'){
    if(S.panel!=='detail')return;
    var scale=L.scale||1,x=(L.panPadding||0)+p.x*scale,y=p.y*scale;
    if(x<sc.scrollLeft+LABELW||x+p.w*scale>sc.scrollLeft+sc.clientWidth)sc.scrollLeft=x-LABELW-8;
    if(y<sc.scrollTop+AXISH||y+p.h*scale>sc.scrollTop+sc.clientHeight)sc.scrollTop=y-AXISH-8;
    updateMinimapWin();
    return;
  }
  var pw=S.panel!=='none'?372:0;var left=sc.scrollLeft+LABELW,right=sc.scrollLeft+sc.clientWidth-pw;
  if(p.x<left+8||p.x+p.w>right-8){sc.scrollLeft=Math.max(0,p.x-LABELW-(sc.clientWidth-pw-LABELW-p.w)/2)}
  var top=sc.scrollTop+AXISH,bot=sc.scrollTop+sc.clientHeight;
  if(p.y<top||p.y+p.h>bot){sc.scrollTop=Math.max(0,p.y-AXISH-20)}
}

function visible(p){return !!p&&(S.filterTag==null||(p.tag||'')===S.filterTag)}
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
  if(S.panel!=='detail'||S.view!=='card'||(S.detailScroll&&S.detailScroll.z!==S.zoom))S.detailScroll=null;
  var ex=$('#exTag');if(ex)ex.hidden=!S.example;var ob=$('#ownBtn');if(ob){ob.hidden=!S.example;ob.textContent=RET?'내 타임라인으로 돌아가기':'내 타임라인 시작'}
  renderMe();
  renderTagbar();renderPanel();
  var rd=!!(S.reader&&paperBy(S.reader));if(!rd)S.reader=null;
  $('.work').hidden=rd;$('#reader').hidden=!rd;
  $('.app').classList.toggle('reading',rd);
  if(rd){$('#overviewControls').hidden=true;$('#bandsw').hidden=true;renderReader();$('#fcard').hidden=true;$('#fdot').hidden=true;$('#vCard').setAttribute('aria-pressed',false);$('#vList').setAttribute('aria-pressed',false);$('#vDot').setAttribute('aria-pressed',false);renderTagbar();save();return}
  RD.id=null;killPv();
  var card=S.view==='card',list=S.view==='list';
  $('#paperList').hidden=!list;
  $('#overviewControls').hidden=!card||S.zoom!=='all';
  $('#timelineMonth').hidden=!card;
  $('#scroller').hidden=!card;$('#dotwrap').hidden=S.view!=='dot';$('#fcard').hidden=!card;$('#fdot').hidden=S.view!=='dot';$('#bandsw').hidden=!card||S.zoom!=='all'||!S.tags.length;$('#bWhy').hidden=!card;
  $('#vCard').setAttribute('aria-pressed',card);$('#vDot').setAttribute('aria-pressed',S.view==='dot');$('#vList').setAttribute('aria-pressed',list);
  $('#bBand').setAttribute('aria-pressed',!S.bands);$('#bWhy').setAttribute('aria-pressed',S.why);
  $('#mm').hidden=false;$('#fcard').classList.toggle('overview',S.zoom==='all');
  $('#mm').setAttribute('role','slider');$('#mm').setAttribute('tabindex','0');$('#mm').setAttribute('aria-label','타임라인 날짜 이동');
  $$('#zoomSeg button').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.z===S.zoom)});
  renderRbar();
  var em=!list&&!S.papers.some(visible)&&(!card||!S.tags.length);$('#emptyBox').hidden=!em;
  $('#emptyBox').innerHTML='<p class="eb-hint">'+(S.papers.length?'이 태그에 등록된 논문이 없어요.':'왼쪽 위 <b>+ 논문 추가</b>로 시작하세요.')+'</p>';
  if(em){$('#timelineMonth').hidden=true;$('#fcard').hidden=true;$('#fdot').hidden=true;$('#canvas').innerHTML='';$('#dotsvg').innerHTML='';D.els={};D.edges={};$('#bandsw').hidden=true}
  else if(card){renderCards();renderMinimap()}else if(list){renderPaperList()}else{renderDots()}
  save();
}
var TAGEDIT=false,TAGMANAGE=false;
document.addEventListener('click',function(e){var b=document.getElementById('ghB');if(!b)return;if(e.target.closest&&e.target.closest('#ghB')){b.setAttribute('aria-expanded',b.getAttribute('aria-expanded')==='true'?'false':'true')}else b.setAttribute('aria-expanded','false')});
document.addEventListener('click',function(e){
  if(e.target.closest&&e.target.closest('#tagEdit')){TAGMANAGE=!TAGMANAGE;renderTagbar();return}
  if(TAGMANAGE&&!e.target.closest('.sgt')&&!e.target.closest('.ov')){TAGMANAGE=false;renderTagbar()}
});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&TAGMANAGE&&!document.querySelector('.ov')){TAGMANAGE=false;renderTagbar();var b=$('#tagEdit');if(b)b.focus()}});
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('#tagAdd');if(!b)return;if(TAGEDIT){commitTag();return}TAGEDIT=true;renderTagbar()});
function commitTag(){var i=$('#tagNew');if(!TAGEDIT)return;var v=i?i.value.trim():'';TAGEDIT=false;if(v){addTag(v);S.bands=true;S.filterTag=null;S.view='card';S.reader=null}renderAll()}
function setTagFilter(id){
  S.filterTag=id===null||S.filterTag===id?null:id;S.reader=null;S.sel=null;S.panel='none';S.linking=null;S.bubble=null;S.scroll=null;S.listScroll=0;D.inited=false;
  renderAll();if(S.view==='card'){var target=curPaper()||S.papers.filter(visible).slice().sort(function(a,b){return dnum(b.date)-dnum(a.date)})[0];if(target)ensureVisible(target.id);updateMinimapWin()}
  var active=$('#chips button[aria-pressed="true"]');if(active)active.focus({preventScroll:true});
}
function renderTagbar(){
  var h='';
  function chip(id,name,n,color){return '<button type="button" class="tchip tag-filter" data-filter-tag="'+esc(id===null?'*':id)+'" aria-pressed="'+(S.filterTag==null?id===null:S.filterTag===id)+'" style="--c:'+color+'">'+(id===null?'':'<i></i>')+'<span>'+esc(name)+'</span><em>'+n+'</em></button>'}
  if(S.tags.length||S.papers.length)h+=chip(null,'전체',S.papers.length,'#7d8490');
  S.tags.forEach(function(t){var n=S.papers.filter(function(p){return p.tag===t.id}).length;h+='<div class="tag-row">'+chip(t.id,t.name,n,t.color)+(TAGMANAGE?'<button type="button" class="tag-delete" data-delete-tag="'+esc(t.id)+'" aria-label="'+esc(t.name)+' 태그 삭제" title="태그 삭제"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h14M7 5V3h6v2M5 5l1 12h8l1-12M8 8v6M12 8v6"/></svg></button>':'')+'</div>'});
  var u=S.papers.filter(function(p){return !p.tag}).length;
  if((u||S.filterTag==='')&&S.tags.length)h+=chip('','태그 없음',u,NOTAG.color);
  if(TAGEDIT)h+='<input class="tnew" id="tagNew" maxlength="20" placeholder="새 태그 이름" aria-label="새 태그 이름">';
  h+='<button type="button" class="tag-add-bottom" id="tagAdd" aria-label="태그 추가">+ 태그 추가</button>';
  $('#chips').innerHTML=h;
  var edit=$('#tagEdit');if(edit)edit.setAttribute('aria-pressed',TAGMANAGE);
  $$('#chips [data-filter-tag]').forEach(function(b){b.addEventListener('click',function(){setTagFilter(b.dataset.filterTag==='*'?null:b.dataset.filterTag)})});
  $$('#chips [data-delete-tag]').forEach(function(b){b.addEventListener('click',function(){deleteTag(b.dataset.deleteTag)})});
  var ti=$('#tagNew');if(ti){ti.focus();ti.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();commitTag()}else if(e.key==='Escape'){TAGEDIT=false;renderTagbar()}});ti.addEventListener('blur',function(){setTimeout(function(){if(TAGEDIT)commitTag()},120)})}
  var cnt={done:0,reading:0,skim:0,unknown:0};S.papers.forEach(function(p){cnt[readingStateKey(p.state)]++});
  var sl=$('#stl');if(sl)sl.innerHTML=['done','reading','skim'].concat(cnt.unknown?['unknown']:[]).map(function(k){return '<div class="stl st-'+k+'"><i></i>'+readingState(k).t+'<em>'+cnt[k]+'</em></div>'}).join('');
}


function iconFind(){return '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>'}

/* 처음 상태: 논문이 하나도 없는 빈 타임라인 */
function startEmpty(){clearStore();reset();S.name='내 타임라인';showMain()}

function deleteTag(id){
  var tag=S.tags.find(function(t){return t.id===id});if(!tag)return;
  var count=S.papers.filter(function(p){return p.tag===id}).length;
  var ov=document.createElement('div');ov.className='ov';
  ov.innerHTML='<div class="dlg tag-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="tagDeleteTitle"><button type="button" class="tag-dialog-close" aria-label="닫기">×</button><h3 id="tagDeleteTitle">태그 삭제</h3><p>'+esc(tag.name)+' 태그를 어떻게 삭제할까요?</p><fieldset class="tag-delete-options"><legend class="sr-only">삭제 범위</legend><label><input type="radio" name="tagDeleteScope" value="tag" checked><span><b>태그만 삭제</b><small>논문 '+count+'편은 ‘태그 없음’으로 이동해요.</small></span></label><label><input type="radio" name="tagDeleteScope" value="papers"><span><b>태그와 논문 모두 삭제</b><small>논문 '+count+'편과 메모·하이라이트도 함께 삭제해요.</small></span></label></fieldset><div class="dact"><button type="button" class="btn" id="tagDeleteCancel">취소</button><button type="button" class="btn pri" id="tagDeleteContinue">태그 삭제</button></div></div>';
  var previous=document.activeElement,ok=$('#tagDeleteContinue',ov);
  $('.tag-dialog-close',ov).setAttribute('aria-label','닫기');
  function close(){document.removeEventListener('keydown',key,true);ov.remove();if(previous&&document.contains(previous))previous.focus()}
  function key(e){
    if(e.key==='Escape'){e.stopPropagation();close()}
    if(e.key==='Tab'){
      var controls=Array.from(ov.querySelectorAll('button,input')).filter(function(n){return n.type!=='radio'||n.checked});
      var first=controls[0],last=controls[controls.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
    }
  }
  ov.addEventListener('change',function(){var all=ov.querySelector('input[value="papers"]').checked;ok.textContent=all?'논문 '+count+'편 삭제':'태그 삭제';ok.className='btn '+(all?'dng':'pri')});
  $('#tagDeleteCancel',ov).addEventListener('click',close);$('.tag-dialog-close',ov).addEventListener('click',close);
  ov.addEventListener('mousedown',function(e){if(e.target===ov)close()});
  ok.addEventListener('click',function(){
    var all=ov.querySelector('input[value="papers"]').checked;close();
    if(all&&count)ask('논문 '+count+'편을 모두 삭제할까요?','“'+tag.name+'” 태그와 논문 '+count+'편의 메모·하이라이트·기록 이력·첨부 PDF 및 관련 연결이 삭제됩니다. 되돌릴 수 없어요.','논문 '+count+'편 삭제',function(){applyTagDeletion(id,true)},true);
    else applyTagDeletion(id,all);
  });
  document.body.appendChild(ov);document.addEventListener('keydown',key,true);$('#tagDeleteCancel',ov).focus();
}
function applyTagDeletion(id,withPapers){
  if(!S.tags.some(function(t){return t.id===id}))return false;
  var removed=S.papers.filter(function(p){return p.tag===id}),ids=new Set(removed.map(function(p){return p.id}));
  var oldPapers=S.papers,oldTags=S.tags,oldLinks=S.links,oldFilter=S.filterTag;
  S.papers=withPapers?S.papers.filter(function(p){return !ids.has(p.id)}):S.papers.map(function(p){return p.tag===id?Object.assign({},p,{tag:''}):p});
  S.links=withPapers?S.links.filter(function(l){return !ids.has(l.from)&&!ids.has(l.to)}):S.links;
  S.tags=S.tags.filter(function(t){return t.id!==id});if(S.filterTag===id)S.filterTag=null;
  if(!S.example&&!save()){
    S.papers=oldPapers;S.tags=oldTags;S.links=oldLinks;S.filterTag=oldFilter;renderAll();
    toast('삭제 내용을 저장하지 못해 기존 기록을 유지했어요. 다시 시도해 주세요.');return false;
  }
  if(withPapers){
    if(ids.has(S.sel)){S.sel=null;S.panel='none'}
    if(ids.has(S.reader))S.reader=null;
    if(ids.has(S.bubble))S.bubble=null;
    if(S.linking&&(ids.has(S.linking.from)||ids.has(S.linking.to)))S.linking=null;
    if(typeof NA!=='undefined'&&ids.has(NA.pid)){NA.pid=null;NA.requestId=null;NA.st='idle'}
    removed.forEach(function(p){D.pos.delete(p.id);if(!S.example)idbDel(p.id)});
  }
  S.hidden.delete(id);D.inited=false;renderAll();return true;
}
