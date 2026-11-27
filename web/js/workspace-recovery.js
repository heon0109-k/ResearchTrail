'use strict';

// Previous account releases kept unfinished edition memos and reader writes in
// account save-status storage. The project form already handles unscoped drafts.
const legacyReaderWrites=new WeakMap();
function legacyReaderReceipt(payload,state) {
  if (!Array.isArray(state?.highlights)) return false;
  if (payload.last_page) return state.last_page===payload.last_page;
  // initial_page inserts only if no other device has set a position.
  if (payload.initial_page) return Number.isSafeInteger(state.last_page) && state.last_page>0;
  const mark=payload.link||payload.highlight;
  const stored=mark && state.highlights.find(h=>h.id===mark.id);
  if (!stored || (mark.record_id && stored.record_id!==mark.record_id)) return false;
  return payload.link ? true : stored.page===mark.page && stored.text===mark.text &&
    JSON.stringify(stored.rects)===JSON.stringify(mark.rects);
}

function retryLegacyReader(api,row,payload) {
  if (!api.current() || S.taskId!==row.task) return Promise.resolve(false);
  const {task,artifactId,key,scope,kind}=row,saves=api.saves;
  const same=()=>JSON.stringify(saves.read(key)?.payload)===JSON.stringify(payload);
  if (!same()) return Promise.resolve(false);
  if (!legacyReaderWrites.has(api)) legacyReaderWrites.set(api,new Map());
  const writes=legacyReaderWrites.get(api);
  if (writes.has(key)) return writes.get(key);
  async function send() {
    saves.track(key,task,kind,'saving',scope.label);
    try {
      const state=await api.write('/tasks/'+task+'/artifacts/'+artifactId+'/reader',payload);
      if (!api.current()) return false;
      if (!same()) {
        // A newer draft is still pending even if this write received a valid receipt.
        if (saves.read(key)) saves.track(key,task,kind,'failed',scope.label);
        return false;
      }
      if (!legacyReaderReceipt(payload,state)) throw Error('저장 결과를 확인하지 못했어요.');
      saves.store(key,null);
      saves.track(key,task,kind,'saved',scope.label);
      return true;
    } catch {
      if (api.current() && saves.read(key)) saves.track(key,task,kind,'failed',scope.label);
      return false;
    }
  }
  const result=send().finally(()=>writes.delete(key));
  writes.set(key,result);
  return result;
}

function listLegacyRecovery(task,api) {
  if (!api.current() || S.taskId!==task || api.resume?.task_id!==task) return [];
  const keys=api.saves.recoveryKeys(task);
  if (!keys.length) return [];
  const scopes=new Map(),labelCounts=new Map();
  for (const doc of api.resume.context.document_contexts) {
    for (const edition of doc.artifacts) {
      const name=[edition.label_text||'PDF',edition.version_text,edition.part_text].filter(Boolean).join(' · ');
      const label=[doc.document.title,name].filter(Boolean).join(' · ');
      if (!scopes.has(edition.artifact_id)) {
        scopes.set(edition.artifact_id,{artifactId:edition.artifact_id,documentId:doc.document_id,label});
        labelCounts.set(label,(labelCounts.get(label)||0)+1);
      }
    }
  }
  const rows=[];
  for (const scope of scopes.values()) {
    if (labelCounts.get(scope.label)>1) scope.label+=' · '+scope.artifactId.slice(0,8);
  }
  for (const key of keys) {
    const item=api.saves.read(key);
    if (!item) continue;
    const [type,,artifactId]=key.split('.');
    const scope=scopes.get(artifactId);
    if (type==='reader' && !item.payload) continue;
    const kind=type==='draft'?'메모':accountReaderOperation(item.payload);
    const row={task,key,artifactId,scope,kind,label:scope?.label||item.label||'기존 판본'};
    if (!scope) row.label+=' · 연결한 판본을 확인할 수 없어요. 이전 입력을 보관하고 있어요.';
    else if (type==='draft') row.label+=' · 이전 메모 이어 쓰기';
    else {
      const page=item.payload.last_page||item.payload.initial_page||item.payload.highlight?.page;
      row.label+=' · '+(page?page+'쪽 ':'')+kind+' 다시 저장';
      row.retry=()=>retryLegacyReader(api,row,item.payload);
    }
    rows.push(row);
  }
  return rows;
}

function renderLegacyRecovery(task,api,el,openMemo,{artifactId,onSaved}={}) {
  el.replaceChildren();
  for (const row of listLegacyRecovery(task,api)) {
    if (artifactId && artifactId!==row.artifactId) continue;
    const button=document.createElement('button');
    button.type='button';button.className='btn sm';button.textContent=row.label;
    button.disabled=!row.scope;
    button.onclick=async()=>{
      if (!api.current() || S.taskId!==task || !api.saves.read(row.key) || !row.scope) return;
      button.disabled=true;
      try {
        if (!row.retry) return await openMemo(row.scope);
        const saved=await row.retry();
        if (!api.current() || S.taskId!==task) return;
        renderLegacyRecovery(task,api,el,openMemo,{artifactId,onSaved});
        if (saved) onSaved?.(row);
      } catch {
        if (api.current() && S.taskId===task) {
          const status=document.createElement('p');
          status.setAttribute('role','status');
          status.textContent='이 판본의 기록을 열지 못했어요. 연결을 확인하고 다시 시도해 주세요.';
          el.appendChild(status);
        }
      } finally {button.disabled=false;}
    };
    el.appendChild(button);
  }
}

function productLegacyReaderRecovery(p,scope,el) {
  const previous=el.querySelector('[data-legacy-recovery]');
  if (!scope.artifact) {previous?.remove();return;}
  const section=previous||document.createElement('div');
  if (!previous) {section.setAttribute('data-legacy-recovery','');el.appendChild(section);}
  renderLegacyRecovery(scope.task,scope.w,section,memo=>scope.active() && scope.w.openRecords(memo),{
    artifactId:scope.artifact,onSaved(){
      if (scope.active() && S.reader===p.id) readerSrc(p,p.page);
    }
  });
}
