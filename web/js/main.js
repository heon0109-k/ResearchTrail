'use strict';
function startResearchTrail(){
  if(typeof S!=='undefined' && S.source==='account'){
    app.textContent=window.parent===window?'로그인 후 계정 프로젝트에서 타임라인을 열어 주세요.':'계정 프로젝트를 여는 중…';
    return;
  }
  /* ?demo=1 : 시작 페이지 안에 끼워 넣는 미리보기. 저장된 기록을 읽지도 쓰지도 않고 예시만 보여 준다 */
  if(window.name==='rt-demo'||/[?&]demo=1/.test(location.search)){document.documentElement.classList.add('demo');loadSample();S.zoom='month';S.bubble=null;renderAll();lockDemo()}
  else if(!(isPageReload()&&restoreSessionScreen())&&!load({timeline:!isPageReload(),restoreView:isPageReload()})){
    var seenLanding=landingSeen();
    landingMark();
    if(seenLanding)startEmpty();else showLanding();
  }
}

/* 시작 페이지의 미리보기는 타임라인을 보여 주기만 한다: 누르기·더블클릭·오른쪽 클릭·키 입력으로 열거나 고치는 동작을 모두 막고, 스크롤만 남긴다. */
function lockDemo(){
  if(!document.addEventListener)return;
  function stop(e){e.preventDefault();e.stopPropagation()}
  ['click','dblclick','contextmenu','auxclick','dragstart','submit'].forEach(function(t){document.addEventListener(t,stop,true)});
  document.addEventListener('keydown',function(e){if(/^(Enter| |Delete|Backspace)$/.test(e.key))stop(e)},true);
}

function isPageReload(){try{return window.name==='rt-local-reload'||performance.getEntriesByType('navigation')[0].type==='reload'}catch(e){return false}}

function restoreSessionScreen(){
  try{
    var screen=sessionStorage.getItem('researchtrail.screen');
    if(screen==='landing'){showLanding();return true}
    if(screen!=='example')return false;
    var state=JSON.parse(sessionStorage.getItem('researchtrail.example')||'null');
    if(!state||!Array.isArray(state.papers)||!Array.isArray(state.tags))return false;
    RET=hasMine();reset();
    ['name','tags','papers','links','view','listQuery','listScroll','reader','sel','panel','bands','zoom','overviewZoom','overviewPan','filterTag','scroll','bubble','bubbleGap','judge','next','why'].forEach(function(k){if(Object.prototype.hasOwnProperty.call(state,k))S[k]=state[k]});
    if(['week','month','all'].indexOf(S.zoom)<0)S.zoom='month';
    S.example=true;S.restoreViewOnce=true;uid=Math.max(uid,+state.uid||0);showMain();return true;
  }catch(e){return false}
}

var accountTimelineActions = null;

function mountAccountWorkspace(editable) {
  app.innerHTML = screens.main;
  const layout = $('.app');
  layout.classList.add('account-timeline');
  const nav = $('nav[aria-label="보기 방식"]');
  const views = [$('#vCard'), $('#vList')];
  if (editable) views.push($('#vDot'));
  nav.replaceChildren(...views);
  $('.side').replaceChildren(...(editable ? [$('#addBtn'), nav] : [nav]));
  $('.bar').innerHTML = '<label>프로젝트 <select id="workspaceTask"></select></label>' +
    (editable ? '<button type="button" id="workspaceNew" class="btn sm">새 프로젝트</button> <button type="button" id="workspaceRecords" class="btn sm" disabled>프로젝트 기록</button>' : '<span>읽기 전용</span>') +
    '<button type="button" id="workspaceRetry" class="btn sm">다시 불러오기</button>';
  $('#emptyBox').innerHTML = '<p class="eb-hint" id="workspaceStatus" role="status"></p>';
  $('#bandsw').remove();
  $('#panel').remove();
  if (editable) {
    $('.bar').insertAdjacentHTML('afterend','<div class="workspace-notices"><span id="workspaceActionStatus" role="status"></span> '+
      '<button id="workspaceLinkCancel" type="button" class="btn sm" hidden>연결 취소</button> '+
      '<span id="memoStatus" role="status" aria-atomic="true"></span> <button id="memoRetry" class="btn sm" hidden>메모 저장 다시 시도</button> <button id="pdfUploadRetry" type="button" class="btn sm" hidden></button></div>');
    $('#vDot').addEventListener('click', () => setView('dot'));
    $('#relayout').addEventListener('click', relayoutDots);
    wireDots();
  } else $('#fdot').remove();
  $('#rbar').remove();
  $('.work').insertAdjacentHTML('beforebegin', '<section id="undatedPapers" aria-label="날짜 미기록" hidden></section>' +
    '<dialog id="accountPaperDetail" aria-label="논문 상세"></dialog>');

  $('#vCard').addEventListener('click', () => setView('card'));
  $('#vList').addEventListener('click', () => setView('list'));
  $('#zoomSeg').addEventListener('click', event => {
    const button = event.target.closest('[data-z]');
    if (button) setZoom(button.dataset.z);
  });
  $('#overviewFit').addEventListener('click', () => adjustOverviewZoom(0));
  $('#mm').addEventListener('keydown', event => {
    const steps = {ArrowLeft:-7, ArrowRight:7};
    if (steps[event.key]) {
      event.preventDefault();
      scrollToDay(Number($('#mm').getAttribute('aria-valuenow')) + steps[event.key]);
    }
  });
  $('#undatedPapers').addEventListener('click', event => {
    const button = event.target.closest('[data-paper]');
    if (button) onPick(button.dataset.paper);
  });
  wireScroller();
  wireMinimap();
  wirePaperList();
}

