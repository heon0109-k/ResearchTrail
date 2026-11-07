'use strict';
/* ---------- 다음 작업 후보 (메모 → 후보 → 수정/확인/취소) ----------
   규칙: 후보는 사용자가 "확인"을 눌러야만 p.todo로 저장된다. 취소하면 메모만 남는다. */
var NA={pid:null,st:'idle',cand:'',src:''};
function naConsent(){try{return localStorage.getItem('researchtrail.consent')==='1'}catch(e){return false}}
function naInit(p){
  if(NA.pid!==p.id){NA.pid=p.id;NA.st='idle';NA.cand='';NA.src=''}
  naRender(p);
  var t=$('#rTodo');if(t)t.addEventListener('input',function(){p.todoSrc='manual';naRender(p,true)});
}
function naFocusTodo(){var t=$('#rTodo');if(t)t.focus()}
function naRender(p,keep){
  var box=$('#naBox');if(!box)return;
  var h='<div class="na-h"><b>다음 작업 후보</b><span class="na-badge">예시 응답</span></div>';
  if(NA.st==='idle'){
    var cur=p.todo?('<div class="na-cur"><span class="k">저장된 다음 할 일</span> '+esc(p.todo)+(p.todoSrc?' <em>'+(p.todoSrc==='confirmed'?'· 후보를 확인해 저장함':'· 직접 입력')+'</em>':'')+'</div>'):'<div class="na-cur none"><span class="k">저장된 다음 할 일</span> 아직 기록 없음</div>';
    h+=cur+'<p class="na-s">위의 "읽으면서 메모"에서 다음 할 일 한 가지를 찾아 제안해요. 확인하기 전에는 저장되지 않아요.</p><button type="button" class="btn" id="naMake">메모로 후보 만들기</button>';
  }else if(NA.st==='consent'){
    h+='<p class="na-s"><b>이 메모를 AI에 보내도 될까요?</b><br>지금은 저장된 예시 응답을 쓰기 때문에 실제로 밖으로 나가지 않아요. 동의하지 않으면 직접 적을 수 있어요.</p><div class="na-row"><button type="button" class="btn pri" id="naYes">동의하고 만들기</button><button type="button" class="btn" id="naNo">직접 입력할게요</button></div>';
  }else if(NA.st==='loading'){
    h+='<p class="na-s" role="status">후보를 만드는 중…</p>';
  }else if(NA.st==='cand'){
    h+='<div class="na-cmp"><div><span class="k">내 메모에서</span><div class="na-q">'+esc(NA.src)+'</div></div><label><span class="k">후보 (고쳐도 돼요)</span><input type="text" id="naCand" value="'+esc(NA.cand)+'"></label></div>'+
      '<div class="na-row"><button type="button" class="btn pri" id="naOk">확인하고 저장</button><button type="button" class="btn" id="naCancel">취소</button></div><p class="na-s">취소하면 메모만 남고 다음 할 일은 바뀌지 않아요.</p>';
  }else if(NA.st==='unclear'){
    h+='<p class="na-s warn" role="status">메모에서 다음 할 일을 분명하게 찾지 못했어요. 메모는 그대로 남겨 뒀어요. 위의 "다음에 할 일"에 직접 적어 주세요.</p><button type="button" class="btn" id="naBack">닫기</button>';
  }else if(NA.st==='fail'){
    h+='<p class="na-s warn" role="alert">후보를 불러오지 못했어요. 메모는 그대로 남아 있어요. 위의 "다음에 할 일"에 직접 적어 주세요.</p><div class="na-row"><button type="button" class="btn" id="naRetry">다시 시도</button><button type="button" class="btn" id="naBack">닫기</button></div>';
  }else if(NA.st==='empty'){
    h+='<p class="na-s warn" role="status">먼저 "읽으면서 메모"에 적어 주세요. 메모가 있어야 후보를 만들 수 있어요.</p><button type="button" class="btn" id="naBack">닫기</button>';
  }
  box.innerHTML=h;
  var g=function(id,fn){var e=$('#'+id);if(e)e.addEventListener('click',fn)};
  g('naMake',function(){naStart(p)});
  g('naYes',function(){try{localStorage.setItem('researchtrail.consent','1')}catch(e){}naRun(p)});
  g('naNo',function(){NA.st='idle';naRender(p);naFocusTodo()});
  g('naRetry',function(){naRun(p)});
  g('naBack',function(){NA.st='idle';naRender(p);naFocusTodo()});
  g('naCancel',function(){NA.st='idle';NA.cand='';naRender(p)});
  g('naOk',function(){
    var v=($('#naCand').value||'').trim();
    if(!v){$('#naCand').focus();return}
    p.todo=v;p.todoSrc='confirmed';save();NA.st='idle';
    var t=$('#rTodo');if(t)t.value=v;
    naRender(p);
  });
  var ci=$('#naCand');if(ci){ci.addEventListener('input',function(){NA.cand=ci.value});if(!keep)ci.focus()}
}
function naStart(p){
  if(!(p.note||'').trim()){NA.st='empty';naRender(p);return}
  if(!naConsent()){NA.st='consent';naRender(p);return}
  naRun(p);
}
function naRun(p){
  NA.st='loading';naRender(p);
  var pid=p.id;
  aiSuggest(p.note).then(function(r){
    if(NA.pid!==pid||NA.st!=='loading')return;
    if(!r||!r.ok)NA.st='fail';
    else if(!r.action)NA.st='unclear';
    else{NA.st='cand';NA.cand=r.action;NA.src=r.source}
    var cp=paperBy(pid);if(cp&&$('#naBox'))naRender(cp);
  });
}

/* ---------- 이어 읽기 줄: 타임라인 위에 항상 보이는 한 줄 카드 ---------- */
function renderRbar(){
  var el=$('#rbar');if(!el)return;
  var p=S.papers.length?curPaper():null;
  var on=p&&!p.tut&&(p.state==='reading'||p.page||p.todo)&&!S.reader&&!S.bubble;
  el.hidden=!on;if(!on){el.innerHTML='';return}
  var todo=p.todo||'';
  el.innerHTML='<span class="rb-k">이어 읽기</span><button type="button" class="rb-t" id="rbSel" title="카드로 이동">'+esc(short(p.title,60))+'</button>'+
    (p.page?'<span class="rb-c">p.'+esc(p.page)+(p.total?' / '+esc(p.total):'')+'에서 멈춤</span>':'')+
    (function(){var k=(p.hl||[]).filter(function(h){return h.stuck&&!h.solved}).length;return k?'<span class="rb-c stk-c">막힌 곳 '+k+'</span>':''})()+(todo?'<span class="rb-n"><em>다음 할 일</em> '+esc(short(todo,48))+'</span>':'')+
    '<span class="sp"></span><button type="button" class="btn pri sm" id="rbGo2">이어 읽기</button>';
  $('#rbGo2').addEventListener('click',function(){openReader(p.id)});
  $('#rbSel').addEventListener('click',function(){select(p.id)});
}
