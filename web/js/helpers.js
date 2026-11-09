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
  function priority(p){return p.state==='reading'?0:p.state==='skim'?1:2}
  return S.papers.filter(function(p){return p.state!=='done'&&(typeof visible!=='function'||visible(p))}).sort(function(a,b){
    var ao=Number.isSafeInteger(a.lastReadOrder)&&a.lastReadOrder>0?a.lastReadOrder:0;
    var bo=Number.isSafeInteger(b.lastReadOrder)&&b.lastReadOrder>0?b.lastReadOrder:0;
    return priority(a)-priority(b)||bo-ao||dnum(b.date)-dnum(a.date)||String(a.id).localeCompare(String(b.id));
  })[0];
}

function ago(ms){var m=Math.floor(ms/6e4);if(m<60)return m+'분';var h=Math.floor(m/60);if(h<24)return h+'시간';return Math.floor(h/24)+'일'}
function paperResumeContext(p){
  var inc=S.links.filter(function(l){return l.to===p.id})[0];
  var reason=inc?inc.reason:p.memo;
  var page=Number(p.page),knownPage=Number.isSafeInteger(page)&&page>0;
  return {pageText:knownPage?'p.'+page+'에서 멈췄어요':'읽은 위치 미기록/확인 필요',
    reasonLabel:inc?'넘어온 이유':'저장 이유',
    reasonText:typeof reason==='string'&&reason.trim()?reason:'미기록/확인 필요'};
}
function lastReadingMemo(p){
  var history=p.noteHistory||[];
  for(var i=history.length-1;i>=0;i--){
    var source=readingSource(p,history[i].source_highlight_id||'legacy-note');
    if(source&&source.text.trim())return source.text.trim();
  }
  var records=p.hl||[];
  for(var j=records.length-1;j>=0;j--){
    var text=records[j].mine;
    if(typeof text==='string'&&text.trim())return text.trim();
  }
  return typeof p.note==='string'?p.note.trim():'';
}
function renderResume(){
  var el=$('#resume');if(!el)return;
  var p=curPaper();if(!p){el.hidden=true;return}
  preparePaperHistory(p);
  el.hidden=false;
  var st=readingState(p.state),context=paperResumeContext(p);
  var inc=S.links.filter(function(l){return l.to===p.id})[0];
  var from=inc?paperBy(inc.from):null;
  var nr=S.papers.filter(function(x){return x.state==='reading'}).length;
  var gone=S.prevSeen&&Date.now()-S.prevSeen>=6e4;
  var h='<div class="rs-h"><b>지금 여기</b><span>논문 '+S.papers.length+'편'+(nr?' · 읽는 중 '+nr+'편':'')+(gone?' · 마지막 방문 '+ago(Date.now()-S.prevSeen)+' 전':'')+'</span><span class="sp"></span><button type="button" class="btn sm ghost" id="rsTog" aria-expanded="'+S.resumeOpen+'">'+(S.resumeOpen?'접기':'펼치기')+'</button></div>';
  if(S.resumeOpen){
    h+='<div class="rs-b">'+
    '<div class="rs-c"><h5>'+(p.state==='reading'?'이어 읽을 논문':p.state==='skim'?'다음에 읽을 논문':'마지막으로 읽은 논문')+'</h5>'+
      '<button type="button" class="rs-go" data-go="'+p.id+'">'+esc(p.title)+'</button>'+
      '<span class="st">'+sg(p.state)+' '+st.t+' · '+p.date+'</span>'+
      '<div class="rs-sub">'+'<b>'+context.reasonLabel+'</b> '+esc(context.reasonText)+'</div></div>'+
    '<div class="rs-c"><h5>전체 타임라인 메모 · 논문 연결 미확인</h5><textarea id="rsJudge" aria-label="전체 타임라인 메모" placeholder="미기록/확인 필요 — 이 칸은 특정 논문에 연결되지 않은 전체 메모예요">'+esc(S.judge)+'</textarea></div>'+
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
var STORE_REVISION=null;
function save(){
  rememberTabView();
  if(S.example){S.saved=false;var se=$('#saved');if(se)se.hidden=true;return false}
  var conflict=false;
  try{
    var currentRaw=localStorage.getItem(KEY),current=currentRaw?JSON.parse(currentRaw):null;
    var revision=current&&Number.isSafeInteger(current.storageRevision)?current.storageRevision:0;
    if(STORE_REVISION!==null&&currentRaw&&revision!==STORE_REVISION){conflict=true;throw new Error('STORAGE_FAILURE')}
    var nextRevision=Math.max(revision,STORE_REVISION||0)+1;
    var o={v:3,storageRevision:nextRevision,name:S.name,tags:S.tags,papers:S.papers.map(function(p){return {id:p.id,tag:p.tag,date:p.date,title:p.title,memo:p.memo,link:p.link,state:p.state==null?null:p.state,note:p.note||'',noteHistory:Array.isArray(p.noteHistory)?p.noteHistory:[],actionHistory:Array.isArray(p.actionHistory)?p.actionHistory:[],page:p.page||'',hl:p.hl||[],todo:p.todo||'',todoSrc:p.todoSrc||'',lastReadOrder:Number.isSafeInteger(p.lastReadOrder)&&p.lastReadOrder>0?p.lastReadOrder:0,total:p.total||'',abs:p.abs||'',authors:p.authors||'',year:p.year||'',pdf:!!p.pdf,fname:p.fname||'',resources:Array.isArray(p.resources)?p.resources:undefined,tut:p.tut?true:undefined}}),links:S.links,view:S.view,filterTag:S.filterTag==null?null:S.filterTag,bands:S.bands,zoom:S.zoom,why:S.why,judge:S.judge,next:S.next,resumeOpen:S.resumeOpen,scroll:S.scroll||null,bubbleDay:S.bubbleDay||'',example:S.example,reader:S.reader||null,uid:uid,seen:Date.now()};
    localStorage.setItem(KEY,JSON.stringify(o));STORE_REVISION=nextRevision;S.saved=true;
  }catch(e){S.saved=false}
  var el=$('#saved');if(el)el.hidden=!S.saved;
  var error=$('#saveError');
  if(S.saved){if(error)error.remove()}
  else{
    if(!error){error=document.createElement('div');error.id='saveError';error.className='save-error';error.setAttribute('role','alert');document.body.appendChild(error)}
    error.textContent=conflict?'다른 창에서 기록이 변경되어 이 창의 저장을 멈췄어요. 지금 입력한 내용은 복사한 뒤 새로고침해 주세요.':'이 브라우저에 저장하지 못했어요. 화면을 닫거나 새로고침하기 전에 입력 내용을 복사해 주세요.';
  }
  return S.saved;
}
function rememberNote(p, content) {
  if (!Array.isArray(p.noteHistory)) p.noteHistory=[];
  var text=String(content==null?'':content);
  var previous=p.noteHistory.filter(function(e){return !e.source_highlight_id}).slice(-1)[0];
  if (previous&&previous.content_text===text) return previous;
  if (!previous&&!text) return null;
  var entry={id:nid('rn'),content_text:text,created_at:Date.now()};
  p.noteHistory.push(entry);
  return entry;
}
function rememberReadingMemo(p,id,content){
  var source=readingSource(p,id);if(!source)return null;
  if(id==='legacy-note')return rememberNote(p,content);
  if(!Array.isArray(p.noteHistory))p.noteHistory=[];
  var text=String(content==null?'':content),previous=p.noteHistory.filter(function(e){return e.source_highlight_id===id}).slice(-1)[0];
  if(previous&&previous.content_text===text)return previous;if(!previous&&!text)return null;
  var entry={id:nid('rn'),content_text:text,source_highlight_id:id,source_page:source.page,source_kind:source.kind,created_at:Date.now()};p.noteHistory.push(entry);return entry;
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
    return '<details class="history-entry"><summary>'+(entry.source_page?'p.'+esc(entry.source_page)+' · ':'')+'메모 '+(notes.length-index)+'</summary>'+block('원문 메모',entry.content_text)+'</details>';
  }).join('');
  content+=actions.slice().reverse().map(function(entry,index){
    var title=entry.kind==='candidate'?'생성한 후보':entry.kind==='confirmed'?'확인한 다음 할 일':entry.kind==='manual'?'직접 입력한 다음 할 일':'이전 다음 할 일 · 최초 후보 미기록';
    var body='';
    if (entry.kind==='candidate'||entry.kind==='confirmed') {
      if(entry.source_highlight_id)body+=block('선택한 읽기 기록',entry.source_page?'p.'+entry.source_page:'쪽 미기록');
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
    STORE_REVISION=Number.isSafeInteger(o.storageRevision)?o.storageRevision:0;
    if(o.example){clearStore();return false}
    reset();
    uid=Math.max(uid,+o.uid||0);
    S.name=o.name||'';S.tags=o.tags||[];
    S.papers=o.papers.map(function(p){p.state=p.state==null?null:p.state;p.tag=p.tag||'';p.link=p.link||'';preparePaperHistory(p);return p});
    S.filterTag=o.filterTag===''?'':typeof o.filterTag==='string'&&S.tags.some(function(t){return t.id===o.filterTag})?o.filterTag:null;
    S.links=o.links||[];S.view=['card','dot','list'].indexOf(o.view)>=0?o.view:'card';S.bands=o.bands!==false;
    S.zoom=['week','month','all'].indexOf(o.zoom)>-1?o.zoom:'month';
    S.why=o.why===true;S.judge=o.judge||'';S.next=o.next||'';S.resumeOpen=o.resumeOpen!==false;S.example=!!o.example;S.scroll=o.scroll||null;S.bubbleDay=o.bubbleDay||'';S.reader=(o.reader&&paperBy(o.reader))?o.reader:null;
    if(S.reader&&!S.papers.some(function(p){return Number.isSafeInteger(p.lastReadOrder)&&p.lastReadOrder>0})){paperBy(S.reader).lastReadOrder=1}
    if(options&&options.restoreView){
      try{
        var tabView=typeof sessionStorage!=='undefined'?JSON.parse(sessionStorage.getItem('researchtrail.view')||'null'):null;
        if(tabView){
          S.view=['card','dot','list'].indexOf(tabView.view)>=0?tabView.view:'card';S.reader=paperBy(tabView.reader)?tabView.reader:null;
          S.sel=paperBy(tabView.sel)?tabView.sel:null;S.panel=S.sel&&tabView.panel==='detail'?'detail':'none';
          S.scroll=tabView.scroll||null;S.listQuery=String(tabView.listQuery||'');S.listScroll=Math.max(0,Number(tabView.listScroll)||0);S.overviewZoom=Math.max(1,Math.min(4,Number(tabView.overviewZoom)||1));S.overviewPan=Math.max(-.5,Math.min(.5,Number(tabView.overviewPan)||0));
          S.bubble=paperBy(tabView.bubble)?tabView.bubble:null;S.bubbleGap=tabView.bubbleGap||0;
          if(['week','month','all'].indexOf(tabView.zoom)>=0)S.zoom=tabView.zoom;
          S.filterTag=tabView.filterTag===''?'':S.tags.some(function(t){return t.id===tabView.filterTag})?tabView.filterTag:null;
        }
      }catch(e){}
      S.restoreViewOnce=true;
    }
    if(options&&options.timeline){S.reader=null;S.view='card';S.zoom='month'}
    uid=Math.max(uid,+o.uid||0);S.prevSeen=+o.seen||0;
    showMain();return true;
  }catch(e){return false}
}
function clearStore(){try{localStorage.removeItem(KEY);STORE_REVISION=null}catch(e){}}
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

function rememberTabView(){
  try{
    var embedded=typeof window!=='undefined'&&(window.name==='rt-demo'||(typeof location!=='undefined'&&/[?&]demo=1/.test(location.search)));
    if(!embedded&&typeof sessionStorage!=='undefined'){
      if($('#lp')){sessionStorage.setItem('researchtrail.screen','landing');return}
      sessionStorage.setItem('researchtrail.screen',S.example?'example':'main');
      sessionStorage.setItem('researchtrail.view',JSON.stringify({view:S.view,listQuery:S.listQuery||'',listScroll:S.listScroll||0,reader:S.reader||null,sel:S.sel||null,panel:S.panel,scroll:S.scroll||null,bubble:S.bubble||null,bubbleGap:S.bubbleGap||0,zoom:S.zoom,overviewZoom:S.overviewZoom||1,overviewPan:S.overviewPan||0,filterTag:S.filterTag==null?null:S.filterTag}));
      if(S.example)sessionStorage.setItem('researchtrail.example',JSON.stringify({name:S.name,tags:S.tags,papers:S.papers,links:S.links,view:S.view,listQuery:S.listQuery||'',listScroll:S.listScroll||0,reader:S.reader||null,sel:S.sel||null,panel:S.panel,bands:S.bands,zoom:S.zoom,overviewZoom:S.overviewZoom||1,overviewPan:S.overviewPan||0,filterTag:S.filterTag,scroll:S.scroll||null,bubble:S.bubble||null,bubbleGap:S.bubbleGap||0,judge:S.judge,next:S.next,why:S.why,uid:uid}));
    }
  }catch(e){}
}

if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('pagehide',function(){
  var sc=$('#scroller');if(sc&&!S.reader&&S.view==='card')S.scroll=timelineScrollState(sc);
  var list=$('#paperList');if(list&&!S.reader&&S.view==='list')S.listScroll=list.scrollTop;
  rememberTabView();
});
