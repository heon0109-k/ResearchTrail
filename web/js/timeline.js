'use strict';
/* ---------- card view ---------- */
function rng(){
  var ds=S.papers.map(function(p){return dnum(p.date)});
  var a=Math.min.apply(null,ds)-14,b=Math.max.apply(null,ds)+14;
  if(b-a<60){var m=(a+b)/2;a=m-30;b=m+30}
  return [Math.floor(a),Math.ceil(b)];
}
function ppd(){
  var r=rng();
  if(S.zoom==='week')return 120;if(S.zoom==='month')return 34;if(S.zoom==='quarter')return 11;
  var sc=$('#scroller');var w=(sc&&sc.clientWidth)||900;
  return Math.max(2,(w-LABELW-24)/(r[1]-r[0]));
}
function setZoom(z){
  var sc=$('#scroller');var old=L.px,a=L.a;
  var center=a+(sc.scrollLeft+(sc.clientWidth-LABELW)/2)/old;
  S.zoom=z;renderAll();
  sc.scrollLeft=Math.max(0,(center-L.a)*L.px-(sc.clientWidth-LABELW)/2);updateMinimapWin();
}
function focusStart(){
  if(S.view!=='card')return;
  var sc=$('#scroller');if(!sc)return;
  var sv=S.scroll;
  if(sv&&sv.z===S.zoom){
    sc.scrollLeft=sv.l;sc.scrollTop=sv.t;
    var current=curPaper();if(current)ensureVisible(current.id);
    updateMinimapWin();return;
  }
  if(sc.scrollWidth<=sc.clientWidth+4&&sc.scrollHeight<=sc.clientHeight+4)return;
  var p=curPaper();if(!p)return;var q=L.pos[p.id];if(!q)return;
  sc.scrollLeft=Math.max(0,q.x-LABELW-(sc.clientWidth-LABELW-q.w)/2);
  sc.scrollTop=Math.max(0,q.y-AXISH-(sc.clientHeight-AXISH-q.h)/2);
  updateMinimapWin();
  var el=$('.card[data-id="'+p.id+'"]');if(el){el.classList.add('pulse');setTimeout(function(){el.classList.remove('pulse')},2200)}
}
function scrollToDay(day){
  var sc=$('#scroller');if(S.view!=='card')return;
  sc.scrollLeft=Math.max(0,(day-L.a)*L.px-(sc.clientWidth-LABELW)/2);updateMinimapWin();
}
function rpath(pts,r){
  var q=[pts[0]];
  for(var i=1;i<pts.length;i++){var l=q[q.length-1];if(Math.abs(l[0]-pts[i][0])>.5||Math.abs(l[1]-pts[i][1])>.5)q.push(pts[i])}
  var d='M'+q[0][0]+','+q[0][1];
  for(var j=1;j<q.length-1;j++){
    var p0=q[j-1],p1=q[j],p2=q[j+1];
    var l1=Math.hypot(p1[0]-p0[0],p1[1]-p0[1]),l2=Math.hypot(p2[0]-p1[0],p2[1]-p1[1]);
    var rr=Math.min(r,l1/2,l2/2);
    d+='L'+(p1[0]-(p1[0]-p0[0])/l1*rr)+','+(p1[1]-(p1[1]-p0[1])/l1*rr)+'Q'+p1[0]+','+p1[1]+' '+(p1[0]+(p2[0]-p1[0])/l2*rr)+','+(p1[1]+(p2[1]-p1[1])/l2*rr);
  }
  var e=q[q.length-1];return d+'L'+e[0]+','+e[1];
}
function route(A,B){
  var x1,y1,x2,y2,mx,my;
  if(B.x>=A.x+A.w+28||B.x+B.w+28<=A.x){
    var right=B.x>=A.x+A.w+28;
    x1=right?A.x+A.w:A.x;y1=A.y+A.h/2;x2=right?B.x:B.x+B.w;y2=B.y+B.h/2;mx=(x1+x2)/2;my=(y1+y2)/2;
    return {d:rpath([[x1,y1],[mx,y1],[mx,y2],[x2,y2]],12),mx:mx,my:my};
  }
  x1=A.x+A.w/2;x2=B.x+B.w/2;
  if(B.y>A.y){y1=A.y+A.h;y2=B.y}else{y1=A.y;y2=B.y+B.h}
  my=(y1+y2)/2;mx=(x1+x2)/2;
  return {d:rpath([[x1,y1],[x1,my],[x2,my],[x2,y2]],12),mx:mx,my:my};
}
function renderCards(){
  var r=rng(),a=r[0],b=r[1],px=ppd();L.a=a;L.b=b;L.px=px;
  var compact=px<20,cw=compact?CMW:CW,ch=compact?CMH:CH;
  var W=LABELW+(b-a)*px+40;
  var bands=bandList(S.bands);
  var y=AXISH;L.pos={};L.bandInfo=[];
  var bandsHtml='',cardsHtml='';
  bands.forEach(function(bd,bi){
    var items=S.papers.filter(function(p){return visible(p)&&(bd.id==='*'||p.tag===bd.id)}).sort(function(m,n){return dnum(m.date)-dnum(n.date)});
    var ends=[];
    items.forEach(function(p){
      var x=LABELW+(dnum(p.date)-a)*px;var r2=-1;
      for(var i=0;i<ends.length;i++){if(x>=ends[i]+8){r2=i;break}}
      if(r2<0){r2=ends.length;ends.push(0)}
      ends[r2]=x+cw;p._row=r2;p._x=x;
    });
    var rows=Math.max(1,ends.length);var h=Math.max(120,30+rows*(ch+GAP)+8);
    var step=ch+GAP,off=28;
    if(bands.length===1){
      var avail=($('#scroller')?$('#scroller').clientHeight:0)-AXISH-8;
      if(avail>h){
        h=avail;var pad=36;
        if(rows<=1){off=(h-ch)/2}
        else{step=Math.min(ch+GAP+70,(h-pad*2-ch)/(rows-1));off=(h-(step*(rows-1)+ch))/2}
      }
    }
    items.forEach(function(p){L.pos[p.id]={x:p._x,y:y+off+p._row*step,w:cw,h:ch}});
    L.bandInfo.push({band:bd,y:y,h:h});
    bandsHtml+='<div class="band'+(bi%2?' alt':'')+'" style="top:'+y+'px;height:'+h+'px;width:'+W+'px;--bc:'+bd.color+'"><div class="blabel" style="--c:'+bd.color+'"><i></i><span>'+esc(bd.name)+'</span></div></div>';
    y+=h;
  });
  var H=y+8;
  // axis
  var ax='<div class="acorner"></div>';
  var dow0=new Date(a*864e5).getUTCDay();var toMon=(8-dow0)%7;
  for(var d=a;d<=b;d++){
    var dt=new Date(d*864e5);var x=LABELW+(d-a)*px;
    if(dt.getUTCDate()===1||(d===a&&dt.getUTCDate()<=25))ax+='<div class="mo" style="left:'+x+'px">'+dt.getUTCFullYear()+'.'+String(dt.getUTCMonth()+1).padStart(2,'0')+'</div>';
    var wd=dt.getUTCDay();
    if(px>=60)ax+='<div class="tk'+((wd===0||wd===6)?' we':'')+'" style="left:'+x+'px;width:'+px+'px">'+dt.getUTCDate()+(px>=60?'<small>'+WD[wd]+'</small>':'')+'</div>';
    else if(px>=9&&wd===1)ax+='<div class="tk" style="left:'+x+'px">'+(dt.getUTCMonth()+1)+'/'+dt.getUTCDate()+'</div>';
  }
  var td=dnum(todayStr()),todayHtml='';
  if(td>=a&&td<=b){var tx=LABELW+(td-a)*px;todayHtml='<div class="todayline" style="left:'+tx+'px"></div>';ax+='<div class="tdlab" style="left:'+tx+'px">오늘</div>'}
  // links
  var lks='',lbls='';
  var defs='<defs><marker id="arrG" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0L8,4L0,8Z" fill="#b7bec9"/></marker><marker id="arrI" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0L8,4L0,8Z" fill="#12161c"/></marker></defs>';
  S.links.forEach(function(l){
    var A=L.pos[l.from],B=L.pos[l.to];if(!A||!B)return;
    var rt=route(A,B);var on=(S.sel===l.from||S.sel===l.to)||(S.linking&&(S.linking.from===l.from||S.linking.from===l.to)&&false);
    var txt=l.reason||'연결';
    lks+='<g class="lk'+(on?' on':'')+'" data-id="'+l.id+'" data-mx="'+rt.mx+'" data-my="'+rt.my+'" data-t="'+esc(txt)+'"><path class="h" d="'+rt.d+'"/><path class="v" d="'+rt.d+'"/><rect class="mid" x="'+(rt.mx-3)+'" y="'+(rt.my-3)+'" width="6" height="6"/></g>';
  });
  // cards
  var rp=S.papers.filter(function(p){return p.state==='reading'}).sort(function(a,b){return dnum(b.date)-dnum(a.date)})[0];
  var lp=S.papers.slice().sort(function(a,b){return dnum(b.date)-dnum(a.date)})[0];
  if(lp&&rp&&lp.id===rp.id)lp=null;
  S.papers.forEach(function(p){
    var ps=L.pos[p.id];if(!ps)return;var t=tagBy(p.tag);
    var cls='card st-'+readingStateKey(p.state)+(compact?' cmp':'')+(S.sel===p.id?' sel':'')+(S.linking&&S.linking.from===p.id?' src':'')+(S.linking&&S.linking.to===p.id?' tgt':'')+(matches(p)?'':' dim')+(rp&&rp.id===p.id?' go':'')+(lp&&lp.id===p.id?' last':'');
    var mark=(rp&&rp.id===p.id)?'이어 읽을 논문':((lp&&lp.id===p.id)?'마지막으로 읽던 논문':'');
    var st=readingState(p.state);
    var inc=S.links.filter(function(l){return l.to===p.id});
    var why=(S.why&&inc.length)?'<div class="cwhy">↩ '+esc(inc[0].reason||'미기록/확인 필요')+(inc.length>1?' 외 '+(inc.length-1):'')+'</div>':'';
    cardsHtml+='<div class="'+cls+'" data-id="'+p.id+'" tabindex="0" role="button" aria-label="'+esc(p.title+' · '+st.t+' · '+p.date+(mark?' · '+mark:''))+'" style="left:'+ps.x+'px;top:'+ps.y+'px;width:'+ps.w+'px;height:'+ps.h+'px;--tc:'+t.color+'">'+
      (mark?'<div class="cmk">'+mark+'</div>':'')+'<div class="ct1"><span class="tx">'+esc(p.title)+'</span></div><div class="cmemo">'+esc(p.memo)+'</div>'+
      '<div class="cfoot"><span class="ctitle">'+sg(p.state)+' '+esc(p.title)+'</span><span class="cdt">'+p.date.slice(5)+'</span></div></div>';
  });
  var who=rp||lp||S.papers.slice().sort(function(a,b){return dnum(b.date)-dnum(a.date)})[0];
  if(who&&L.pos[who.id]){var wp=L.pos[who.id];cardsHtml+='<div class="who" style="left:'+(wp.x+wp.w-34)+'px;top:'+(wp.y-(curChar().rows.length*2-1))+'px">'+spr(curChar().rows,2,'bob')+'</div>'}
  if(S.bubble){
    var bp=paperBy(S.bubble),bs=bp&&L.pos[bp.id];
    if(bs){
      var context=paperResumeContext(bp),whyTxt=context.reasonText,whyLab=context.reasonLabel;
      var legacyJudge=bp.id===curPaper().id?S.judge:'';
      var todoTxt=bp.todo||'';
      var legacyNext=bp.id===curPaper().id&&S.next&&S.next!==bp.todo?S.next:'';
      var BW=310,BH=172+(legacyJudge?52+Math.ceil(legacyJudge.length/22)*19:0)+(legacyNext?52+Math.ceil(legacyNext.length/22)*19:0)+(todoTxt?52+Math.ceil(todoTxt.length/22)*19:0)+(whyTxt?34+Math.ceil(whyTxt.length/24)*19:0),bx=Math.max(LABELW+4,Math.min(W-BW-12,bs.x-20)),below=true,by=bs.y+bs.h+16;
      if(by+BH>H&&bs.y-BH-16>AXISH){below=false;by=bs.y-BH-16-((curChar().rows.length*2)-1)}
      var tail=Math.max(24,Math.min(BW-40,bs.x+bs.w/2-bx-7));
      var gap=S.bubbleGap,msg=gap>=864e5?(Math.floor(gap/864e5)+'일 만이에요'):(gap>=36e5?(Math.floor(gap/36e5)+'시간 만이에요'):'');
      var head='다시 오셨네요'+(msg?' · '+msg:'');
      var big=context.pageText;
      var sub=(bp.page&&bp.total?bp.total+'쪽 중 '+bp.page+'쪽 · ':'')+readingState(bp.state).t;
      cardsHtml+='<div class="rbub'+(below?'':' up')+'" id="rbub" role="dialog" aria-label="이어 읽기 안내" style="left:'+bx+'px;top:'+by+'px;width:'+BW+'px;--tl:'+tail+'px">'+
        '<div class="h"><span>'+head+'</span><button type="button" class="x" id="rbX" aria-label="닫기">×</button></div>'+
        '<div class="m">'+esc(big)+'</div><div class="pg">'+esc(sub)+'</div>'+
        (bp.page&&bp.total?'<div class="bar"><i style="width:'+Math.max(3,Math.min(100,Math.round(bp.page/bp.total*100)))+'%"></i></div>':'')+(whyTxt?'<div class="q"><div class="k">'+whyLab+'</div><div class="t">'+esc(whyTxt)+'</div></div>':'')+(todoTxt?'<div class="nx td"><div class="k">다음 할 일</div><div class="t">'+esc(todoTxt)+'</div></div>':'')+(legacyJudge?'<div class="q"><div class="k">전체 타임라인 메모 · 논문 연결 미확인</div><div class="t">'+esc(legacyJudge)+'</div></div>':'')+(legacyNext?'<div class="nx td"><div class="k">이전 전체 메모 · 논문 연결 미확인</div><div class="t">'+esc(legacyNext)+'</div></div>':'')+
        '<button type="button" class="go" id="rbGo">이어 읽기</button></div>';
    }
  }
  var canvas=$('#canvas');
  canvas.style.width=W+'px';canvas.style.height=Math.max(H,$('#scroller').clientHeight-0)+'px';
  canvas.innerHTML='<div class="axis" style="width:'+W+'px">'+ax+'</div>'+bandsHtml+
    '<div class="grid" style="width:'+W+'px;background-size:'+(7*px)+'px 100%;background-position:'+(LABELW+toMon*px)+'px 0"></div>'+todayHtml+
    '<svg id="links" class="'+(S.sel?'has-sel':'')+'" width="'+W+'" height="'+H+'">'+defs+lks+'</svg>'+cardsHtml+
    '<svg id="lbls" width="'+W+'" height="'+H+'">'+lbls+'<g id="hov"></g></svg>';
  var wh=$('.who',canvas);if(wh){var showB=function(){if(S.bubble)return;var cp=curPaper();if(!cp)return;S.bubble=cp.id;S.bubbleGap=S.prevSeen?Date.now()-S.prevSeen:0;renderAll()};wh.addEventListener('mouseenter',showB);wh.addEventListener('click',showB);}
  var bg=$('#rbGo');if(bg){bg.addEventListener('click',function(){var id=S.bubble;dismissBubble(true);openReader(id)});$('#rbX').addEventListener('click',function(){dismissBubble(true);renderAll()})}
}
/* 말풍선 밖을 누르면 닫는다. 단, 버튼·입력칸을 누른 경우에는 누르는 도중에 화면을 다시 그리면 그 클릭이 사라지므로
   버튼이 먼저 동작하게 두고, 클릭이 끝난 뒤에 닫는다 */