// Rendering uses the read transport. Only explicit account controls get the write transport.
async function startAccountTimeline(get, account) {
  if (S.source !== 'account') return;
  try { await screensReady; } catch { return; } // The screen loader displays its retry control.
  if (!account.current()) return;
  const editable = !!account.write;
  mountAccountWorkspace(editable);
  const picker = $('#workspaceTask');
  const key = 'researchtrail.account.' + account.projectUrl + '.' + account.accountId + '.task';
  let selection = 0, read = 0;
  let tasks = [];
  const current = version => account.current() && version === selection;
  S.accountId = account.accountId;
  listSort = 'added';

  function clear(id, message) {
    ++selection;
    S.taskId = id;
    S.links = [];
    S.linking = null;
    accountTimelineActions?.reset(id);
    S.papers = [];
    S.sel = null;
    S.listQuery = '';
    S.listScroll = 0;
    S.timelineRange = null;
    S.zoom = 'all';
    S.overviewZoom = 1;
    S.overviewPan = 0;
    LIST_STATE = 'all';
    $('#workspaceStatus').textContent = message;
    $('#tip').hidden = true;
    $('#tip').textContent = '';
    const detail = $('#accountPaperDetail');
    detail.close();
    detail.replaceChildren();
    renderAll();
    return selection;
  }
  async function selectTask(id) {
    picker.value = id;
    clear(id, '프로젝트 논문을 불러오는 중…');
    return refresh(id);
  }
  async function refresh(id) {
    if (!id || id !== S.taskId || !account.current()) return;
    const version = selection, attempt = ++read;
    const path = '/tasks/' + encodeURIComponent(id);
    try {
      const [{papers}, {links}] = await Promise.all([get(path + '/papers'),
        editable ? get(path + '/paper-links') : {links:[]}]);
      if (!current(version) || attempt !== read) return;
      S.links = links.map(l => ({id:l.link_id, from:l.from_document_use_id, to:l.to_document_use_id, reason:l.reason_text}));
      S.papers = papers.map(row => ({
        ...row, id:row.document_use_id, title:row.document.title || '제목 미기록',
        memo:row.use.purpose_text, tag:'', date:row.date ?? null,
        state:Object.keys(STATES).find(k => STATES[k].t === row.use.reading_state_text) || null,
      }));
      if (editable) $('#workspaceRecords').disabled = $('#addBtn').disabled = false;
      $('#workspaceStatus').textContent = S.papers.length ? '' : '이 프로젝트에는 등록한 논문이 없어요.';
    } catch {
      if (!current(version) || attempt !== read) return;
      S.links = []; S.papers = [];
      if (editable) $('#addBtn').disabled = true;
      $('#workspaceStatus').textContent = '프로젝트 논문을 불러오지 못했어요. 다시 불러와 주세요.';
    }
    renderAll();
  }
  async function loadTasks() {
    picker.disabled = true;
    if (editable) $('#workspaceNew').disabled = true;
    picker.replaceChildren();
    const version = clear(null, '계정 프로젝트를 불러오는 중…');
    try {
      const data = await get('/tasks');
      if (!current(version)) return;
      tasks = data.tasks;
      accountTimelineActions?.projects(tasks);
      if (editable) $('#workspaceNew').disabled = false;
      if (!tasks.length) {
        $('#workspaceStatus').textContent = '아직 계정 프로젝트가 없어요.';
        return;
      }
      picker.replaceChildren(...tasks.map(t => new Option(t.task.goal_text, t.task_id)));
      picker.disabled = false;
      let last;
      try { last = JSON.parse(sessionStorage.getItem(key)); } catch { /* Optional tab preference. */ }
      return selectTask(tasks.find(t => t.task_id === last)?.task_id || tasks[0].task_id);
    } catch {
      if (current(version)) $('#workspaceStatus').textContent = '프로젝트 목록을 불러오지 못했어요. 다시 불러와 주세요.';
    }
  }
  function choose(id) {
    try { sessionStorage.setItem(key, JSON.stringify(id)); } catch { /* Optional tab preference. */ }
    return selectTask(id);
  }
  picker.addEventListener('change', () => choose(picker.value));
  if (editable) accountTimelineActions = createAccountGraphWorkspace(get, account, refresh, task => {
    if (!tasks.some(t => t.task_id === task.task_id)) tasks.unshift(task);
    picker.replaceChildren(...tasks.map(t => new Option(t.task.goal_text, t.task_id)));
    picker.disabled = false;
    accountTimelineActions.projects(tasks);
    return choose(task.task_id);
  });
  $('#workspaceRetry').addEventListener('click', () => S.taskId ? selectTask(S.taskId) : loadTasks());
  await loadTasks();
}

