'use strict';
/* ---------- main frame ---------- */
function showMain(){
  TAGMANAGE=false;
  app.innerHTML = screens.main;
  $('#overviewFit').addEventListener('click',function(){adjustOverviewZoom(0)});
  wireMe();
  (function(){var side=$('.side'),mb=$('#mMenu');if(!side||!mb)return;
    var ICON_OPEN=mb.innerHTML,ICON_X='<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>';
    function setOpen(on){var ob=$('#ownBtn'),mo=$('#mOwn');if(on&&ob&&mo){mo.hidden=ob.hidden;mo.querySelector('span').textContent=ob.textContent}side.classList.toggle('m-open',on);mb.setAttribute('aria-expanded',on);mb.setAttribute('aria-label',on?'메뉴 닫기':'메뉴 열기');mb.innerHTML=on?ICON_X:ICON_OPEN}
    mb.addEventListener('click',function(){setOpen(!side.classList.contains('m-open'))});
    side.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('.nv,#addBtn,[data-filter-tag]'))setOpen(false)});
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&side.classList.contains('m-open'))setOpen(false)});
    /* 휴대폰: 엄지가 닿는 아래쪽 탭바. 기존 버튼을 그대로 눌러 주기만 한다. */
    var nav=document.createElement('nav');nav.className='mnav';nav.id='mNav';nav.setAttribute('aria-label','화면 이동');
    nav.innerHTML=[['vCard',$('#vCard svg').outerHTML,'타임라인'],['vList',$('#vList svg').outerHTML,'목록'],['vDot',$('#vDot svg').outerHTML,'그래프'],['vFind',$('#vFind svg').outerHTML,'찾기']].map(function(t){return '<button type="button" data-for="'+t[0]+'">'+t[1]+'<span>'+t[2]+'</span></button>'}).join('')+
      '<button type="button" data-menu="1" aria-label="태그와 프로필 메뉴"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3.5 6h13M3.5 10h13M3.5 14h13"/></svg><span>메뉴</span></button>';
    $('.app').appendChild(nav);
    var home=document.createElement('button');home.type='button';home.className='mhome';
    home.innerHTML='<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9.5 10 4l7 5.5M5 8v8h10V8"/></svg><span>처음 화면으로</span><small>ResearchTrail 소개</small>';
    var own=document.createElement('button');own.type='button';own.className='mown';own.id='mOwn';own.hidden=true;
    own.innerHTML='<span></span><b aria-hidden="true">→</b>';
    side.insertBefore(own,mb.nextSibling);own.addEventListener('click',function(){setOpen(false);var o=$('#ownBtn');if(o)o.click()});
    side.appendChild(home);home.addEventListener('click',function(){setOpen(false);var h=$('#homeBtn');if(h)h.click()});
    document.addEventListener('click',function(e){if(side.classList.contains('m-open')&&!e.target.closest('.side')&&!e.target.closest('#mNav')){e.preventDefault();e.stopPropagation();setOpen(false)}},true);
    nav.addEventListener('click',function(e){var x=e.target.closest('button');if(!x)return;if(x.dataset.menu){setOpen(true);return}var t=$('#'+x.dataset.for);if(t)t.click()});})();
  $('#tName').textContent=S.name;$('#exTag').hidden=!S.example;$('#ownBtn').hidden=!S.example;$('#ownBtn').textContent=RET?'내 타임라인으로 돌아가기':'내 타임라인 시작';
  $('#vCard').addEventListener('click',function(){setView('card')});
  $('#vList').addEventListener('click',function(){setView('list')});
  $('#vDot').addEventListener('click',function(){setView('dot')});
  $('#vFind').addEventListener('click',openFind);
  $('#tourBtn').addEventListener('click',function(){tourStart()});
  /* 제목을 누르면 프로젝트 메뉴(고르기·새로 만들기·이름 바꾸기·삭제). 예시를 볼 때는 열리지 않는다. */
  var tn=$('#tName'),tch=$('#tChev');
  if(typeof projMenuToggle==='function'){tn.setAttribute('role','button');tn.tabIndex=0;tn.title='프로젝트 바꾸기';tn.setAttribute('aria-haspopup','dialog');tn.setAttribute('aria-expanded','false');
    tn.addEventListener('click',projMenuToggle);if(tch)tch.addEventListener('click',projMenuToggle);
    tn.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();projMenuToggle()}})}
  else if(tch)tch.hidden=true;
  $('#ownBtn').addEventListener('click',function(){if(TOUR)tourEnd(true);if(RET){RET=false;S.example=false;if(load()){showMain();renderAll();return}}startEmpty();firstRunTour()});
  $('#bBand').addEventListener('click',function(){S.bands=!S.bands;renderAll()});
  $('#bWhy').addEventListener('click',function(){S.why=!S.why;renderAll()});
  $('#addBtn').addEventListener('click',function(){openAdd(null)});
  $('#homeBtn').addEventListener('click',function(){showLanding()});
  $('#mm').addEventListener('keydown',function(e){var step=e.key==='ArrowLeft'?-7:e.key==='ArrowRight'?7:0;if(!step)return;e.preventDefault();var sc=$('#scroller');scrollToDay(S.zoom==='all'?(L.a+L.b)/2+(S.overviewPan||0)*(L.b-L.a)+step:L.a+(sc.scrollLeft+(sc.clientWidth-LABELW)/2)/L.px+step)});
  $('#zoomSeg').addEventListener('click',function(e){var b=e.target.closest('button');if(b)setZoom(b.dataset.z)});
  $('#relayout').addEventListener('click',function(){D.pos.forEach(function(o){o.x=(Math.random()-.5)*400;o.y=(Math.random()-.5)*400;o.vx=o.vy=0});D.fit=true;D.alpha=1;kick()});
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

