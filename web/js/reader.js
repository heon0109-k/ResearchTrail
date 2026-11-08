'use strict';
/* ---------- reader ---------- */
var RD={id:null,url:null};
var NOTES_OPEN=true;try{NOTES_OPEN=localStorage.getItem('researchtrail.notes')!=='0'}catch(e){}
function togHtml(){return '<button type="button" class="icbtn" data-tog="1" aria-label="메모 패널 접기/펴기"></button>'}
function applyNotes(){var r=$('#reader');if(!r)return;r.classList.toggle('notes-closed',!NOTES_OPEN);
  var d=NOTES_OPEN?'M5 4l6 6-6 6M11 4l6 6-6 6':'M15 4l-6 6 6 6M9 4l-6 6 6 6';
  $$('[data-tog]',r).forEach(function(b){b.setAttribute('aria-pressed',NOTES_OPEN);b.setAttribute('aria-expanded',NOTES_OPEN);
    b.innerHTML='<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="'+d+'"/></svg>';
    b.title=NOTES_OPEN?'메모 패널 접기':'메모 패널 펴기'})}
function openReader(id){S.bubble=null;
  var p=paperBy(id);if(!p)return;
  if(p.state==='skim')p.state='reading';
  p.lastReadOrder=S.papers.reduce(function(order,item){return Number.isSafeInteger(item.lastReadOrder)&&item.lastReadOrder>order?item.lastReadOrder:order},0)+1;
  S.reader=id;S.sel=id;S.panel='none';S.linking=null;renderAll();if(typeof renderRbar==='function')renderRbar();
}
function closeReader(){S.reader=null;renderAll();if(S.sel)ensureVisible(S.sel)}
function readerSrc(p,page){
  var box=$('#rdsrc');if(!box)return;
  var hash=page?'#page='+(+page||1):'';
  function frame(u){
    box.innerHTML='<iframe class="rdframe" title="논문 원문" src="'+esc(u+hash)+'"></iframe>';
  }
  if(RD.url){try{URL.revokeObjectURL(RD.url)}catch(e){}RD.url=null}
  killPv();$('#reader').classList.remove('has-pv');
  if(p.pdf){
    box.innerHTML='<div class="rdempty">PDF 불러오는 중…</div>';
    idbGet(p.id).then(function(b){
      if(RD.id!==p.id)return;
      if(!b){box.innerHTML='<div class="rdempty"><b>저장된 PDF를 찾지 못했어요.</b><span>다른 브라우저에서 열었거나 저장소가 비워졌을 수 있어요. 아래에서 다시 올려 주세요.</span>'+pickHtml()+'</div>';wirePick(p);return}
      b.arrayBuffer().then(function(buf){return openPv(p,{data:buf},page)}).catch(function(){RD.url=URL.createObjectURL(b);frame(RD.url);toast('이 PDF는 형광펜 없이 기본 뷰어로 열었어요')});
    });return;
  }
  var pu=pdfUrlOf(p.link);
  if(pu){
    box.innerHTML='<div class="rdempty">원문 불러오는 중…</div>';
    openPv(p,{url:pu},page).catch(function(){if(RD.id!==p.id)return;frame(pu);toast('arXiv 원문은 형광펜 없이 열려요. PDF를 내려받아 올리면 형광펜을 쓸 수 있어요')});
    return;
  }
  if(p.link){
    box.innerHTML='<div class="rdempty"><b>이 링크는 여기서 바로 열 수 없어요.</b><span>'+esc(short(p.link,70))+'</span><a class="btn pri" href="'+esc(p.link)+'" target="_blank" rel="noopener">새 탭에서 읽기</a><span>읽다가 돌아와서 메모를 적으면 돼요. PDF를 올리면 여기서 바로 읽을 수 있어요.</span>'+pickHtml()+'</div>';wirePick(p);return}
  box.innerHTML='<div class="rdempty"><b>아직 원문이 없어요.</b><span>링크를 붙이거나 PDF를 올리면 여기서 바로 읽어요.</span><div class="srcrow"><input type="text" id="rdLk" placeholder="arXiv·DOI 링크"><button type="button" class="btn" id="rdLkOk">저장</button></div>'+pickHtml()+'</div>';
  wirePick(p);
  var ok=$('#rdLkOk');if(ok)ok.addEventListener('click',function(){var v=$('#rdLk').value.trim();if(!v)return;var r=parseRef(v);p.link=r.type==='url'?r.url:r.link;if(r.type!=='url'&&!p.title)fetchMeta(r).then(function(m){p.title=m.title}).catch(function(){});save();readerSrc(p,p.page);renderRNotes()});
}
function pickHtml(){return '<label class="filebtn"><input type="file" id="rdFile" accept="application/pdf,.pdf" hidden><span class="btn">PDF 파일 올리기</span></label>'}
function wirePick(p){
  var f=$('#rdFile');if(!f)return;
  f.addEventListener('change',function(e){var file=e.target.files[0];if(!file)return;
    p.pdf=true;p.fname=file.name;idbPut(p.id,file).then(function(){save();readerSrc(p,p.page);renderRNotes()})});
}
function renderReader(){
  var p=paperBy(S.reader),el=$('#reader');
  if(RD.id===p.id&&el.firstChild)return;
  RD.id=p.id;
  el.innerHTML='<div class="rdbar"><button type="button" class="btn sm" id="rdBack">← 타임라인</button><div class="rdt" id="rdTitle"></div><span class="sp"></span>'+
    '<a class="btn sm" id="rdOpen" target="_blank" rel="noopener" hidden>새 탭에서 열기</a>'+
    '<span class="rdtog1">'+togHtml()+'</span></div>'+
    '<div class="rdbody"><div class="rdsrc" id="rdsrc"></div><aside class="rdnotes" id="rdnotes"></aside></div>';
  $('#rdBack').addEventListener('click',closeReader);
  applyNotes(p);
  el.onclick=function(e){var t=e.target.closest&&e.target.closest('[data-tog]');if(!t)return;NOTES_OPEN=!NOTES_OPEN;try{localStorage.setItem('researchtrail.notes',NOTES_OPEN?'1':'0')}catch(x){}applyNotes();if(PV){setTimeout(function(){var cur=PV.cur;buildPages(p);pvGo(cur,true)},60)}};
  readerSrc(p,p.page);renderRNotes();
}
function renderRNotes(){
  var p=paperBy(S.reader),el=$('#rdnotes');if(!p||!el)return;
  preparePaperHistory(p);
  $('#rdTitle').textContent=p.title;
  var op=$('#rdOpen');var ou=p.pdf?'':(pdfUrlOf(p.link)||p.link);op.hidden=!ou;if(ou)op.href=ou;
  var outs=S.links.filter(function(l){return l.from===p.id}),ins=S.links.filter(function(l){return l.to===p.id});
  function li(l,dir){var o=paperBy(dir==='out'?l.to:l.from);if(!o)return '';return '<li><span class="arr">'+(dir==='out'?'→':'←')+'</span><button type="button" class="go" data-go="'+o.id+'">'+esc(short(o.title,44))+'</button>'+(l.reason?'<span class="why">'+esc(l.reason)+'</span>':'')+'<button type="button" class="x" data-del="'+l.id+'" aria-label="연결 삭제">×</button></li>'}
  var others=S.papers.filter(function(x){return x.id!==p.id}).sort(function(a,b){return dnum(b.date)-dnum(a.date)});
  var meta=[p.authors?esc(short(p.authors,60)):'',p.year||''].filter(Boolean).join(' · ');
  el.innerHTML=
   (meta?'<div class="rmeta">'+meta+'</div>':'')+
   '<label class="field"><span>읽은 정도</span><select id="rState">'+stateOpts(p.state)+'</select></label>'+
   '<div class="two"><label class="field"><span>읽던 쪽 (자동 기록)</span><input type="number" min="1" id="rPage" value="'+esc(p.page)+'" placeholder="예: 7"></label><div class="field"><span>&nbsp;</span><button type="button" class="btn" id="rGo">이 쪽으로 이동</button></div></div>'+
   '<label class="field"><span>다음에 할 일 <em class="opt">(다시 오면 알려줘요)</em></span><input type="text" id="rTodo" value="'+esc(p.todo||'')+'" placeholder="예: Table 2에서 비용·성능 비교 확인하기"></label>'+
   '<label class="field"><span>저장 이유</span><textarea id="rMemo" rows="2">'+esc(p.memo)+'</textarea></label>'+
   '<label class="field"><span>읽으면서 메모</span><textarea id="rNote" class="big" rows="7" placeholder="핵심 주장, 헷갈린 부분, 다음에 확인할 것…">'+esc(p.note||'')+'</textarea></label>'+
   '<div class="na" id="naBox"></div><section id="rHistory" aria-label="기록 이력"></section>'+
   '<div><h4>하이라이트</h4><div id="rHl"></div></div>'+
   (p.abs?'<details class="rabs"><summary>초록 보기</summary><p>'+esc(p.abs)+'</p></details>':'')+
   '<div><h4>이어진 논문</h4>'+((outs.length||ins.length)?'<ul class="lklist">'+outs.map(function(l){return li(l,'out')}).join('')+ins.map(function(l){return li(l,'in')}).join('')+'</ul>':'<p class="empty">아직 없어요. 읽다가 이어서 본 논문을 연결해 두세요.</p>')+
     (others.length?'<div class="rlk"><select id="rLkTo" aria-label="이어진 논문"><option value="">이 논문에서 이어서 본 논문…</option>'+others.map(function(o){return '<option value="'+o.id+'">'+esc(short(o.title,46))+'</option>'}).join('')+'</select><input type="text" id="rLkWhy" placeholder="왜 이어서 봤나요?"><button type="button" class="btn" id="rLkOk">연결</button><p class="empty" id="rLkErr" style="color:var(--c3)" hidden></p></div>':'')+'</div>'+
   '<div class="rfoot"><button type="button" class="btn pri" id="rDone">다 읽었어요</button></div>';
  $('#rState').addEventListener('change',function(e){p.state=e.target.value||null;save()});
  $('#rPage').addEventListener('change',function(e){p.page=e.target.value;save()});
  $('#rGo').addEventListener('click',function(){p.page=$('#rPage').value;save();if(PV)pvGo(+p.page,true);else readerSrc(p,p.page)});
  drawHlList();
  $('#rMemo').addEventListener('input',function(e){p.memo=e.target.value;save()});
  $('#rTodo').addEventListener('input',function(e){p.todo=e.target.value;p.todoSrc='manual';save()});
  var editingNote=false;
  $('#rNote').addEventListener('input',function(e){
    if(!editingNote){rememberNote(p,p.note||'');editingNote=true}
    p.note=e.target.value;save();
  });
  $('#rNote').addEventListener('change',function(){
    rememberNote(p,p.note||'');editingNote=false;save();renderHistory(p);
    if(NA.pid===p.id&&NA.st==='cand')naRender(p,true);
  });
  $('#rTodo').addEventListener('change',function(){rememberManualTodo(p);save();renderHistory(p)});
  naInit(p);renderHistory(p);
  $$('[data-go]',el).forEach(function(b){b.addEventListener('click',function(){openReader(b.dataset.go)})});
  $$('[data-del]',el).forEach(function(b){b.addEventListener('click',function(){ask('이 연결을 삭제할까요?','연결 이유도 함께 사라져요.','삭제',function(){S.links=S.links.filter(function(l){return l.id!==b.dataset.del});save();renderRNotes()},true)})});
  var ok=$('#rLkOk');if(ok)ok.addEventListener('click',function(){
    var to=$('#rLkTo').value,er=$('#rLkErr');if(!to){er.hidden=false;er.textContent='이어서 본 논문을 골라 주세요.';return}
    var e=linkError(p.id,to);if(e){er.hidden=false;er.textContent=e;return}
    S.links.push({id:nid('l'),from:p.id,to:to,reason:$('#rLkWhy').value.trim()});save();renderRNotes();
  });
  $('#rDone').addEventListener('click',function(){p.state='done';closeReader()});
}
