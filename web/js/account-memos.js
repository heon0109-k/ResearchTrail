'use strict';

function createAccountMemos(request, account, saves, drawPapers) {
  const section = $('#accountMemos'), field = $('#rNote'), paper = $('#memoPaper');
  const finish = $('#memoFinish'), add = $('#rAddNote');
  const recordList = $('#accountRecords'), readStatus = $('#memoReadStatus');
  const prefix = 'researchtrail.account.' + account.projectUrl + '.' + account.accountId + '.';
  const drafts = new Map();
  let view = null;
  const actions = createAccountActionReview(request,{current,refresh,read,store});

  function read(key) {
    try { return JSON.parse(sessionStorage.getItem(prefix + key)); } catch { return null; }
  }
  function store(key, value) {
    try {
      if (value === null) sessionStorage.removeItem(prefix + key);
      else sessionStorage.setItem(prefix + key, JSON.stringify(value));
    } catch { /* The open tab still retains the draft in memory. */ }
  }
  function blank() {
    return {text:'', original:'', recordId:null, documentId:'', operations:[]};
  }
  function current(v) { return v && view === v && account.current(); }
  function hasNewVersion(d) {
    const last = d.operations.at(-1);
    return !!d.text.trim() && d.text !== (last ? last.record.content_text : d.original);
  }
  function keep(v) {
    const d = v.draft;
    const unfinished = d.operations.length || d.text !== d.original;
    if (unfinished) drafts.set(v.id,d);
    else drafts.delete(v.id);
    store('draft.'+v.id, unfinished ? d : null);
  }
  function controls(v) {
    const d = v.draft;
    $('#memoLabel').textContent = d.recordId ? '메모 수정' : '새 메모';
    let phase = 'idle';
    if (v.sending) phase = 'saving';
    else if (d.operations.length) phase = 'failed';
    else if (d.text !== d.original) phase = d.text.trim() ? 'draft' : 'empty';
    else if (v.acknowledged) phase = 'saved';
    saves.memo(v.id,phase);
    const edited = hasNewVersion(d);
    const retry = d.operations.length && !v.sending && !edited;
    finish.hidden = !!retry;
    finish.disabled = !retry && !edited;
    add.disabled = !!d.operations.length || !!(d.text.trim() && d.text !== d.original);
    paper.disabled = !!d.operations.length || !!d.recordId;
  }
  function render(v, data) {
    if (data.task_id !== v.id || !Array.isArray(data.records)) throw new Error('프로젝트 기록을 확인하지 못했어요.');
    const docs = data.context.document_contexts;
    const titles = new Map(docs.map(d=>[d.document_id,d.document.title || '제목 미기록']));
    paper.innerHTML = '<option value="">논문 연결 안 함</option>' +
      Array.from(titles, ([id,title])=>'<option value="'+esc(id)+'">'+esc(title)+'</option>').join('');
    paper.value = v.draft.documentId;
    $('#memoPaperField').hidden = !titles.size;
    v.records = data.records;
    v.snapshot = data;
    recordList.innerHTML = v.records.length ? '<h3>저장된 메모</h3><ul>'+v.records.map(r=>{
      const names = (r.context_refs.document_ids || []).map(id=>titles.get(id)).filter(Boolean);
      const detail = [r.revises_record_id ? '정정 기록' : '', ...names].filter(Boolean).map(esc).join(' · ');
      return '<li>'+(detail ? '<small>'+detail+'</small>' : '')+'<p>'+esc(r.record.content_text)+'</p>'+
        '<button type="button" class="btn sm" data-edit-record="'+esc(r.record_id)+'">수정</button> '+
        '<button type="button" class="btn sm" data-review-record="'+esc(r.record_id)+'" data-mode="candidate">다음 할 일 찾기 →</button> '+
        '<button type="button" class="btn sm" data-review-record="'+esc(r.record_id)+'" data-mode="manual">다음 작업 직접 입력</button></li>';
    }).join('')+'</ul>' : '<p>저장된 메모가 없어요.</p>';
    function group(label, values) {
      return values.length ? '<h3>'+label+'</h3><ul>'+values.map(value=>'<li>'+esc(value)+'</li>').join('')+'</ul>' : '';
    }
    $('#accountContext').innerHTML = group('질문',data.context.questions.map(q=>q.question_text)) +
      group('판단',data.context.decisions.map(d=>d.decision_text));
    $('#accountActions').innerHTML = accountActionHistory(data.next_actions,v.records);
    readStatus.textContent = '';
    drawPapers(docs);
  }
  async function refresh(v) {
    const seq = ++v.read;
    let data;
    try { data = await request('/tasks/'+v.id+'/resume'); }
    catch (error) {
      if (current(v) && seq === v.read) throw error;
      return;
    }
    if (!current(v) || seq !== v.read) return;
    render(v,data);
  }
  function clear() {
    view = null;
    actions.clear();
    section.hidden = true;
    field.value = '';
    readStatus.textContent = '';
    recordList.innerHTML = $('#accountContext').innerHTML = $('#accountActions').innerHTML = '';
    paper.innerHTML = '';
  }
  async function open(id) {
    clear();
    const draft = drafts.get(id) || read('draft.'+id) || blank();
    const v = view = {id,draft,read:0,sending:false,records:[]};
    store('task',id);
    field.value = draft.text;
    controls(v);
    await refresh(v);
    if (current(v)) section.hidden = false;
  }

  function complete(explicitRetry = false) {
    const v = view;
    if (!current(v) || section.hidden) return;
    const d = v.draft;
    // Capture completed versions, even while an earlier version is awaiting its receipt.
    // Keystrokes after the latest completion stay in the draft.
    const queue = d.operations;
    if (hasNewVersion(d)) {
      const op = {request_id:crypto.randomUUID(),record:{content_text:d.text}};
      if (d.documentId) op.context = {document_contexts:[{document_ref:{document_id:d.documentId},use:{}}]};
      queue.push(op);
      keep(v);
      if (v.sending) controls(v);
    } else if (!explicitRetry) return;
    return sendCompleted(v);
  }
  async function sendCompleted(v) {
    if (!current(v)) return;
    const d = v.draft, queue = d.operations;
    if (v.sending || !queue.length) return;
    v.sending = true;
    controls(v);
    try {
      while (queue.length) {
        const op = queue[0];
        if (d.recordId) op.revises_record_id = d.recordId;
        keep(v);
        const ack = await request('/tasks/'+v.id+'/records',op);
        if (!current(v)) return;
        if (!ack || typeof ack.record_id !== 'string' || !ack.record_id) throw new Error();
        v.acknowledged = true;
        d.recordId = ack.record_id;
        d.original = op.record.content_text;
        queue.shift();
        keep(v);
      }
    } catch {
      if (current(v)) {
        v.sending = false;
        controls(v);
      }
      return;
    }
    v.sending = false;
    controls(v);
    const read = v.read + 1;
    try { await refresh(v); }
    catch { if (current(v) && v.read === read) readStatus.textContent = '저장된 기록 목록을 다시 보려면 프로젝트를 열어 주세요.'; }
  }

  wireMemoEditor(field,text=>{
    const v = view;
    if (!current(v)) return;
    v.draft.text = text;
    keep(v);
    controls(v);
  },()=>complete());
  finish.addEventListener('click',()=>complete(true));
  $('#memoRetry').addEventListener('click',()=>{ if (current(view)) return sendCompleted(view); });
  paper.addEventListener('change',()=>{ if (current(view)) { view.draft.documentId=paper.value; keep(view); } });
  function edit(record) {
    const v = view;
    if (!current(v) || v.draft.operations.length || (v.draft.text.trim() && v.draft.text !== v.draft.original)) return;
    const d = v.draft = blank();
    if (record) {
      d.recordId = record.record_id;
      d.text = d.original = record.record.content_text;
      const docs = record.context_refs.document_ids;
      if (docs.length === 1) d.documentId = docs[0];
    }
    field.value = d.text;
    paper.value = d.documentId;
    keep(v);
    v.acknowledged = false;
    controls(v);
    field.focus();
  }
  add.addEventListener('click',()=>edit(null));
  recordList.addEventListener('click',e=>{
    const button = e.target.closest('[data-edit-record], [data-review-record]');
    if (!button || !current(view)) return;
    const {editRecord,reviewRecord,mode}=button.dataset;
    const record = view.records.find(r=>r.record_id===(editRecord || reviewRecord));
    if (record && reviewRecord) return actions.open(view,record,mode);
    if (record) edit(record);
  });
  return {open,clear,reload:()=>current(view) && refresh(view),lastTask:()=>read('task'),records:()=>view?.records || []};
}
