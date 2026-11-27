'use strict';
/* Registered papers: a vertical list alongside the existing timeline. */
/* 읽기 상태 필터: all(전체) | reading | skim | done */
var LIST_STATE='all';
var listSort='recent';
var LIST_STATES=[['all','전체'],['reading','읽는 중'],['skim','읽을 것'],['done','다 읽음']];
function listStateOk(p){return LIST_STATE==='all'||readingStateKey(p.state)===LIST_STATE}
function paperListItems(query){
  var q=String(query||'').trim().toLowerCase();
  return S.papers.filter(function(p){return visible(p)&&listStateOk(p)&&(!q||String(p.title||'').toLowerCase().indexOf(q)>=0)}).slice().sort(function(a,b){
    var ar=Number.isSafeInteger(a.lastReadOrder)?a.lastReadOrder:0,br=Number.isSafeInteger(b.lastReadOrder)?b.lastReadOrder:0;
    if(listSort==='title'){
      var titleOrder=String(a.title||'').localeCompare(String(b.title||''),'ko',{numeric:true,sensitivity:'base'});
      if(titleOrder)return titleOrder;
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
  body.innerHTML=rows.length?rows.map(function(p){var st=readingState(p.state);return '<tr><td><button type="button" class="paper-list-title" data-list-paper="'+esc(p.id)+'">'+esc(p.title||'제목 미기록')+'</button></td><td><span class="paper-list-state '+(p.state==='reading'?'is-reading':'')+'">'+esc(st.t)+'</span></td><td class="paper-list-todo">'+(p.todo?esc(p.todo):'<span class="paper-list-missing">—</span>')+'</td></tr>'}).join(''):'<tr><td colspan="3" class="paper-list-empty">'+(S.listQuery?'검색한 제목의 논문이 없어요.':S.filterTag!=null?'이 태그에 등록된 논문이 없어요.':LIST_STATE!=='all'?'이 상태의 논문이 없어요.':'아직 등록한 논문이 없어요. 왼쪽에서 논문을 추가해 보세요.')+'</td></tr>';
}
function renderPaperList(){
  var box=$('#paperList');if(!box)return;
  box.innerHTML='<div class="paper-list-toolbar"><h2>논문 목록</h2>'+
    '<div class="paper-list-controls"><input type="search" id="paperListQuery" aria-label="논문 제목 검색" placeholder="논문 제목 검색" value="'+esc(S.listQuery||'')+'">'+
    '<select id="paperListSort" aria-label="논문 정렬"><option value="recent">최근에 연 순</option><option value="oldest">오래전에 연 순</option><option value="title">제목순</option></select></div></div>'+
    '<div class="pl-state" id="paperListState" role="group" aria-label="읽기 상태로 거르기"></div><table class="paper-list-table"><colgroup><col class="paper-title-column"><col class="paper-state-column"><col class="paper-action-column"></colgroup><thead><tr><th scope="col">논문 제목</th><th scope="col">읽기 상태</th><th scope="col">다음 할 일</th></tr></thead><tbody id="paperListRows"></tbody></table>';
  var sort=$('#paperListSort');
  sort.value=listSort;
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
  box.addEventListener('click',function(e){var f=e.target.closest&&e.target.closest('[data-list-state]');if(f){LIST_STATE=f.dataset.listState;S.listScroll=0;box.scrollTop=0;renderPaperListRows();return}var b=e.target.closest&&e.target.closest('[data-list-paper]');if(b)openReader(b.dataset.listPaper)});
  box.addEventListener('scroll',function(){clearTimeout(timer);S.listScroll=box.scrollTop;timer=setTimeout(function(){if(S.view==='list'&&!S.reader)rememberTabView()},120)});
}
