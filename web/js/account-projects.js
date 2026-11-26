'use strict';

// A request is bound to one account frame by account.js. Selecting a task invalidates old list/form responses.
async function startAccountProjects(request) {
  let tasks = [];
  let active = null;
  let selection = 0;
  let formVersion = 0;
  let createKey = {};
  const title = $('#tName'), add = $('#addBtn'), pin = $('#pin');
  const status = $('#projectStatus'), retry = $('#projectRetry'), list = $('#accountPapers');

  function closeForm() {
    formVersion++;
    pin.hidden = true;
    pin.innerHTML = '';
    list.hidden = false;
  }
  function report(error) {
    status.textContent = error.message || '계정 자료를 불러오지 못했어요.';
    retry.hidden = false;
  }
  function draw(papers) {
    list.innerHTML = '<ul>' + papers.map(p => {
      const details = [p.date, p.use.reading_state_text, ...p.artifacts.map(a => a.label_text || a.access_locator_text)].filter(Boolean);
      return '<li><strong>'+esc(p.document.title || '제목 미기록')+'</strong>'+
        (p.use.purpose_text ? '<p>'+esc(p.use.purpose_text)+'</p>' : '')+
        '<small>'+details.map(esc).join(' · ')+'</small></li>';
    }).join('') + '</ul>';
    status.textContent = papers.length ? '' : '아직 이 프로젝트에 등록한 논문이 없어요.';
  }
  async function select(id) {
    const task = tasks.find(t => t.task_id === id);
    if (!task) return;
    const current = ++selection;
    active = id;
    closeForm();
    title.textContent = task.task.goal_text;
    list.innerHTML = '';
    status.textContent = '논문 목록을 불러오는 중…';
    retry.hidden = true;
    add.disabled = true;
    try {
      const data = await request('/tasks/'+id+'/papers');
      if (current !== selection) return;
      draw(data.papers);
      add.disabled = false;
    } catch (error) { if (current === selection) report(error); }
  }
  async function load() {
    const current = ++selection;
    closeForm();
    title.disabled = add.disabled = true;
    retry.hidden = true;
    list.innerHTML = '';
    status.textContent = '프로젝트를 불러오는 중…';
    try {
      const data = await request('/tasks');
      if (current !== selection) return;
      tasks = data.tasks;
      title.disabled = false;
      if (tasks.length) {
        await select(tasks.some(t => t.task_id === active) ? active : tasks[0].task_id);
      } else {
        active = null;
        title.textContent = '프로젝트 선택';
        status.textContent = '프로젝트 선택에서 새 프로젝트를 만들어 주세요.';
      }
    } catch (error) { if (current === selection) report(error); }
  }
  projAccountMenu = {
    catalog: () => ({active, list:tasks.map(t => ({id:t.task_id, name:t.task.goal_text}))}),
    select,
    async create(name) {
      const current = selection;
      if (createKey.name !== name) createKey = {name, id:crypto.randomUUID()};
      const task = await request('/tasks',{goal_text:name, request_id:createKey.id});
      createKey = {};
      if (!tasks.some(t => t.task_id === task.task_id)) tasks.unshift(task);
      if (current === selection) await select(task.task_id);
    },
  };
  title.addEventListener('click', projMenuToggle);
  retry.addEventListener('click', load);
  add.addEventListener('click', async () => {
    if (!active || !pin.hidden) return;
    const selected = active;
    const version = ++formVersion;
    const current = () => selected === active && version === formVersion;
    status.textContent = '등록 양식을 여는 중…';
    add.disabled = true;
    try {
      const { documents } = await request('/documents');
      if (!current()) return;
      pin.hidden = false;
      list.hidden = true;
      status.textContent = '';
      renderAddPanel(pin, {documents, close: closeForm, current, register: async body => {
        if (!current()) return;
        await request('/tasks/'+selected+'/papers', body);
        if (current()) await select(selected);
      }});
      $('#aTitle').focus();
    } catch (error) { if (current()) report(error); }
    finally { if (current()) add.disabled = false; }
  });
  await load();
}

function wireAccountPaperForm(account) {
  const form = $('#addForm'), error = $('#aErr'), doc = $('#aDocument'), title = $('#aTitle');
  let pending = false, lastBody, requestId;
  $('#pClose').addEventListener('click',account.close);
  $('#aCancel').addEventListener('click',account.close);
  $('#aFile').addEventListener('change',() => { $('#aFname').textContent = $('#aFile').files[0]?.name || ''; });
  if (doc) doc.addEventListener('change',() => {
    const selected = account.documents.find(d => d.document_id === doc.value);
    title.disabled = !!selected;
    title.value = selected?.title || '';
  });
  form.addEventListener('submit',async event => {
    event.preventDefault();
    if (pending || !account.current()) return;
    error.hidden = true;
    const documentId = doc?.value;
    const name = title.value.trim();
    const raw = $('#aSrc').value.trim();
    const ref = parseRef(raw);
    // Preserve explicit versioned links. Bare DOI and arXiv identifiers are also accepted.
    let locator = /^https?:\/\//i.test(raw) ? safeExternalUrl(raw) : ref.link || ref.url;
    if (ref.type === 'arxiv' && !/^https?:\/\//i.test(raw)) locator += raw.match(/v\d+$/i)?.[0] || '';
    if ((!documentId && !name) || (raw && !locator)) {
      error.hidden=false;
      error.textContent = !documentId && !name ? '논문 제목을 입력해 주세요.' : '올바른 논문 링크를 입력해 주세요.';
      return;
    }
    const file = $('#aFile').files[0];
    const artifacts = [];
    if (locator) artifacts.push({access_locator_text:locator});
    if (file) artifacts.push({label_text:file.name});
    const state = $('#aState').value;
    const body = {
      ...(documentId ? {document_id:documentId} : {document:{title:name,material_kind_text:'논문'}}),
      use:{purpose_text:$('#aMemo').value.trim() || null, reading_state_text:state ? STATES[state].t : null},
      artifacts, date:$('#aDate').value || null,
    };
    const signature = JSON.stringify(body);
    if (lastBody !== signature) { lastBody = signature; requestId = crypto.randomUUID(); }
    pending = true;
    form.inert = true;
    form.setAttribute('aria-busy','true');
    try { await account.register({...body, request_id:requestId}); }
    catch (failure) {
      if (account.current()) { error.hidden=false; error.textContent=failure.message || '논문을 저장하지 못했어요. 다시 시도해 주세요.'; }
    } finally {
      pending = false;
      form.inert = false;
      form.setAttribute('aria-busy','false');
    }
  });
}
