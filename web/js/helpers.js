'use strict';
/* ---------- helpers: link rules, resume, storage, dialog ---------- */
function linkError(a,b){
  if(a===b)return '같은 논문끼리는 연결할 수 없어요.';
  var rev=S.links.filter(function(l){return l.from===b&&l.to===a})[0];
  if(rev)return '이미 반대 방향으로 연결돼 있어요. 한 방향만 남길 수 있어요.';
  var seen={},st=[b];
  while(st.length){var x=st.pop();if(x===a)return '이어 가면 처음 논문으로 돌아오는 원이 돼요. 탐색 경로는 한 방향으로만 이어 주세요.';if(seen[x])continue;seen[x]=1;S.links.forEach(function(l){if(l.from===x)st.push(l.to)})}
  return '';
}
function curPaper(){
  var opened=S.papers.filter(function(p){return Number.isSafeInteger(p.lastReadOrder)&&p.lastReadOrder>0});
  opened.sort(function(a,b){return b.lastReadOrder-a.lastReadOrder||String(a.id).localeCompare(String(b.id))});
  if(opened.length)return opened[0];
  var ps=S.papers.slice().sort(function(a,b){return dnum(b.date)-dnum(a.date)||S.papers.indexOf(b)-S.papers.indexOf(a)});
  return ps.filter(function(p){return p.state==='reading'})[0]||ps[0];
}
function ago(ms){var m=Math.floor(ms/6e4);if(m<60)return m+'분';var h=Math.floor(m/60);if(h<24)return h+'시간';return Math.floor(h/24)+'일'}
function renderResume(){
  var el=$('#resume');if(!el)return;
  var p=curPaper();if(!p){el.hidden=true;return}
  preparePaperHistory(p);
  el.hidden=false;
  var st=STATES[p.state||'skim'];
  var inc=S.links.filter(function(l){return l.to===p.id})[0];
  var from=inc?paperBy(inc.from):null;
  var nr=S.papers.filter(function(x){return x.state==='reading'}).length;
  var gone=S.prevSeen&&Date.now()-S.prevSeen>=6e4;
  var h='<div class="rs-h"><b>지금 여기</b><span>논문 '+S.papers.length+'편'+(nr?' · 읽는 중 '+nr+'편':'')+(gone?' · 마지막 방문 '+ago(Date.now()-S.prevSeen)+' 전':'')+'</span><span class="sp"></span><button type="button" class="btn sm ghost" id="rsTog" aria-expanded="'+S.resumeOpen+'">'+(S.resumeOpen?'접기':'펼치기')+'</button></div>';
  if(S.resumeOpen){
    h+='<div class="rs-b">'+
    '<div class="rs-c"><h5>'+(p.state==='reading'?'이어 읽을 논문':'마지막으로 읽은 논문')+'</h5>'+
      '<button type="button" class="rs-go" data-go="'+p.id+'">'+esc(p.title)+'</button>'+
      '<span class="st">'+sg(p.state)+' '+st.t+' · '+p.date+'</span>'+
      '<div class="rs-sub">'+(inc?'<b>넘어온 이유</b> '+esc(inc.reason||'미기록/확인 필요'):'<b>저장 이유</b> '+esc(p.memo))+'</div></div>'+
    '<div class="rs-c"><h5>마지막 판단 · 남은 질문</h5><textarea id="rsJudge" aria-label="마지막 판단 또는 남은 질문" placeholder="미기록/확인 필요 — 마지막으로 내린 판단이나 아직 남은 질문을 남겨요">'+esc(S.judge)+'</textarea></div>'+
    '<div class="rs-c"><h5>다음 할 일 (한 가지)</h5><textarea id="rsNext" aria-label="다음 할 일" placeholder="미기록/확인 필요 — 돌아오면 가장 먼저 할 일 하나">'+esc(p.todo||'')+'</textarea>'+((S.next&&S.next!==p.todo)?'<div class="rs-sub"><b>이전 전체 메모 · 논문 연결 미확인</b> '+esc(S.next)+'</div>':'')+'</div></div>';
  }
  el.innerHTML=h;
  $('#rsTog').addEventListener('click',function(){S.resumeOpen=!S.resumeOpen;renderAll()});
  var g=$('.rs-go',el);if(g)g.addEventListener('click',function(){select(g.dataset.go)});
  var j=$('#rsJudge'),n=$('#rsNext');
  if(j)j.addEventListener('input',function(){S.judge=j.value;save()});
  if(n){n.addEventListener('input',function(){p.todo=n.value;p.todoSrc='manual';save();renderRbar()});n.addEventListener('change',function(){rememberManualTodo(p);save()})}
}
var KEY='researchtrail.v5';
function save(){
  if(S.example){S.saved=false;var se=$('#saved');if(se)se.hidden=true;return false}
  try{
    var o={v:3,name:S.name,tags:S.tags,papers:S.papers.map(function(p){return {id:p.id,tag:p.tag,date:p.date,title:p.title,memo:p.memo,link:p.link,state:p.state||'skim',note:p.note||'',noteHistory:Array.isArray(p.noteHistory)?p.noteHistory:[],actionHistory:Array.isArray(p.actionHistory)?p.actionHistory:[],page:p.page||'',hl:p.hl||[],todo:p.todo||'',todoSrc:p.todoSrc||'',lastReadOrder:Number.isSafeInteger(p.lastReadOrder)&&p.lastReadOrder>0?p.lastReadOrder:0,total:p.total||'',abs:p.abs||'',authors:p.authors||'',year:p.year||'',pdf:!!p.pdf,fname:p.fname||'',tut:p.tut?true:undefined}}),links:S.links,view:S.view,bands:S.bands,zoom:S.zoom,why:S.why,judge:S.judge,next:S.next,resumeOpen:S.resumeOpen,scroll:S.scroll||null,bubbleDay:S.bubbleDay||'',example:S.example,reader:S.reader||null,uid:uid,seen:Date.now()};
    localStorage.setItem(KEY,JSON.stringify(o));S.saved=true;
  }catch(e){S.saved=false}
  var el=$('#saved');if(el)el.hidden=!S.saved;
  var error=$('#saveError');
  if(S.saved){if(error)error.remove()}
  else{
    if(!error){error=document.createElement('div');error.id='saveError';error.className='save-error';error.setAttribute('role','alert');document.body.appendChild(error)}
    error.textContent='이 브라우저에 저장하지 못했어요. 화면을 닫거나 새로고침하기 전에 입력 내용을 복사해 주세요.';
  }
  return S.saved;
}
function rememberNote(p, content) {
  if (!Array.isArray(p.noteHistory)) p.noteHistory=[];
  var text=String(content==null?'':content);
  var previous=p.noteHistory[p.noteHistory.length-1];
  if (previous&&previous.content_text===text) return previous;
  if (!previous&&!text) return null;
  var entry={id:nid('rn'),content_text:text,created_at:Date.now()};
  p.noteHistory.push(entry);
  return entry;
}
function rememberAction(p, fields) {
  if (!Array.isArray(p.actionHistory)) p.actionHistory=[];
  if (fields.id) {
    var existing=p.actionHistory.find(function(entry){return entry.id===fields.id});
    if (existing) return existing;
  }
  var entry=Object.assign({id:fields.id||nid('ah'),created_at:Date.now()},fields);
  p.actionHistory.push(entry);
  return entry;
}
function rememberManualTodo(p, kind) {
  if (!Array.isArray(p.actionHistory)) p.actionHistory=[];
  var previous=p.actionHistory.filter(function(entry){return Object.prototype.hasOwnProperty.call(entry,'final_action')}).slice(-1)[0];
  var value=p.todo||'';
  if (previous&&previous.final_action===value) return previous;
  if (!previous&&!value) return null;
  var fields={kind:kind||'manual',final_action:value};
  if (kind==='legacy') {fields.created_at=null;fields.imported_at=Date.now()}
  return rememberAction(p,fields);
}
function preparePaperHistory(p) {
  rememberNote(p,p.note||'');
  rememberManualTodo(p,'legacy');
}
function renderHistory(p) {
  var box=$('#rHistory');
  if (!box) return;
  var notes=Array.isArray(p.noteHistory)?p.noteHistory:[];
  var actions=Array.isArray(p.actionHistory)?p.actionHistory:[];
  function block(label,value) {
    return '<div class="history-label">'+esc(label)+'</div><pre class="history-text">'+esc(value==null?'미기록':value||'(빈 내용)')+'</pre>';
  }
  var content=notes.slice().reverse().map(function(entry,index){
    return '<details class="history-entry"><summary>메모 '+(notes.length-index)+'</summary>'+block('원문 메모',entry.content_text)+'</details>';
  }).join('');
  content+=actions.slice().reverse().map(function(entry,index){
    var title=entry.kind==='candidate'?'생성한 후보':entry.kind==='confirmed'?'확인한 다음 할 일':entry.kind==='manual'?'직접 입력한 다음 할 일':'이전 다음 할 일 · 최초 후보 미기록';
    var body='';
    if (entry.kind==='candidate'||entry.kind==='confirmed') {
      body+=block('요청 당시 원문 메모',entry.source_note)+block('최초 후보',entry.original_candidate);
    }
    if (Object.prototype.hasOwnProperty.call(entry,'final_action')) body+=block('저장한 최종 내용',entry.final_action);
    return '<details class="history-entry"><summary>'+esc(title)+' '+(actions.length-index)+'</summary>'+body+'</details>';
  }).join('');
  box.innerHTML='<details class="history-list"><summary>기록 이력 ('+(notes.length+actions.length)+')</summary>'+(content||'<p class="empty">아직 기록 이력이 없어요.</p>')+'</details>';
}