var BUB_PEND=false;
document.addEventListener('mousedown',function(e){if(!(S&&S.bubble&&document.querySelector('.app')&&!e.target.closest('#rbub')&&!e.target.closest('#tour')))return;
  if(e.target.closest('button,a,input,select,textarea,label,summary')){BUB_PEND=true;return}
  dismissBubble(true);renderAll()},true);
document.addEventListener('click',function(){if(!BUB_PEND)return;BUB_PEND=false;if(S&&S.bubble&&document.querySelector('.app')){dismissBubble(true);renderAll()}});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&S&&S.bubble&&document.querySelector('.app')&&!$('#tour')){dismissBubble(true);renderAll()}});
function dismissBubble(mark){if(mark)S.bubbleDay=todayStr();S.bubble=null}
function maybeBubble(){
  var p=curPaper();if(!p)return;
  var gap=S.prevSeen?Date.now()-S.prevSeen:0;

  S.bubble=p.id;S.bubbleGap=gap;
}
function bandList(by){
  var b=[];
  if(by){
    S.tags.forEach(function(t){if(S.papers.some(function(p){return p.tag===t.id}))b.push({id:t.id,name:t.name,color:t.color})});
    if(S.papers.some(function(p){return !p.tag}))b.push({id:'',name:NOTAG.name,color:NOTAG.color});
    if(b.length===1&&b[0].id==='')b=[];
  }
  if(!b.length)b=[{id:'*',name:'전체',color:'#1b1b1f'}];
  return b;
}
function lblSvg(mx,my,txt){
  var lw=Math.min(320,txt.length*12+22);
  return '<g class="lbl"><rect x="'+(mx-lw/2)+'" y="'+(my-27)+'" width="'+lw+'" height="22" rx="8"/><text x="'+mx+'" y="'+(my-11)+'" text-anchor="middle">'+esc(txt)+'</text></g>';
}
function wireScroller(){
  var sc=$('#scroller');
  sc.addEventListener('click',function(e){
    var c=e.target.closest('.card');
    if(c){onPick(c.dataset.id);return}
    if(e.target.closest('.axis')||e.target.closest('.blabel')||e.target.closest('.lk'))return;
    if(S.linking)return;
    if(S.sel||S.panel==='add'){S.sel=null;S.panel='none';renderAll()}
  });
  sc.addEventListener('dblclick',function(e){
    if(e.target.closest('.card')||e.target.closest('.blabel')||e.target.closest('.axis'))return;
    var r=$('#canvas').getBoundingClientRect();var x=e.clientX-r.left,y=e.clientY-r.top;
    if(x<LABELW)return;
    if(!S.papers.length){openAdd(null);return}
    var day=Math.round(L.a+(x-LABELW)/L.px);
    var bi=L.bandInfo.filter(function(b){return y>=b.y&&y<b.y+b.h})[0];
    openAdd({date:dstr(day),tag:(bi&&bi.band.id!=='*')?bi.band.id:null});
  });
  sc.addEventListener('mouseover',function(e){
    var g=e.target.closest&&e.target.closest('.lk');var h=$('#hov');if(!h)return;
    h.innerHTML=g?lblSvg(+g.dataset.mx,+g.dataset.my,g.dataset.t):'';
  });
  sc.addEventListener('keydown',function(e){
    var c=e.target.closest&&e.target.closest('.card');
    if(c&&(e.key==='Enter'||e.key===' ')){e.preventDefault();var id=c.dataset.id;onPick(id);var n=$('.card[data-id="'+id+'"]');if(n)n.focus({preventScroll:true})}
  });
  var tip=document.createElement('div');tip.id='tip';tip.hidden=true;document.body.appendChild(tip);
  var sup=null;
  function hideTip(){tip.hidden=true}
  function showTip(card){
    var p=paperBy(card.dataset.id);if(!p){return}
    var inc=S.links.filter(function(l){return l.to===p.id}),out=S.links.filter(function(l){return l.from===p.id});
    var h='<div class="tt">'+esc(p.title)+'</div><div class="ts">'+sg(p.state)+' '+readingState(p.state).t+' · '+p.date+'</div><div class="tm">'+esc(p.memo)+'</div>';
    h+='<div class="tc">누르면 옆에 자세히 열려요</div>';
    tip.innerHTML=h;tip.hidden=false;
    var r=card.getBoundingClientRect(),tw=tip.offsetWidth,th=tip.offsetHeight;
    var x=Math.min(Math.max(8,r.left),window.innerWidth-tw-8),y=r.bottom+8;
    if(y+th>window.innerHeight-8)y=Math.max(8,r.top-th-8);
    tip.style.left=x+'px';tip.style.top=y+'px';
  }
  sc.addEventListener('mouseover',function(e){var c=e.target.closest&&e.target.closest('.card');if(c){if(c.dataset.id===sup)return;sup=null;showTip(c)}});
  sc.addEventListener('mouseout',function(e){var c=e.target.closest&&e.target.closest('.card');if(c&&!c.contains(e.relatedTarget)){hideTip();if(c.dataset.id===sup)sup=null}});
  sc.addEventListener('focusin',function(e){var c=e.target.closest&&e.target.closest('.card');if(c&&c.dataset.id!==sup)showTip(c)});
  sc.addEventListener('focusout',hideTip);
  sc.addEventListener('click',function(e){var c=e.target.closest&&e.target.closest('.card');sup=c?c.dataset.id:null;hideTip()});
  sc.addEventListener('scroll',hideTip);
  var raf=0;
  sc.addEventListener('scroll',function(){if(raf)return;raf=requestAnimationFrame(function(){raf=0;updateMinimapWin()})});
  window.addEventListener('resize',function(){if(S.view==='card'&&S.zoom==='all'&&$('#scroller')){renderCards();updateMinimapWin()}});
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&$('#panel')){if(S.linking){S.linking=null;renderAll()}else if(S.panel!=='none'){S.sel=null;S.panel='none';renderAll()}}
  });
}
function renderMinimap(){
  var mm=$('#mm');var a=L.a,b=L.b;var h='';
  S.papers.forEach(function(p){
    if(!visible(p))return;var i=Math.max(0,S.tags.findIndex(function(t){return t.id===p.tag}));var t=tagBy(p.tag);
    h+='<i class="mmd" style="left:'+((dnum(p.date)-a)/(b-a)*100)+'%;top:'+(5+(i%4)*7)+'px;background:'+t.color+'"></i>';
  });
  h+='<div class="mmwin" id="mmwin"></div>';mm.innerHTML=h;updateMinimapWin();
}
function updateMinimapWin(){
  var sc=$('#scroller'),w=$('#mmwin');if(!sc||!w||S.view!=='card')return;
  var a=L.a,b=L.b,px=L.px;
  var s=Math.max(a,a+sc.scrollLeft/px),e=Math.min(b,a+(sc.scrollLeft+sc.clientWidth-LABELW)/px);
  w.style.left=((s-a)/(b-a)*100)+'%';w.style.width=Math.max(2,((e-s)/(b-a)*100))+'%';
  $('#rng').textContent=dstr(Math.floor(s))+' → '+dstr(Math.floor(e));
}
function wireMinimap(){
  var mm=$('#mm'),dragging=false;
  function go(e){
    var r=mm.getBoundingClientRect();var f=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width));
    scrollToDay(L.a+f*(L.b-L.a));
  }
  mm.addEventListener('pointerdown',function(e){dragging=true;mm.setPointerCapture(e.pointerId);go(e)});
  mm.addEventListener('pointermove',function(e){if(dragging)go(e)});
  mm.addEventListener('pointerup',function(){dragging=false});
}
