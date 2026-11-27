'use strict';
/* ---------- dot view ---------- */
var D={pos:new Map(),alpha:0,raf:0,tx:0,ty:0,k:1,inited:false,els:{},edges:{},drag:null};
// Graph navigation belongs to the project. Only a completed gesture or an explicit relayout
// writes settings. Keep pan relative to the viewport centre for a differently sized client.
function restoreAccountGraphLayout(layout){
  flushGraphGesture();
  D.savedView=null;
  if(!layout || typeof layout!=='object')return;
  for(var [id,point] of Object.entries(layout.points||{})){
    if(paperBy(id) && Number.isFinite(point?.x) && Number.isFinite(point?.y))
      D.pos.set(id,{x:point.x,y:point.y,vx:0,vy:0,fx:null,fy:null});
  }
  if(Number.isFinite(layout.k) && Number.isFinite(layout.x) && Number.isFinite(layout.y))
    D.savedView={k:Math.min(3,Math.max(.15,layout.k)),x:layout.x,y:layout.y,fit:layout.fit===true};
}
function flushGraphGesture(){
  if(!D.graphWrite)return;
  clearTimeout(D.graphTimer);
  var write=D.graphWrite;
  D.graphWrite=null;D.graphTimer=null;
  write();
}
function saveGraphGesture(nodeId,allNodes=false,deferred=false){
  if(S.source!=='account'||typeof accountWorkspace==='undefined'||!accountWorkspace||!S.taskId)return;
  var svg=$('#dotsvg'),workspace=accountWorkspace,task=S.taskId;
  var patch={x:D.tx-svg.clientWidth/2,y:D.ty-svg.clientHeight/2,k:D.k,fit:!!D.fit};
  if(nodeId||allNodes){
    patch.points={};
    D.pos.forEach(function(pos,id){
      if((allNodes||id===nodeId) && paperBy(id) && Number.isFinite(pos.x) && Number.isFinite(pos.y))
        patch.points[id]={x:pos.x,y:pos.y};
    });
  }
  // Capture the project and the visible viewport now, even if the user opens another view.
  var write=()=>{if(workspace.current())workspace.patchExtra('project',null,{graphLayout:patch},{task,label:'그래프 배치'}).catch(()=>{})};
  if(deferred){
    clearTimeout(D.graphTimer);
    D.graphWrite=write;
    D.graphTimer=setTimeout(flushGraphGesture,180);
  }else{
    flushGraphGesture();
    write();
  }
}
function anchorOf(tagId){
  var n=Math.max(S.tags.length,1);var i=Math.max(0,S.tags.findIndex(function(t){return t.id===tagId}));
  if(n===1)return {x:0,y:0};
  /* 좁은 화면(휴대폰)에서는 태그 묶음을 위아래로 쌓아 세로 공간을 쓴다. */
  var svg=typeof document!=='undefined'&&$('#dotsvg');if(svg&&svg.clientWidth&&svg.clientWidth<520)return {x:0,y:(i-(n-1)/2)*260};
  var ang=-Math.PI/2+i*2*Math.PI/n;return {x:Math.cos(ang)*170,y:Math.sin(ang)*170};
}
function nodeR(id,deg){return 5+Math.min(6,(deg[id]||0)*1.1)}
function renderDots(){
  var svg=$('#dotsvg');var w=svg.clientWidth||800,h=svg.clientHeight||500;
  if(!D.inited){D.tx=w/2;D.ty=h/2;D.k=1;D.inited=true;D.fit=true;
    if(D.savedView){D.tx+=D.savedView.x;D.ty+=D.savedView.y;D.k=D.savedView.k;D.fit=D.savedView.fit;D.savedView=null}
  }
  S.papers.forEach(function(p){if(!D.pos.has(p.id)){var an=anchorOf(p.tag);D.pos.set(p.id,{x:an.x+(Math.random()-.5)*90,y:an.y+(Math.random()-.5)*90,vx:0,vy:0,fx:null,fy:null})}});
  var deg={};S.links.forEach(function(l){var a=paperBy(l.from),b=paperBy(l.to);if(!a||!b||!visible(a)||!visible(b))return;deg[l.from]=(deg[l.from]||0)+1;deg[l.to]=(deg[l.to]||0)+1});
  var nb=null;
  if(S.sel){nb=new Set([S.sel]);S.links.forEach(function(l){if(l.from===S.sel)nb.add(l.to);if(l.to===S.sel)nb.add(l.from)})}
  var defs='<defs><marker id="dArrG" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0L8,4L0,8Z" fill="#aab2bd"/></marker><marker id="dArrI" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0L8,4L0,8Z" fill="#12161c"/></marker></defs>';
  var eh='',nh='';
  S.links.forEach(function(l){
    var A=paperBy(l.from),B=paperBy(l.to);if(!A||!B||!visible(A)||!visible(B))return;
    var on=S.sel&&(l.from===S.sel||l.to===S.sel);
    eh+='<g class="de'+(on?' on':'')+(S.sel&&!on?' dim':'')+'" data-id="'+l.id+'"><line class="dl"/><text class="dlab">'+esc(l.reason||'연결')+'</text></g>';
  });
  S.papers.forEach(function(p){
    if(!visible(p))return;var t=tagBy(p.tag);
    var dim=(nb&&!nb.has(p.id))||!matches(p);
    var cls='dn st-'+readingStateKey(p.state)+(S.sel===p.id?' on':'')+(dim?' dim':'')+(S.linking&&S.linking.from===p.id?' on':'')+(S.linking&&S.linking.to===p.id?' on':'');
    var label=p.title;
    if(S.papers.some(function(other){return other.id!==p.id&&other.title===p.title}))label+=' · '+String(p.id).slice(-8);
    var display=(p.title.length>26?p.title.slice(0,26)+'…':p.title)+label.slice(p.title.length);
    nh+='<g class="'+cls+'" data-id="'+esc(p.id)+'" tabindex="0" role="button" aria-label="'+esc(label)+'">'+
      (label!==p.title?'<title>'+esc(label)+'</title>':'')+'<circle class="ring"/><circle class="dot" fill="'+t.color+'"/><text class="dt">'+esc(display)+'</text></g>';
  });
  svg.innerHTML=defs+'<g id="vp">'+eh+nh+'</g>';
  D.els={};D.edges={};D.deg=deg;
  $$('.dn',svg).forEach(function(g){D.els[g.dataset.id]={g:g,dot:g.querySelector('.dot'),ring:g.querySelector('.ring'),txt:g.querySelector('.dt')}});
  $$('.de',svg).forEach(function(g){D.edges[g.dataset.id]={g:g,line:g.querySelector('.dl'),lab:g.querySelector('.dlab')}});
  applyTransform();updateDots();if(D.fit)fitDots();
  D.alpha=Math.max(D.alpha,.35);kick();
}
/* 처음에는 모든 점과 제목이 화면 안에 들어오도록 자동으로 맞춘다. 사용자가 직접 옮기거나 확대하면 멈춘다. */
function fitDots(){
  var svg=$('#dotsvg');if(!svg)return;var w=svg.clientWidth,h=svg.clientHeight;if(!w||!h)return;
  var ns=[],FS=11.5,pad=20,k0=D.k||1;
  Object.keys(D.els).forEach(function(id){var o=D.pos.get(id),e=D.els[id];if(!o)return;var tw=150;try{tw=e.txt.getComputedTextLength()*k0}catch(_){}ns.push({o:o,r:nodeR(id,D.deg),tw:tw,e:e})});
  if(!ns.length)return;
  /* 제목 글자는 화면에서 항상 같은 크기(11.5px)로 보이게 하고, 점 사이 거리만 줄여서 맞춘다. */
  function box(k){var x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;ns.forEach(function(n){x0=Math.min(x0,n.o.x*k-n.r-4);x1=Math.max(x1,n.o.x*k+n.r+5+n.tw);y0=Math.min(y0,n.o.y*k-n.r-10);y1=Math.max(y1,n.o.y*k+n.r+10)});return [x0,y0,x1,y1]}
  function ok(k){var b=box(k);return b[2]-b[0]<=w-pad*2&&b[3]-b[1]<=h-pad*2}
  var lo=.15,hi=1;if(ok(hi))lo=hi;else{for(var t=0;t<18;t++){var m=(lo+hi)/2;if(ok(m))lo=m;else hi=m}}
  var k=lo,b=box(k);
  ns.forEach(function(n){var r=n.r/k;n.e.txt.style.fontSize=(FS/k)+'px';n.e.txt.style.strokeWidth=(4/k)+'px';n.e.dot.setAttribute('r',r);n.e.ring.setAttribute('r',r+4/k);n.e.txt.setAttribute('x',n.o.x+r+5/k)});
  svg.style.setProperty('--dk',k);
  D.k=k;D.tx=w/2-(b[0]+b[2])/2;D.ty=h/2-(b[1]+b[3])/2;applyTransform();
}
function applyTransform(){var vp=$('#vp');if(vp)vp.setAttribute('transform','translate('+D.tx+','+D.ty+') scale('+D.k+')')}
function updateDots(){
  Object.keys(D.els).forEach(function(id){
    var o=D.pos.get(id),e=D.els[id];if(!o)return;var r=nodeR(id,D.deg);
    e.dot.setAttribute('cx',o.x);e.dot.setAttribute('cy',o.y);e.dot.setAttribute('r',r);
    e.ring.setAttribute('cx',o.x);e.ring.setAttribute('cy',o.y);e.ring.setAttribute('r',r+4);
    e.txt.setAttribute('x',o.x+r+5);e.txt.setAttribute('y',o.y+3.5);
  });
  S.links.forEach(function(l){
    var e=D.edges[l.id];if(!e)return;var A=D.pos.get(l.from),B=D.pos.get(l.to);if(!A||!B)return;
    var dx=B.x-A.x,dy=B.y-A.y,d=Math.sqrt(dx*dx+dy*dy)||1;var ux=dx/d,uy=dy/d;
    var ra=nodeR(l.from,D.deg),rb=nodeR(l.to,D.deg)+3;
    e.line.setAttribute('x1',A.x+ux*ra);e.line.setAttribute('y1',A.y+uy*ra);e.line.setAttribute('x2',B.x-ux*rb);e.line.setAttribute('y2',B.y-uy*rb);
    e.lab.setAttribute('x',(A.x+B.x)/2);e.lab.setAttribute('y',(A.y+B.y)/2-6);
  });
}
function tick(){
  var ns=S.papers.filter(visible).map(function(p){return {p:p,o:D.pos.get(p.id)}}).filter(function(n){return n.o});
  var a=D.alpha,i,j;
  for(i=0;i<ns.length;i++){for(j=i+1;j<ns.length;j++){
    var A=ns[i].o,B=ns[j].o,dx=B.x-A.x,dy=B.y-A.y,d2=dx*dx+dy*dy;
    if(d2<1){dx=Math.random()-.5;dy=Math.random()-.5;d2=1}
    var d=Math.sqrt(d2),f=600*a/Math.max(d,24),fx=dx/d*f,fy=dy/d*f;
    A.vx-=fx;A.vy-=fy;B.vx+=fx;B.vy+=fy;
  }}
  S.links.forEach(function(l){
    var A=D.pos.get(l.from),B=D.pos.get(l.to);if(!A||!B||!paperBy(l.from)||!visible(paperBy(l.from))||!visible(paperBy(l.to)))return;
    var dx=B.x-A.x,dy=B.y-A.y,d=Math.sqrt(dx*dx+dy*dy)||1,f=(d-120)*0.05*a,fx=dx/d*f,fy=dy/d*f;
    A.vx+=fx;A.vy+=fy;B.vx-=fx;B.vy-=fy;
  });
  ns.forEach(function(n){
    var an=anchorOf(n.p.tag);n.o.vx+=(an.x-n.o.x)*0.015*a;n.o.vy+=(an.y-n.o.y)*0.015*a;
    n.o.vx*=0.75;n.o.vy*=0.75;
    if(n.o.fx!=null){n.o.x=n.o.fx;n.o.y=n.o.fy;n.o.vx=n.o.vy=0}else{n.o.x+=n.o.vx;n.o.y+=n.o.vy}
  });
  D.alpha*=0.985;
}
function kick(){
  if(D.raf||S.view!=='dot')return;
  (function loop(){
    D.raf=0;if(S.view!=='dot')return;
    tick();updateDots();if(D.fit)fitDots();
    if(D.alpha>0.02||D.drag){D.raf=requestAnimationFrame(loop)}
  })();
}
function relayoutDots(){
  D.pos.forEach(function(o){o.x=(Math.random()-.5)*400;o.y=(Math.random()-.5)*400;o.vx=o.vy=0});
  D.fit=true;D.alpha=1;kick();
  if(S.source==='account')saveGraphGesture(null,true);
}
function wireDots(){
  var svg=$('#dotsvg');
  svg.addEventListener('pointerdown',function(e){
    var n=e.target.closest('.dn');
    D.drag={id:n?n.dataset.id:null,sx:e.clientX,sy:e.clientY,moved:false,tx:D.tx,ty:D.ty};
    try{svg.setPointerCapture(e.pointerId)}catch(_){}
    svg.style.cursor='grabbing';
  });
  svg.addEventListener('pointermove',function(e){
    var d=D.drag;if(!d)return;
    var dx=e.clientX-d.sx,dy=e.clientY-d.sy;
    if(!d.moved&&Math.sqrt(dx*dx+dy*dy)>3)d.moved=true;
    if(!d.moved)return;
    if(d.id){var o=D.pos.get(d.id);var r=svg.getBoundingClientRect();o.fx=(e.clientX-r.left-D.tx)/D.k;o.fy=(e.clientY-r.top-D.ty)/D.k;D.alpha=Math.max(D.alpha,.3);kick()}
    else{D.fit=false;D.tx=d.tx+dx;D.ty=d.ty+dy;applyTransform()}
  });
  svg.addEventListener('pointerup',function(){
    var d=D.drag;D.drag=null;svg.style.cursor='';if(!d)return;
    if(d.id){var o=D.pos.get(d.id);if(o){if(d.moved && o.fx!=null){o.x=o.fx;o.y=o.fy}o.fx=null;o.fy=null}if(!d.moved)onPick(d.id);else saveGraphGesture(d.id)}
    else if(d.moved)saveGraphGesture();
    else if(!S.linking&&(S.sel||S.panel==='add')){S.sel=null;S.panel='none';renderAll()}
  });
  svg.addEventListener('keydown',function(e){
    var n=e.target.closest&&e.target.closest('.dn');
    if(n&&(e.key==='Enter'||e.key===' ')){e.preventDefault();var id=n.dataset.id;onPick(id);var el=svg.querySelector('.dn[data-id="'+id+'"]');if(el)el.focus()}
  });
  svg.addEventListener('wheel',function(e){
    e.preventDefault();D.fit=false;
    var r=svg.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
    var k2=Math.min(3,Math.max(.3,D.k*Math.exp(-e.deltaY*0.0012)));
    D.tx=mx-(mx-D.tx)*(k2/D.k);D.ty=my-(my-D.ty)*(k2/D.k);D.k=k2;applyTransform();
    if(S.source==='account')saveGraphGesture(null,false,true);
  },{passive:false});
}
if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('resize',function(){if(S.view==='dot'&&D.fit&&!S.reader)fitDots()});

if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('pagehide',flushGraphGesture);
