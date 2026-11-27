'use strict';

// Keep a receipt-bound request, not a copy of a project. Tab recovery is scoped
// to the Supabase project and owner. Independent records have independent lanes.
function createWorkspaceStore(account, changed) {
  const prefix='researchtrail.pending.'+account.projectUrl+'.'+account.accountId+'.';
  const jobs=new Map(), scopes=new Map(), running=new Map(), waiting=new Map();
  const clone=value=>value===undefined?undefined:structuredClone(value);
  const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
  const safeKey=k=>!['__proto__','constructor','prototype'].includes(k);
  function equal(a,b){
    if(a===b)return true;
    if(!a || !b || typeof a!=='object' || typeof b!=='object' || Array.isArray(a)!==Array.isArray(b))return false;
    const keys=Object.keys(a);
    return keys.length===Object.keys(b).length && keys.every(k=>Object.hasOwn(b,k) && equal(a[k],b[k]));
  }
  const scopedKey=(task,target,id)=>JSON.stringify([task,target,target==='project'?null:id]);
  function merge(data,patch) {
    if (!object(patch)) return clone(patch);
    const result=Object.assign(Object.create(null),object(data)?data:{});
    for (const [key,value] of Object.entries(patch)) if(safeKey(key)) {
      if (value===null) delete result[key]; else result[key]=merge(result[key],value);
    }
    return result;
  }
  function conflicts(before,now,patch) {
    if (!object(patch)) return !equal(before,now) && !equal(now,patch===null?undefined:patch);
    return Object.keys(patch).some(k=>conflicts(before?.[k],now?.[k],patch[k]));
  }
  function previousValues(data,patch){
    if(!object(patch))return clone(data);
    return Object.fromEntries(Object.keys(patch).filter(k=>safeKey(k) && data && Object.hasOwn(data,k))
      .map(k=>[k,previousValues(data[k],patch[k])]));
  }
  function read(task,target,id) {return scopes.get(scopedKey(task,target,id)) || {version:0,data:{}};}
  function load(task,snapshot) {
    function put(target,id,value) {
      if (value && Number.isSafeInteger(value.version) && value.version>=read(task,target,id).version)
        scopes.set(scopedKey(task,target,id),clone(value));
    }
    put('project',null,snapshot.project);
    for (const [kind,rows] of [['paper',snapshot.papers],['artifact',snapshot.artifacts]])
      for (const [id,val] of Object.entries(rows||{})) put(kind,id,val);
  }
  function persist(job) {
    const {id,task,lane,label,path,method,body,edit,order,conflict,tagRemoval,reviewTag}=job;
    try {sessionStorage.setItem(prefix+id,JSON.stringify({id,task,lane,label,path,method,body,edit,order,conflict,tagRemoval,reviewTag})); job.volatile=false;}
    catch {job.volatile=true;}
  }
  const pending=()=>[...jobs.values()].sort((a,b)=>a.order-b.order);
  try {
    for(let i=0;i<sessionStorage.length;i++){
      const k=sessionStorage.key(i); if(!k?.startsWith(prefix)) continue;
      let job;
      try {job=JSON.parse(sessionStorage.getItem(k));}catch{continue;}
      if (!job?.id || !job.path?.startsWith('/tasks') || !job.lane)continue;
      if(!job.tagRemoval && job.path.endsWith('/tag-removal') && job.body?.tag_id){
        const {tag_id,archive_papers}=job.body;
        job.tagRemoval={tag_id,archive_papers};
        job.lane=JSON.stringify([job.task,'tag-removal',tag_id]);
        // Older archive requests did not record which papers the user saw.
        if(archive_papers)job.reviewTag=true;
      }
      jobs.set(job.id,{...job,phase:'queued',recovered:true});
    }
  } catch { /* The session may have no accessible recovery storage. */ }
  // Each lane sends one request at a time. Only the head could have lost its
  // receipt during refresh. Later edits resume in order after that exact retry.
  const stopped=new Set();
  for(const job of pending()){
    if(stopped.has(job.lane))continue;
    job.phase='failed';
    stopped.add(job.lane);
  }
  let seq=Math.max(0,...pending().map(j=>j.order));
  function ticket(job) {
    if (!waiting.has(job.id)) {
      let resolve,reject;
      const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
      waiting.set(job.id,{promise,resolve,reject});
    }
    return waiting.get(job.id).promise;
  }
  function next(lane){return pending().find(j=>j.lane===lane);}
  function settle(job,error,ack) {
    const wait=waiting.get(job.id);
    waiting.delete(job.id);
    if(error) wait?.reject(error); else wait?.resolve(ack);
  }
  function tagDependency(job,tag){
    if(job.edit?.target==='project')return Object.hasOwn(job.edit.patch,'tags');
    if(job.edit?.target==='paper' && Object.hasOwn(job.edit.patch,'tag'))
      return job.edit.patch.tag===tag || read(job.task,'paper',job.edit.id).data.tag===tag;
    return job.path.endsWith('/papers') && job.body?.workspace_data?.tag===tag;
  }
  function tagCreationsBefore(job){
    const tag=job.edit?.target==='paper'?job.edit.patch.tag:
      job.path.endsWith('/papers')?job.body?.workspace_data?.tag:null;
    if(!tag || read(job.task,'project').data.tags?.some(t=>t.id===tag))return [];
    return pending().filter(j=>j.task===job.task && j.order<job.order &&
      j.edit?.target==='project' && j.edit.patch.tags?.some(t=>t.id===tag));
  }
  async function sendTagRemoval(job){
    const {tag_id,archive_papers,expected_papers}=job.tagRemoval;
    for(const prev of pending().filter(j=>j.task===job.task && j.order<job.order && tagDependency(j,tag_id))){
      if(!jobs.has(prev.id))continue;
      if(next(prev.lane)?.phase==='failed')throw Error('이 태그에 대한 미확인 저장을 먼저 다시 시도해 주세요.');
      await ticket(prev);
    }
    if(!job.body){
      job.body={...job.tagRemoval,request_id:job.id,version:read(job.task,'project').version};
      persist(job);
    }
    const send=()=>account.write(job.path,job.body,{method:'POST'});
    try{return await send();}catch(error){
      if(error.status!==409)throw error;
      const snapshot=await account.write('/tasks/'+job.task+'/workspace');
      load(job.task,snapshot);
      const members=Object.entries(snapshot.papers || {}).filter(([,v])=>v.data?.tag===tag_id).map(([id])=>id).sort();
      if(archive_papers && !equal(members,expected_papers)){
        job.reviewTag=true;
        throw Error('이 태그의 논문이 바뀌었어요. 삭제할 논문을 다시 확인해 주세요.');
      }
      job.body.version=snapshot.project.version;
      persist(job);
      return send();
    }
  }
  async function attempt(job) {
    if (!account.current()) throw Error('계정이 변경되었어요.');
    if(job.reviewTag)throw Error('삭제할 논문을 다시 확인해 주세요.');
    if(job.tagRemoval)return sendTagRemoval(job);
    for(const prior of tagCreationsBefore(job)){
      if(!jobs.has(prior.id))continue;
      if(next(prior.lane)?.phase==='failed')throw Error('새 태그의 저장을 먼저 다시 시도해 주세요.');
      await ticket(prior);
      if(!account.current())throw Error('계정이 변경되었어요.');
    }
    if (job.edit && !job.body) {
      const {target,id,patch}=job.edit;
      const head=read(job.task,target,id);
      job.edit.before=previousValues(head.data,patch);
      job.body={target,...(target==='project'?{}:{id}),version:head.version,patch,request_id:job.id};
      if(job.edit.paperFields)job.body.paper_fields=job.edit.paperFields;
      persist(job);
    }
    try { return await account.write(job.path,job.body,{method:job.method}); }
    catch (error) {
      if (!job.edit || error.status!==409) throw error;
      const {target,id,patch,before}=job.edit;
      load(job.task,await account.write(job.path));
      const head=read(job.task,target,id);
      if ((job.edit.paperFields || conflicts(before,head.data,patch)) && !job.overwrite) {
        job.conflict=true;
        throw Error('다른 기기에서 같은 항목을 수정했어요. 내용을 확인해 주세요.');
      }
      job.overwrite=false; job.conflict=false;
      job.body={...job.body,version:head.version};
      job.edit.before=previousValues(head.data,patch);
      persist(job);
      return account.write(job.path,job.body,{method:job.method});
    }
  }
  function pump(lane) {
    if (running.has(lane)) return;
    const job=next(lane);
    if (!job || job.phase!=='queued') return;
    job.phase='saving';
    const sent=Promise.resolve().then(()=>attempt(job)).then(ack=>{
      if (!jobs.has(job.id))return;
      if (!account.current()) throw Error('계정이 변경되었어요.');
      if(job.path.endsWith('/active-project') && (!Number.isSafeInteger(ack?.revision) || ack.revision<job.body.revision ||
          (typeof ack.task_id!=='string' && ack.task_id!==null) || typeof ack.request_id!=='string'))
        throw Error('마지막 프로젝트의 계정 저장을 확인하지 못했어요.');
      if(job.path.endsWith('/reader')){
        const body=job.body, marks=ack?.highlights;
        if(!Array.isArray(marks) || (body.last_page && ack.last_page!==body.last_page) ||
          (body.highlight && !marks.some(h=>h.id===body.highlight.id && h.page===body.highlight.page &&
            h.text===body.highlight.text && equal(h.rects,body.highlight.rects) &&
            (body.highlight.record_id==null || h.record_id===body.highlight.record_id))) ||
          (body.link && !marks.some(h=>h.id===body.link.id && h.record_id===body.link.record_id)) ||
          (body.remove_highlight && marks.some(h=>h.id===body.remove_highlight)))
          throw Error('이 판본의 읽기 기록을 확인하지 못했어요.');
      }
      if(job.path.endsWith('/next-actions') &&
        (!ack?.next_action_id || ack.source_record_id!==job.body.source_record_id ||
          ack.saved_action?.action_text!==job.body.reviewed_action?.action_text))
        throw Error('확인한 다음 작업의 저장 응답을 확인하지 못했어요.');
      if(job.path.endsWith('/records') && !ack?.record_id)
        throw Error('저장한 메모의 번호를 확인하지 못했어요.');
      if (/^\/tasks\/[^/]+\/papers$/.test(job.path) &&
          (ack?.task_id!==job.task || !ack.document_use_id || !ack.document_id))
        throw Error('이 프로젝트의 논문 등록을 확인하지 못했어요.');
      if (job.path.endsWith('/paper-links') && (!ack?.link_id ||
          ack.from_document_use_id!==job.body.from_document_use_id || ack.to_document_use_id!==job.body.to_document_use_id))
        throw Error('선택한 두 논문의 연결을 확인하지 못했어요.');
      if (job.edit || job.tagRemoval) {
        if (!Number.isSafeInteger(ack?.version) || !object(ack?.data)) throw Error('저장 응답을 확인하지 못했어요.');
        if(job.edit?.paperFields && (!equal(ack.paper_fields,job.edit.paperFields) ||
            !equal(merge(ack.data,job.edit.patch),ack.data)))
          throw Error('논문 수정 내용과 태그의 저장을 함께 확인하지 못했어요.');
        if(job.tagRemoval && (!Number.isSafeInteger(ack.removed) || !Array.isArray(ack.data.tags) ||
            ack.data.tags.some(t=>t.id===job.tagRemoval.tag_id) ||
            (job.tagRemoval.archive_papers && ack.removed!==job.tagRemoval.expected_papers.length)))
          throw Error('태그 삭제 결과를 확인하지 못했어요.');
        const target=job.edit?.target || 'project', id=job.edit?.id;
        if(ack.version>=read(job.task,target,id).version)
          scopes.set(scopedKey(job.task,target,id),clone(ack));
      }
      try {sessionStorage.removeItem(prefix+job.id);} catch {}
      jobs.delete(job.id);
      settle(job,null,ack);
      const overtaken=job.path.endsWith('/active-project') && ack.task_id!==job.task;
      changed(job,overtaken?'idle':'saved',ack);
      // A UI refresh failure must not turn an acknowledged mutation into a second write.
      if (job.onAck) Promise.resolve().then(()=>job.onAck(ack)).catch(()=>{});
    }).catch(error=>{
      if (!jobs.has(job.id))return;
      job.phase='failed'; job.error=error.message;persist(job);
      settle(job,error);
      for (const later of pending().filter(j=>j.lane===lane && j.id!==job.id))
        settle(later,Error('먼저 실패한 저장을 다시 시도해 주세요.'));
      changed(job,'failed');
    }).finally(()=>{running.delete(lane);pump(lane);});
    running.set(lane,sent); changed(job,'saving');
  }
  function enqueue(job) {
    const existing=jobs.get(job.id);
    if (existing) {
      if (existing.lane!==job.lane || existing.method!==job.method || !equal(existing.path,job.path) ||
          !equal(existing.edit?.paperFields,job.edit?.paperFields) ||
          !equal(existing.tagRemoval || existing.edit?.patch || existing.body,job.tagRemoval || job.edit?.patch || job.body))
        return Promise.reject(Error('다른 변경에 같은 저장 번호를 사용할 수 없어요.'));
      if (job.onAck) existing.onAck=job.onAck;
      return retry(existing.id);
    }
    job.order=++seq; job.phase='queued'; jobs.set(job.id,job);
    persist(job); changed(job,'queued');
    const promise=ticket(job);
    if(next(job.lane)?.phase==='failed') settle(job,Error('이전 변경의 저장을 먼저 확인해 주세요.'));
    pump(job.lane);
    return promise;
  }
  function retry(id,overwrite=false) {
    const job=jobs.get(id); if(!job)return Promise.resolve();
    if(job.reviewTag)return Promise.reject(Error('태그에 속한 논문을 다시 확인해 주세요.'));
    const first=next(job.lane);
    if(first!==job && first.phase==='failed') return Promise.reject(Error('이전 변경의 저장을 먼저 확인해 주세요.'));
    if (job.phase==='failed'){job.phase='queued'; job.overwrite=overwrite;}
    const promise=ticket(job); pump(job.lane); return promise;
  }
  function mutate(label,path,body,options={}) {
    const reader=path.endsWith('/reader');
    const id=body?.request_id || options.requestId || crypto.randomUUID();
    const data=clone(body||{});
    if (!reader) data.request_id=id;
    let lane=path;
    if (reader) lane+='/'+(data.highlight?.id || data.link?.id || data.remove_highlight || 'page');
    else if (/\/(records|next-actions|tasks|papers|paper-links|active-project)$/.test(path)) lane+='/'+id;
    return enqueue({id,lane,path,label,task:path.split('/')[2]||'',body:data,method:options.method||'POST',onAck:options.onAck});
  }
  function patch(task,target,id,data,options={}) {
    if (!task) return Promise.reject(Error('프로젝트를 먼저 선택해 주세요.'));
    return enqueue({id:options.requestId||options.request_id||crypto.randomUUID(),lane:scopedKey(task,target,id),task,
      label:options.label||({project:'프로젝트 설정',paper:'논문 정보',artifact:'판본 기록'}[target]),
      path:'/tasks/'+task+'/workspace',method:'PATCH',edit:{target,id,patch:clone(data),
        ...(options.paperFields?{paperFields:clone(options.paperFields)}:{})},onAck:options.onAck});
  }
  function releaseTagReview(id){
    const job=jobs.get(id);
    if(!job?.tagRemoval || !job.reviewTag || job.phase!=='failed')return;
    jobs.delete(id);
    try{sessionStorage.removeItem(prefix+id);}catch{}
    changed(job,'idle');
    pump(job.lane);
  }
  function removeTag(task,tag,archivePapers,ids) {
    if(archivePapers && !Array.isArray(ids))return Promise.reject(Error('삭제할 논문을 확인해 주세요.'));
    const tagRemoval={tag_id:tag,archive_papers:!!archivePapers};
    if(archivePapers)tagRemoval.expected_papers=[...new Set(ids)].sort();
    const lane=JSON.stringify([task,'tag-removal',tag]);
    const previous=next(lane);
    if(previous?.reviewTag)releaseTagReview(previous.id);
    else if(previous && !equal(previous.tagRemoval,tagRemoval))
      return Promise.reject(Error('이 태그에 대한 이전 저장을 먼저 확인해 주세요.'));
    return enqueue({id:next(lane)?.id || crypto.randomUUID(),lane,task,tagRemoval,label:'태그 삭제',
      path:'/tasks/'+task+'/tag-removal',method:'POST'});
  }
  async function flush(task) {
    while (pending().some(j=>j.task===task)) {
      const jobsForTask=pending().filter(j=>j.task===task);
      if(jobsForTask.some(j=>j.phase==='failed')) throw Error('확인되지 않은 저장을 먼저 다시 시도해 주세요.');
      await Promise.all(jobsForTask.map(ticket));
    }
  }
  function projected(task,target,id) {
    return pending().filter(j=>j.lane===scopedKey(task,target,id) && j.edit)
      .reduce((data,j)=>merge(data,j.edit.patch),clone(read(task,target,id).data));
  }
  function reconcileSelection(selection,eligible) {
    for (const job of pending()) {
      if (!job.path.endsWith('/active-project'))continue;
      const revision=job.body.revision;
      if (eligible.has(job.task) && (revision>selection.revision ||
          (revision===selection.revision && job.id>selection.request_id)))continue;
      // A newer confirmed choice or an archived task retires only this preference.
      // An in-flight response cannot revive a retired request.
      jobs.delete(job.id);
      try {sessionStorage.removeItem(prefix+job.id);} catch {}
      settle(job,null,selection);changed(job,'idle');
      pump(job.lane);
    }
  }
  return {read,load,mutate,patch,retry,removeTag,releaseTagReview,pending,flush,projected,reconcileSelection};
}
