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
  return '<p>'+name+' · 업로드 대기</p>'+
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
  if (expectedSha) {
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()));
    if (Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('')!==expectedSha)
      throw new Error('이 판본을 다시 올리려면 처음 선택한 PDF가 필요해요.');
  }
}

function createAccountPdfReader(request, connected) {
  const box=$('#accountPdfReader'), status=$('#pdfPageStatus'), canvas=$('#accountPdfPage');
  const prev=$('#accountPdfPrev'), next=$('#accountPdfNext');
  let version=0, loading=null, documentPdf=null, pageNumber=0, rendering=null;
  function close() {
    version++;
    rendering?.cancel(); rendering=null;
    loading?.destroy().catch(()=>{}); loading=null; documentPdf=null;
    canvas.width=canvas.height=0;
    box.hidden=true;
  }
  async function showPage(number) {
    const current=version, pdf=documentPdf;
    if (!pdf || number<1 || number>pdf.numPages) return;
    prev.disabled=next.disabled=true;
    try {
      const page=await pdf.getPage(number);
      if (current!==version || !connected()) return;
      const viewport=page.getViewport({scale:1});
      const width=Math.max(1, Math.min(box.clientWidth || 800,1200));
      const scale=Math.min(width/viewport.width,2400/Math.max(viewport.width,viewport.height));
      const size=page.getViewport({scale});
      canvas.width=Math.ceil(size.width); canvas.height=Math.ceil(size.height);
      rendering=page.render({canvasContext:canvas.getContext('2d'),viewport:size});
      await rendering.promise;
      if (current!==version || !connected()) return;
      rendering=null;
      pageNumber=number;
      status.textContent=number+' / '+pdf.numPages+'쪽';
      prev.disabled=number===1; next.disabled=number===pdf.numPages;
    } catch {
      if (current===version && connected()) status.textContent='PDF 페이지를 표시하지 못했어요. 다시 열어 주세요.';
    }
  }
  async function open(task, artifact, label) {
    close();
    const current=version;
    box.hidden=false;
    $('#accountPdfTitle').textContent=label || 'PDF';
    status.textContent='PDF를 불러오는 중…';
    prev.disabled=next.disabled=true;
    box.scrollIntoView?.({block:'nearest'});
    try {
      const blob=await request('/tasks/'+task+'/artifacts/'+artifact+'/pdf',undefined,{pdf:true});
      if (current!==version || !connected()) return;
      const [data]=await Promise.all([blob.arrayBuffer(),loadPdfJs()]);
      if (current!==version || !connected()) return;
      loading=pdfjsLib.getDocument({data,isEvalSupported:false});
      const pdf=await loading.promise;
      if (current!==version || !connected()) return;
      documentPdf=pdf;
      await showPage(1);
    } catch {
      if (current===version && connected()) status.textContent='PDF를 열지 못했어요. 파일을 다시 열어 주세요.';
    }
  }
  $('#accountPdfClose').addEventListener('click',close);
  prev.addEventListener('click',()=>showPage(pageNumber-1));
  next.addEventListener('click',()=>showPage(pageNumber+1));
  window.addEventListener?.('pagehide',close);
  return {open,close};
}
