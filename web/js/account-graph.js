'use strict';

// Adapt existing account documents and their editions to the original paper controls.
function accountPaperFromRow(row, extras = {}) {
  const artifacts = row.artifacts || [];
  const editions = artifacts.filter(a => a.pdf || a.can_attach_pdf);
  const selected = editions.find(a=>a.artifact_id===extras.selectedArtifactId) || (editions.length===1 ? editions[0] : null);
  const originalLink = artifacts.find(a => a.access_locator_text);
  const link = Object.hasOwn(row,'access_locator_text') ? row.access_locator_text : originalLink?.access_locator_text;
  return {
    ...row, artifacts, id:row.document_use_id, title:row.document.title,
    date:row.date ?? null, memo:row.use?.purpose_text || '', link:link || '',
    state:Object.keys(STATES).find(k => STATES[k].t === row.use?.reading_state_text) || null,
    pdf:!!selected?.pdf?.available, artifactId:selected?.artifact_id || null, fname:selected?.label_text || '',
    tag:extras.tag || '', resources:Array.isArray(extras.resources) ? extras.resources : [],
    dismissedResourceUrls:Array.isArray(extras.dismissedResourceUrls) ? extras.dismissedResourceUrls : [],
    abs:extras.abs || '', authors:extras.authors || '', year:extras.year || '',
    lastReadOrder:Number.isSafeInteger(extras.lastReadOrder) ? extras.lastReadOrder : 0,
  };
}

