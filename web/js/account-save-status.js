'use strict';

function createAccountSaveStatus(request, connected) {
  const tasks = new Map();
  const message = $('#memoStatus'), memoRetry = $('#memoRetry'), pdfRetry = $('#pdfUploadRetry');
  let active = null;
  const memoText = {
    idle: '', empty: '메모 내용을 입력해 주세요.', draft: '메모를 작성 중이에요.', saving: '메모를 저장하는 중이에요.',
    failed: '메모 저장을 확인하지 못했어요. 다시 시도해 주세요.', saved: '메모를 계정에 저장했어요.',
  };
  function state(task) {
    if (!tasks.has(task)) tasks.set(task, {memo:'idle', uploads:new Set(), pdfSaved:false});
    return tasks.get(task);
  }
  function firstFailed(s) { return Array.from(s.uploads).find(job => job.phase === 'failed'); }
  function render() {
    if (!connected()) return;
    const s = tasks.get(active);
    const failed = s && firstFailed(s);
    if (memoRetry) memoRetry.hidden = s?.memo !== 'failed';
    pdfRetry.hidden = !failed;
    if (failed) pdfRetry.textContent = 'PDF 업로드 다시 시도 · '+failed.name;
    const parts = [];
    if (s) {
      parts.push(memoText[s.memo]);
      const phases = new Set(Array.from(s.uploads, job => job.phase));
      if (phases.has('selected')) parts.push('PDF를 선택했어요. 프로젝트에 추가하면 업로드해요.');
      if (phases.has('preparing')) parts.push('PDF 업로드를 준비하고 있어요.');
      if (phases.has('blocked')) parts.push('PDF 업로드를 시작하지 못했어요. 입력을 확인해 주세요.');
      if (phases.has('uploading')) parts.push('PDF를 업로드하는 중이에요.');
      if (failed) parts.push('PDF 업로드에 실패했어요.');
      if (!s.uploads.size && s.pdfSaved) parts.push('PDF를 계정에 저장했어요.');
      const outstanding = Array.from(tasks.values()).some(t =>
        t.uploads.size || (t.memo !== 'idle' && t.memo !== 'saved'));
      if (!outstanding && (s.memo === 'saved' || s.pdfSaved))
        parts.push('요청한 저장을 모두 확인했어요. 이제 닫아도 돼요.');
    }
    const text = parts.filter(Boolean).join(' ');
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
    const sameFile = previous => previous.phase === 'failed' && previous.use === use && previous.sha256 === job.sha256;
    for (const previous of s.uploads) {
      if (sameFile(previous) && previous.artifactId === artifactId) s.uploads.delete(previous);
    }
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
      job.phase = 'saved';
      s.uploads.delete(job);
      // Reselecting identical bytes can confirm a previously interrupted upload to this paper.
      for (const previous of s.uploads) {
        if (sameFile(previous) && (!previous.artifactId || previous.artifactId === ack.artifact_id)) s.uploads.delete(previous);
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
  return {
    focus(task) { active = task; render(); },
    memo(task,phase) { state(task).memo = phase; render(); },
    prepare, block, discard, upload,
  };
}
