'use strict';

function createAccountMemos(request, account, saves, drawPapers, lookup=$) {
  const section = lookup('#accountMemos'), field = lookup('#rNote'), paper = lookup('#memoPaper');
  const finish = lookup('#memoFinish'), add = lookup('#rAddNote');
  const recordList = lookup('#accountRecords'), readStatus = lookup('#memoReadStatus');
  const {read,store} = saves;
  const drafts = new Map();
  let view = null;
  const actions = createAccountActionReview(request,{current,refresh,read,store,saves,lookup});

  function blank(scope) {
    return {text:'', original:'', recordId:null, documentId:scope?.documentId || '',
      artifactId:scope?.artifactId || '',label:scope?.label,operations:[]};
  }
  function current(v) { return v && view === v && account.current(); }
  function hasNewVersion(d) {
    const last = d.operations.at(-1);
    return !!d.text.trim() && d.text !== (last ? last.record.content_text : d.original);
  }
  function keep(v) {
    const d = v.draft;
    const unfinished = d.operations.length || d.text !== d.original;
    if (unfinished) drafts.set(v.key,d);
    else drafts.delete(v.key);
    store(v.key, unfinished ? d : null);
  }
  function controls(v) {
    const d = v.draft;
    lookup('#memoLabel').textContent = d.recordId ? '메모 수정' : '새 메모';
    let phase = 'idle';
    if (v.sending) phase = 'saving';
    else if (d.operations.length) phase = 'failed';
    else if (d.text !== d.original) phase = d.text.trim() ? 'draft' : 'empty';
    else if (v.acknowledged) phase = 'saved';
    saves.track(v.key,v.id,'메모',phase,d.label || '프로젝트 기록');
    const edited = hasNewVersion(d);
    const retry = d.operations.length && !v.sending && !edited;
    lookup('#memoRetry').hidden = !retry;
    finish.hidden = !!retry;
    finish.disabled = !retry && !edited;
    add.disabled = !!d.operations.length || !!(d.text.trim() && d.text !== d.original);
    paper.disabled = !!v.scope || !!d.operations.length || !!d.recordId;
    lookup('#memoPaperLabel').textContent=paper.disabled?'이 메모의 논문':'연결할 논문 (선택)';
    const multiple=d.recordContexts?.length>1;
    lookup('#memoPaperField').hidden=multiple || (!v.scope && !v.snapshot?.context.document_contexts.length);
    const hint=lookup('#memoAssociation');
    if (multiple) hint.textContent='정정 기록은 원래 메모에 연결된 자료들을 유지해요.';
    else if (v.scope && !d.artifactId) hint.textContent='원래 메모와 같은 논문에 정정 내용을 저장해요.';
    else hint.textContent=v.scope?'이 판본에 저장 · '+v.scope.label:'';
  }
  function render(v, data) {
    if (data.task_id !== v.id || !Array.isArray(data.records)) throw new Error('프로젝트 기록을 확인하지 못했어요.');
    const docs = data.context.document_contexts;
    const titles = new Map(docs.map(d=>[d.document_id,d.document.title || '제목 미기록']));
    const counts = new Map();
    for (const title of titles.values()) counts.set(title,(counts.get(title) || 0)+1);
    for (const [id,title] of titles) if (counts.get(title)>1) titles.set(id,title+' · '+id);
    paper.innerHTML = '<option value="">논문 연결 안 함</option>' +
      Array.from(titles, ([id,title])=>'<option value="'+esc(id)+'">'+esc(title)+'</option>').join('');
    paper.value = v.draft.documentId;
    if (v.scope && !titles.has(v.scope.documentId)) throw new Error('선택한 논문을 확인하지 못했어요.');
    v.records = data.records;
    v.snapshot = data;
    controls(v);
    const editionLabels=new Map();
    for (const doc of docs) for (const a of doc.artifacts) editionLabels.set(a.artifact_id,a.label_text);
    const visible=v.scope ? v.records.filter(r=>{
      const refs=r.context_refs;
      return refs.artifact_ids?.length ? refs.artifact_ids.includes(v.scope.artifactId) :
        refs.document_ids.includes(v.scope.documentId);
    }) : v.records;
    recordList.innerHTML = visible.length ? '<h3>저장된 메모</h3><ul>'+visible.map(r=>{
      const names = (r.context_refs.document_ids || []).map(id=>titles.get(id)).filter(Boolean);
      const editions=(r.context_refs.artifact_ids || []).map(id=>editionLabels.get(id)).filter(Boolean);
      const pendingAction=read('action.'+v.id+'.'+r.record_id);
      const detail = [r.revises_record_id ? '정정 기록' : '', ...names,...editions].filter(Boolean).map(esc).join(' · ');
      return '<li>'+(detail ? '<small>'+detail+'</small>' : '')+'<p>'+esc(r.record.content_text)+'</p>'+
        '<button type="button" class="btn sm" data-edit-record="'+esc(r.record_id)+'">수정</button> '+
        '<button type="button" class="btn sm" data-review-record="'+esc(r.record_id)+'" data-mode="candidate">'+(pendingAction?'다음 작업 저장 다시 확인':'다음 할 일 찾기 →')+'</button> '+
        '<button type="button" class="btn sm" data-review-record="'+esc(r.record_id)+'" data-mode="manual">다음 작업 직접 입력</button></li>';
    }).join('')+'</ul>' : '<p>저장된 메모가 없어요.</p>';
    function group(label, values) {
      return values.length ? '<h3>'+label+'</h3><ul>'+values.map(value=>'<li>'+esc(value)+'</li>').join('')+'</ul>' : '';
    }
    const sources=new Set(visible.map(r=>r.record_id));
    const inScope=id=>!v.scope || sources.has(id);
    lookup('#accountContext').innerHTML = group('질문',data.context.questions.filter(q=>inScope(q.record_id)).map(q=>q.question_text)) +
      group('판단',data.context.decisions.filter(d=>inScope(d.record_id)).map(d=>d.decision_text));
    lookup('#accountActions').innerHTML = accountActionHistory(data.next_actions.filter(a=>inScope(a.source_record_id)),v.records);
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
    if (view?.sending) saves.track(view.key,view.id,'메모','failed',view.draft.label || '프로젝트 기록');
    saves.editor(null);
    view = null;
    actions.clear();
    section.hidden = true;
    field.value = '';
    readStatus.textContent = '';
    recordList.innerHTML = lookup('#accountContext').innerHTML = lookup('#accountActions').innerHTML = '';
    paper.innerHTML = '';
  }
  async function open(id,scope=null) {
    clear();
    const key='draft.'+id+(scope ? '.'+scope.artifactId : '');
    const draft = drafts.get(key) || read(key) || blank(scope);
    const v = view = {id,key,scope,draft,read:0,sending:false,records:[]};
    saves.editor(key);
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
      const entries=d.recordContexts || (d.documentId ? [documentContext(d.documentId,d.artifactId)] : []);
      if (entries.length) op.context={document_contexts:entries};
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

  // A native textarea change precedes blur. Wait for the focus destination before
  // completing a focused edit so the user can still choose its paper.
  let focused=false, choosingPaper=false;
  field.addEventListener('focus',()=>{ focused=true; choosingPaper=false; });
  lookup('#memoPaperField').addEventListener('pointerdown',()=>{ choosingPaper=focused && !paper.disabled; });
  field.addEventListener('input',()=>{
    const v = view;
    if (!current(v)) return;
    v.draft.text = field.value;
    keep(v);
    controls(v);
  });
  field.addEventListener('change',()=>{ if (!focused) return complete(); });
  field.addEventListener('blur',event=>{
    focused=false;
    const target=event.relatedTarget;
    const movingToPaper=target===paper || (!target && choosingPaper);
    choosingPaper=false;
    if (!movingToPaper && target!==finish && target!==lookup('#memoRetry')) return complete();
  });
  finish.addEventListener('click',()=>complete(true));
  lookup('#memoRetry').addEventListener('click',()=>{ if (current(view)) return sendCompleted(view); });
  paper.addEventListener('change',()=>{
    if (current(view) && !paper.disabled) { view.draft.documentId=paper.value; keep(view); }
  });
  function documentContext(doc,artifact) {
    const entry={document_ref:{document_id:doc},use:{}};
    if (artifact) entry.artifact_ref={artifact_id:artifact};
    return entry;
  }
  function edit(record) {
    const v = view;
    if (!current(v) || v.draft.operations.length || (v.draft.text.trim() && v.draft.text !== v.draft.original)) return;
    const d = v.draft = blank(v.scope);
    if (record) {
      d.recordId = record.record_id;
      d.text = d.original = record.record.content_text;
      const refs=record.context_refs;
      d.documentId=refs.document_ids.length===1 ? refs.document_ids[0] : '';
      d.artifactId=refs.artifact_ids?.length===1 ? refs.artifact_ids[0] : '';
      // Each record context pairs one document with its optional cited artifact.
      const contexts=v.snapshot.context.document_contexts.filter(row=>row.record_id===record.record_id);
      if (contexts.length) d.recordContexts=contexts.map(row=>{
        const cited=row.artifacts.find(a=>refs.artifact_ids?.includes(a.artifact_id));
        return documentContext(row.document_id,cited?.artifact_id);
      });
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
