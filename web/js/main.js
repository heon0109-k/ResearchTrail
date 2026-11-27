'use strict';
function startResearchTrail(){
  if(typeof S!=='undefined' && S.source==='account'){
    app.textContent=window.parent===window?'계정 타임라인을 보려면 시작 화면에서 로그인해 주세요.':'계정 타임라인을 여는 중…';
    return;
  }
  /* ?demo=1 : 시작 페이지 안에 끼워 넣는 미리보기. 저장된 기록을 읽지도 쓰지도 않고 예시만 보여 준다 */
  if(window.name==='rt-demo'||/[?&]demo=1/.test(location.search)){document.documentElement.classList.add('demo');loadSample();S.zoom='month';S.bubble=null;renderAll();lockDemo()}
  else if(/(?:^|[?&])sample=1(?:&|$)/.test(location.search)){
    history.replaceState(null,'',location.pathname);RET=standaloneProduct||hasMine();loadSample();
  }
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

var accountWorkspace=null;

// Auth supplies transports and an owner. The shared frame and its controls mount
// through showMain() exactly as they do after loading a device project.
async function startAccountTimeline(get,account) {
  if (S.source!=='account') return;
  await screensReady;
  if (!account.current()) return;
  const api=accountWorkspace={...account,write:account.write||get, tasks:[],resume:null,recordRequests:{}};
  let generation=0, read=0, loading=true, projectBaseline={}, paperBaseline=new Map(), recordsDialog;
  const publicKey='researchtrail.account.'+account.projectUrl+'.'+account.accountId+'.task';
  const notice=document.createElement('aside');
  notice.className='product-save-feedback';
  notice.setAttribute('aria-label','계정 저장 상태');
  notice.innerHTML='<span id="workspaceStatus" role="status"></span><span id="memoStatus" role="status"></span>'+
    '<button type="button" id="pdfUploadRetry" class="btn sm" hidden></button><span class="product-retries"></span>';
  document.body.appendChild(notice);
  const status=$('#workspaceStatus'), retries=notice.querySelector('.product-retries');
  const saves=api.saves=createAccountSaveStatus(api.write,account.current,account);
  function showRetries(){
    retries.replaceChildren();
    for(const job of store.pending().filter(j=>j.phase==='failed')){
      const btn=document.createElement('button');
      btn.type='button'; btn.className='btn sm';
      const name=api.tasks.find(t=>t.task_id===job.task)?.task.goal_text;
      btn.textContent=(name?name+' · ':'')+job.label+(job.conflict?' · 내 변경으로 다시 저장':' 다시 저장');
      if(job.reviewTag){
        btn.textContent=(name?name+' · ':'')+'삭제할 논문 다시 확인';
        btn.onclick=async()=>{
          try{
            if(job.task===S.taskId)await refresh();else await selectTask(job.task);
            if(!account.current() || S.taskId!==job.task)return;
            store.releaseTagReview(job.id);
            if(S.tags.some(tag=>tag.id===job.tagRemoval.tag_id))deleteTag(job.tagRemoval.tag_id);
            else status.textContent='이 태그는 이미 삭제됐어요.';
          }catch{status.textContent='태그가 붙은 논문을 다시 불러오지 못했어요.';}
        };
      }else btn.onclick=()=>store.retry(job.id,!!job.conflict).then(async ack=>{
        if(job.path.endsWith('/reader'))accountReaderRefreshMarks(job,ack);
        if (job.path==='/tasks' || /^\/tasks\/[^/]+$/.test(job.path)) await reloadTasks();
        else if (job.task===S.taskId) await refresh();
      }).catch(()=>{});
      retries.appendChild(btn);
    }
  }
  const store=createWorkspaceStore(account,(job,phase,ack)=>{
    if (!account.current()) return;
    if(ack && job.path.endsWith('/active-project'))observeSelection(ack);
    if(phase==='saved'){
      if(/^\/tasks\/[^/]+\/papers$/.test(job.path))saves.registrationSaved(job.task,job.id,ack);
      saves.track('product.'+job.id,job.task,job.label,'idle');
      saves.track('receipt.'+job.task,job.task,job.label,'saved');
    } else saves.track('product.'+job.id,job.task,job.label,phase==='queued'?'saving':phase);
    if(job.volatile && phase!=='saved')status.textContent='이 탭에 재시도 내용을 보관하지 못했어요. 저장이 끝날 때까지 창을 열어 두세요.';
    if(job.conflict)status.textContent='다른 기기에서 같은 항목이 바뀌었어요. 내 변경을 유지하려면 다시 저장해 주세요.';
    if(job.reviewTag && phase==='failed')status.textContent='태그에 속한 논문이 바뀌었어요. 삭제할 논문을 다시 확인해 주세요.';
    showRetries();
  });
  for(const job of store.pending())saves.track('product.'+job.id,job.task,job.label,job.phase==='failed'?'failed':'saving');
  showRetries();
  api.mutate=store.mutate;
  api.removeTag=store.removeTag;
  api.extra=(target,id)=>store.read(S.taskId,target,id).data;
  api.extraVersion=(target,id)=>store.read(S.taskId,target,id).version;
  api.pendingSummary=(target,id)=>store.pending().find(job=>job.task===S.taskId && job.edit?.target===target &&
    job.edit.id===id && job.edit.patch?.memoSummary);
  api.patchExtra=(target,id,patch,options)=>store.patch(options?.task||S.taskId,target,id,patch,options);
  api.editPaper=(id,extras,options)=>api.patchExtra('paper',id,extras,options);
  api.flush=()=>store.flush(S.taskId);
  api.papers=createAccountPaperOperations(api);

  const preferences=['tags','bands','why','zoom','overviewZoom','resumeOpen','judge','next','filterTag'];
  const paperFields=['tag','resources','abs','authors','year','lastReadOrder'];
  const snapshot=(data,keys)=>Object.fromEntries(keys.filter(k=>data[k]!==undefined).map(k=>[k,structuredClone(data[k])]));
  const differences=(a,b)=>Object.fromEntries(Object.keys(b).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])).map(k=>[k,b[k]]));
  function baseline(){
    projectBaseline=snapshot(S,preferences);
    paperBaseline=new Map(S.papers.map(p=>[p.id,snapshot(p,paperFields)]));
  }
  api.saveChanges=()=>{
    if(loading || !S.taskId || S.example || !account.current())return false;
    const now=snapshot(S,preferences), task=S.taskId;
    const delta=differences(projectBaseline,now); projectBaseline=now;
    if(Object.keys(delta).length)store.patch(task,'project',null,delta).catch(()=>{});
    for(const paper of S.papers){
      const before=paperBaseline.get(paper.id), current=snapshot(paper,paperFields);
      paperBaseline.set(paper.id,current);
      if(!before)continue;
      const changes=differences(before,current);
      if(Object.keys(changes).length){
        const projected=store.projected(task,'paper',paper.id);
        const patch=differences(projected,changes);
        if(Object.keys(patch).length)store.patch(task,'paper',paper.id,patch).catch(()=>{});
      }
    }
    return !store.pending().some(j=>j.task===task);
  };
  function showLoadError(message,retry){
    status.replaceChildren(document.createTextNode(message+' '));
    const button=document.createElement('button');
    button.type='button';button.className='btn sm';button.textContent='다시 불러오기';
    button.onclick=()=>retry().catch(()=>{});
    status.appendChild(button);
  }
  function current(n){return account.current() && generation===n;}
  async function fetchProject(task,fresh) {
    const n=generation, attempt=++read, base='/tasks/'+encodeURIComponent(task);
    const [catalog,links,resume,meta]=await Promise.all([
      account.listWorkspacePapers?account.listWorkspacePapers(task):get(base+'/papers?view=workspace'),
      get(base+'/paper-links'),get(base+'/resume'),get(base+'/workspace')
    ]);
    if(!current(n)||attempt!==read)return;
    if(resume.task_id!==task || !Array.isArray(catalog.papers) || !Array.isArray(links.links) || !meta.project)
      throw Error('프로젝트 응답을 확인하지 못했어요.');
    store.load(task,meta);
    api.resume=resume;api.recordRequests=meta.record_requests||{};api.readingPages=meta.reading_pages||{};
    api.readerHighlights=meta.reader_highlights||{};
    S.name=api.tasks.find(t=>t.task_id===task)?.task.goal_text || '';
    const data=store.projected(task,'project');
    for (const key of preferences) if(Object.hasOwn(data,key)) S[key]=structuredClone(data[key]);
    S.tags=(Array.isArray(S.tags)?S.tags:[]).filter(t=>t && typeof t.name==='string' && /^[a-zA-Z0-9_-]+$/.test(t.id))
      .map(t=>({id:t.id,name:t.name,color:/^#[0-9a-f]{6}$/i.test(t.color)?t.color:PAL[0]}));
    if(S.filterTag!=null && S.filterTag!=='' && !S.tags.some(tag=>tag.id===S.filterTag))S.filterTag=null;
    if(!['week','month','all'].includes(S.zoom))S.zoom='month';
    if(!Number.isFinite(S.overviewZoom) || S.overviewZoom<1 || S.overviewZoom>4)S.overviewZoom=1;
    if(fresh){
      if(typeof accountRestoreReaderPrefs==='function')accountRestoreReaderPrefs(data);
    }
    S.links=links.links.map(l=>({id:l.link_id,from:l.from_document_use_id,to:l.to_document_use_id,reason:l.reason_text||''}));
    const old=new Map(S.papers.map(p=>[p.id,p]));
    S.papers=catalog.papers.map(row=>{
      const p=accountPaperFromRow(row,store.projected(task,'paper',row.document_use_id));
      const prior=old.get(p.id), selected=prior && p.artifacts.find(a=>a.artifact_id===prior.artifactId);
      if(selected){p.artifactId=selected.artifact_id;p.pdf=!!selected.pdf?.available;p.fname=selected.label_text||'';}
      if(!fresh && prior && S.reader===p.id){
        // The open editor owns in-flight drafts and PDF.js handles.
        for(const k of ['title','use','date','artifacts','memo','link','tag','resources','state'])
          prior[k]=p[k];
        return prior;
      }
      accountHydratePaperRecords(p,resume);
      return p;
    });
    if(fresh && typeof restoreAccountGraphLayout==='function')restoreAccountGraphLayout(data.graphLayout);
    if(fresh && typeof restoreAccountPaperList==='function')restoreAccountPaperList(data.listControls);
    if(S.sel && !paperBy(S.sel)){S.sel=null;S.panel='none';S.reader=null;}
    baseline();
    loading=false;status.textContent='';
    if(fresh || !$('#tName'))showMain();
    else if(!S.reader && S.panel!=='add')renderAll();
    saves.focus(task);
  }
  async function refresh(){
    const task=S.taskId,n=generation;
    if(!task || !account.current())return;
    try{await fetchProject(task,false);}
    catch(e){if(current(n))showLoadError('프로젝트를 다시 불러오지 못했어요.',refresh);throw e;}
  }
  async function selectTask(id) {
    if(!account.current() || (id && !api.tasks.some(t=>t.task_id===id)))return;
    ++generation; const n=generation;
    if(typeof resetPaperWorkspaceControls==='function')resetPaperWorkspaceControls();
    if(typeof accountCloseProductReader==='function')accountCloseProductReader();
    recordsDialog?.close();
    loading=true;reset();
    S.reader=null;S.taskId=id||null;S.accountId=account.accountId;S.scroll=null;S.restoreViewOnce=false;
    S.prevSeen=0;S.bubbleDay='';S.detailScroll=null;S.name=id?api.tasks.find(t=>t.task_id===id).task.goal_text:'새 프로젝트';
    if(typeof RBSEL!=='undefined')RBSEL=null;
    if(typeof LIST_STATE!=='undefined')LIST_STATE='all';
    if(typeof listSort!=='undefined')listSort='recent';
    saves.focus(id);
    try {if(id)sessionStorage.setItem(publicKey,JSON.stringify(id));else sessionStorage.removeItem(publicKey);}catch{}
    if(!id){baseline();showMain();loading=false;status.textContent='프로젝트 메뉴에서 첫 프로젝트를 만들어 주세요.';return;}
    app.replaceChildren();status.textContent='프로젝트를 불러오는 중이에요.';
    try{await fetchProject(id,true);}
    catch(e){if(current(n)){
      S.taskId=null;S.name='프로젝트 선택';S.papers=[];S.links=[];
      showMain();showLoadError('이 프로젝트를 불러오지 못했어요.',()=>selectTask(id));
    }throw e;}
  }
  let taskLoad=0, choiceRevision=0, selection=null;
  function observeSelection(value) {
    if (!Number.isSafeInteger(value?.revision) || value.revision<0 ||
        (value.task_id!==null && typeof value.task_id!=='string'))return;
    choiceRevision=Math.max(choiceRevision,value.revision);
    if (!selection || value.revision>selection.revision ||
        (value.revision===selection.revision && (value.request_id||'')>=(selection.request_id||''))) selection=value;
    store.reconcileSelection(selection,new Set(api.tasks.map(t=>t.task_id)));
  }
  function chooseTask(id) {
    if (!account.current() || !id || !api.tasks.some(t=>t.task_id===id))return;
    const opened=selectTask(id);
    if (selection) {
      const pending=store.pending().filter(j=>j.path.endsWith('/active-project'));
      const revision=choiceRevision=Math.max(choiceRevision,...pending.map(j=>j.body.revision))+1;
      api.mutate('마지막 프로젝트','/tasks/'+encodeURIComponent(id)+'/active-project',{revision},{method:'PATCH',onAck:async ack=>{
        if (!account.current())return;
        await opened;
        if (account.current() && S.taskId===id && choiceRevision===selection.revision && selection.task_id!==id)
          status.textContent='다른 기기에서 마지막 프로젝트를 변경했어요. 이 프로젝트를 다시 선택하면 계정에 저장해요.';
      }}).catch(()=>{});
    }
    return opened;
  }
  async function reloadTasks(preferred){
    const version=++taskLoad, started=generation;
    try {
      const {tasks,selection:remote}=await get('/tasks?view=workspace');
      if(!account.current()||version!==taskLoad||started!==generation)return;
      api.tasks=tasks;saves.projects(tasks);
      observeSelection(remote);
      let tab;
      try{tab=JSON.parse(sessionStorage.getItem(publicKey));}catch{}
      if (preferred && preferred!==S.taskId && tasks.some(t=>t.task_id===preferred)) {
        // Creating a project from the picker explicitly selects the new project.
        await chooseTask(preferred);
      } else {
        const id=[S.taskId,tab,selection?.task_id,tasks[0]?.task_id].find(id=>id && tasks.some(t=>t.task_id===id));
        await selectTask(id);
      }
    }catch(e){if(account.current() && version===taskLoad && !S.taskId)showLoadError('프로젝트 목록을 불러오지 못했어요.',reloadTasks);throw e;}
  }
  Object.assign(api,{select:selectTask,refresh,reloadTasks});
  projAccountMenu=createAccountProjectMenu({catalog:()=>({active:S.taskId,list:api.tasks.map(t=>({id:t.task_id,name:t.task.goal_text,count:t.paper_count}))}),
    select:chooseTask,refresh:reloadTasks,request:(path,body,opts)=>api.mutate('프로젝트',path,body,opts)});
  api.openRecords=async(scope)=>{
    if (!S.taskId || !account.current())return;
    const version=generation, task=S.taskId;
    try{
      if(!recordsDialog)recordsDialog=await createProjectRecordsDialog(api,saves);
      if(current(version))await recordsDialog.open(task,scope);
    }catch{if(current(version))showLoadError('프로젝트 기록을 불러오지 못했어요.',api.openRecords);}
  };
  await reloadTasks().catch(()=>{});
}

// Project-level records remain accessible from the project menu, including notes
// written before papers or PDFs were attached. Mount only this optional form.
async function createProjectRecordsDialog(api,saves) {
  const response=await fetch('views/project-records.html');
  if(!response.ok || !api.current())throw Error('프로젝트 기록을 열지 못했어요.');
  const dialog=document.createElement('dialog');
  dialog.className='product-records-dialog';
  dialog.setAttribute('aria-label','프로젝트 기록');
  const template=document.createElement('template');
  template.innerHTML=await response.text();
  // The reader and the project record editor use some of the same control IDs.
  // Keep their labels, focus targets and event handlers scoped to their own form.
  const host=document.createElement('div');
  dialog.appendChild(host);
  const form=host.attachShadow({mode:'open'});
  for(const css of ['style.css','styles/paper-panel.css','styles/reading-records.css','styles/account.css']){
    const link=document.createElement('link');link.rel='stylesheet';link.href=css;form.appendChild(link);
  }
  form.appendChild(template.content.cloneNode(true));
  const lookup=selector=>form.querySelector(selector);
  lookup('form[method=dialog]').addEventListener('submit',event=>{event.preventDefault();dialog.close();});
  const memos=createAccountMemos(api.write,api,saves,()=>{},lookup);
  dialog.addEventListener('close',()=>{memos.clear();dialog.remove();});
  return {
    async open(task,scope){
      if(!api.current() || S.taskId!==task)return;
      document.body.appendChild(dialog);
      if(!dialog.open)dialog.showModal();
      await memos.open(task,scope);
      if(api.current() && S.taskId===task && dialog.open)
        renderLegacyRecovery(task,api,lookup('#editionRecovery'),item=>memos.open(task,item));
    },
    close(){if(dialog.open)dialog.close();}
  };
}