/* 캐릭터 고르기 기능은 없앴다. 타임라인의 안내 캐릭터는 기본 캐릭터로 보인다. */
function renderMe(){}
function wireMe(){}
function renderAll({keepTagInputs=false}={}){
  if(S.panel!=='detail'||S.view!=='card'||(S.detailScroll&&S.detailScroll.z!==S.zoom))S.detailScroll=null;
  var ex=$('#exTag');if(ex)ex.hidden=!S.example;var ob=$('#ownBtn');if(ob){ob.hidden=!S.example;ob.textContent=RET?'내 타임라인으로 돌아가기':'내 타임라인 시작'}
  renderMe();
  if(!keepTagInputs)renderTagbar();
  renderPanel();
  var rd=!!(S.reader&&paperBy(S.reader));if(!rd)S.reader=null;
  $('.work').hidden=rd;$('#reader').hidden=!rd;
  $('.app').classList.toggle('reading',rd);
  if(rd){$('#overviewControls').hidden=true;$('#bandsw').hidden=true;renderReader();$('#fcard').hidden=true;$('#fdot').hidden=true;$('#vCard').setAttribute('aria-pressed',false);$('#vList').setAttribute('aria-pressed',false);$('#vDot').setAttribute('aria-pressed',false);save();return}
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
  $('#emptyBox').innerHTML='<p class="eb-hint">'+(S.papers.length?'이 태그에 등록된 논문이 없어요.':'<span class="hint-dir">왼쪽 위 </span><b>+ 논문 추가</b>로 시작하세요.')+'</p>';
  if(em){$('#timelineMonth').hidden=true;$('#fcard').hidden=true;$('#fdot').hidden=true;$('#canvas').innerHTML='';$('#dotsvg').innerHTML='';D.els={};D.edges={};$('#bandsw').hidden=true}
  else if(card){renderCards();renderMinimap()}else if(list){renderPaperList()}else{renderDots()}
  save();
}
var TAGEDIT=false,TAGMANAGE=false,NEWCOLOR=null,COLOREDIT=null;
/* 태그 색: 사용자가 고른 색은 태그 점에만 쓰인다(카드·그래프 색은 읽기 상태). */
function colorSwatches(cur,attr){return '<div class="tag-color-palette" role="group" aria-label="태그 색">'+PAL.map(function(c){return '<button type="button" '+attr+'="'+c+'" style="--c:'+c+'" aria-label="색 '+c+'" aria-pressed="'+(c===cur)+'"></button>'}).join('')+'</div>'}
document.addEventListener('click',function(e){var b=document.getElementById('ghB');if(!b)return;if(e.target.closest&&e.target.closest('#ghB')){b.setAttribute('aria-expanded',b.getAttribute('aria-expanded')==='true'?'false':'true')}else b.setAttribute('aria-expanded','false')});
document.addEventListener('click',function(e){
  if(e.target.closest&&e.target.closest('#tagEdit')){
    TAGMANAGE=!TAGMANAGE;
    COLOREDIT=null;
    if(TAGEDIT)commitTag();else renderTagbar();
    return;
  }
  if(TAGMANAGE&&e.target.isConnected&&!e.target.closest('.tag-menu')&&!e.target.closest('.ov')){TAGMANAGE=false;COLOREDIT=null;renderTagbar()}
});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&TAGMANAGE&&!document.querySelector('.ov')){TAGMANAGE=false;renderTagbar();var b=$('#tagEdit');if(b)b.focus()}});
document.addEventListener('click',function(e){
  if(!e.target.closest||!e.target.closest('#tagAdd'))return;
  if(TAGEDIT){commitTag();return}
  TAGMANAGE=false;
  COLOREDIT=null;
  TAGEDIT=true;
  renderTagbar();
});
function commitTag(){var i=$('#tagNew');if(!TAGEDIT)return;var v=i?i.value.trim():'';TAGEDIT=false;if(v){var before=S.tags.length,nt=addTag(v);if(S.tags.length>before&&NEWCOLOR)nt.color=NEWCOLOR;NEWCOLOR=null;S.bands=true;S.filterTag=null;S.view='card';S.reader=null}renderAll()}
function setTagFilter(id){
  S.filterTag=id===null||S.filterTag===id?null:id;S.reader=null;S.sel=null;S.panel='none';S.linking=null;S.bubble=null;S.scroll=null;S.listScroll=0;D.inited=false;
  renderAll();if(S.view==='card'){var target=curPaper()||S.papers.filter(visible).slice().sort(function(a,b){return dnum(b.date)-dnum(a.date)})[0];if(target)ensureVisible(target.id);updateMinimapWin()}
  var active=$('#chips button[aria-pressed="true"]');if(active)active.focus({preventScroll:true});
}
function renderTagbar(){
  var h='';
  function chip(id,name,n,color){return '<button type="button" class="tag-filter" data-filter-tag="'+esc(id===null?'*':id)+'" aria-pressed="'+(S.filterTag==null?id===null:S.filterTag===id)+'" style="--c:'+color+'">'+(id===null?'':'<i></i>')+'<span>'+esc(name)+'</span><em>'+n+'</em></button>'}
  if(S.tags.length||S.papers.length)h+=chip(null,'전체',S.papers.length,'#7d8490');
  S.tags.forEach(function(t){
    var n=S.papers.filter(function(p){return p.tag===t.id}).length;
    h+='<div class="tag-row">';
    if(TAGMANAGE){
      h+='<div class="tag-filter tag-rename'+(S.filterTag===t.id?' is-selected':'')+'" style="--c:'+t.color+'">';
      h+='<button type="button" class="tag-color-button" data-color-tag="'+esc(t.id)+'" aria-label="'+esc(t.name)+' 태그 색 바꾸기" aria-expanded="'+(COLOREDIT===t.id)+'"><i></i></button>';
      h+='<input type="text" data-rename-tag="'+esc(t.id)+'" value="'+esc(t.name)+'" maxlength="20" aria-label="'+esc(t.name)+' 태그 이름" autocomplete="off">';
      h+='<button type="button" class="tag-delete" data-delete-tag="'+esc(t.id)+'" aria-label="'+esc(t.name)+' 태그 삭제" title="태그 삭제"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h14M7 5V3h6v2M5 5l1 12h8l1-12M8 8v6M12 8v6"/></svg></button>';
      h+='<em>'+n+'</em></div>';
    }else{
      h+=chip(t.id,t.name,n,t.color);
    }
    h+='</div>';
  });
  var u=S.papers.filter(function(p){return !p.tag}).length;
  if((u||S.filterTag==='')&&S.tags.length)h+=chip('','태그 없음',u,NOTAG.color);
  if(TAGEDIT){if(!NEWCOLOR)NEWCOLOR=PAL[S.tags.length%PAL.length];h+='<div class="tag-add-form"><input class="tag-name-input" id="tagNew" maxlength="20" placeholder="새 태그 이름" aria-label="새 태그 이름">'+colorSwatches(NEWCOLOR,'data-new-color')+'</div>'}
  h+='<button type="button" class="tag-add-bottom" id="tagAdd" aria-label="태그 추가">+ 태그 추가</button>';
  $('#chips').innerHTML=h;
  function showPalette(button){
    var old=$('#chips .tag-palette');
    if(old)old.remove();
    $$('#chips [data-color-tag]').forEach(function(dot){dot.setAttribute('aria-expanded',String(dot===button))});
    COLOREDIT=button?button.dataset.colorTag:null;
    if(!button)return;
    var tag=tagBy(COLOREDIT),row=button.closest('.tag-row');
    row.insertAdjacentHTML('afterend',colorSwatches(tag.color,'data-set-color'));
    var palette=row.nextElementSibling;
    palette.classList.add('tag-palette');
    palette.addEventListener('click',function(e){
      var swatch=e.target.closest('[data-set-color]');
      if(!swatch)return;
      tag.color=swatch.dataset.setColor;
      COLOREDIT=null;
      renderAll();
    });
  }
  $$('#chips [data-color-tag]').forEach(function(dot){
    if(dot.dataset.colorTag===COLOREDIT)showPalette(dot);
    dot.addEventListener('click',function(){showPalette(COLOREDIT===dot.dataset.colorTag?null:dot)});
  });
  $$('#chips [data-new-color]').forEach(function(b){b.addEventListener('mousedown',function(e){e.preventDefault()});b.addEventListener('click',function(){NEWCOLOR=b.dataset.newColor;$$('#chips [data-new-color]').forEach(function(x){x.setAttribute('aria-pressed',x===b)});var ti=$('#tagNew');if(ti)ti.focus()})});
  var edit=$('#tagEdit');if(edit)edit.setAttribute('aria-pressed',TAGMANAGE);
  $$('#chips [data-filter-tag]').forEach(function(b){b.addEventListener('click',function(){setTagFilter(b.dataset.filterTag==='*'?null:b.dataset.filterTag)})});
  $$('#chips [data-delete-tag]').forEach(function(b){b.addEventListener('click',function(){deleteTag(b.dataset.deleteTag)})});
  $$('#chips [data-rename-tag]').forEach(function(inp){
    inp.addEventListener('focus',function(){
      if(COLOREDIT!==inp.dataset.renameTag)showPalette(inp.closest('.tag-row').querySelector('[data-color-tag]'));
    });
    inp.addEventListener('keydown',function(e){if(e.isComposing||e.keyCode===229)return;if(e.key==='Enter'){e.preventDefault();inp.blur()}else if(e.key==='Escape'){e.stopPropagation();inp.value=tagBy(inp.dataset.renameTag).name;inp.blur()}});
    inp.addEventListener('change',function(){renameTag(inp)});
  });
  var ti=$('#tagNew');if(ti){ti.focus();ti.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();commitTag()}else if(e.key==='Escape'){TAGEDIT=false;renderTagbar()}});ti.addEventListener('blur',function(){setTimeout(function(){if(TAGEDIT)commitTag()},120)})}
  var cnt={done:0,reading:0,skim:0,unknown:0};S.papers.forEach(function(p){cnt[readingStateKey(p.state)]++});
  var sl=$('#stl');if(sl)sl.innerHTML=['done','reading','skim'].concat(cnt.unknown?['unknown']:[]).map(function(k){return '<div class="stl st-'+k+'"><i></i>'+readingState(k).t+'<em>'+cnt[k]+'</em></div>'}).join('');
}



