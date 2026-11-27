'use strict';
/* Registered papers: a vertical list alongside the existing timeline. */
/* 읽기 상태 필터: all(전체) | reading | skim | done */
var LIST_STATE='all';
var listSort='recent';
var LIST_STATES=[['all','전체'],['reading','읽는 중'],['skim','읽을 것'],['done','다 읽음']];
function listStateOk(p){return LIST_STATE==='all'||readingStateKey(p.state)===LIST_STATE}
function paperListItems(query){
  var q=String(query||'').trim().toLowerCase();
  var papers=S.papers.filter(function(p){return visible(p)&&listStateOk(p)&&(!q||String(p.title||'').toLowerCase().indexOf(q)>=0)});
  if(S.source==='account'&&listSort==='added')return papers; // Preserve the API's registration order.
  return papers.sort(function(a,b){
    var ar=Number.isSafeInteger(a.lastReadOrder)?a.lastReadOrder:0,br=Number.isSafeInteger(b.lastReadOrder)?b.lastReadOrder:0;
    if(listSort==='title'){
      var titleOrder=String(a.title||'').localeCompare(String(b.title||''),'ko',{numeric:true,sensitivity:'base'});
      if(titleOrder)return titleOrder;
    }else if(listSort==='added'){
      /* 추가한 날짜가 같으면 아래 공통 규칙(날짜·id)으로 */
    }else if(ar!==br){
      if(!ar)return 1;
      if(!br)return -1;
      return listSort==='oldest'?ar-br:br-ar;
    }
    var ad=String(a.date||''),bd=String(b.date||'');if(ad!==bd)return ad<bd?1:-1;
    return String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0;
  });
}
function renderPaperListRows(){
  var rows=paperListItems(S.listQuery),body=$('#paperListRows');if(!body)return;
  var f=$('#paperListState');if(f)f.innerHTML=LIST_STATES.map(function(t){var n=S.papers.filter(function(p){return visible(p)&&(t[0]==='all'||readingStateKey(p.state)===t[0])}).length;return '<button type="button" data-list-state="'+t[0]+'" aria-pressed="'+(LIST_STATE===t[0])+'">'+t[1]+' <em>'+n+'</em></button>'}).join('');
  if(!rows.length){
    var message='아직 등록한 논문이 없어요.';
    if(S.listQuery)message='검색한 제목의 논문이 없어요.';
    else if(S.filterTag!=null)message='이 태그에 등록된 논문이 없어요.';
    else if(LIST_STATE!=='all')message='이 상태의 논문이 없어요.';
    else if(S.source!=='account')message+=' 왼쪽에서 논문을 추가해 보세요.';
    body.innerHTML='<tr><td colspan="3" class="paper-list-empty">'+message+'</td></tr>';
    return;
  }
  body.innerHTML=rows.map(function(p){
    var value=p.todo?esc(p.todo):'<span class="paper-list-missing">—</span>';
    if(S.source==='account')value=esc(p.date||'날짜 미기록');
    return '<tr><td><button type="button" class="paper-list-title" data-list-paper="'+esc(p.id)+'">'+esc(p.title||'제목 미기록')+'</button></td>'+
      '<td><span class="paper-list-state '+(p.state==='reading'?'is-reading':'')+'">'+esc(p.use?.reading_state_text||readingState(p.state).t)+'</span></td>'+
      '<td class="paper-list-todo">'+value+'</td></tr>';
  }).join('');
}
/* 정렬: 최근에 연 순(기본) · 오래전에 연 순 · 최근 추가한 순 · 제목순 */
var LIST_SORTS=[['recent','최근에 연 순'],['oldest','오래전에 연 순'],['added','최근 추가한 순'],['title','제목순']];
function renderPaperList(){
  var box=$('#paperList');if(!box)return;
  box.innerHTML='<h2 class="pl-title">논문 목록</h2>'+
    '<div class="pl-bar">'+
      '<div class="pl-state" id="paperListState" role="group" aria-label="읽기 상태로 거르기"></div>'+
      '<div class="pl-tools">'+
        '<label class="pl-search"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>'+
          '<input type="search" id="paperListQuery" aria-label="논문 제목 검색" placeholder="제목 검색" value="'+esc(S.listQuery||'')+'"></label>'+
        '<select id="paperListSort" aria-label="논문 정렬">'+(S.source==='account'?LIST_SORTS.slice(2):LIST_SORTS).map(function(o){return '<option value="'+o[0]+'">'+o[1]+'</option>'}).join('')+'</select>'+
      '</div>'+
    '</div>'+
    '<table class="paper-list-table"><colgroup><col class="paper-title-column"><col class="paper-state-column"><col class="paper-action-column"></colgroup><thead><tr><th scope="col">논문 제목</th><th scope="col">읽기 상태</th><th scope="col">'+(S.source==='account'?'읽은 날짜':'다음 할 일')+'</th></tr></thead><tbody id="paperListRows"></tbody></table>';
  var sort=$('#paperListSort');
  sort.value=listSort;
  if(typeof prettySelect==='function')prettySelect(sort,'정렬');
  sort.addEventListener('change',function(){
    listSort=sort.value;
    S.listScroll=0;
    box.scrollTop=0;
    renderPaperListRows();
  });
  renderPaperListRows();box.scrollTop=S.listScroll||0;
  $('#paperListQuery').addEventListener('input',function(e){S.listQuery=e.target.value;S.listScroll=0;box.scrollTop=0;renderPaperListRows();save()});
}
function wirePaperList(){
  var box=$('#paperList'),timer;
  box.addEventListener('click',function(e){
    var filter=e.target.closest&&e.target.closest('[data-list-state]');
    if(filter){LIST_STATE=filter.dataset.listState;S.listScroll=0;box.scrollTop=0;renderPaperListRows();return}
    var paper=e.target.closest&&e.target.closest('[data-list-paper]');
    if(!paper)return;
    if(S.source==='account')onPick(paper.dataset.listPaper);
    else openReader(paper.dataset.listPaper);
  });
  box.addEventListener('scroll',function(){clearTimeout(timer);S.listScroll=box.scrollTop;timer=setTimeout(function(){if(S.view==='list'&&!S.reader)rememberTabView()},120)});
}
