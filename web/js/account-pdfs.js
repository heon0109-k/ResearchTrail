'use strict';

function accountPdfAttachHtml(use,expectedSha,artifactId) {
  return '<label class="account-pdf-attach">'+(expectedSha?'같은 PDF로 업로드 재시도':artifactId?'이 파일명에 PDF 첨부':'PDF 첨부')+
    ' (최대 10 MiB) <input type="file" accept="application/pdf,.pdf" data-attach-pdf="'+esc(use)+'"'+
    (expectedSha?' data-expected-sha="'+esc(expectedSha)+'"':'')+
    (artifactId?' data-artifact-id="'+esc(artifactId)+'"':'')+'></label>';
}

function accountPdfArtifactHtml(use,artifact,sameName) {
  const edition=sameName && artifact.pdf.sha256 ? ' · '+artifact.pdf.sha256.slice(0,8) : '';
  const name=esc((artifact.label_text || 'PDF')+edition);
  if (artifact.pdf.available)
    return '<p><button type="button" class="btn sm" data-open-pdf="'+esc(artifact.artifact_id)+'" data-label="'+name+'">'+name+' 열기</button></p>';
  return '<p>'+name+' · PDF 이용 불가 <button type="button" class="btn sm" data-open-pdf="'+esc(artifact.artifact_id)+'" data-label="'+name+'" data-available="false">저장된 읽기 위치 보기</button></p>'+
    (artifact.pdf.document_use_id===use ? accountPdfAttachHtml(use,artifact.pdf.sha256,artifact.artifact_id) : '');
}

async function validateAccountPdf(file,expectedSha) {
  if (!file || !/\.pdf$/i.test(file.name) || file.name.length<5 || file.name.length>255 ||
      /[\\/\x00-\x1f\x7f]/.test(file.name) || (file.type && file.type.toLowerCase()!=='application/pdf')) {
    throw new Error('PDF 파일을 선택해 주세요.');
  }
  if (!file.size || file.size>10*1024*1024) throw new Error('PDF는 0바이트보다 크고 10 MiB 이하여야 해요.');
  const [header,tail]=await Promise.all([file.slice(0,10).text(),file.slice(-1024).text()]);
  if (!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(header) || !/%%EOF[\x00\t\n\f\r ]*$/.test(tail))
    throw new Error('PDF 파일 내용을 확인해 주세요.');
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()));
  const sha256=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
  if (expectedSha && sha256!==expectedSha) throw new Error('이 판본을 다시 올리려면 처음 선택한 PDF가 필요해요.');
  return sha256;
}

