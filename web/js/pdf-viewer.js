'use strict';
/* ---------- PDF.js viewer with highlights ---------- */
var PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
function loadPdfJs(){
  if(window.pdfjsLib&&pdfjsLib.GlobalWorkerOptions.workerSrc)return Promise.resolve();
  return new Promise(function(res,rej){
    var go=function(){fetch(PDFJS+'pdf.worker.min.js').then(function(r){if(!r.ok)throw 0;return r.text()}).then(function(t){pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob([t],{type:'text/javascript'}));res()}).catch(rej)};
    if(window.pdfjsLib)return go();
    var sc=document.createElement('script');sc.src=PDFJS+'pdf.min.js';sc.onload=go;sc.onerror=rej;document.head.appendChild(sc);
  });
}
var PV=null;
function killPv(){if(PV){try{PV.io&&PV.io.disconnect();PV.doc&&PV.doc.destroy()}catch(e){}PV=null}var b=$('#hlbar');if(b)b.remove()}
function toast(t){var el=$('#rdtoast');if(!el){el=document.createElement('div');el.id='rdtoast';el.className='rdtoast';document.body.appendChild(el)}el.textContent=t;el.classList.add('on');clearTimeout(toast._t);toast._t=setTimeout(function(){el.classList.remove('on')},4200)}
function openPv(p,src,page){
  return loadPdfJs().then(function(){return pdfjsLib.getDocument(src).promise}).then(function(doc){
    if(RD.id!==p.id){doc.destroy();return}
    var box=$('#rdsrc');
    box.innerHTML='<div class="pvwrap"><div class="pvbar"><button type="button" class="btn sm" id="pvPrev" aria-label="이전 쪽">◀</button><span class="pvpg"><input type="number" min="1" id="pvNum" value="1"> / <b id="pvTot">'+doc.numPages+'</b></span><button type="button" class="btn sm" id="pvNext" aria-label="다음 쪽">▶</button><span class="sp"></span><button type="button" class="btn sm" id="pvMinus" aria-label="축소">−</button><span id="pvZ" class="pvz">100%</span><button type="button" class="btn sm" id="pvPlus" aria-label="확대">＋</button><button type="button" class="btn sm" id="pvCap" aria-pressed="false" title="깨지는 수식이나 그래프를 이미지로 저장">영역 캡처</button>'+togHtml()+'</div><div class="pvscroll" id="pvs"></div></div>';
    PV={doc:doc,zoom:1,pages:[],io:null,pid:p.id,cur:1};
    if(String(p.total)!==String(doc.numPages)){p.total=String(doc.numPages);save()}
    $('#reader').classList.add('has-pv');applyNotes();
    return doc.getPage(1).then(function(p1){
      PV.w1=p1.getViewport({scale:1}).width;
      buildPages(p);
      var sc=$('#pvs');
      var tm=0;sc.addEventListener('scroll',function(){clearTimeout(tm);tm=setTimeout(function(){trackPage(p)},120)});
      sc.addEventListener('mouseup',function(e){setTimeout(function(){onSel(p,e)},10)});
      sc.addEventListener('mousedown',function(){var b=$('#hlbar');if(b)b.remove()});
      $('#pvPrev').addEventListener('click',function(){pvGo(PV.cur-1)});
      $('#pvNext').addEventListener('click',function(){pvGo(PV.cur+1)});
      $('#pvNum').addEventListener('change',function(e){pvGo(+e.target.value)});
      $('#pvMinus').addEventListener('click',function(){pvZoom(p,-.15)});
      $('#pvPlus').addEventListener('click',function(){pvZoom(p,.15)});
      pvCapInit(p);pvHitInit(p);
      var start=Math.max(1,Math.min(doc.numPages,+(page||p.page)||1));
      setTimeout(function(){pvGo(start,true)},0);
    });
  });
}
function buildPages(p){
  var sc=$('#pvs');if(!sc||!PV)return;
  if(PV.io)PV.io.disconnect();
  var avail=Math.max(280,sc.clientWidth-40);PV.scale=avail/PV.w1*PV.zoom;
  sc.innerHTML='';PV.pages=[];
  PV.io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)renderPage(p,+e.target.dataset.n)})},{root:sc,rootMargin:'700px 0px'});
  var h0=Math.round(PV.w1*PV.scale*1.414);
  for(var n=1;n<=PV.doc.numPages;n++){
    var d=document.createElement('div');d.className='pgbox';d.dataset.n=n;d.style.width=Math.round(PV.w1*PV.scale)+'px';d.style.height=h0+'px';
    sc.appendChild(d);PV.pages[n]={el:d,done:false};PV.io.observe(d);
  }
  $('#pvZ').textContent=Math.round(PV.zoom*100)+'%';
}
function renderPage(p,n){
  var pg=PV&&PV.pages[n];if(!pg||pg.done||pg.busy)return;pg.busy=true;
  var doc=PV.doc;
  doc.getPage(n).then(function(page){
    if(!PV||PV.doc!==doc)return;
    var vp=page.getViewport({scale:PV.scale}),dpr=window.devicePixelRatio||1;
    var el=pg.el;el.style.width=Math.round(vp.width)+'px';el.style.height=Math.round(vp.height)+'px';el.innerHTML='';
    var cv=document.createElement('canvas');cv.width=Math.round(vp.width*dpr);cv.height=Math.round(vp.height*dpr);cv.style.width=vp.width+'px';cv.style.height=vp.height+'px';
    var hl=document.createElement('div');hl.className='hlayer';
    var tl=document.createElement('div');tl.className='textLayer';tl.style.setProperty('--scale-factor',PV.scale);
    el.appendChild(cv);el.appendChild(hl);el.appendChild(tl);
    var ctx=cv.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
    page.render({canvasContext:ctx,viewport:vp}).promise.then(function(){return page.getTextContent()}).then(function(tc){
      return pdfjsLib.renderTextLayer({textContentSource:tc,container:tl,viewport:vp,textDivs:[]}).promise;
    }).then(function(){var eoc=document.createElement('div');eoc.className='endOfContent';tl.appendChild(eoc);pg.done=true;pg.busy=false;drawHl(p,n)}).catch(function(){pg.busy=false});
  });
}
function drawHl(p,n){
  var pg=PV&&PV.pages[n];if(!pg||!pg.el)return;var l=pg.el.querySelector('.hlayer');if(!l)return;
  l.innerHTML=(p.hl||[]).filter(function(h){return h.page===n}).map(function(h){return h.rects.map(function(r){return '<i'+(h.stuck&&!h.solved?' class="stk"':'')+' style="left:'+r[0]*100+'%;top:'+r[1]*100+'%;width:'+r[2]*100+'%;height:'+r[3]*100+'%"></i>'}).join('')}).join('');
}
function pvGo(n,quiet){
  if(!PV)return;n=Math.max(1,Math.min(PV.doc.numPages,Math.round(n)||1));
  var pg=PV.pages[n];if(!pg)return;
  $('#pvs').scrollTop=pg.el.offsetTop-12;PV.cur=n;$('#pvNum').value=n;
  if(!quiet){var p=paperBy(PV.pid);if(p){p.page=String(n);var r=$('#rPage');if(r)r.value=n;save()}}
}
function trackPage(p){
  if(!PV)return;var sc=$('#pvs');if(!sc)return;var mid=sc.scrollTop+sc.clientHeight*.35,cur=1;
  for(var n=1;n<PV.pages.length;n++){var e=PV.pages[n].el;if(e.offsetTop<=mid)cur=n;else break}
  if(cur!==PV.cur){PV.cur=cur;$('#pvNum').value=cur}
  if(String(cur)!==String(p.page)){p.page=String(cur);var r=$('#rPage');if(r)r.value=cur;save()}
}
function pvZoom(p,d){
  if(!PV)return;var cur=PV.cur;PV.zoom=Math.max(.5,Math.min(2.4,Math.round((PV.zoom+d)*100)/100));buildPages(p);pvGo(cur,true);
}
function snapWords(sel){
  try{
    var r=sel.getRangeAt(0),sc=r.startContainer,ec=r.endContainer,so=r.startOffset,eo=r.endOffset,ws=/\s/;
    if(sc.nodeType===3){var t=sc.textContent;while(so>0&&!ws.test(t.charAt(so-1)))so--;}
    if(ec.nodeType===3){var u=ec.textContent;while(eo<u.length&&!ws.test(u.charAt(eo)))eo++;}
    r.setStart(sc,so);r.setEnd(ec,eo);sel.removeAllRanges();sel.addRange(r);
  }catch(e){}
}
var SNAP=true;try{SNAP=localStorage.getItem('researchtrail.snap')!=='0'}catch(e){}
function snapSentences(sel){
  try{
    var r=sel.getRangeAt(0),sc=r.startContainer,ec=r.endContainer;
    if(sc.nodeType!==3||ec.nodeType!==3)return false;
    var layer=(sc.parentElement||{}).closest&&sc.parentElement.closest('.textLayer');
    if(!layer||!layer.contains(ec))return false;
    var w=document.createTreeWalker(layer,NodeFilter.SHOW_TEXT,null),nodes=[],starts=[],pos=0,n;
    while((n=w.nextNode())){if(!n.textContent)continue;nodes.push(n);starts.push(pos);pos+=n.textContent.length+1}
    var iS=nodes.indexOf(sc),iE=nodes.indexOf(ec);if(iS<0||iE<0)return false;
    var joined=nodes.map(function(x){return x.textContent}).join(' ');
    var gS=starts[iS]+r.startOffset,gE=starts[iE]+r.endOffset;
    var ABBR=/(?:et al|Fig|Figs|Eq|Eqs|e\.g|i\.e|vs|Tab|Sec|No|approx|cf)$/i;
    function isEnd(i){var c=joined.charAt(i);if(c!=='.'&&c!=='?'&&c!=='!')return false;var nx=joined.charAt(i+1);if(nx&&!/\s/.test(nx)&&nx!==')'&&nx!=='"'&&nx!=='”')return false;if(c==='.'&&ABBR.test(joined.slice(Math.max(0,i-8),i)))return false;if(c==='.'&&/\d$/.test(joined.slice(Math.max(0,i-1),i))&&/^\s*\d/.test(joined.slice(i+1,i+3)))return false;return true}
    var a=gS;while(a>0&&!isEnd(a-1))a--;
    while(a<gE&&/\s/.test(joined.charAt(a)))a++;
    var b=Math.max(gE,a+1);while(b<joined.length&&!isEnd(b-1))b++;
    while(b>a&&/\s/.test(joined.charAt(b-1)))b--;
    function loc(g,endSide){for(var k=nodes.length-1;k>=0;k--){if(starts[k]<=g){var off=Math.min(g-starts[k],nodes[k].textContent.length);if(endSide&&off===0&&k>0){return {n:nodes[k-1],o:nodes[k-1].textContent.length}}return {n:nodes[k],o:off}}}return {n:nodes[0],o:0}}
    var s0=loc(a,false),e0=loc(b,true);
    r.setStart(s0.n,s0.o);r.setEnd(e0.n,e0.o);sel.removeAllRanges();sel.addRange(r);return true;
  }catch(e){return false}
}
function onSel(p,e){
  var old=$('#hlbar');if(old)old.remove();
  var sel=window.getSelection();if(!sel||sel.isCollapsed||!sel.rangeCount||!PV)return;
  var text=sel.toString().replace(/\s+/g,' ').trim();if(text.length<2)return;
  var r=sel.getRangeAt(0);var n0=r.startContainer.nodeType===1?r.startContainer:r.startContainer.parentElement;
  var box=n0&&n0.closest&&n0.closest('.pgbox');if(!box)return;
  var bb=box.getBoundingClientRect(),page=+box.dataset.n;
  var rects=[].map.call(r.getClientRects(),function(q){
      /* 쪽 경계를 넘는 사각형은 버리지 않고 쪽 안으로 잘라서 쓴다 (줄 끝·가장자리 글자가 빠지던 문제) */
      var x0=Math.max(0,(q.left-bb.left)/bb.width),y0=Math.max(0,(q.top-bb.top)/bb.height),x1=Math.min(1,(q.right-bb.left)/bb.width),y1=Math.min(1,(q.bottom-bb.top)/bb.height);
      return [x0,y0,x1-x0,y1-y0]}).filter(function(q){return q[2]>0.002&&q[3]>0.002&&q[3]<0.2});
  if(!rects.length)return;
  rects=fitInk(box,rects);
  var last=r.getClientRects();var lr=last[last.length-1];
  var bar=document.createElement('div');bar.id='hlbar';bar.className='hlbar';
  bar.innerHTML='<button type="button" data-a="hl">형광펜</button><button type="button" data-a="q">메모에 인용</button><button type="button" data-a="stuck" class="stk">막혔어요</button>';
  document.body.appendChild(bar);
  var bw=bar.offsetWidth;bar.style.left=Math.max(8,Math.min(window.innerWidth-bw-8,lr.right-bw/2))+'px';bar.style.top=Math.min(window.innerHeight-48,lr.bottom+8)+'px';
  bar.addEventListener('mousedown',function(ev){ev.preventDefault();ev.stopPropagation()});
  bar.addEventListener('click',function(ev){
    var a=ev.target.getAttribute&&ev.target.getAttribute('data-a'),rs=ev.target.getAttribute&&ev.target.getAttribute('data-r');
    function fin(extra){
      p.hl=p.hl||[];var h={id:nid('h'),page:page,text:text,kind:guessKind(text),rects:rects};
      if(extra)for(var k in extra)h[k]=extra[k];
      p.hl.push(h);return h}
    if(a==='stuck'){
      bar.innerHTML='<span class="hlq">어디서 막혔나요?</span>'+STUCK.map(function(s){return '<button type="button" data-r="'+s.id+'">'+s.t+'</button>'}).join('')+'<button type="button" data-a="back" class="mute">취소</button>';
      var bw2=bar.offsetWidth;bar.style.left=Math.max(8,Math.min(window.innerWidth-bw2-8,lr.right-bw2/2))+'px';return}
    if(a==='back'){bar.remove();sel.removeAllRanges();return}
    if(rs){
      var s=STUCK.filter(function(x){return x.id===rs})[0];
      var h=fin({stuck:rs,unsure:'',solved:false});if(rs==='eq'&&!h.kind)h.kind='수식';
      save();drawHl(p,page);drawHlList();bar.remove();sel.removeAllRanges();toast('막힌 곳으로 저장했어요. 오른쪽 목록에서 질문을 복사해 챗봇에 붙여넣을 수 있어요.');return}
    if(!a)return;
    fin();
    if(a==='q'){p.note=(p.note?p.note.replace(/\s*$/,'')+'\n\n':'')+'> “'+text+'” (p.'+page+')\n';var t=$('#rNote');if(t)t.value=p.note}
    save();drawHl(p,page);drawHlList();bar.remove();sel.removeAllRanges();
  });
}
/* ---------- 막혔어요: 이유를 고르면 그 이유에 맞는 질문문을 만들어 준다 (앱이 직접 설명을 생성하지는 않는다) ---------- */
var STUCK=[
  {id:'term',t:'낯선 용어',long:'용어가 낯설어요',ask:'이 문맥에서 낯선 용어의 뜻과 간단한 예시를 알려 주세요.'},
  {id:'why',t:'왜 하는 말인지',long:'왜 이런 말을 하는지 모르겠어요',ask:'이 문장을 왜 하는지, 논문이 풀려는 문제와 주장에 어떻게 연결되는지 설명해 주세요.'},
  {id:'bg',t:'배경지식 부족',long:'배경지식이 부족해요',ask:'이 부분을 이해하는 데 필요한 배경 개념을, 지금 읽는 데 필요한 만큼만 쉬운 것부터 설명해 주세요.'},
  {id:'eq',t:'수식이 안 읽힘',long:'수식이 안 읽혀요',ask:'각 기호의 의미, 입력과 출력, 이 식이 하는 일을 설명해 주세요.'}
];
function stuckBy(id){return STUCK.filter(function(s){return s.id===id})[0]}
function stuckPrompt(p,h){
  var s=stuckBy(h.stuck)||STUCK[0];
  return '저는 [내 전공/배경을 여기에 적어 주세요] 분야이고, 다른 분야 논문을 읽다가 막혔어요.\n\n'+
    '논문: '+p.title+'\n쪽: p.'+h.page+'\n막힌 문장:\n“'+(h.text||'(영역 캡처한 그림·수식)')+'”\n\n'+
    '막힌 이유: '+s.long+'\n'+(h.mine?'지금까지 이해한 것: '+h.mine+'\n':'')+(h.unsure?'아직 헷갈리는 것: '+h.unsure+'\n':'')+
    '\n'+s.ask+'\n설명은 "직관 → 예시 → 원문 표현으로 돌아오기" 순서로 해 주시고, 비유가 실제 개념과 달라지는 부분도 알려 주세요. 확실하지 않은 내용은 모른다고 말해 주세요.';
}
function copyText(t,done){
  function fb(){var a=document.createElement('textarea');a.value=t;a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();var ok=false;try{ok=document.execCommand('copy')}catch(e){}a.remove();done(ok)}
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(function(){done(true)},fb);else fb();
}
function drawHlList(){
  var p=paperBy(S.reader),el=$('#rHl');if(!p||!el)return;
  var hs=(p.hl||[]).slice().sort(function(a,b){return a.page-b.page});
  el.innerHTML=hs.length?'<ul class="hllist">'+hs.map(function(h){
    return '<li'+(h.stuck?' class="stuck'+(h.solved?' done':'')+'"':'')+'><div class="hl-top"><button type="button" class="hgo" data-pg="'+h.page+'"><b>p.'+h.page+'</b> '+(h.img?'캡처한 부분':esc(short(h.text,80)))+'</button><button type="button" class="x" data-hd="'+h.id+'" aria-label="하이라이트 삭제">×</button></div>'+
      (h.img?'<img class="hl-img" title="눌러서 크게 보기" src="'+h.img+'" alt="캡처한 부분">':'')+
      '<div class="hl-meta"><select data-hk="'+h.id+'" aria-label="종류"><option value="">종류</option>'+KINDS.map(function(k){return '<option'+(h.kind===k?' selected':'')+'>'+k+'</option>'}).join('')+'</select><input type="text" data-hm="'+h.id+'" value="'+esc(h.mine||'')+'" placeholder="내가 이해한 것 (예: PSD = 주파수별 에너지)" aria-label="내가 이해한 것"></div>'+
      (h.stuck?'<div class="stk-box"><span class="stk-b">막힘 · '+esc((stuckBy(h.stuck)||{t:''}).t)+'</span><input type="text" data-hu="'+h.id+'" value="'+esc(h.unsure||'')+'" placeholder="아직 헷갈리는 것 (예: 왜 음성 샘플이 필요한지)" aria-label="아직 헷갈리는 것"><div class="stk-act"><button type="button" class="btn sm" data-hq="'+h.id+'">질문 복사</button><button type="button" class="btn sm ghost" data-hs="'+h.id+'">'+(h.solved?'다시 막힘':'이해했어요')+'</button></div></div>':'')+'</li>';
  }).join('')+'</ul>':'<p class="empty">PDF에서 문장을 드래그하면 형광펜, 메모에 인용, 막혔어요 버튼이 나와요. 수식이 깨지면 위쪽 "영역 캡처"로 이미지로 저장하세요.</p>';
  function hb(id){return (p.hl||[]).filter(function(x){return x.id===id})[0]}
  $$('[data-pg]',el).forEach(function(b){b.addEventListener('click',function(){pvGo(+b.dataset.pg)})});
  $$('[data-hk]',el).forEach(function(s){s.addEventListener('change',function(){var h=hb(s.dataset.hk);if(h){h.kind=s.value;save()}})});
  $$('[data-hu]',el).forEach(function(i){i.addEventListener('input',function(){var h=hb(i.dataset.hu);if(h){h.unsure=i.value;save()}})});
  $$('[data-hq]',el).forEach(function(b){b.addEventListener('click',function(){var h=hb(b.dataset.hq);if(!h)return;copyText(stuckPrompt(p,h),function(ok){toast(ok?'질문을 복사했어요. 챗봇에 붙여넣고, [내 전공/배경] 부분만 고쳐 주세요.':'복사하지 못했어요. 브라우저 권한을 확인해 주세요.')})})});
  $$('[data-hs]',el).forEach(function(b){b.addEventListener('click',function(){var h=hb(b.dataset.hs);if(!h)return;h.solved=!h.solved;save();drawHl(p,h.page);drawHlList()})});
  $$('[data-hm]',el).forEach(function(i){i.addEventListener('input',function(){var h=hb(i.dataset.hm);if(h){h.mine=i.value;save()}})});
  $$('[data-hd]',el).forEach(function(b){b.addEventListener('click',function(){var h=hb(b.dataset.hd);if(!h)return;
    function del(){p.hl=(p.hl||[]).filter(function(x){return x.id!==h.id});save();drawHl(p,h.page);drawHlList()}
    if(h.img)ask('이 캡처를 삭제할까요?','저장한 이미지와 "내가 이해한 것"이 함께 사라져요.','삭제',del,true);else del()})});
  $$('.hl-img',el).forEach(function(im){im.addEventListener('click',function(){
    var ov=document.createElement('div');ov.className='ov';ov.innerHTML='<img class="bigimg" src="'+im.src+'" alt="캡처한 부분 크게 보기">';
    function c(){document.removeEventListener('keydown',k,true);ov.remove()}function k(e){if(e.key==='Escape'){e.stopPropagation();c()}}
    document.addEventListener('keydown',k,true);ov.addEventListener('click',c);document.body.appendChild(ov)})});
}


