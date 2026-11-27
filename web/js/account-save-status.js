'use strict';

function createAccountSaveStatus(request, connected, account) {
  const tasks = new Map();
  const message = $('#memoStatus'), memoRetry = $('#memoRetry'), pdfRetry = $('#pdfUploadRetry');
  const prefix = account && 'researchtrail.account.'+account.projectUrl+'.'+account.accountId+'.';
  const operations = new Map(), names = new Map(), volatile = new Set();
  let active = null, editor = null;
  function read(key) {
    try { return JSON.parse(sessionStorage.getItem(prefix+key)); } catch { return null; }
  }
  function store(key,value) {
    if (!prefix) return;
    try {
      if (value == null) sessionStorage.removeItem(prefix+key);
      else sessionStorage.setItem(prefix+key,JSON.stringify(value));
      volatile.delete(key);
    } catch {
      if (value!=null) volatile.add(key);
      else volatile.delete(key);
    }
  }
  function track(key,task,kind,phase,label='') {
    if (phase === 'idle') operations.delete(key);
    else operations.set(key,{task,kind,phase,label});
    render();
  }
  // The payload is the recovery index. Older tab drafts need no second index or migration.
  function restore() {
    if (!prefix) return;
    for (let i=0; i<sessionStorage.length; i++) {
      const full = sessionStorage.key(i);
      if (!full?.startsWith(prefix)) continue;
      const key=full.slice(prefix.length), [type,task]=key.split('.');
      const item=read(key);
      if (!task || !item) continue;
      let kind, phase='failed';
      if (type==='draft') {
        kind='메모';
        if (!item.operations?.length) phase=item.text?.trim()?'draft':'empty';
      } else if (type==='reader' && item.payload) kind=accountReaderOperation(item.payload);
      else if (type==='action') {
        kind='다음 작업';
        if (item.rejected) phase='rejected';
      }
      else if (type==='upload') { state(task).uploads.add({...item,key,phase:'reselect'}); continue; }
      else continue;
      operations.set(key,{task,kind,phase,label:type==='action' ? '프로젝트 기록' : item.label});
    }
  }
  const memoText = {
    idle: '', empty: '메모 내용을 입력해 주세요.', draft: '메모를 작성 중이에요.', saving: '메모를 저장하는 중이에요.',
    failed: '메모 저장을 확인하지 못했어요. 다시 시도해 주세요.', saved: '메모를 계정에 저장했어요.',
  };
  function state(task) {
    if (!tasks.has(task)) tasks.set(task, {uploads:new Set(), pdfSaved:false});
    return tasks.get(task);
  }
  function firstFailed(s) { return Array.from(s.uploads).find(job => job.phase === 'failed'); }
  function render() {
    if (!connected()) return;
    const s = tasks.get(active);
    const failed = s && firstFailed(s);
    if (memoRetry) memoRetry.hidden = !editor || operations.get(editor)?.phase !== 'failed';
    pdfRetry.hidden = !failed;
    if (failed) pdfRetry.textContent = 'PDF 업로드 다시 시도 · '+failed.name;
    const parts = new Set();
    let outstanding=false, acknowledged=false;
    for (const op of operations.values()) {
      const here=op.task===active;
      if (op.phase==='saved') {
        if (!here) continue;
        acknowledged=true;
      } else outstanding=true;
      const where=[!here && (names.get(op.task) || op.task), op.label].filter(Boolean).join(' · ');
      const what=op.kind==='메모' ? memoText[op.phase] : op.kind+({
        saving:' 저장 중이에요.', failed:' 저장을 확인하지 못했어요. 다시 저장해 주세요.', saved:' 저장을 확인했어요.',
        rejected:' 저장 요청을 처리하지 못했어요. 원문 메모에서 입력과 연결을 다시 확인해 주세요.',
      }[op.phase]);
      parts.add([where,what].filter(Boolean).join(' · '));
    }
    for (const [task,t] of tasks) {
      const where=task===active?'':(names.get(task) || task)+' · ';
      const phases=new Set(Array.from(t.uploads,job=>job.phase));
      outstanding ||= !!t.uploads.size;
      if (phases.has('selected')) parts.add(where+'PDF를 선택했어요. 프로젝트에 추가하면 업로드해요.');
      if (phases.has('preparing')) parts.add(where+'PDF 업로드를 준비하고 있어요.');
      if (phases.has('blocked')) parts.add(where+'PDF 업로드를 시작하지 못했어요. 입력을 확인해 주세요.');
      if (phases.has('uploading')) parts.add(where+'PDF를 업로드하는 중이에요.');
      if (phases.has('failed')) parts.add(where+'PDF 업로드에 실패했어요.');
      for (const job of t.uploads) if (job.phase==='reselect')
        parts.add(where+'PDF 업로드 미확인 · 해당 논문에서 '+job.name+' 파일을 다시 선택해 주세요.');
      if (task===active && !t.uploads.size && t.pdfSaved) {
        parts.add('PDF를 계정에 저장했어요.');
        acknowledged=true;
      }
    }
    if (outstanding && volatile.size) parts.add('이 탭에 재시도 내용을 보관하지 못했어요. 저장을 확인할 때까지 새로고침하지 마세요.');
    if (!outstanding && acknowledged) parts.add('요청한 저장을 모두 확인했어요. 이제 닫아도 돼요.');
    const text = Array.from(parts).join(' ');
    if (message.textContent !== text) message.textContent = text;
  }
  function prepare(task, slot, file, phase = 'preparing') {
    const s = state(task);
    for (const previous of s.uploads) {
      if (previous.slot === slot && ['selected','blocked'].includes(previous.phase)) s.uploads.delete(previous);
    }
    const job = {slot, task, name:file.name, phase};
    s.uploads.add(job);
    render();
    return job;
  }
  function block(job) { job.phase = 'blocked'; render(); }
  function discard(job) { state(job.task).uploads.delete(job); render(); }
  // The retry retains the original File and destination until the storage receipt arrives.
  function upload(job, file, use, artifactId, afterSave) {
    const s = state(job.task);
    job.use = use;
    job.artifactId = artifactId;
    // One retry control per transfer, including when the original file is picked again.
    const sameFile = previous => ['failed','reselect'].includes(previous.phase) &&
      previous.use === use && previous.sha256 === job.sha256;
    for (const previous of s.uploads) {
      if (sameFile(previous) && previous.artifactId === artifactId) s.uploads.delete(previous);
    }
    job.key = 'upload.'+job.task+'.'+use+'.'+(artifactId || '')+'.'+job.sha256;
    store(job.key,{task:job.task,name:job.name,use,artifactId,sha256:job.sha256});
    job.retry = async () => {
      if (!connected() || !s.uploads.has(job) || job.phase === 'uploading') return;
      job.phase = 'uploading';
      render();
      let ack;
      try {
        ack = await request('/tasks/'+job.task+'/papers/'+use+'/pdf',file,{pdf:true,artifactId});
        if (!ack || typeof ack.artifact_id !== 'string' || !ack.artifact_id ||
            (artifactId && artifactId !== ack.artifact_id)) throw new Error();
      } catch {
        job.phase = 'failed';
        render();
        return false;
      }
      if (!connected()) return;
      job.phase = 'saved';
      store(job.key,null);
      s.uploads.delete(job);
      // Reselecting identical bytes can confirm a previously interrupted upload to this paper.
      for (const previous of s.uploads) {
        if (sameFile(previous) && (!previous.artifactId || previous.artifactId === ack.artifact_id)) {
          store(previous.key,null); s.uploads.delete(previous);
        }
      }
      s.pdfSaved = true;
      render();
      await afterSave();
      return true;
    };
    return job.retry();
  }
  pdfRetry.addEventListener('click',() => {
    const s = tasks.get(active);
    if (s) return firstFailed(s)?.retry();
  });
  try { restore(); } catch { /* Tab storage can be unavailable. */ }
  return {
    read,store,track,
    projects(rows) { for (const t of rows) names.set(t.task_id,t.task.goal_text); render(); },
    focus(task) { active = task; editor=null; render(); },
    editor(key) { editor=key; render(); },
    prepare, block, discard, upload,
  };
}
