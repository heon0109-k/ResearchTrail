'use strict';
/* ---------- 다음 작업 후보 (메모 → 후보 → 수정/확인/취소) ----------
   규칙: 후보는 사용자가 "확인"을 눌러야만 p.todo로 저장된다. 취소하면 메모만 남는다. */
var NA={pid:null,st:'idle',cand:'',src:'',saveError:'',requestId:null,noteText:null,recordId:null,originalCandidate:null,candidateId:null,confirmationId:null,sourceId:null,sourcePage:null};
// This flag only remembers the demo notice; it is not consent to future external AI processing.
function naConsent(){try{return localStorage.getItem('researchtrail.consent')==='1'}catch(e){return false}}
function naDraftKey(p){return 'researchtrail.action-draft.'+(S.example?'example.':'main.')+p.id}
function naDraftStorage(){
  // Demo data remains tab-local; personal drafts survive closing a tab.
  if(!S.example&&typeof localStorage!=='undefined')return localStorage;
  return typeof sessionStorage!=='undefined'?sessionStorage:null;
}
function naStoreDraft(p){
  if(NA.pid!==p.id||NA.st!=='cand')return;
  try{
    var storage=naDraftStorage();if(!storage)throw new Error('STORAGE_FAILURE');
    if(!S.example&&typeof STORE_REVISION!=='undefined'&&STORE_REVISION!==null&&typeof KEY!=='undefined'){
      var current=JSON.parse(storage.getItem(KEY)||'null');
      if(current&&current.storageRevision!==STORE_REVISION)throw new Error('STORAGE_FAILURE');
    }
    storage.setItem(naDraftKey(p),JSON.stringify({candidateId:NA.candidateId,sourceId:NA.sourceId,cand:NA.cand,previousDraft:NA.previousDraft||null}));
    NA.draftError=false;
  }catch(e){NA.draftError=true}
}
function naDropDraft(p){
  try{var storage=naDraftStorage();if(storage)storage.removeItem(naDraftKey(p))}catch(e){}
  try{if(typeof sessionStorage!=='undefined')sessionStorage.removeItem(naDraftKey(p))}catch(e){}
}
function naRestoreDraft(p){
  try{
    var storage=naDraftStorage();if(!storage)return false;
    var raw=storage.getItem(naDraftKey(p));
    // Recover edits made before persistent drafts were introduced, too.
    if(!raw&&!S.example&&typeof sessionStorage!=='undefined')raw=sessionStorage.getItem(naDraftKey(p));
    var draft=JSON.parse(raw||'null');if(!draft)return false;
    var event=(p.actionHistory||[]).find(function(e){return e.kind==='candidate'&&e.id===draft.candidateId});
    var source=draft.sourceId?(typeof readingSource==='function'&&readingSource(p,draft.sourceId)):true;
    if(!event||!source||typeof draft.cand!=='string'||(event.source_highlight_id||null)!==(draft.sourceId||null)||(p.actionHistory||[]).some(function(e){return e.kind==='confirmed'&&e.candidate_id===event.id})){naDropDraft(p);return false}
    NA.previousDraft=draft.previousDraft||null;NA.pid=p.id;NA.st='cand';NA.cand=draft.cand;NA.sourceId=draft.sourceId||null;NA.sourcePage=event.source_page||null;
    NA.noteText=event.source_note;NA.recordId=event.source_record_id;NA.originalCandidate=event.original_candidate;NA.candidateId=event.id;
    NA.src=event.original_output&&event.original_output.source||'';NA.requestId=null;NA.confirmationId=null;NA.saveError='';NA.draftError=false;
    return true;
  }catch(e){return false}
}
function naInit(p){
  if(NA.pid!==p.id){
    NA.previousDraft=null;NA.pid=p.id;NA.st='idle';NA.cand='';NA.src='';NA.saveError='';NA.requestId=null;NA.noteText=null;NA.recordId=null;NA.originalCandidate=null;NA.candidateId=null;NA.confirmationId=null;NA.sourceId=null;NA.sourcePage=null;NA.draftError=false;
    if(naRestoreDraft(p)&&typeof RR!=='undefined'){
      RR.pid=p.id;RR.selected=NA.sourceId;
      if(typeof drawHlList==='function')drawHlList();
    }
  }
  naRender(p);
  var t=$('#rTodo');if(t)t.addEventListener('input',function(){naRender(p,true)});
}
function naChooseSource(p,id){
  if(NA.pid===p.id&&NA.sourceId&&!naInput(p))naDropDraft(p);
  NA.pid=p.id;NA.sourceId=id;NA.sourcePage=null;NA.st='idle';NA.cand='';NA.src='';NA.saveError='';NA.requestId=null;NA.noteText=null;NA.recordId=null;NA.originalCandidate=null;NA.candidateId=null;NA.confirmationId=null;naRender(p);
}
function naInput(p){
  if(NA.sourceId)return typeof readingSource==='function'?readingSource(p,NA.sourceId):null;
  return {id:null,text:String(p.note||''),page:null,kind:'note'};
}
function naSourceFields(){return NA.sourceId?{source_highlight_id:NA.sourceId,source_page:NA.sourcePage}:{};}
function naFocusTodo(){var t=$('#rTodo');if(t)t.focus()}
function naRender(p,keep){
  var box=$('#naBox');if(!box)return;
  naStoreDraft(p);
  var unified=typeof RR!=='undefined'&&RR.pid===p.id;
  var saved=$('#rTodoSaved');if(saved)saved.hidden=false;
  box.hidden=unified&&NA.st==='idle';if(box.hidden)return;
  var h='<div class="na-h"><b>'+(NA.st==='cand'?'확정 전 초안':unified?'저장 전 제안':'이어서 할 일, 이건 어때요?')+'</b><span class="na-badge" title="메모는 외부로 전송되지 않아요">규칙 기반</span></div>';
  if(NA.st==='idle'){
    var cur=p.todo?('<div class="na-cur"><span class="k">'+(S.saved?'저장된 다음 할 일':'현재 다음 할 일')+'</span> '+esc(p.todo)+(p.todoSrc?' <em>'+(!S.saved?'· 저장 상태 확인 필요':(p.todoSrc==='confirmed'?'· 후보를 확인해 저장함':'· 직접 입력'))+'</em>':'')+'</div>'):'<div class="na-cur none"><span class="k">저장된 다음 할 일</span> 아직 기록 없음</div>';
    h+=cur+'<p class="na-s">실제 AI 대신 메모의 표현을 규칙으로 찾아 다음 할 일 한 가지를 제안해요. 확인하기 전에는 저장되지 않아요.</p><button type="button" class="btn" id="naMake">다음 할 일 찾기 →</button>';
  }else if(NA.st==='consent'){
    h+='<p class="na-s"><b>메모에서 다음 할 일을 찾아볼까요?</b><br>규칙 기반 예시 기능이며 메모는 외부로 전송되지 않아요. 제안된 내용을 확인한 뒤 저장하거나 직접 입력할 수 있어요.</p><div class="na-row"><button type="button" class="btn pri" id="naYes">다음 할 일 찾기</button><button type="button" class="btn" id="naNo">직접 입력할게요</button></div>';
  }else if(NA.st==='loading'){
    h+='<p class="na-s" role="status">메모에서 다음 할 일을 찾는 중…</p>';
  }else if(NA.st==='cand'){
    var current=naInput(p);
    if(NA.noteText!==null&&(!current||NA.noteText!==current.text))h+='<p class="na-s warn">이 제안은 현재 메모가 아닌 생성 요청 당시 메모를 기준으로 만들었어요.</p><button type="button" class="btn sm" id="naRefresh">수정한 메모로 다시 찾기</button>';
    h+='<p class="na-s" id="naDraftStatus" role="status">'+naDraftStatus()+'</p>';
    if(NA.sourceId)h+='<p class="na-s">'+(NA.sourcePage?'p.'+esc(NA.sourcePage)+' 메모에서 찾았어요':'선택한 메모에서 찾았어요')+'</p>';
    if(NA.saveError)h+='<p class="na-s warn" role="alert">'+esc(NA.saveError)+'</p>';
    h+='<div class="na-cmp">'+(unified?'':'<div><span class="k">내 메모에서</span><div class="na-q">'+esc(NA.src)+'</div></div>')+'<label><span class="k">다음에 할 일 (고쳐도 돼요)</span>'+(NA.sourceId?'<textarea id="naCand" rows="2">'+esc(NA.cand)+'</textarea>':'<input type="text" id="naCand" value="'+esc(NA.cand)+'">')+'</label></div>'+
      '<div class="na-row"><button type="button" class="btn pri" id="naOk">'+(NA.saveError?'다시 저장':NA.sourceId?'다음 할 일로 저장':'확인하고 저장')+'</button><button type="button" class="btn" id="naCancel">취소</button></div>';
  }else if(NA.st==='unclear'){
    h+='<p class="na-s warn" role="status">메모에서 다음 할 일을 분명하게 찾지 못했어요. 메모는 그대로 남겨 뒀어요. "다음에 할 일"에 직접 적어 주세요.</p><button type="button" class="btn" id="naBack">닫기</button>';
  }else if(NA.st==='fail'){
    h+='<p class="na-s warn" role="alert">다음 할 일을 찾지 못했어요. 메모는 그대로 남아 있어요. "다음에 할 일"에 직접 적어 주세요.</p><div class="na-row"><button type="button" class="btn" id="naRetry">다시 시도</button><button type="button" class="btn" id="naBack">닫기</button></div>';
  }else if(NA.st==='empty'){
    h+='<p class="na-s warn" role="status">선택한 기록의 메모에 다음에 할 일을 짧게 적어 주세요. 먼저 메모를 남겨 주세요.</p><button type="button" class="btn" id="naBack">닫기</button>';
  }
  if(NA.previousDraft&&NA.st!=='loading')h+='<button type="button" class="btn sm" id="naPrevious">이전 초안으로 돌아가기</button>';
  box.innerHTML=h;
  var g=function(id,fn){var e=$('#'+id);if(e)e.addEventListener('click',fn)};
  g('naPrevious',function(){naRestorePrevious(p)});
  g('naMake',function(){naStart(p)});
  g('naYes',function(){try{localStorage.setItem('researchtrail.consent','1')}catch(e){}naRun(p)});
  g('naNo',function(){NA.st='idle';naRender(p);naFocusTodo()});
  g('naRetry',function(){naRun(p)});
  g('naRefresh',function(){naStart(p)});
  g('naBack',function(){NA.st='idle';naRender(p);naFocusTodo()});
  g('naCancel',function(){naDropDraft(p);NA.previousDraft=null;NA.st='idle';NA.cand='';NA.saveError='';naRender(p)});
  g('naOk',function(){
    if(NA.pid!==p.id||NA.st!=='cand')return;
    if(NA.sourceId&&!naInput(p)){NA.st='idle';naRender(p);return}
    var v=($('#naCand').value||'').trim();
    if(!v){$('#naCand').focus();return}
    NA.cand=v;
    var oldTodo=p.todo,oldSource=p.todoSrc;
    if(!NA.confirmationId)NA.confirmationId=nid('cf');
    if(!Array.isArray(p.actionHistory))p.actionHistory=[];
    var oldHistoryLength=p.actionHistory.length;
    rememberAction(p,Object.assign({id:NA.confirmationId,kind:'confirmed',candidate_id:NA.candidateId,source_record_id:NA.recordId,source_note:NA.noteText,original_candidate:NA.originalCandidate,final_action:v},naSourceFields()));
    p.todo=v;p.todoSrc='confirmed';
    if(!save()&&!S.example){
      p.todo=oldTodo;p.todoSrc=oldSource;p.actionHistory.length=oldHistoryLength;
      NA.saveError='다음 할 일을 저장하지 못했어요. 입력한 내용을 보관하고 있으니 다시 저장해 주세요.';
      naRender(p);return;
    }
    naDropDraft(p);NA.previousDraft=null;NA.saveError='';NA.st='idle';
    var t=$('#rTodo');if(t){t.value=v;if(typeof resizeReaderTodo==='function')resizeReaderTodo()}
    naRender(p);renderHistory(p);
  });
  var ci=$('#naCand');if(ci){ci.addEventListener('input',function(){NA.cand=ci.value;naStoreDraft(p);var status=$('#naDraftStatus');if(status)status.textContent=naDraftStatus()});if(!keep)ci.focus()}
}
function naRestorePrevious(p){
  if(!NA.previousDraft)return;
  try{
    var storage=naDraftStorage();if(!storage)throw new Error('STORAGE_FAILURE');
    storage.setItem(naDraftKey(p),JSON.stringify(NA.previousDraft));
    if(naRestoreDraft(p))naRender(p);
  }catch(e){NA.draftError=true;naRender(p,true)}
}
function naDraftStatus(){
  if(NA.draftError)return '초안을 보관하지 못했어요. 화면을 닫기 전에 편집 내용을 복사해 주세요.';
  return (S.example?'예시의 초안은 이 탭에만 임시 보관돼요.':'초안은 이 브라우저에 보관돼요. 탭을 닫아도 이 논문을 열면 이어서 편집할 수 있어요.')+' 확인·저장 전에는 기존 다음 할 일을 바꾸지 않아요.';
}
function naStart(p){
  if(NA.st==='loading')return Promise.resolve();
  NA.saveError='';
  var input=naInput(p);
  if(!input||!input.text.trim()){NA.st='empty';naRender(p);return}
  return naRun(p);
}
function naRun(p){
  var input=naInput(p);if(!input||!input.text.trim()){NA.st='empty';naRender(p);return Promise.resolve()}
  if(NA.st==='cand'){
    naStoreDraft(p);
    if(NA.draftError&&NA.cand!==NA.originalCandidate){naRender(p,true);return Promise.resolve()}
    NA.previousDraft={candidateId:NA.candidateId,sourceId:NA.sourceId,cand:NA.cand};
  }
  NA.st='loading';
  var pid=p.id,memo=input.text,record=NA.sourceId?rememberReadingMemo(p,NA.sourceId,memo):rememberNote(p,memo),requestId=nid('rq');
  NA.sourcePage=input.page;
  NA.requestId=requestId;NA.noteText=memo;NA.recordId=record?record.id:null;
  NA.originalCandidate=null;NA.candidateId=null;NA.confirmationId=null;
  save();naRender(p);renderHistory(p);
  return aiSuggest(memo).then(function(r){
    if(NA.pid!==pid||NA.requestId!==requestId||NA.st!=='loading')return;
    var cp=paperBy(pid);if(!cp)return;
    if(NA.sourceId&&!naInput(cp)){NA.st='idle';naRender(cp);return}
    if(!r||!r.ok)NA.st='fail';
    else if(!r.action)NA.st='unclear';
    else{
      NA.st='cand';NA.cand=r.action;NA.src=r.source;NA.originalCandidate=r.action;
      var event=rememberAction(cp,Object.assign({kind:'candidate',source_record_id:NA.recordId,source_note:memo,original_candidate:r.action,original_output:{ok:r.ok,action:r.action,source:r.source}},naSourceFields()));
      NA.candidateId=event.id;save();
    }
    if($('#naBox'))naRender(cp);
    renderHistory(cp);
  }).catch(function(){
    if(NA.pid!==pid||NA.requestId!==requestId||NA.st!=='loading')return;
    NA.st='fail';var cp=paperBy(pid);if(cp&&$('#naBox'))naRender(cp);
  });
}

