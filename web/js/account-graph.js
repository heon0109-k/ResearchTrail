'use strict';

// Each instance belongs to one authenticated frame. All mutations start with an explicit user action.
function createAccountGraphWorkspace(get, account, refresh, chooseCreated) {
  const dialog = $('#accountPaperDetail'), notice = $('#workspaceActionStatus');
  const cancelLink = $('#workspaceLinkCancel'), add = $('#addBtn');
  const saves = createAccountSaveStatus(account.write, account.current, account);
  let reader;
  function openReader(paper,artifact,label) {
    close();
    reader ||= createAccountWorkspaceReader(account,saves);
    return reader.open(S.taskId,paper,artifact,label);
  }
  $('#workspaceRecords').addEventListener('click',()=>openReader());
  for (const id of ['vDot','vCard','vList']) $('#'+id).addEventListener('click',()=>reader?.close());
  let generation = 0, formVersion = 0, opening, discard;
  function endForm() {
    ++formVersion;
    opening = null;
    if (typeof dpClose === 'function') dpClose();
    discard?.();
    discard = null;
    S.draftFile = S.draftMeta = null;
  }
  function close() {
    endForm();
    dialog.close();
  }
  function formScope() {
    endForm();
    const version = formVersion, project = generation;
    return {task:S.taskId, version, current:() => account.current() && generation === project && formVersion === version};
  }
  function show(label) {
    dialog.setAttribute('aria-label',label);
    if (!dialog.open) dialog.showModal();
  }
  function clearLink() {
    S.linking = null;
    cancelLink.hidden = true;
    notice.textContent = '';
  }
  function reset(task) {
    reader?.close();
    ++generation;
    endForm();
    clearLink();
    $('#workspaceRecords').disabled = add.disabled = true;
    D.pos.clear();
    D.els = {}; D.edges = {}; D.drag = null; D.inited = false; D.alpha = 0;
    saves.focus(task);
  }
  function caption(p) {
    if (!S.papers.some(other => other.id !== p.id && other.title === p.title)) return p.title;
    const shortId = p.id.slice(-8);
    const ambiguous = S.papers.some(other => other.id !== p.id && other.title === p.title && other.id.endsWith(shortId));
    return p.title+' · '+(ambiguous ? p.id : shortId);
  }

  // Retain the operation's key until its acknowledgement. Repeating a form submission
  // with different content is a different operation. Layout and view changes never call this.
  function wireMutation(form, label, scope, makeRequest, saved) {
    let busy = false, signature, key;
    const error = $('#workspaceFormError');
    form.addEventListener('submit',async event => {
      event.preventDefault();
      if (busy || !scope.current()) return;
      const operation = makeRequest();
      if (!operation) return;
      const next = JSON.stringify(operation);
      if (next !== signature) { signature = next; key = crypto.randomUUID(); }
      busy = true; form.inert = true; form.setAttribute('aria-busy','true'); error.textContent = '';
      try {
        const result = await account.write(operation.path,{...operation.body,request_id:key},{method:operation.method});
        if (scope.current()) await saved(result);
      } catch (failure) {
        if (scope.current()) error.textContent = failure.code === 'INVALID_LINK'
          ? '연결할 수 없는 경로예요. 다시 불러온 뒤 이동 경로를 확인해 주세요.'
          : '저장을 확인하지 못했어요. 입력 내용을 확인하고 다시 시도해 주세요.';
      } finally { busy = false; form.inert = false; form.setAttribute('aria-busy','false'); }
    });
    $('#workspaceDismiss').addEventListener('click',close);
    show(label);
  }
  function buttons(label) {
    return '<p id="workspaceFormError" role="alert"></p><div class="paper-form-actions">'+
      '<button type="submit" class="btn pri sm">'+label+'</button> '+
      '<button type="button" class="btn sm" id="workspaceDismiss">취소</button></div>';
  }
  $('#workspaceNew').addEventListener('click',() => {
    clearLink();
    const scope = formScope();
    dialog.innerHTML = '<h2>새 프로젝트</h2><form id="workspaceCreateForm"><label class="field">프로젝트 이름'+
      '<input id="workspaceName" required maxlength="60" autofocus></label>'+buttons('프로젝트 만들기')+'</form>';
    wireMutation($('#workspaceCreateForm'),'새 프로젝트',scope,() => {
      const name = projCleanName($('#workspaceName').value);
      if (name) return {path:'/tasks',method:'POST',body:{goal_text:name}};
      $('#workspaceFormError').textContent = '프로젝트 이름을 입력해 주세요.';
    },async task => { close(); await chooseCreated(task); });
  });
  async function addPaper() {
    if (opening || add.disabled || !S.taskId) return;
    clearLink();
    const scope = formScope();
    opening = scope;
    try {
      const {documents} = await get('/documents');
      if (!scope.current()) return;
      discard = renderAccountRegistration(dialog,{documents,request:account.write,selected:scope.task,
        version:scope.version,current:scope.current,saves,uploadPdf:true,closeForm:close,refresh,registered:refresh});
      show('새 논문');
      $('#aTitle').focus();
    } catch {
      if (scope.current()) notice.textContent = '논문 등록 양식을 열지 못했어요. 논문 추가를 다시 눌러 주세요.';
    } finally { if (opening === scope) opening = null; }
  }
  add.addEventListener('click',addPaper);
  cancelLink.addEventListener('click',() => { clearLink(); renderAll(); });
  dialog.addEventListener('cancel',event => {
    if (dialog.querySelector('form[aria-busy="true"]')) event.preventDefault();
    else endForm();
  });

  function linkForm(from, to, existing, remove = false) {
    clearLink();
    const scope = formScope(), path = '/tasks/'+scope.task+'/paper-links';
    const heading = remove ? '이 연결을 삭제할까요?' : existing ? '연결 이유 수정' : '이동 경로 추가';
    dialog.innerHTML = '<h2>'+heading+'</h2><p>'+esc(caption(from))+' → '+esc(caption(to))+'</p>'+
      '<form id="workspaceLinkForm">'+(remove ? '<p>연결 이유도 함께 삭제돼요.</p>' :
        '<label class="field">왜 이 논문으로 넘어갔나요?<input id="lkWhy" value="'+esc(existing?.reason || '')+'"></label>')+
      buttons(remove ? '연결 삭제' : '연결 저장')+'</form>';
    wireMutation($('#workspaceLinkForm'),heading,scope,() => {
      const reason = remove ? null : $('#lkWhy').value.trim() || null;
      if (existing) return {path:path+'/'+existing.id,method:remove?'DELETE':'PATCH',body:remove?{}:{reason_text:reason}};
      return {path,method:'POST',body:{from_document_use_id:from.id,to_document_use_id:to.id,reason_text:reason}};
    },async () => { close(); await refresh(scope.task); });
  }
  function pickTarget(paper) {
    if (!S.linking) return false;
    const from = paperBy(S.linking.from);
    if (!from) { clearLink(); return false; }
    const error = linkError(from.id,paper.id);
    if (error) { notice.textContent = error; return true; }
    linkForm(from,paper,S.links.find(l => l.from === from.id && l.to === paper.id));
    return true;
  }
  function paperControls(box, paper) {
    const scope = formScope();
    box.setAttribute('aria-label','논문 상세');
    const links = S.links.filter(l => l.from === paper.id || l.to === paper.id);
    const related = links.map(l => {
      const other = paperBy(l.from === paper.id ? l.to : l.from);
      return other ? '<li>'+ (l.from === paper.id ? '다음에 읽은 논문' : '먼저 읽은 논문')+' · '+esc(caption(other))+
        '<p>'+esc(l.reason || '연결 이유 미기록')+'</p><button type="button" class="btn sm" data-edit-link="'+esc(l.id)+'">이유 수정</button> '+
        '<button type="button" class="btn sm" data-remove-link="'+esc(l.id)+'">연결 삭제</button></li>' : '';
    }).join('');
    const attach = paper.artifacts.map(a => a.can_attach_pdf
      ? '<p>'+esc(a.label_text || 'PDF')+' '+accountPdfAttachHtml(paper.id,a.pdf?.sha256,a.artifact_id)+'</p>' : '').join('');
    $('#workspacePaperActions').innerHTML = '<h3>이동 경로</h3>'+
      (related?'<ul>'+related+'</ul>':'')+
      (S.papers.length>1?'<button type="button" class="btn sm" id="lkStart">이동 경로 추가</button>':'')+
      '<h3>PDF 첨부</h3>'+attach+accountPdfAttachHtml(paper.id)+'<p id="workspacePdfError" role="alert"></p>';
    $$('[data-open-pdf]',box).forEach(button=>button.addEventListener('click',()=>{
      const edition=paper.artifacts.find(a=>a.artifact_id===button.dataset.openPdf);
      if (scope.current() && edition) return openReader(paper,edition,button.dataset.label);
    }));
    $('#lkStart')?.addEventListener('click',() => {
      close(); S.linking = {from:paper.id};
      notice.textContent = '이 논문에서 이어서 읽은 논문을 선택해 주세요.';
      cancelLink.hidden = false; renderAll();
    });
    $$('[data-edit-link],[data-remove-link]',box).forEach(button => button.addEventListener('click',() => {
      const l = links.find(l => l.id === (button.dataset.editLink || button.dataset.removeLink));
      linkForm(paperBy(l.from),paperBy(l.to),l,!!button.dataset.removeLink);
    }));
    $$('[data-attach-pdf]',box).forEach(input => input.addEventListener('change',async () => {
      const file = input.files?.[0];
      if (!file || input.disabled || !scope.current()) return;
      const {artifactId,expectedSha} = input.dataset;
      input.disabled = true;
      const job=saves.prepare(scope.task,paper.id+'/'+(artifactId || ''),file);
      try {
        job.sha256 = await validateAccountPdf(file,expectedSha);
        if (!scope.current()) { saves.discard(job); return; }
        const saved = await saves.upload(job,file,paper.id,artifactId,async () => {
          await refresh(scope.task);
          if (scope.current() && dialog.open && paperBy(paper.id)) showAccountPaper(paper.id);
        });
        if (!saved && scope.current()) $('#workspacePdfError').textContent =
          'PDF 업로드를 확인하지 못했어요. 창을 닫고 PDF 업로드 다시 시도를 눌러 주세요.';
      } catch (error) {
        if (job.phase==='preparing') saves.discard(job);
        if (scope.current()) $('#workspacePdfError').textContent = error.message;
      } finally { input.value = ''; input.disabled = false; }
    }));
  }
  return {reset,addPaper,pickTarget,paperControls,caption,projects:saves.projects};
}
