'use strict';
/* ---------- reader ---------- */
var RD={id:null,url:null};
var RR={pid:null,selected:null};
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
  var bundled=typeof samplePdfUrl==='function'?samplePdfUrl(p):null;
  if(bundled){
    box.innerHTML='<div class="rdempty">예시 PDF 불러오는 중…</div>';
    openPv(p,{url:bundled},page).catch(function(){if(RD.id!==p.id)return;frame(bundled);toast('기본 PDF 뷰어로 열었어요. 형광펜 기능을 쓰려면 인터넷 연결을 확인하고 다시 열어 주세요.')});
    return;
  }
  var pu=pdfUrlOf(p.link);
  if(pu){
    box.innerHTML='<div class="rdempty">원문 불러오는 중…</div>';
    openPv(p,{url:pu},page).catch(function(){if(RD.id!==p.id)return;frame(pu);toast('arXiv 원문은 형광펜 없이 열려요. PDF를 내려받아 올리면 형광펜을 쓸 수 있어요')});
    return;
  }
  if(p.link){
    var safeLink=safeExternalUrl(p.link);
    if(!safeLink){box.innerHTML='<div class="rdempty"><b>안전하지 않거나 올바르지 않은 링크예요.</b><span>논문 상세 화면에서 http 또는 https 링크로 수정해 주세요.</span>'+pickHtml()+'</div>';wirePick(p);return}
    box.innerHTML='<div class="rdempty"><b>이 링크는 여기서 바로 열 수 없어요.</b><span>'+esc(short(p.link,70))+'</span><a class="btn pri" href="'+esc(safeLink)+'" target="_blank" rel="noopener">새 탭에서 읽기</a><span>읽다가 돌아와서 메모를 적으면 돼요. PDF를 올리면 여기서 바로 읽을 수 있어요.</span>'+pickHtml()+'</div>';wirePick(p);return}
  box.innerHTML='<div class="rdempty"><b>아직 원문이 없어요.</b><span>링크를 붙이거나 PDF를 올리면 여기서 바로 읽어요.</span><div class="srcrow"><input type="text" id="rdLk" placeholder="arXiv·DOI 링크"><button type="button" class="btn" id="rdLkOk">저장</button></div>'+pickHtml()+'</div>';
  wirePick(p);
  var ok=$('#rdLkOk');if(ok)ok.addEventListener('click',function(){var input=$('#rdLk'),v=input.value.trim();if(!v)return;var r=parseRef(v);if(r.type==='invalid'){input.setCustomValidity('올바른 http 또는 https 링크를 입력해 주세요.');input.reportValidity();return}input.setCustomValidity('');p.link=r.type==='url'?r.url:r.link;if(r.type!=='url'&&!p.title)fetchMeta(r).then(function(m){p.title=m.title}).catch(function(){});save();readerSrc(p,p.page);renderRNotes()});
}
function pickHtml(){return '<label class="filebtn"><input type="file" id="rdFile" accept="application/pdf,.pdf" hidden><span class="btn">PDF 파일 올리기</span></label>'}
function wirePick(p){
  var f=$('#rdFile');if(!f)return;
  f.addEventListener('change',function(e){var file=e.target.files[0];if(!file)return;
    f.disabled=true;
    attachPaperPdf(p,file).then(function(){
      save();
      if(typeof scanPaperResources==='function')scanPaperResources(p,file);
      if(S.reader===p.id){readerSrc(p,p.page);renderRNotes()}
    }).catch(function(){
      var box=$('#rdsrc');if(S.reader===p.id&&box){var error=document.createElement('p');error.setAttribute('role','alert');error.textContent='PDF를 저장하지 못했어요. 기존 첨부와 메모는 유지했으니 다시 선택해 주세요.';box.appendChild(error)}
    }).finally(function(){f.disabled=false;f.value=''})});
}
function renderReader(){
  var p=paperBy(S.reader),el=$('#reader');
  if(RD.id===p.id&&el.firstChild)return;
  RD.id=p.id;
  el.innerHTML='<div class="rdbar"><button type="button" class="btn sm" id="rdBack">← '+(S.view==='list'?'논문 목록':'타임라인')+'</button><div class="rdt" id="rdTitle"></div><span class="sp"></span>'+
    '<a class="btn sm" id="rdOpen" target="_blank" rel="noopener" hidden>새 탭에서 열기</a>'+
    '<span class="rdtog1">'+togHtml()+'</span></div>'+
    '<div class="rdbody"><div class="rdsrc" id="rdsrc"></div><aside class="rdnotes" id="rdnotes"></aside></div>';
  $('#rdBack').addEventListener('click',closeReader);
  applyNotes(p);
  el.onclick=function(e){var t=e.target.closest&&e.target.closest('[data-tog]');if(!t)return;NOTES_OPEN=!NOTES_OPEN;try{localStorage.setItem('researchtrail.notes',NOTES_OPEN?'1':'0')}catch(x){}applyNotes();if(PV){setTimeout(function(){var cur=PV.cur;buildPages(p);pvGo(cur,true)},60)}};
  readerSrc(p,p.page);renderRNotes();
}
function resizeReaderTodo(){
  var t=$('#rTodo');if(!t||!t.style)return;
  t.style.height='auto';t.style.height=Math.max(66,t.scrollHeight+2)+'px';
}
function readingSource(p,id){
  if(id==='legacy-note')return {id:id,text:String(p.note||''),page:null,kind:'note'};
  var h=(p.hl||[]).find(function(h){return h.id===id});
  return h?{id:h.id,text:String(h.mine||''),page:Number.isSafeInteger(+h.page)&&+h.page>0?+h.page:null,kind:h.img?'capture':h.type==='note'?'note':'highlight'}:null;
}
function chooseReadingRecord(p,id){
  if(!readingSource(p,id))return;
  if(RR.pid!==p.id||RR.selected!==id){RR.pid=p.id;RR.selected=id;naChooseSource(p,id)}
  $$('.reading-card',$('#rRecords')).forEach(function(card){card.classList.toggle('is-selected',card.dataset.rid===id)});
}
function clearReadingSelection(p){RR.selected=null;naChooseSource(p,null)}
function legacyReadingRecordHtml(p){
  if(!p.note&&!(p.noteHistory||[]).some(function(e){return !e.source_highlight_id}))return '';
  return '<div class="reading-card legacy-reading-card'+(RR.selected==='legacy-note'?' is-selected':'')+'" data-rid="legacy-note" tabindex="0" aria-label="논문 메모 선택"><div class="hl-top"><b class="record-title">논문 메모</b><span class="record-selected">선택한 기록</span><button type="button" class="hl-copy" id="rLegacyCopy" aria-label="AI에게 물어볼 질문 복사" title="AI에게 물어볼 질문 복사">⧉</button></div><textarea id="rNote" rows="2" aria-label="읽기 기록 메모" placeholder="메모를 남겨 보세요">'+esc(p.note||'')+'</textarea><button type="button" class="record-candidate" data-record-candidate="legacy-note">다음 할 일 찾기 →</button></div>';
}
function wireReadingRecords(p){
  var box=$('#rRecords');
  function select(e){var card=e.target.closest&&e.target.closest('[data-rid]');if(!card)return;
    if(e.target.closest('button,a,summary')&&!e.target.closest('.hgo'))return;chooseReadingRecord(p,card.dataset.rid)}
  box.addEventListener('click',select);box.addEventListener('focusin',select);
  box.addEventListener('keydown',function(e){if(e.target.matches('[data-rid]')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();chooseReadingRecord(p,e.target.dataset.rid)}});
  box.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-record-candidate]');if(!b)return;chooseReadingRecord(p,b.dataset.recordCandidate);naStart(p);var panel=$('#naBox');if(panel&&!panel.hidden&&panel.scrollIntoView)panel.scrollIntoView({block:'nearest'})});
  $('#rAddNote').addEventListener('click',function(){
    var page=typeof PV!=='undefined'&&PV&&PV.pid===p.id?PV.cur:(+p.page>0?+p.page:null);
    var h={id:nid('h'),type:'note',page:page,text:'',mine:'',rects:[]};p.hl=p.hl||[];p.hl.push(h);save();drawHlList();chooseReadingRecord(p,h.id);
    var field=$('[data-hm="'+h.id+'"]',box);if(field)field.focus();
  });
  var copy=$('#rLegacyCopy');if(copy)copy.addEventListener('click',function(){copyText(highlightQuestion(p,{type:'note',page:null,text:'',mine:p.note||''}),function(ok){toast(ok?'질문을 복사했어요. 원하는 챗봇에 붙여넣어 주세요.':'복사하지 못했어요. 브라우저 권한을 확인해 주세요.')})});
}
function renderRNotes(){
  var p=paperBy(S.reader),el=$('#rdnotes');if(!p||!el)return;
  preparePaperHistory(p);
  if(RR.pid!==p.id){RR.pid=p.id;RR.selected=null}
  if(RR.selected&&!readingSource(p,RR.selected))RR.selected=null;
  $('#rdTitle').textContent=p.title;
  var op=$('#rdOpen');var ou=p.pdf?'':((typeof samplePdfUrl==='function'&&samplePdfUrl(p))||pdfUrlOf(p.link)||safeExternalUrl(p.link));op.hidden=!ou;if(ou)op.href=ou;else op.removeAttribute('href');
  var outs=S.links.filter(function(l){return l.from===p.id}),ins=S.links.filter(function(l){return l.to===p.id});
  function li(l,dir){var o=paperBy(dir==='out'?l.to:l.from);if(!o)return '';return '<li><span class="arr">'+(dir==='out'?'→':'←')+'</span><button type="button" class="go" data-go="'+o.id+'">'+esc(short(o.title,44))+'</button>'+(l.reason?'<span class="why">'+esc(l.reason)+'</span>':'')+'<button type="button" class="x" data-del="'+l.id+'" aria-label="연결 삭제">×</button></li>'}
  var others=S.papers.filter(function(x){return x.id!==p.id}).sort(function(a,b){return dnum(b.date)-dnum(a.date)});
  var meta=[p.authors?esc(short(p.authors,60)):'',p.year||''].filter(Boolean).join(' · ');
  el.innerHTML=
   (meta?'<div class="rmeta">'+meta+'</div>':'')+
   '<section class="reader-section reader-resume" aria-label="이어 읽기"><h3>이어 읽기</h3><label class="field"><span>읽은 정도</span><select id="rState">'+stateOpts(p.state)+'</select></label>'+
   '<div class="two"><label class="field"><span>읽던 쪽 (자동 기록)</span><input type="number" min="1" id="rPage" value="'+esc(p.page)+'" placeholder="예: 7"></label><div class="field"><span>&nbsp;</span><button type="button" class="btn" id="rGo">이 쪽으로 이동</button></div></div>'+
   '</section><section class="reader-section reader-records" aria-label="읽기 기록"><div class="records-heading"><h3>읽기 기록</h3><button type="button" class="record-add" id="rAddNote">+ 메모 추가</button></div><p class="reader-hint">문장이나 캡처에 짧게 메모를 남겨요. 메모 아래의 "다음 할 일 찾기"를 누르면 그 메모에서 후보를 찾아요.</p><div id="rRecords">'+legacyReadingRecordHtml(p)+'<div id="rHl"></div></div></section>'+
   '<section class="reader-section reader-next" aria-label="다음에 할 일"><h3>다음에 할 일</h3><div id="rTodoSaved"><label class="field"><span class="sr-only">저장된 다음에 할 일</span><textarea id="rTodo" rows="2" placeholder="아직 정하지 않았어요. 직접 적어도 돼요.">'+esc(p.todo||'')+'</textarea></label><p class="reader-hint">다시 돌아오면 여기서 이어가요. 직접 고쳐 적어도 돼요.</p></div><div class="na" id="naBox" hidden></div></section><section id="rHistory" aria-label="기록 이력"></section>'+
   (typeof paperResourcesHtml==='function'&&(p.pdf||(p.resources||[]).length||(typeof samplePdfUrl==='function'&&samplePdfUrl(p)))?paperResourcesHtml('rResources'):'')+
   '<details class="reader-extra"><summary>저장 이유</summary><label class="field"><span class="sr-only">저장 이유</span><textarea id="rMemo" rows="2">'+esc(p.memo)+'</textarea></label></details>'+
   (p.abs?'<details class="rabs"><summary>초록 보기</summary><p>'+esc(p.abs)+'</p></details>':'')+
   '<div><h4>이어진 논문</h4>'+((outs.length||ins.length)?'<ul class="lklist">'+outs.map(function(l){return li(l,'out')}).join('')+ins.map(function(l){return li(l,'in')}).join('')+'</ul>':'<p class="empty">아직 없어요. 읽다가 이어서 본 논문을 연결해 두세요.</p>')+
     (others.length?'<div class="rlk"><select id="rLkTo" aria-label="이어진 논문"><option value="">이 논문에서 이어서 본 논문…</option>'+others.map(function(o){return '<option value="'+o.id+'">'+esc(short(o.title,46))+'</option>'}).join('')+'</select><input type="text" id="rLkWhy" placeholder="왜 이어서 봤나요?"><button type="button" class="btn" id="rLkOk">연결</button><p class="empty" id="rLkErr" style="color:var(--c3)" hidden></p></div>':'')+'</div>'+
   (typeof sampleSourceHtml==='function'?sampleSourceHtml(p):'')+
   '<div class="rfoot"><button type="button" class="btn pri" id="rDone">다 읽었어요</button></div>';
  $('#rState').addEventListener('change',function(e){p.state=e.target.value||null;save()});
  $('#rPage').addEventListener('change',function(e){p.page=e.target.value;save()});
  $('#rGo').addEventListener('click',function(){p.page=$('#rPage').value;save();if(PV)pvGo(+p.page,true);else readerSrc(p,p.page)});
  drawHlList();wireReadingRecords(p);
  $('#rMemo').addEventListener('input',function(e){p.memo=e.target.value;save()});
  resizeReaderTodo();
  $('#rTodo').addEventListener('input',function(e){resizeReaderTodo();p.todo=e.target.value;p.todoSrc='manual';save()});
  var editingNote=false,noteField=$('#rNote');
  if(noteField){noteField.addEventListener('input',function(e){
    if(!editingNote){rememberNote(p,p.note||'');editingNote=true}
    p.note=e.target.value;save();if(NA.pid===p.id&&NA.st==='cand')naRender(p,true);
  });
  noteField.addEventListener('change',function(){rememberNote(p,p.note||'');editingNote=false;save();renderHistory(p);if(NA.pid===p.id&&NA.st==='cand')naRender(p,true)})}
  $('#rTodo').addEventListener('change',function(){rememberManualTodo(p);save();renderHistory(p)});
  naInit(p);renderHistory(p);
  if(typeof wirePaperResources==='function')wirePaperResources($('#rResources'),p);
  $$('[data-go]',el).forEach(function(b){b.addEventListener('click',function(){openReader(b.dataset.go)})});
  $$('[data-del]',el).forEach(function(b){b.addEventListener('click',function(){ask('이 연결을 삭제할까요?','연결 이유도 함께 사라져요.','삭제',function(){S.links=S.links.filter(function(l){return l.id!==b.dataset.del});save();renderRNotes()},true)})});
  var ok=$('#rLkOk');if(ok)ok.addEventListener('click',function(){
    var to=$('#rLkTo').value,er=$('#rLkErr');if(!to){er.hidden=false;er.textContent='이어서 본 논문을 골라 주세요.';return}
    var e=linkError(p.id,to);if(e){er.hidden=false;er.textContent=e;return}
    S.links.push({id:nid('l'),from:p.id,to:to,reason:$('#rLkWhy').value.trim()});save();renderRNotes();
  });
  $('#rDone').addEventListener('click',function(){p.state='done';var next=curPaper();if(next)S.sel=next.id;closeReader()});
}