/* ---------- 이어 읽기 줄: 타임라인 위에 항상 보이는 한 줄 카드 ---------- */
function renderRbar(){
  var el=$('#rbar');if(!el)return;
  var p=S.papers.length?curPaper():null;
  var on=p&&!p.tut&&(p.state==='reading'||p.state==='skim'||p.page||p.todo)&&!S.reader&&!S.bubble;
  el.hidden=!on;if(!on){el.innerHTML='';return}
  var todo=p.todo||'';
  var page=Number.isSafeInteger(+p.page)&&+p.page>0?+p.page:null;
  el.innerHTML='<span class="rb-k">'+(p.state==='skim'?'다음에 읽을 논문':'이어 읽기')+'</span><button type="button" class="rb-t" id="rbSel" title="'+esc(p.title)+'">'+esc(p.title)+'</button>'+
    (page?'<span class="rb-c" title="'+page+'쪽에서 멈췄어요">'+page+(+p.total>0?' / '+esc(p.total):'')+'쪽</span>':'')+
    (todo?'<div class="rb-n" title="'+esc(todo)+'"><em>다음 할 일</em><span>'+esc(todo)+'</span></div>':'')+
    '<button type="button" class="btn pri sm" id="rbGo2">'+(p.state==='skim'?'읽기 시작':'이어 읽기')+'</button>';
  $('#rbGo2').addEventListener('click',function(){openReader(p.id)});
  $('#rbSel').addEventListener('click',function(){select(p.id)});
}
