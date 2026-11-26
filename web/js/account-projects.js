'use strict';

// A request is bound to one account frame by account.js. Selecting a task invalidates old list/form responses.
async function startAccountProjects(request, account) {
  const memos = account ? createAccountMemos(request,account) : null;
  const connected = () => !account || account.current();
  const pdfReader = account ? createAccountPdfReader(request,connected,memos.records) : null;
  let tasks = [];
  let active = memos?.lastTask() || null;
  let selection = 0;
  let formVersion = 0;
  let catalogRead = 0;
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
    // A memo can cite an already listed paper, sometimes with a different edition.
    const registered = new Map();
    for (const p of papers.filter(p=>!p.record_id)) {
      if (!registered.has(p.document_id)) registered.set(p.document_id,new Set());
      for (const a of p.artifacts) registered.get(p.document_id).add(a.artifact_id);
    }
    const visible = papers.filter(p=>{
      if (!p.record_id) return true;
      const known = registered.get(p.document_id);
      if (known && p.artifacts.every(a=>known.has(a.artifact_id))) return false;
      const ids = known || new Set();
      for (const a of p.artifacts) ids.add(a.artifact_id);
      registered.set(p.document_id,ids);
      return true;
    });
    list.innerHTML = '<ul>' + visible.map(p => {
      const details = [p.date, p.use.reading_state_text].filter(Boolean);
      return '<li><strong>'+esc(p.document.title || '제목 미기록')+'</strong>'+
        (p.use.purpose_text ? '<p>'+esc(p.use.purpose_text)+'</p>' : '')+
        '<small>'+details.map(esc).join(' · ')+'</small>'+
        p.artifacts.map(a=>{
          if (pdfReader && a.pdf) {
            const sameName=p.artifacts.some(other=>other!==a && other.pdf && other.label_text===a.label_text);
            return accountPdfArtifactHtml(p.document_use_id,a,sameName);
          }
          if (pdfReader && a.can_attach_pdf) return '<p>'+esc(a.label_text)+'</p>'+accountPdfAttachHtml(p.document_use_id,null,a.artifact_id);
          const url=safeExternalUrl(a.access_locator_text);
          return url ? '<p><a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(a.label_text || url)+'</a></p>' :
            '<p>'+esc(a.label_text || a.access_locator_text || '')+'</p>';
        }).join('')+
        (pdfReader && p.document_use_id ? accountPdfAttachHtml(p.document_use_id) : '')+'</li>';
    }).join('') + '</ul>';
    status.textContent = papers.length ? '' : '아직 이 프로젝트에 등록한 논문이 없어요.';
  }
  if (pdfReader) {
    list.addEventListener('click',event=>{
      const button=event.target.closest('[data-open-pdf]');
      if (button && connected()) return pdfReader.open(active,button.dataset.openPdf,button.dataset.label,button.dataset.available!=='false');
    });
    list.addEventListener('change',async event=>{
      const input=event.target, use=input.dataset.attachPdf, file=input.files?.[0];
      if (!use || !file || input.disabled) return;
      const selected=active, version=selection;
      const current=()=>connected() && version===selection;
      input.disabled=true;
      try {
        await validateAccountPdf(file,input.dataset.expectedSha);
        if (!current()) return;
        status.textContent='PDF를 업로드하는 중…';
        await request('/tasks/'+selected+'/papers/'+use+'/pdf',file,{pdf:true,artifactId:input.dataset.artifactId});
        if (!current()) return;
        const read=++catalogRead;
        const snapshot=await request('/tasks/'+selected+'/resume');
        if (!current() || read!==catalogRead) return;
        draw(snapshot.context.document_contexts);
        status.textContent='계정에 PDF를 저장했어요.';
      } catch (error) {
        if (current()) status.textContent=(error.message || 'PDF를 저장하지 못했어요.')+' 파일을 다시 선택해 주세요.';
      } finally { input.disabled=false; input.value=''; }
    });
  }
  async function select(id) {
    const task = tasks.find(t => t.task_id === id);
    if (!task || !connected()) return;
    const current = ++selection;
    active = id;
    pdfReader?.close();
    closeForm();
    title.textContent = task.task.goal_text;
    list.innerHTML = '';
    status.textContent = '프로젝트 기록을 불러오는 중…';
    retry.hidden = true;
    add.disabled = true;
    try {
      const papers = memos ? await memos.open(id) : (await request('/tasks/'+id+'/papers')).papers;
      if (current !== selection || !connected()) return;
      draw(papers);
      add.disabled = false;
    } catch (error) { if (current === selection && connected()) report(error); }
  }
  async function load() {
    const current = ++selection;
    pdfReader?.close();
    memos?.clear();
    closeForm();
    title.disabled = add.disabled = true;
    retry.hidden = true;
    list.innerHTML = '';
    status.textContent = '프로젝트를 불러오는 중…';
    try {
      const data = await request('/tasks');
      if (current !== selection || !connected()) return;
      tasks = data.tasks;
      title.disabled = false;
      if (tasks.length) {
        await select(tasks.some(t => t.task_id === active) ? active : tasks[0].task_id);
      } else {
        active = null;
        title.textContent = '프로젝트 선택';
        status.textContent = '프로젝트 선택에서 새 프로젝트를 만들어 주세요.';
      }
    } catch (error) { if (current === selection && connected()) report(error); }
  }
  projAccountMenu = {
    catalog: () => ({active, list:tasks.map(t => ({id:t.task_id, name:t.task.goal_text}))}),
    select,
    async create(name) {
      const current = selection;
      if (createKey.name !== name) createKey = {name, id:crypto.randomUUID()};
      const task = await request('/tasks',{goal_text:name, request_id:createKey.id});
      if (!connected()) return;
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
    const current = () => connected() && selected === active && version === formVersion;
    status.textContent = '등록 양식을 여는 중…';
    add.disabled = true;
    try {
      const { documents } = await request('/documents');
      if (!current()) return;
      pin.hidden = false;
      list.hidden = true;
      status.textContent = '';
      let receipt;
      const dismiss = () => receipt ? select(selected) : closeForm();
      renderAddPanel(pin, {documents, uploadPdf:!!pdfReader, close: dismiss, current, register: async (body,file) => {
        if (!current()) return;
        if (!receipt) receipt=await request('/tasks/'+selected+'/papers', body);
        if (!current()) return;
        if (file && pdfReader) {
          for (const id of ['aTitle','aSrc','aDate','aMemo','aState','aDocument']) {
            const field=$('#'+id);
            if (field) field.disabled=true;
          }
          try { await request('/tasks/'+selected+'/papers/'+receipt.document_use_id+'/pdf',file,{pdf:true}); }
          catch { throw new Error('논문은 등록됐어요. 같은 PDF를 다시 제출하거나 논문 목록에서 첨부해 주세요.'); }
        }
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
    if (file && !account.uploadPdf) artifacts.push({label_text:file.name});
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
    try {
      if (file && account.uploadPdf) await validateAccountPdf(file);
      if (account.current()) await account.register({...body, request_id:requestId},file);
    }
    catch (failure) {
      if (account.current()) { error.hidden=false; error.textContent=failure.message || '논문을 저장하지 못했어요. 다시 시도해 주세요.'; }
    } finally {
      pending = false;
      form.inert = false;
      form.setAttribute('aria-busy','false');
    }
  });
}
