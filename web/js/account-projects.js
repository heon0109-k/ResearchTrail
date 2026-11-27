'use strict';

// A request is bound to one account frame by account.js. Selecting a task invalidates old list/form responses.
async function startAccountProjects(request, account) {
  const connected = () => !account || account.current();
  const saves = account ? createAccountSaveStatus(request,connected) : null;
  const memos = account ? createAccountMemos(request,account,saves,draw) : null;
  const pdfReader = account ? createAccountPdfReader(request,connected,memos.records) : null;
  let tasks = [];
  let active = memos?.lastTask() || null;
  let selection = 0;
  let formVersion = 0;
  let retryCatalog = false;
  let catalogHtml = null;
  let discardFormPreparation;
  let createKey = {};
  const title = $('#tName'), add = $('#addBtn'), pin = $('#pin');
  const status = $('#projectStatus'), retry = $('#projectRetry'), list = $('#accountPapers');

  function closeForm() {
    formVersion++;
    discardFormPreparation?.();
    discardFormPreparation = null;
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
    const html = '<ul>' + visible.map(p => {
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
    if (html !== catalogHtml) {
      list.innerHTML = html;
      catalogHtml = html;
    }
    retryCatalog = false;
    retry.hidden = true;
    status.textContent = papers.length ? '' : '아직 이 프로젝트에 등록한 논문이 없어요.';
  }
  async function refreshPapers(id) {
    if (id !== active || !connected()) return;
    const version = selection;
    try {
      if (memos) await memos.reload();
      else {
        const data = await request('/tasks/'+id+'/papers');
        if (version === selection && connected()) draw(data.papers);
      }
    } catch {
      if (version === selection && connected()) {
        retryCatalog = true;
        report(new Error('논문 목록을 다시 불러와 주세요.'));
      }
    }
  }
  if (pdfReader) {
    list.addEventListener('click',event=>{
      const button=event.target.closest('[data-open-pdf]');
      if (button && connected()) return pdfReader.open(active,button.dataset.openPdf,button.dataset.label,button.dataset.available!=='false');
    });
    list.addEventListener('change',async event=>{
      const input=event.target, use=input.dataset.attachPdf, file=input.files?.[0];
      if (!use || !file || input.disabled || !connected()) return;
      const task = active, version = selection, {artifactId,expectedSha} = input.dataset;
      const job = saves.prepare(task,use+'/'+(artifactId || ''),file);
      input.disabled = true;
      try {
        job.sha256 = await validateAccountPdf(file,expectedSha);
        if (connected() && version === selection)
          await saves.upload(job,file,use,artifactId,()=>refreshPapers(task));
        else saves.discard(job);
      } catch (error) {
        if (connected() && version === selection) {
          saves.block(job);
          status.textContent = error.message;
        } else saves.discard(job);
      } finally {
        input.disabled = false;
        input.value = '';
      }
    });
  }
  async function select(id) {
    const task = tasks.find(t => t.task_id === id);
    if (!task || !connected()) return;
    const current = ++selection;
    active = id;
    retryCatalog = false;
    saves?.focus(id);
    pdfReader?.close();
    closeForm();
    title.textContent = task.task.goal_text;
    catalogHtml = null;
    list.innerHTML = '';
    status.textContent = '프로젝트 기록을 불러오는 중…';
    retry.hidden = true;
    add.disabled = true;
    try {
      if (memos) await memos.open(id);
      else {
        const {papers} = await request('/tasks/'+id+'/papers');
        if (current === selection && connected()) draw(papers);
      }
      if (current === selection && connected()) add.disabled = false;
    } catch (error) { if (current === selection && connected()) report(error); }
  }
  async function load() {
    const current = ++selection;
    pdfReader?.close();
    saves?.focus(null);
    memos?.clear();
    closeForm();
    title.disabled = add.disabled = true;
    retry.hidden = true;
    catalogHtml = null;
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
  retry.addEventListener('click', () => retryCatalog ? refreshPapers(active) : load());
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
      discardFormPreparation = renderAccountRegistration(pin,{request, documents, selected, version, current,
        saves, uploadPdf:!!pdfReader, closeForm, refresh:refreshPapers});
      $('#aTitle').focus();
    } catch (error) { if (current()) report(error); }
    finally { if (current()) add.disabled = false; }
  });
  await load();
}

// Shared by both account entry points. Keep the registration receipt while retrying a PDF.
function renderAccountRegistration(pin,{request, documents, selected, version, current, saves, uploadPdf, closeForm, refresh, registered}) {
  let receipt, job;
  const discard = () => {
    if (job && ['selected','blocked','preparing'].includes(job.phase)) saves.discard(job);
  };
  const dismiss = () => {
    closeForm();
    if (receipt) return refresh(selected);
  };
  function fileChanged(file) {
    if (!saves || !current() || job?.phase === 'uploading') return;
    discard();
    job = file ? saves.prepare(selected,version,file,'selected') : null;
  }
  renderAddPanel(pin, {documents, uploadPdf, close:dismiss, current, fileChanged, register:async (body,file) => {
    if (!current() || job?.phase === 'uploading') return;
    if (file && uploadPdf) job = saves.prepare(selected,version,file);
    else if (job?.phase === 'blocked') saves.discard(job);
    try {
      if (file && uploadPdf) job.sha256 = await validateAccountPdf(file);
      if (current() && !receipt) {
        const result = await request('/tasks/'+selected+'/papers',body);
        if (!result?.document_use_id) throw new Error('논문 등록을 확인하지 못했어요.');
        receipt = result;
        if (current() && file && uploadPdf) registered?.(selected);
      }
    } catch (error) {
      if (job) { if (current()) saves.block(job); else saves.discard(job); }
      throw error;
    }
    if (!current()) {
      if (job) saves.discard(job);
      return;
    }
    const submitted = job;
    const finish = () => {
      if (current() && submitted === job) closeForm();
      return refresh(selected);
    };
    if (file && uploadPdf) {
      for (const id of ['aTitle','aSrc','aDate','aMemo','aState','aDocument']) {
        const field=$('#'+id);
        if (field) field.disabled=true;
      }
      const saved = await saves.upload(job,file,receipt.document_use_id,undefined,finish);
      if (!saved) throw new Error('논문은 등록됐어요. PDF 업로드를 다시 시도해 주세요.');
    } else await finish();
  }});
  return discard;
}

function wireAccountPaperForm(account) {
  const form = $('#addForm'), error = $('#aErr'), doc = $('#aDocument'), title = $('#aTitle');
  let pending = false, lastBody, requestId;
  $('#pClose').addEventListener('click',() => {
    if (!pending || !form.closest?.('dialog')) return account.close();
  });
  $('#aCancel').addEventListener('click',account.close);
  $('#aFile').addEventListener('change',() => {
    const file = $('#aFile').files[0];
    $('#aFname').textContent = file?.name || '';
    account.fileChanged(file);
  });
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
