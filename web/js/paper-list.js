'use strict';
/* Registered papers: a vertical list alongside the existing timeline. */
function paperListItems(query){
  var q=String(query||'').trim().toLowerCase();
  return S.papers.filter(function(p){return visible(p)&&(!q||String(p.title||'').toLowerCase().indexOf(q)>=0)}).slice().sort(function(a,b){
    var ar=Number.isSafeInteger(a.lastReadOrder)?a.lastReadOrder:0,br=Number.isSafeInteger(b.lastReadOrder)?b.lastReadOrder:0;
    if(ar!==br)return br-ar;
    var ad=String(a.date||''),bd=String(b.date||'');if(ad!==bd)return ad<bd?1:-1;
    return String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0;
  });
}
function renderPaperListRows(){
  var rows=paperListItems(S.listQuery),body=$('#paperListRows');if(!body)return;
  $('#paperListCount').textContent=rows.length+'편 · 최근 열람순';
  body.innerHTML=rows.length?rows.map(function(p){var st=readingState(p.state);return '<tr><td><button type="button" class="paper-list-title" data-list-paper="'+esc(p.id)+'">'+esc(p.title||'제목 미기록')+'</button></td><td><span class="paper-list-state '+(p.state==='reading'?'is-reading':'')+'">'+esc(st.t)+'</span></td><td class="paper-list-todo">'+(p.todo?esc(p.todo):'<span class="paper-list-missing">—</span>')+'</td></tr>'}).join(''):'<tr><td colspan="3" class="paper-list-empty">'+(S.listQuery?'검색한 제목의 논문이 없어요.':S.filterTag!=null?'이 태그에 등록된 논문이 없어요.':'아직 등록한 논문이 없어요. 왼쪽에서 논문을 추가해 보세요.')+'</td></tr>';
}
function renderPaperList(){
  var box=$('#paperList');if(!box)return;
  box.innerHTML='<div class="paper-list-toolbar"><div><h2>논문 목록</h2><span id="paperListCount" title="최근 열람 기록이 없으면 날짜순으로 표시합니다"></span></div><input type="search" id="paperListQuery" aria-label="논문 제목 검색" placeholder="논문 제목 검색" value="'+esc(S.listQuery||'')+'"></div><table class="paper-list-table"><colgroup><col style="width:52%"><col style="width:16%"><col style="width:32%"></colgroup><thead><tr><th scope="col">논문 제목</th><th scope="col">읽기 상태</th><th scope="col">다음 할 일</th></tr></thead><tbody id="paperListRows"></tbody></table>';
  renderPaperListRows();box.scrollTop=S.listScroll||0;
  $('#paperListQuery').addEventListener('input',function(e){S.listQuery=e.target.value;S.listScroll=0;box.scrollTop=0;renderPaperListRows();save()});
}
function wirePaperList(){
  var box=$('#paperList'),timer;
  box.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-list-paper]');if(b)openReader(b.dataset.listPaper)});
  box.addEventListener('scroll',function(){clearTimeout(timer);S.listScroll=box.scrollTop;timer=setTimeout(function(){if(S.view==='list'&&!S.reader)rememberTabView()},120)});
}
