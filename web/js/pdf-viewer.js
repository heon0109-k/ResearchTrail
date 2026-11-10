'use strict';
/* ---------- PDF.js viewer with highlights ---------- */
var PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
var pdfJsLoading=null;
function loadPdfJs(){
  if(window.pdfjsLib&&pdfjsLib.GlobalWorkerOptions.workerSrc)return Promise.resolve();
  if(pdfJsLoading)return pdfJsLoading;
  pdfJsLoading=new Promise(function(res,rej){
    var go=function(){fetch(PDFJS+'pdf.worker.min.js').then(function(r){if(!r.ok)throw 0;return r.text()}).then(function(t){pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob([t],{type:'text/javascript'}));res()}).catch(rej)};
    if(window.pdfjsLib)return go();
    var sc=document.createElement('script');sc.src=PDFJS+'pdf.min.js';sc.onload=go;sc.onerror=rej;document.head.appendChild(sc);
  }).finally(function(){pdfJsLoading=null});
  return pdfJsLoading;
}
function paperResourceKind(url){
  var u=new URL(url),host=u.hostname.replace(/^www\./,'');
  if((host==='github.com'||host==='gitlab.com'||host==='bitbucket.org')&&u.pathname.split('/').filter(Boolean).length>=2)return 'code';
  if((host==='huggingface.co'&&u.pathname.startsWith('/datasets/'))||
    (host==='kaggle.com'&&u.pathname.startsWith('/datasets/'))||
    (host==='zenodo.org'&&/^\/records?\//.test(u.pathname))||
    (host==='figshare.com'||host.endsWith('.figshare.com'))||host==='datadryad.org'||host==='archive.ics.uci.edu')return 'data';
  return '';
}
function paperResourcePdfUrl(p){
  var link=safeExternalUrl(p.link);
  return samplePdfUrl(p)||pdfUrlOf(p.link)||(link&&/\.pdf$/i.test(new URL(link).pathname)?link:'');
}
async function findPaperResources(p,isCurrent,uploadedFile){
  var file=uploadedFile||(p.pdf?await idbGet(p.id):null);
  var url=file?'':paperResourcePdfUrl(p);
  if(!file&&!url)return null;
  await loadPdfJs();
  if(!isCurrent())return [];
  var source=file?{data:await file.arrayBuffer()}:{url:url};
  var task=pdfjsLib.getDocument({...source,isEvalSupported:false});
  var found=new Map();
  try{
    var doc=await task.promise;
    for(var n=1;n<=doc.numPages&&isCurrent();n++){
      var page=await doc.getPage(n);
      var parts=await Promise.all([page.getAnnotations(),page.getTextContent()]);
      var words=parts[1].items.map(function(item){return item.str||''}).join(' ');
      var links=parts[0].map(function(annotation){return annotation.url}).filter(Boolean);
      (words.match(/(?:https?:\/\/|\b(?:github\.com|gitlab\.com|huggingface\.co|kaggle\.com)\/)[^\s<>"“”]+/gi)||[]).forEach(function(raw){
        links.push(raw.replace(/[.,;:!?\])}]+$/,''));
      });
      links.forEach(function(raw){
        var href=safeExternalUrl(raw),kind=href&&paperResourceKind(href);
        if(kind&&!found.has(href))found.set(href,{url:href,kind:kind,page:n});
      });
      page.cleanup();
    }
    return Array.from(found.values());
  }finally{await task.destroy()}
}
var PV=null;
function killPv(){if(PV){try{PV.io&&PV.io.disconnect();PV.doc&&PV.doc.destroy()}catch(e){}PV=null}var b=$('#hlbar');if(b)b.remove()}
function toast(t){var el=$('#rdtoast');if(!el){el=document.createElement('div');el.id='rdtoast';el.className='rdtoast';document.body.appendChild(el)}el.textContent=t;el.classList.add('on');clearTimeout(toast._t);toast._t=setTimeout(function(){el.classList.remove('on')},4200)}
function openPv(p,src,page){
  return loadPdfJs().then(function(){return pdfjsLib.getDocument({...src,isEvalSupported:false}).promise}).then(function(doc){
    if(RD.id!==p.id){doc.destroy();return}
    var box=$('#rdsrc');
    box.innerHTML='<div class="pvwrap"><div class="pvbar"><button type="button" class="btn sm" id="pvPrev" aria-label="이전 쪽">◀</button><span class="pvpg"><input type="number" min="1" id="pvNum" value="1"> / <b id="pvTot">'+doc.numPages+'</b></span><button type="button" class="btn sm" id="pvNext" aria-label="다음 쪽">▶</button><span class="sp"></span><button type="button" class="btn sm" id="pvMinus" aria-label="축소">−</button><span id="pvZ" class="pvz">100%</span><button type="button" class="btn sm" id="pvPlus" aria-label="확대">＋</button><button type="button" class="btn sm" id="pvCap" aria-pressed="false" title="깨지는 수식이나 그래프를 이미지로 저장">영역 캡처</button>'+togHtml()+'</div><div class="pvscroll" id="pvs"></div></div>';if(typeof placePdfDownload==='function')placePdfDownload();
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
  l.innerHTML=(p.hl||[]).filter(function(h){return h.page===n}).map(function(h){return h.rects.map(function(r){return '<i'+(highlightBlocked(h)?' class="stk"':'')+' style="left:'+r[0]*100+'%;top:'+r[1]*100+'%;width:'+r[2]*100+'%;height:'+r[3]*100+'%"></i>'}).join('')}).join('');
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
  bar.innerHTML='<button type="button" data-a="hl">형광펜</button>';
  document.body.appendChild(bar);
  var bw=bar.offsetWidth;bar.style.left=Math.max(8,Math.min(window.innerWidth-bw-8,lr.right-bw/2))+'px';bar.style.top=Math.min(window.innerHeight-48,lr.bottom+8)+'px';
  bar.addEventListener('mousedown',function(ev){ev.preventDefault();ev.stopPropagation()});
  bar.addEventListener('click',function(ev){
    var a=ev.target.getAttribute&&ev.target.getAttribute('data-a');
    function fin(extra){
      p.hl=p.hl||[];var h={id:nid('h'),page:page,text:text,kind:guessKind(text),rects:rects};
      if(extra)for(var k in extra)h[k]=extra[k];
      p.hl.push(h);return h}
    if(a==='stuck'){fin({blocked:true});save();drawHl(p,page);drawHlList();bar.remove();sel.removeAllRanges();toast('막힌 곳으로 표시했어요. 오른쪽에서 메모를 남기거나 질문을 복사하세요.');return}
    if(a!=='hl')return;
    fin();
    save();drawHl(p,page);drawHlList();bar.remove();sel.removeAllRanges();
  });
}
/* Legacy reason labels remain for previously saved records. New marks need no category. */
var STUCK=[
  {id:'term',t:'낯선 용어',long:'용어가 낯설어요',ask:'이 문맥에서 낯선 용어의 뜻과 간단한 예시를 알려 주세요.'},
  {id:'why',t:'왜 하는 말인지',long:'왜 이런 말을 하는지 모르겠어요',ask:'이 문장을 왜 하는지, 논문이 풀려는 문제와 주장에 어떻게 연결되는지 설명해 주세요.'},
  {id:'bg',t:'배경지식 부족',long:'배경지식이 부족해요',ask:'이 부분을 이해하는 데 필요한 배경 개념을, 지금 읽는 데 필요한 만큼만 쉬운 것부터 설명해 주세요.'},
  {id:'eq',t:'수식이 안 읽힘',long:'수식이 안 읽혀요',ask:'각 기호의 의미, 입력과 출력, 이 식이 하는 일을 설명해 주세요.'}
];
function stuckBy(id){return STUCK.filter(function(s){return s.id===id})[0]}
function setHighlightStuck(h,reason){
  if(reason&&!stuckBy(reason))return false;
  if((h.stuck||'')!==reason){h.stuck=reason;h.solved=false}
  return true;
}
function highlightBlocked(h){return typeof h.blocked==='boolean'?h.blocked:!!(h.stuck&&!h.solved)}
function setHighlightBlocked(h,blocked){h.blocked=!!blocked}
function stuckPrompt(p,h){
  var previous=stuckBy(h.stuck);
  return '논문의 다음 부분을 이해하는 데 도움을 주세요.\n\n'+
    '논문: '+p.title+'\n쪽: p.'+h.page+'\n'+(h.type==='note'?'논문을 읽으며 남긴 메모':h.img?'선택한 부분: 영역 캡처한 그림·수식 (캡처 이미지를 이 질문과 함께 첨부합니다)':'선택한 문장:\n“'+h.text+'”')+'\n\n'+
    (h.mine?'내 메모: '+h.mine+'\n':'')+(h.unsure?'이전에 남긴 질문: '+h.unsure+'\n':'')+
    (previous?'이전에 기록한 막힌 이유: '+previous.long+'\n':'')+
    '\n'+(previous?previous.ask:'위 내용과 내 메모를 바탕으로 핵심 의미와 이해에 필요한 배경을 쉽게 설명해 주세요.')+
    '\n원문에서 확인할 수 있는 내용과 추가 설명을 구분하고, 확실하지 않은 내용은 모른다고 말해 주세요.';
}
function highlightQuestion(p,h){
  return '논문의 다음 부분을 이해하는 데 도움을 주세요.\n\n논문: '+p.title+'\n쪽: '+(h.page?'p.'+h.page:'미기록')+'\n'+
    (h.type==='note'?'논문을 읽으며 남긴 메모':h.img?'선택한 부분: 영역 캡처한 그림·수식 (캡처 이미지를 이 질문과 함께 첨부합니다)':'선택한 문장:\n“'+h.text+'”')+'\n\n'+
    (h.mine?'내 메모: '+h.mine+'\n':'')+
    '\n선택한 내용과 내 메모를 바탕으로 핵심 의미와 이해에 필요한 배경을 쉽게 설명해 주세요. 원문에서 확인할 수 있는 내용과 추가 설명을 구분하고, 확실하지 않은 내용은 모른다고 말해 주세요.';
}
function copyText(t,done){
  function fb(){var a=document.createElement('textarea');a.value=t;a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();var ok=false;try{ok=document.execCommand('copy')}catch(e){}a.remove();done(ok)}
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(function(){done(true)},fb);else fb();
}
var KIND_OUTSIDE_BOUND=false;
function highlightKindMenu(h){
  var kinds=typeof KINDS==='undefined'?['수식','그래프·표','개념·방법','기타']:KINDS;
  return '<details class="kind-picker"><summary aria-label="기록 종류: '+esc(h.kind||'미분류')+'"><span class="kind-label">'+esc(h.kind||'종류')+'</span><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary><div class="kind-menu" role="group" aria-label="종류 선택">'+kinds.map(function(k){return '<button type="button" data-hk="'+esc(h.id)+'" data-kind="'+esc(k)+'" aria-pressed="'+(h.kind===k)+'"><span>'+esc(k)+'</span><span class="kind-check" aria-hidden="true">✓</span></button>'}).join('')+'</div></details>';
}
function drawHlList(){
  var p=paperBy(S.reader),el=$('#rHl');if(!p||!el)return;
  var hs=(p.hl||[]).slice().sort(function(a,b){return (a.page||Infinity)-(b.page||Infinity)});
  el.innerHTML=hs.length?'<ul class="hllist">'+hs.map(function(h){
    var selected=typeof RR!=='undefined'&&RR.pid===p.id&&RR.selected===h.id;
    return '<li class="reading-card'+(selected?' is-selected':'')+'" data-rid="'+esc(h.id)+'" tabindex="0" aria-label="읽기 기록 선택"><span class="record-selected">선택한 기록</span><div class="hl-top"><button type="button" class="hgo" '+(h.page?'data-pg="'+h.page+'"':'disabled')+'><b>'+(h.page?'p.'+h.page:'쪽 미기록')+'</b> '+(h.type==='note'?'메모':h.img?esc(h.text||'캡처한 부분'):esc(short(h.text,80)))+'</button><div class="hl-tools"><button type="button" class="hl-copy" data-hq="'+h.id+'" aria-label="AI에게 물어볼 질문 복사" title="AI에게 물어볼 질문 복사"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M12 4V3a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v7a1 1 0 0 0 1 1h1"/></svg></button><button type="button" class="x" data-hd="'+h.id+'" aria-label="하이라이트 삭제">×</button></div></div>'+
      (h.img?'<img class="hl-img" title="눌러서 크게 보기" src="'+esc(h.img)+'" alt="'+esc(h.text||'캡처한 부분')+'">':'')+
      '<div class="hl-meta">'+highlightKindMenu(h)+'<textarea rows="2" data-hm="'+h.id+'" placeholder="메모를 남겨 보세요" aria-label="하이라이트 메모">'+esc(h.mine||'')+'</textarea></div><button type="button" class="record-candidate" data-record-candidate="'+esc(h.id)+'">다음 할 일 찾기 →</button></li>';
  }).join('')+'</ul>':'<p class="empty">PDF에서 형광펜·영역 캡처를 남기거나 위의 "+ 메모 추가"로 짧게 기록해 보세요.</p>';
  function hb(id){return (p.hl||[]).filter(function(x){return x.id===id})[0]}
  $$('textarea[data-hm]',el).forEach(function(i){
    function fit(){i.style.height='auto';i.style.height=Math.max(58,i.scrollHeight+2)+'px'}
    fit();i.addEventListener('input',fit);
  });
  $$('[data-pg]',el).forEach(function(b){b.addEventListener('click',function(){pvGo(+b.dataset.pg)})});
  $$('[data-hk]',el).forEach(function(b){b.addEventListener('click',function(){var h=hb(b.dataset.hk);if(!h)return;h.kind=b.dataset.kind;save();var menu=b.closest('.kind-picker');$('.kind-label',menu).textContent=h.kind;$('summary',menu).setAttribute('aria-label','기록 종류: '+h.kind);$$('[data-hk]',menu).forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false')});menu.open=false;$('summary',menu).focus()})});
  $$('.kind-picker',el).forEach(function(menu){
    menu.addEventListener('toggle',function(){if(!menu.open)return;$$('.kind-picker',el).forEach(function(other){if(other!==menu)other.open=false});var panel=$('.kind-menu',menu),notes=$('#rdnotes'),r=menu.getBoundingClientRect(),nr=notes?notes.getBoundingClientRect():{top:0,bottom:window.innerHeight};menu.classList.toggle('opens-up',r.bottom+panel.offsetHeight+8>nr.bottom&&r.top-panel.offsetHeight-8>nr.top)});
    menu.addEventListener('keydown',function(e){var options=$$('[data-hk]',menu),index=options.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();e.stopPropagation();menu.open=false;$('summary',menu).focus()}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();menu.open=true;var n=e.key==='ArrowDown'?index+1:index<0?options.length-1:index-1;options[(n+options.length)%options.length].focus()}});
  });
  if(!KIND_OUTSIDE_BOUND&&typeof document!=='undefined'&&document.addEventListener){KIND_OUTSIDE_BOUND=true;document.addEventListener('click',function(e){$$('.kind-picker[open]').forEach(function(menu){if(!menu.contains(e.target))menu.open=false})})}

  $$('[data-hq]',el).forEach(function(b){b.addEventListener('click',function(){var h=hb(b.dataset.hq);if(!h)return;copyText(highlightQuestion(p,h),function(ok){toast(ok?(h.img?'질문을 복사했어요. 챗봇에 붙여넣고 캡처 이미지도 함께 첨부해 주세요.':'질문을 복사했어요. 원하는 챗봇에 붙여넣어 주세요.'):'복사하지 못했어요. 브라우저 권한을 확인해 주세요.')})})});
  $$('[data-hm]',el).forEach(function(i){
    var editing=false;
    i.addEventListener('input',function(){var h=hb(i.dataset.hm);if(!h)return;
      if(!editing&&typeof rememberReadingMemo==='function'){rememberReadingMemo(p,h.id,h.mine||'');editing=true}
      h.mine=i.value;save();if(typeof NA!=='undefined'&&NA.pid===p.id&&NA.sourceId===h.id&&NA.st==='cand')naRender(p,true);
    });
    i.addEventListener('change',function(){var h=hb(i.dataset.hm);if(!h)return;if(typeof rememberReadingMemo==='function')rememberReadingMemo(p,h.id,h.mine||'');editing=false;save();if(typeof renderHistory==='function')renderHistory(p)});
  });
  $$('[data-hd]',el).forEach(function(b){b.addEventListener('click',function(){var h=hb(b.dataset.hd);if(!h)return;
    function del(){if(typeof rememberReadingMemo==='function')rememberReadingMemo(p,h.id,h.mine||'');p.hl=(p.hl||[]).filter(function(x){return x.id!==h.id});if(typeof RR!=='undefined'&&RR.pid===p.id&&RR.selected===h.id)clearReadingSelection(p);save();drawHl(p,h.page);drawHlList();if(typeof renderHistory==='function')renderHistory(p)}
    ask(h.img?'이 캡처를 삭제할까요?':h.type==='note'?'이 메모를 삭제할까요?':'이 하이라이트를 삭제할까요?',h.img?'저장한 이미지와 "내가 이해한 것"이 함께 사라져요.':'선택한 기록과 메모가 목록에서 삭제돼요. 저장된 다음 할 일은 유지돼요.','삭제',del,true)})});
  $$('.hl-img',el).forEach(function(im){im.addEventListener('click',function(){
    var ov=document.createElement('div');ov.className='ov';ov.innerHTML='<img class="bigimg" src="'+im.src+'" alt="캡처한 부분 크게 보기">';
    function c(){document.removeEventListener('keydown',k,true);ov.remove()}function k(e){if(e.key==='Escape'){e.stopPropagation();c()}}
    document.addEventListener('keydown',k,true);ov.addEventListener('click',c);document.body.appendChild(ov)})});
  if(typeof compactRecords==='function')compactRecords();
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