function createAccountPdfReader(request, connected, records = () => []) {
  const box=$('#accountPdfReader'), status=$('#pdfPageStatus'), canvas=$('#accountPdfPage');
  const sheet=$('#accountPdfSheet'), layer=$('#accountPdfText'), overlay=$('#accountPdfOverlay');
  const prev=$('#accountPdfPrev'), next=$('#accountPdfNext'), marks=$('#pdfMarks');
  const memo=$('#pdfMemoRef'), mark=$('#pdfMarkButton'), message=$('#pdfMarkStatus'), retry=$('#pdfReaderRetry');
  const locator=$('#pdfReadingLocator'), selectionText=$('#pdfSelectionText');
  const writes=new Map();
  let view=null;
  const current=v=>v && view===v && connected();

  function close() {
    const v=view;
    view=null;
    v?.rendering?.cancel();
    v?.textTask?.cancel();
    v?.loading?.destroy().catch(()=>{});
    sheet.hidden=box.hidden=true;
    canvas.width=canvas.height=0;
    overlay.innerHTML=layer.innerHTML=marks.innerHTML=memo.innerHTML='';
    locator.textContent=selectionText.textContent=message.textContent='';
    retry.hidden=true;
    mark.disabled=true;
  }
  function controls(v) {
    const busy=v.busy || v.saving || !!v.retry;
    prev.disabled=busy || !v.pdf || v.page<=1;
    next.disabled=busy || !v.pdf || !v.page || v.page>=v.pdf.numPages;
    mark.disabled=busy || !v.state || !v.draft;
    selectionText.textContent=v.draft ? '선택한 구절 · '+v.draft.text : '';
    retry.hidden=!v.retry;
  }
  function fitCurrentPage() {
    const v=view;
    if (current(v) && v.page && box.clientWidth && v.width!==box.clientWidth) showPage(v,v.page);
  }
  function memoOptions() {
    const selected=memo.value;
    memo.innerHTML='<option value="">메모 연결 안 함</option>'+records().map(r=>
      '<option value="'+esc(r.record_id)+'">'+esc(r.record.content_text.slice(0,80))+'</option>').join('');
    memo.value=selected || '';
  }
  function draw(v) {
    if (!v.state) return;
    const memos=new Map(records().map(r=>[r.record_id,r.record.content_text]));
    locator.textContent=v.state.last_page ? '마지막으로 읽은 곳 · '+v.state.last_page+'쪽' : '';
    const highlights=v.state.highlights;
    marks.innerHTML=highlights.length ? '<h3>저장된 하이라이트</h3><ul>'+highlights.map(h=>
      '<li><button type="button" class="btn sm" data-reader-page="'+h.page+'"'+(!v.page?' disabled':'')+'>'+h.page+'쪽</button> '+
      esc(h.text)+(h.record_id ? '<p>연결한 메모 · '+esc(memos.get(h.record_id) ?? h.record_id)+'</p>' :
      ' <button type="button" class="btn sm" data-link-mark="'+esc(h.id)+'">선택한 메모 연결</button>')+'</li>').join('')+'</ul>' : '';
    overlay.innerHTML=v.page ? pdfHighlightMarkup(highlights,v.page) : '';
  }

  // A reopened edition waits for its own outstanding receipt. A late receipt never paints a different view.
  async function save(v,payload) {
    if (!current(v) || !v.state || v.saving) return;
    v.saving=true;
    v.retry=null;
    controls(v);
    message.textContent='읽기 위치를 저장하는 중…';
    const pending=request(v.base+'/reader',payload);
    writes.set(v.base,pending);
    try {
      const state=await pending;
      if (!current(v)) return;
      v.state=state;
      if (payload.highlight) v.draft=null;
      draw(v);
      message.textContent='계정에 저장했어요.';
    } catch {
      if (current(v)) {
        v.retry=payload;
        message.textContent='저장을 확인하지 못했어요. 같은 내용으로 다시 시도해 주세요.';
      }
    } finally {
      if (writes.get(v.base)===pending) writes.delete(v.base);
      v.saving=false;
      if (current(v)) { controls(v); fitCurrentPage(); }
    }
  }
  async function showPage(v,number,navigation=false) {
    if (!current(v) || !v.pdf || v.busy || v.saving || v.retry || number<1 || number>v.pdf.numPages) return;
    v.busy=true;
    v.page=0;
    v.draft=null;
    sheet.hidden=true;
    overlay.innerHTML=layer.innerHTML='';
    controls(v);
    try {
      const page=await v.pdf.getPage(number);
      if (!current(v)) return;
      const viewport=page.getViewport({scale:1});
      v.width=box.clientWidth || 800;
      const scale=Math.min(Math.min(v.width,1200)/viewport.width,2400/Math.max(viewport.width,viewport.height));
      const size=page.getViewport({scale});
      sheet.style.width=size.width+'px';
      sheet.dataset.n=String(number);
      canvas.width=Math.ceil(size.width); canvas.height=Math.ceil(size.height);
      v.rendering=page.render({canvasContext:canvas.getContext('2d'),viewport:size});
      await v.rendering.promise;
      if (!current(v)) return;
      v.rendering=null;
      sheet.hidden=false;
      v.page=number;
      draw(v);
      status.textContent=number+' / '+v.pdf.numPages+'쪽';
      // A visible page is a reading position even when its text layer is slow or unavailable.
      let pageSave;
      if (v.state && navigation && v.state.last_page!==number) pageSave=save(v,{last_page:number});
      else if (v.state && v.state.last_page===null) pageSave=save(v,{initial_page:number});
      try {
        const content=await page.getTextContent();
        if (!current(v)) return;
        layer.style.setProperty('--scale-factor',scale);
        v.textTask=pdfjsLib.renderTextLayer({textContentSource:content,container:layer,viewport:size,textDivs:[]});
        await v.textTask.promise;
        v.textTask=null;
      } catch {
        if (current(v)) message.textContent='이 쪽의 텍스트를 선택할 수 없어요.';
      }
      await pageSave;
    } catch {
      if (current(v)) status.textContent='PDF 페이지를 표시하지 못했어요. 다시 열어 주세요.';
    } finally {
      v.busy=false;
      if (current(v)) { controls(v); fitCurrentPage(); }
    }
  }
  async function readState(v) {
    const prior=writes.get(v.base);
    if (prior) await prior.catch(()=>{});
    if (!current(v)) return;
    try {
      const state=await request(v.base+'/reader');
      if (!current(v)) return;
      if (!state || !Array.isArray(state.highlights)) throw new Error();
      v.state=state;
      draw(v);
    } catch {
      if (current(v)) message.textContent='저장된 읽기 위치를 불러오지 못했어요. 다시 열어 주세요.';
    }
  }
  async function readFile(v) {
    try {
      const blob=await request(v.base+'/pdf',undefined,{pdf:true});
      if (!current(v)) return;
      const [data]=await Promise.all([blob.arrayBuffer(),loadPdfJs()]);
      if (!current(v)) return;
      v.loading=pdfjsLib.getDocument({data,isEvalSupported:false});
      const pdf=await v.loading.promise;
      if (current(v)) v.pdf=pdf;
    } catch {
      if (current(v)) status.textContent='PDF를 열지 못했어요. 저장된 읽기 위치를 확인할 수 있어요.';
    }
  }
  async function open(task,artifact,label,available=true) {
    close();
    const v=view={base:'/tasks/'+task+'/artifacts/'+artifact,page:0,state:null};
    box.hidden=false;
    $('#accountPdfTitle').textContent=label || 'PDF';
    status.textContent=available?'PDF를 불러오는 중…':'PDF 파일을 이용할 수 없어요.';
    controls(v);
    memoOptions();
    box.scrollIntoView?.({block:'nearest'});
    await Promise.all([readState(v),available && readFile(v)]);
    if (current(v) && v.pdf) await showPage(v,Math.min(v.state?.last_page || 1,v.pdf.numPages));
  }
  function capture() {
    const v=view;
    if (!current(v) || !v.page || !v.state || v.busy || v.saving || v.retry) return;
    const selection=window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const range=selection.getRangeAt(0);
    if (!layer.contains(range.startContainer) || !layer.contains(range.endContainer)) return;
    const anchor=pdfSelectionAnchor(selection,sheet);
    v.draft=anchor ? {...anchor,id:crypto.randomUUID()} : null;
    controls(v);
  }
  sheet.addEventListener('pointerup',capture);
  sheet.addEventListener('keyup',capture);
  sheet.addEventListener('mousemove',pvKeepSelectionAtLineEnd);
  document.addEventListener?.('selectionchange',capture);
  memo.addEventListener('focus',memoOptions);
  mark.addEventListener('mousedown',event=>event.preventDefault());
  mark.addEventListener('click',()=>{
    const v=view;
    if (!current(v) || !v.draft || mark.disabled) return;
    const highlight={...v.draft,record_id:memo.value || null};
    window.getSelection()?.removeAllRanges();
    return save(v,{highlight});
  });
  marks.addEventListener('click',event=>{
    const v=view, button=event.target.closest('button');
    if (!current(v) || !button || v.busy || v.saving || v.retry) return;
    if (button.dataset.readerPage) return showPage(v,Number(button.dataset.readerPage),true);
    if (!button.dataset.linkMark) return;
    if (!memo.value) { message.textContent='연결할 메모를 선택해 주세요.'; memo.focus(); return; }
    return save(v,{link:{id:button.dataset.linkMark,record_id:memo.value}});
  });
  retry.addEventListener('click',()=>{ if (current(view) && view.retry) return save(view,view.retry); });
  $('#accountPdfClose').addEventListener('click',close);
  prev.addEventListener('click',()=>{if (current(view)) return showPage(view,view.page-1,true);});
  next.addEventListener('click',()=>{if (current(view)) return showPage(view,view.page+1,true);});
  if (window.ResizeObserver) new ResizeObserver(fitCurrentPage).observe(box);
  window.addEventListener?.('pagehide',close);
  return {open,close};
}