function createAccountPaperOperations(workspace) {
  const scope = () => {
    const task = S.taskId;
    if (!task || !workspace.current()) throw Error('먼저 계정 프로젝트를 선택해 주세요.');
    return {task, path:'/tasks/'+encodeURIComponent(task), current:() => workspace.current() && S.taskId===task};
  };
  function paperLabel(id) {
    const paper=paperBy(id);
    if (!paper?.title) return String(id).slice(-8);
    const brief=paper.title.length>45 ? paper.title.slice(0,45)+'…' : paper.title;
    return S.papers.some(other=>other.id!==id && other.title===paper.title) ? brief+' · '+id.slice(-8) : brief;
  }
  const retries=new Map();
  function request(label,path,body,method) {
    const signature=JSON.stringify([path,method,body]);
    const id=retries.get(signature) || crypto.randomUUID();
    retries.set(signature,id);
    const acknowledged=()=>{if(retries.get(signature)===id)retries.delete(signature);};
    return workspace.mutate(label,path,{...body,request_id:id},{method,onAck:acknowledged})
      .then(result=>{acknowledged();return result;});
  }
  async function attach(paper,file,artifactId) {
    return upload(scope(),paper,file,artifactId);
  }
  async function upload(project,paper,file,artifactId,registration) {
    const prior=paper.artifacts?.find(a=>a.artifact_id===artifactId);
    const sha256=registration?.uploadJob?.sha256 || await validateAccountPdf(file,prior?.pdf?.sha256);
    if (!workspace.current()) throw Error('계정이 변경되었어요.');
    const job=registration?.uploadJob || workspace.saves.prepare(project.task,paper.id+'/'+(artifactId || ''),file);
    job.sha256=sha256;
    let edition;
    const ok=await workspace.saves.upload(job,file,paper.id,artifactId,async ack=>{
      edition={...prior,artifact_id:ack.artifact_id,label_text:prior?.label_text || file.name,
        pdf:{available:true,document_use_id:paper.id,sha256,size_bytes:file.size}};
      if(registration)registration.uploaded=edition;
      if (!project.current()) return;
      if (!paperBy(paper.id) && registration) {
        try { await workspace.refresh(); } catch { /* The upload receipt is already confirmed. */ }
      }
      if (!project.current()) return;
      const currentPaper=paperBy(paper.id) || paper;
      const artifacts=(currentPaper.artifacts || []).filter(a=>a.artifact_id!==edition.artifact_id);
      Object.assign(currentPaper,{artifacts:[...artifacts,edition],artifactId:edition.artifact_id,pdf:true,fname:edition.label_text});
      if (currentPaper!==paper) Object.assign(paper,{artifacts:currentPaper.artifacts,artifactId:edition.artifact_id,pdf:true,fname:edition.label_text});
      if (currentPaper.artifacts.filter(a=>a.pdf||a.can_attach_pdf).length>1) {
        workspace.patchExtra('paper',paper.id,{selectedArtifactId:edition.artifact_id},{task:project.task,label:'읽을 PDF 판본'}).catch(()=>{});
      }
      if (!S.reader) renderAll();
    });
    if (!ok) throw Error('PDF 업로드를 확인하지 못했어요. 같은 파일로 다시 시도해 주세요.');
    return edition;
  }
  // The registration receipt covers the selected task, paper and all of its metadata.
  // Private PDF bytes go to the separate upload route only after registration succeeds.
  async function register(p,file,job) {
    const project=scope();
    if (job.task && job.task!==project.task) throw Error('프로젝트가 변경되었어요.');
    job.task=project.task;
    if (!job.requestId) {
      const sha256=file ? await validateAccountPdf(file) : null;
      if (!project.current()) throw Error('프로젝트가 변경되었어요.');
      const data={};
      for (const key of ['tag','abs','authors','year']) if (p[key]) data[key]=p[key];
      job.requestId=crypto.randomUUID();
      job.body={request_id:job.requestId,
        ...(p.document_id ? {document_id:p.document_id} : {document:{title:p.title,material_kind_text:'논문'}}),
        use:{purpose_text:p.memo || null,reading_state_text:STATES[p.state]?.t || null}, date:p.date || null,
        artifacts:p.link ? [{access_locator_text:p.link}] : [], ...(Object.keys(data).length ? {workspace_data:data} : {})};
      job.paper={...p,artifacts:[]};
      if (file) {
        job.file=file;
        job.uploadJob=workspace.saves.prepare(project.task,job.requestId,file,'selected');
        workspace.saves.expectRegistrationPdf(job.uploadJob,job.requestId,sha256,p.title);
      }
    }
    const finish=async receipt=>{
      if (!receipt?.document_use_id) throw Error('논문 등록을 확인하지 못했어요.');
      job.receipt=receipt;
      Object.assign(job.paper,{...receipt,id:receipt.document_use_id});
      if (job.file && !job.uploaded) {
        workspace.saves.registrationSaved(project.task,job.requestId,receipt);
        await upload(project,job.paper,job.file,undefined,job);
      }
      return receipt.document_use_id;
    };
    if (job.receipt) return finish(job.receipt);
    try {
      job.failed=false;
      const receipt=await workspace.mutate(p.title.slice(0,45)+' · 논문 등록',project.path+'/papers',job.body,
        {onAck:ack=>{if(job.failed)return finish(ack);}});
      return await finish(receipt);
    } catch (error) {
      job.failed=true;
      if(job.uploadJob && !job.receipt)workspace.saves.block(job.uploadJob);
      throw error;
    }
  }
  async function update(p,changes) {
    const project=scope(), fields={}, extra={};
    const names={title:'title',memo:'purpose_text',date:'date',link:'access_locator_text',state:'reading_state_text'};
    for (const [key,value] of Object.entries(changes)) {
      if (Object.hasOwn(names,key)) fields[names[key]]=key==='state' ? STATES[value]?.t || null : value || null;
      else if (key==='tag' || key==='resources' || key==='dismissedResourceUrls') extra[key]=value;
    }
    const requests=[];
    if (Object.keys(fields).length) requests.push(request(paperLabel(p.id)+' · 논문 정보',project.path+'/papers/'+p.id,fields,'PATCH').then(()=>{
      if (!project.current()) return;
      const restored=paperBy(p.id) || p;
      for (const key of Object.keys(changes)) if (Object.hasOwn(names,key)) restored[key]=changes[key];
      if ('state' in changes) restored.use={...restored.use,reading_state_text:fields.reading_state_text};
    }));
    if (Object.keys(extra).length) {
      const signature=JSON.stringify([project.path,p.id,extra]);
      const requestId=retries.get(signature) || crypto.randomUUID();
      retries.set(signature,requestId);
      const clear=()=>{if(retries.get(signature)===requestId)retries.delete(signature);};
      requests.push(workspace.patchExtra('paper',p.id,extra,{task:project.task,requestId,onAck:clear,label:paperLabel(p.id)+' · 논문 정보'}).then(()=>{
        clear();
        if (project.current()) Object.assign(paperBy(p.id) || p,extra);
      }));
    }
    const results=await Promise.allSettled(requests);
    const failed=results.find(r=>r.status==='rejected');
    if (failed) throw failed.reason;
  }
  async function link(from,to,reason,existing) {
    const project=scope(), path=project.path+'/paper-links', reason_text=reason || null;
    const label=paperLabel(from)+' → '+paperLabel(to)+' · ';
    if (existing) {
      await request(label+'연결 이유',path+'/'+existing.id,{reason_text},'PATCH');
      if (project.current()) {
        const target=S.links.find(l=>l.id===existing.id);
        if (target) target.reason=reason;
      }
    } else {
      const ack=await request(label+'논문 연결',path,{from_document_use_id:from,to_document_use_id:to,reason_text},'POST');
      if (!ack?.link_id) throw Error('논문 연결을 확인하지 못했어요.');
      if (project.current() && !S.links.some(l=>l.id===ack.link_id)) S.links.push({id:ack.link_id,from,to,reason});
    }
  }
  async function removeLink(id) {
    const project=scope();
    const link=S.links.find(l=>l.id===id);
    const label=link ? paperLabel(link.from)+' → '+paperLabel(link.to)+' · 연결 삭제' : '연결 삭제';
    await request(label,project.path+'/paper-links/'+id,{},'DELETE');
    if (project.current()) S.links=S.links.filter(l=>l.id!==id);
  }
  async function remove(p) {
    const project=scope();
    await request(paperLabel(p.id)+' · 논문 삭제',project.path+'/papers/'+p.id,{},'DELETE');
    if (!project.current()) return;
    S.links=S.links.filter(l=>l.from!==p.id && l.to!==p.id);
    S.papers=S.papers.filter(item=>item.id!==p.id);
  }
  const selections=new Map();
  function selectEdition(p,id) {
    if (!p.artifacts.some(a=>a.artifact_id===id && (a.pdf || a.can_attach_pdf))) throw Error('PDF 판본을 확인해 주세요.');
    const key=S.taskId+'/'+p.id, pending=selections.get(key);
    if (pending?.id===id) return pending.promise;
    if (!pending && workspace.extra('paper',p.id)?.selectedArtifactId===id) return Promise.resolve();
    const promise=workspace.patchExtra('paper',p.id,{selectedArtifactId:id},{label:paperLabel(p.id)+' · 읽을 PDF 판본'})
      .finally(()=>{if(selections.get(key)?.promise===promise)selections.delete(key);});
    selections.set(key,{id,promise});
    return promise;
  }
  return {register,update,link,removeLink,remove,attach,selectEdition,documents:()=>workspace.write('/documents')};
}