function load(options){
  try{
    var raw=localStorage.getItem(KEY);if(!raw)return false;
    var o=JSON.parse(raw);if(!o||!Array.isArray(o.papers))return false;
    if(o.example){clearStore();return false}
    reset();
    uid=Math.max(uid,+o.uid||0);
    S.name=o.name||'';S.tags=o.tags||[];
    S.papers=o.papers.map(function(p){p.state=STATES[p.state]?p.state:'skim';p.tag=p.tag||'';p.link=p.link||'';preparePaperHistory(p);return p});
    S.links=o.links||[];S.view=o.view==='dot'?'dot':'card';S.bands=o.bands!==false;
    S.zoom=['week','month','quarter','all'].indexOf(o.zoom)>-1?o.zoom:'month';
    S.why=o.why===true;S.judge=o.judge||'';S.next=o.next||'';S.resumeOpen=o.resumeOpen!==false;S.example=!!o.example;S.scroll=o.scroll||null;S.bubbleDay=o.bubbleDay||'';S.reader=(o.reader&&paperBy(o.reader))?o.reader:null;
    if(S.reader&&!S.papers.some(function(p){return Number.isSafeInteger(p.lastReadOrder)&&p.lastReadOrder>0})){paperBy(S.reader).lastReadOrder=1}
    if(options&&options.timeline){S.reader=null;S.view='card'}
    uid=Math.max(uid,+o.uid||0);S.prevSeen=+o.seen||0;
    showMain();return true;
  }catch(e){return false}
}
function clearStore(){try{localStorage.removeItem(KEY)}catch(e){}}
function ask(title,body,okLabel,onOk,danger){
  var ov=document.createElement('div');ov.className='ov';
  ov.innerHTML='<div class="dlg" role="alertdialog" aria-modal="true" aria-labelledby="dgT"><h3 id="dgT">'+esc(title)+'</h3><p>'+esc(body)+'</p><div class="dact"><button type="button" class="btn" id="dgNo">취소</button><button type="button" class="btn '+(danger?'dng':'pri')+'" id="dgOk">'+esc(okLabel)+'</button></div></div>';
  var prev=document.activeElement;
  var no=$('#dgNo',ov),ok=$('#dgOk',ov);
  function close(){document.removeEventListener('keydown',kd,true);ov.remove();if(prev&&prev.focus&&document.contains(prev))prev.focus()}
  function kd(e){
    if(e.key==='Escape'){e.stopPropagation();close()}
    else if(e.key==='Tab'){
      if(e.shiftKey&&document.activeElement===no){e.preventDefault();ok.focus()}
      else if(!e.shiftKey&&document.activeElement===ok){e.preventDefault();no.focus()}
    }
  }
  document.addEventListener('keydown',kd,true);
  no.addEventListener('click',close);
  ok.addEventListener('click',function(){close();onOk()});
  ov.addEventListener('mousedown',function(e){if(e.target===ov)close()});
  document.body.appendChild(ov);no.focus();
}