/* 처음 상태: 논문이 하나도 없는 빈 타임라인 */
function startEmpty(){clearStore();reset();S.name='내 타임라인';showMain()}

/* 태그 이름 바꾸기: 빈 이름이나 다른 태그와 겹치는 이름은 받지 않고 원래 이름으로 되돌린다. */
function renameTag(input){
  var id=input.dataset.renameTag,t=S.tags.find(function(tag){return tag.id===id});
  if(!t)return;
  var name=input.value.trim().slice(0,20);
  var duplicate=S.tags.some(function(tag){return tag.id!==id&&tag.name.toLowerCase()===name.toLowerCase()});
  if(!name||duplicate||name===t.name){
    input.value=t.name;
    if(duplicate)toast('같은 이름의 태그가 이미 있어요.');
    return;
  }
  t.name=name;
  input.value=name;
  input.setAttribute('aria-label',name+' 태그 이름');
  var row=input.closest('.tag-row');
  row.querySelector('[data-color-tag]').setAttribute('aria-label',name+' 태그 색 바꾸기');
  row.querySelector('[data-delete-tag]').setAttribute('aria-label',name+' 태그 삭제');
  // 포커스가 다음 입력칸이나 버튼으로 이동하는 동안 편집 중인 행을 유지한다.
  renderAll({keepTagInputs:true});
}
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