function renderAccountWorkspace() {
  const card = S.view === 'card', hasPapers = S.papers.length > 0;
  const graph = S.view === 'dot';
  if (accountTimelineActions) {
    $('#vDot').setAttribute('aria-pressed',String(graph));
    $('#fdot').hidden = $('#dotwrap').hidden = !graph || !hasPapers;
    if (graph && hasPapers) renderDots();
    else $('#dotsvg').replaceChildren();
  }
  const dated = card && S.papers.some(p => p.date);
  const undated = card ? S.papers.filter(p => !p.date) : [];
  $('#vCard').setAttribute('aria-pressed', String(card));
  $('#vList').setAttribute('aria-pressed', String(!card));
  $('#emptyBox').hidden = hasPapers;
  $('#scroller').hidden = $('#timelineMonth').hidden = $('#fcard').hidden = !dated;
  $('#overviewControls').hidden = S.zoom !== 'all';
  $$('#zoomSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.z === S.zoom)));
  $('#paperList').hidden = S.view !== 'list' || !hasPapers;
  if (S.view === 'list' && hasPapers) renderPaperList();
  else $('#paperList').replaceChildren();
  if (dated && !(typeof mtlOn === 'function' && mtlOn())) { renderCards(); renderMinimap(); }
  else { $('#canvas').replaceChildren(); $('#mm').replaceChildren(); L.pos = {}; }
  const group = $('#undatedPapers');
  group.hidden = !undated.length;
  group.classList.toggle('only-undated', !dated);
  group.innerHTML = undated.length ? '<h2>날짜 미기록</h2><div class="undated-cards">' + undated.map(p =>
    '<button class="card st-'+readingStateKey(p.state)+'" type="button" data-paper="'+esc(p.id)+'">'+
      '<span class="ct1"><span class="tx">'+esc(p.title)+'</span></span><span class="cmemo">'+esc(p.memo)+'</span>'+
      '<span class="cfoot">'+sg(p.state)+esc(p.use.reading_state_text || '읽기 상태 미기록')+'</span></button>'
  ).join('') + '</div>' : '';
}

function showAccountPaper(id) {
  const p = paperBy(id);
  if (!p) return;
  if (accountTimelineActions?.pickTarget(p)) return;
  const dialog = $('#accountPaperDetail');
  dialog.innerHTML = '<h2>'+esc(accountTimelineActions ? accountTimelineActions.caption(p) : p.title)+'</h2><p>'+esc(p.date || '날짜 미기록')+' · '+
    esc(p.use.reading_state_text || '읽기 상태 미기록')+'</p><h3>저장 이유</h3><p>'+
    esc(p.memo || '미기록/확인 필요')+'</p>' + (p.artifacts.length ? '<h3>자료 판본</h3><ul>'+
    p.artifacts.map(a => {
      if (accountTimelineActions && a.pdf) {
        const sameName=p.artifacts.some(other=>other!==a && other.pdf && other.label_text===a.label_text);
        return '<li>'+accountPdfArtifactHtml(p.id,a,sameName)+'</li>';
      }
      return '<li>'+esc([a.label_text, a.version_text, a.part_text].filter(Boolean).join(' · ') ||
        a.access_locator_text || '판본 이름 미기록')+'</li>';
    }).join('')+'</ul>' : '')+
    (accountTimelineActions ? '<section class="workspace-paper-actions" id="workspacePaperActions"></section>' : '')+
    '<form method="dialog"><button class="btn" autofocus>닫기</button></form>';
  accountTimelineActions?.paperControls(dialog,p);
  if (!dialog.open) dialog.showModal();
}
