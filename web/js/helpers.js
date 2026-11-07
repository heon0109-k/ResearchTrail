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
  var ps=S.papers.slice().sort(function(a,b){return dnum(b.date)-dnum(a.date)||S.papers.indexOf(b)-S.papers.indexOf(a)});
  return ps.filter(function(p){return p.state==='reading'})[0]||ps[0];
}
function ago(ms){var m=Math.floor(ms/6e4);if(m<60)return m+'분';var h=Math.floor(m/60);if(h<24)return h+'시간';return Math.floor(h/24)+'일'}
function renderResume(){
  var el=$('#resume');if(!el)return;
  var p=curPaper();if(!p){el.hidden=true;return}
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
    '<div class="rs-c"><h5>다음 할 일 (한 가지)</h5><textarea id="rsNext" aria-label="다음 할 일" placeholder="미기록/확인 필요 — 돌아오면 가장 먼저 할 일 하나">'+esc(S.next)+'</textarea></div></div>';
  }
  el.innerHTML=h;
  $('#rsTog').addEventListener('click',function(){S.resumeOpen=!S.resumeOpen;renderAll()});
  var g=$('.rs-go',el);if(g)g.addEventListener('click',function(){select(g.dataset.go)});
  var j=$('#rsJudge'),n=$('#rsNext');
  if(j)j.addEventListener('input',function(){S.judge=j.value;save()});
  if(n)n.addEventListener('input',function(){S.next=n.value;save()});
}
var KEY='researchtrail.v5';
function save(){
  if(S.example){S.saved=false;var se=$('#saved');if(se)se.hidden=true;return}
  try{
    var o={v:3,name:S.name,tags:S.tags,papers:S.papers.map(function(p){return {id:p.id,tag:p.tag,date:p.date,title:p.title,memo:p.memo,link:p.link,state:p.state||'skim',note:p.note||'',page:p.page||'',hl:p.hl||[],todo:p.todo||'',todoSrc:p.todoSrc||'',total:p.total||'',abs:p.abs||'',authors:p.authors||'',year:p.year||'',pdf:!!p.pdf,fname:p.fname||'',tut:p.tut?true:undefined}}),links:S.links,view:S.view,bands:S.bands,zoom:S.zoom,why:S.why,judge:S.judge,next:S.next,resumeOpen:S.resumeOpen,scroll:S.scroll||null,bubbleDay:S.bubbleDay||'',example:S.example,reader:S.reader||null,uid:uid,seen:Date.now()};
    localStorage.setItem(KEY,JSON.stringify(o));S.saved=true;
  }catch(e){S.saved=false}
  var el=$('#saved');if(el)el.hidden=!S.saved;
}
function load(){
  try{
    var raw=localStorage.getItem(KEY);if(!raw)return false;
    var o=JSON.parse(raw);if(!o||!o.papers||!o.papers.length)return false;
    if(o.example){clearStore();return false}
    reset();
    S.name=o.name||'';S.tags=o.tags||[];
    S.papers=o.papers.map(function(p){p.state=STATES[p.state]?p.state:'skim';p.tag=p.tag||'';p.link=p.link||'';return p});
    S.links=o.links||[];S.view=o.view==='dot'?'dot':'card';S.bands=o.bands!==false;
    S.zoom=['week','month','quarter','all'].indexOf(o.zoom)>-1?o.zoom:'month';
    S.why=o.why===true;S.judge=o.judge||'';S.next=o.next||'';S.resumeOpen=o.resumeOpen!==false;S.example=!!o.example;S.scroll=o.scroll||null;S.bubbleDay=o.bubbleDay||'';S.reader=(o.reader&&paperBy(o.reader))?o.reader:null;
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
