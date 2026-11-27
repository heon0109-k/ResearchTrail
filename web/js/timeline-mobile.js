'use strict';
/* 휴대폰(600px 이하): 가로 타임라인 대신 날짜순 세로 카드 목록으로 보여 준다. 데스크톱 화면은 그대로 둔다. */
var MTL_MQ=(typeof window!=='undefined'&&window.matchMedia)?window.matchMedia('(max-width:600px)'):null;
function mtlOn(){return !!(MTL_MQ&&MTL_MQ.matches)}
function mtlDate(d){var p=String(d||'').split('-');return p.length===3?(+p[1])+'월 '+(+p[2])+'일':''}
function mtlCard(p,cur){
  var st=readingState(p.state),tg=tagBy(p.tag||''),go=cur&&cur.id===p.id;
  var tagLabel='<span class="mobile-timeline-tag" style="--c:'+esc(tg.color)+'"><i></i>'+esc(tg.name)+'</span>';
  var nx=S.links.filter(function(l){return l.from===p.id}).map(function(l){return paperBy(l.to)}).filter(Boolean);
  return '<button type="button" class="mobile-timeline-card st-'+readingStateKey(p.state)+(go?' go':'')+(S.sel===p.id?' sel':'')+(matches(p)?'':' dim')+'" data-mtl-paper="'+esc(p.id)+'">'+
    '<span class="mobile-timeline-top">'+tagLabel+'<span class="mobile-timeline-date">'+mtlDate(p.date)+'</span><span class="mobile-timeline-state">'+esc(st.t)+'</span></span>'+
    (go?'<span class="mobile-timeline-resume">이어 읽을 논문</span>':'')+
    '<span class="mobile-timeline-title">'+esc(p.title||'제목 미기록')+'</span>'+
    (p.memo?'<span class="mobile-timeline-memo">'+esc(p.memo)+'</span>':'')+
    (p.todo?'<span class="mobile-timeline-next"><b>다음</b>'+esc(p.todo)+'</span>':'')+
    (nx.length?'<span class="mobile-timeline-link">→ 이어서 읽은 논문: '+nx.map(function(n){return esc(n.title)}).join(', ')+'</span>':'')+
  '</button>';
}
function renderMobileTimeline(){
  var sc=$('#scroller');if(!sc||!sc.parentNode)return;
  var box=$('#mtl');
  if(!box){box=document.createElement('section');box.id='mtl';box.className='mobile-timeline';box.setAttribute('aria-label','타임라인 목록');sc.parentNode.insertBefore(box,sc.nextSibling);
    box.addEventListener('click',function(e){var c=e.target.closest&&e.target.closest('[data-mtl-paper]');if(c)onPick(c.dataset.mtlPaper)})}
  var show=mtlOn()&&S.view==='card'&&!S.reader&&S.papers.length>0;
  box.hidden=!show;if(!show){box.innerHTML='';return}
  var cur=curPaper(),items=S.papers.filter(visible).slice().sort(function(a,b){return dnum(b.date)-dnum(a.date)});
  var h='',month='';
  items.forEach(function(p){var m=String(p.date||'').slice(0,7).replace('-','.');if(m!==month){month=m;h+='<h3 class="mobile-timeline-month">'+esc(m)+'</h3>'}h+=mtlCard(p,cur)});
  box.innerHTML=h||'<p class="mobile-timeline-empty">이 태그에 등록된 논문이 없어요.</p>';
}
function syncMobileNav(){var app=$('.app');if(app){app.dataset.view=S.reader?'reader':S.view;if(S.example)app.dataset.ex='1';else delete app.dataset.ex}var nav=$('#mNav');if(!nav)return;Array.prototype.forEach.call(nav.querySelectorAll('[data-for]'),function(b){var o=$('#'+b.dataset.for);b.setAttribute('aria-current',o&&o.getAttribute('aria-pressed')==='true'?'page':'false')})}
(function(){
  if(typeof renderCards==='function'){var rc=renderCards;renderCards=function(){var r=rc.apply(this,arguments);try{renderMobileTimeline()}catch(e){}return r}}
  if(typeof renderAll==='function'){var ra=renderAll;renderAll=function(){var r=ra.apply(this,arguments);try{renderMobileTimeline();syncMobileNav()}catch(e){}return r}}
  if(MTL_MQ){var on=function(){if(typeof renderAll==='function'&&$('#scroller'))renderAll()};if(MTL_MQ.addEventListener)MTL_MQ.addEventListener('change',on);else if(MTL_MQ.addListener)MTL_MQ.addListener(on)}
})();