/* 글자 칸이 실제 글보다 좁게 잡히는 PDF가 있어서, 줄 끝까지 실제로 그려진 글자(캔버스)를 따라 오른쪽을 늘린다.
   마지막 줄은 사용자가 선택한 곳에서 끝나야 하므로 그대로 둔다. */
function fitInk(box,rects){
  try{
    var cv=box.querySelector('canvas');if(!cv||rects.length<2)return rects;
    var cw=cv.width,ch=cv.height,ctx=cv.getContext('2d');
    var lastR=rects[rects.length-1],lastY=lastR[1],lh=lastR[3];
    return rects.map(function(q){
      if(Math.abs(q[1]-lastY)<lh*.6)return q;
      var y0=Math.max(0,Math.floor((q[1]+q[3]*.2)*ch)),y1=Math.min(ch,Math.ceil((q[1]+q[3]*.8)*ch)),x0=Math.max(0,Math.floor((q[0]+q[2])*cw)-2);
      var maxX=Math.min(cw,x0+Math.round(cw*.15)),gapMax=Math.max(6,Math.round(q[3]*ch*.9));
      if(y1<=y0||maxX<=x0)return q;
      var d=ctx.getImageData(x0,y0,maxX-x0,y1-y0).data,W=maxX-x0,H=y1-y0,lastInk=-1,gap=0;
      for(var x=0;x<W;x++){
        var ink=false;for(var y=0;y<H;y++){var i=(y*W+x)*4;if(d[i+3]>40&&(d[i]+d[i+1]+d[i+2])/3<170){ink=true;break}}
        if(ink){lastInk=x;gap=0}else if(++gap>gapMax)break;
      }
      if(lastInk<0)return q;
      var nr=Math.min(1,(x0+lastInk+3)/cw);
      return nr>q[0]+q[2]?[q[0],q[1],nr-q[0],q[3]]:q;
    });
  }catch(e){return rects}
}
