'use strict';

// Each opening owns its consent, conversation and indexing cursor. The parent transport
// supplies the signed-in session. The local development chatbot has a separate entry point.
function createAccountReaderChat(box,account,pdf,revealPage) {
  const batchSize=32, maxChunks=5000; // researchtrail rag-index/chunks and rt_rag_add_chunks
  let activeSession=null;
  const current=session=>session && activeSession===session && account.current();
  const compatible=index=>index?.chunker===ChatRetrieval.CHUNKER && typeof index.embedding_model==='string' && !!index.embedding_model.trim();
  const isReady=index=>compatible(index) && index.status==='ready' && Number.isSafeInteger(index.chunk_count) && index.chunk_count>0;
  const action=(key,label,style='btn sm')=>'<button type="button" class="'+style+'" data-chat-action="'+key+'">'+label+'</button>';

  function open(task,use,artifact,loaded) {
    close();
    activeSession={task,use,id:artifact.artifact_id,sha:artifact.pdf.sha256,available:artifact.pdf.available,loaded,
      base:'/tasks/'+task+'/artifacts/'+artifact.artifact_id,stage:'idle',messages:[],draft:'',depth:'auto',
      consent:false,offset:0,beginAttempt:false};
  }
  function close() {
    activeSession=null;
    box.innerHTML='';
  }
  function transition(session,stage,status) {
    if (!current(session)) return;
    session.stage=stage;
    session.status=status;
    render(session);
  }
  function render(session) {
    if (!current(session)) return;
    let controls='';
    if (session.stage==='consent') {
      const reuse=isReady(session.index);
      controls='<div class="chat-empty"><p>색인을 준비하면 PDF에서 추출한 본문을 구절로 나누어 OpenAI 임베딩 서비스에 보내고, 이 판본의 검색 색인을 계정에 저장해요.</p>'+
        '<p>질문을 보내면 질문과 최근 대화, 선택한 문장, 이 PDF에서 검색한 구절을 OpenAI에 전송해요.</p></div>'+
        '<div class="account-chat-actions">'+action('consent',reuse?'동의하고 질문하기':session.index?'동의하고 색인 다시 만들기':'동의하고 색인 준비')+
        action('decline','동의하지 않음')+(session.index?.status==='indexing'?action('refresh','색인 상태 다시 확인'):'')+'</div>';
    } else if (session.stage==='declined') controls=action('review','동의 안내 보기');
    else if (session.stage==='status-error') controls=action('refresh','색인 상태 다시 확인');
    else if (session.stage==='index-error') controls=action('retry-index','색인 다시 시도');
    else if (session.stage==='ready' || session.stage==='asking') controls=conversation(session);
    box.innerHTML='<p class="reader-hint" role="status">'+esc(session.status)+'</p>'+controls;
    const list=box.querySelector('#chatList');
    if (list) list.scrollTop=list.scrollHeight;
  }
  function conversation(session) {
    const disabled=session.stage==='asking'?' disabled':'';
    const examples=['이 논문의 핵심은 뭐야?','이 쪽 쉽게 설명해 줘','이 표는 무엇을 비교해?'];
    const turns=session.messages.map(m=>{
      const quotes=(m.evidence || []).map(e=>'<p><button type="button" class="chat-pg" data-chat-action="cite" data-page="'+e.page+
        '" aria-label="'+e.page+'쪽 원문 보기">'+e.page+'쪽</button> '+esc(e.quote)+'</p>').join('');
      return '<div class="chat-m '+(m.role==='user'?'chat-u':'chat-b')+'"><p>'+esc(m.text)+'</p>'+quotes+'</div>';
    }).join('');
    return (session.messages.length && !disabled?'<div class="chat-top">'+action('clear','새 대화','chat-new')+'</div>':'')+
      '<div class="chat-list" id="chatList" role="log">'+(turns || '<div class="chat-empty"><p>열어 둔 PDF 전체에서 관련 구절을 찾아 답해요.</p></div>')+'</div>'+
      (session.error?'<p class="ai-err" role="alert">'+esc(session.error)+'</p>':'')+
      (session.checkIndex?action('refresh','색인 상태 다시 확인'):'')+
      (disabled?'':'<div class="chat-ex-row">'+examples.map(q=>action('example',q,'chat-exb')).join('')+'</div>')+
      '<form class="chat-box">'+(session.selection?'<div class="chat-sel"><span>'+session.selection.page+'쪽 · '+esc(session.selection.text.slice(0,80))+
        '</span>'+action('unselect','선택 취소')+'</div>':'')+
      '<textarea id="chatQ" rows="2" maxlength="1000" placeholder="이 논문에 대해 물어보세요" aria-label="질문 입력"'+disabled+'>'+esc(session.draft)+'</textarea>'+
      '<div class="chat-row">'+(disabled?esc(chatEffortLabel(session.depth)):chatEffortHtml(session.depth))+'<button type="submit" class="chat-send" aria-label="질문 보내기" title="질문 보내기"'+disabled+'>↑</button></div></form>';
  }
  async function readIndex(session) {
    const result=await account.write('/tasks/'+session.task+'/rag-index');
    const entry=result?.artifacts?.find(a=>a.artifact_id===session.id && a.document_use_id===session.use);
    if (!entry || !Object.hasOwn(entry,'index')) throw new Error();
    return entry.index;
  }
  function offerConsent(session,index) {
    session.index=index;
    const text=isReady(index)?'이 판본에 저장된 색인이 있어요. 질문 전송에 동의해 주세요.':
      index?.status==='indexing'?'이 판본의 색인을 만드는 중이에요. 상태를 다시 확인하거나, 작업이 중단됐다면 동의 후 처음부터 다시 만들 수 있어요.':
      index?'이 판본의 저장된 색인 형식이 달라요. 새 색인 준비에 동의해 주세요.':'이 판본의 검색 색인을 준비하려면 전송에 동의해 주세요.';
    transition(session,'consent',text);
  }
  async function check(session) {
    transition(session,'checking','이 판본의 색인 상태를 확인하는 중이에요.');
    try {
      const [index]=await Promise.all([readIndex(session),session.loaded]);
      if (!current(session)) return;
      const doc=pdf.context(session.task,session.id)?.doc;
      if (!doc) return transition(session,'unavailable','PDF를 불러오지 못했어요. 이 판본을 다시 열어 주세요.');
      if (!session.verifiedFile) {
        const sha=await accountPdfDigest(await doc.getData());
        if (!current(session)) return;
        if (sha!==session.sha) return transition(session,'unavailable','선택한 판본과 받은 PDF가 달라요. 판본을 다시 열어 주세요.');
        session.verifiedFile=true;
      }
      if (session.consent && isReady(index)) return enableQuestions(session);
      session.consent=false;
      offerConsent(session,index);
    } catch {
      transition(session,'status-error','PDF 파일과 이 판본의 색인 상태를 확인하지 못했어요.');
    }
  }
  function show() {
    const session=activeSession;
    if (!current(session)) return;
    if (!session.available) return transition(session,'unavailable','이 판본의 PDF를 이용할 수 없어 질문을 보낼 수 없어요.');
    if (session.stage==='idle') return check(session);
    if (session.stage==='ready') syncSelection();
  }
  function syncSelection() {
    const session=activeSession;
    if (!current(session) || session.stage!=='ready') return;
    const next=pdf.context(session.task,session.id)?.selection;
    if (session.seenSelection?.page===next?.page && session.seenSelection?.text===next?.text) return;
    session.selection=session.seenSelection=next;
    render(session);
  }
  function enableQuestions(session) {
    session.chunks=null;
    session.beginAttempt=false;
    session.offset=0;
    session.error='';
    session.checkIndex=false;
    session.selection=session.seenSelection=pdf.context(session.task,session.id)?.selection;
    transition(session,'ready','이 판본의 검색 색인이 준비됐어요.');
  }
  async function extract(session) {
    const doc=pdf.context(session.task,session.id)?.doc;
    const {chunks}=await ChatRetrieval.buildIndex(doc);
    if (!current(session)) return;
    if (!chunks.length) return transition(session,'empty','이 PDF에는 추출할 수 있는 텍스트가 없어요. 텍스트가 있는 판본을 열어 주세요.');
    if (chunks.length>maxChunks) return transition(session,'limit','본문이 계정 색인 한도인 5,000구절을 넘어서 이 판본을 준비할 수 없어요.');
    session.chunks=chunks;
  }
  function needsUpload(session,index) {
    if (!current(session)) return false;
    if (isReady(index)) {
      enableQuestions(session);
      return false;
    }
    const previous=session.index;
    const changedBeforeBegin=index && !session.beginAttempt && (index.status!==previous?.status ||
      index.chunker!==previous?.chunker || index.embedding_model!==previous?.embedding_model);
    const replacedDuringUpload=index && session.beginAttempt && session.model &&
      (index.embedding_model!==session.model || !compatible(index));
    if (changedBeforeBegin || replacedDuringUpload) {
      session.beginAttempt=false;
      session.offset=0;
      session.model=null;
      session.consent=false;
      offerConsent(session,index);
      return false;
    }
    return true;
  }
  async function prepare(session) {
    transition(session,'preparing','이 판본의 색인을 준비하는 중이에요.');
    try {
      let index=await readIndex(session);
      if (!needsUpload(session,index)) return;
      if (!session.chunks) {
        transition(session,'preparing','PDF에서 텍스트를 추출하고 검색할 구절을 준비하는 중이에요.');
        await extract(session);
        if (!current(session) || !session.chunks) return;
        // Another client may have finished during extraction. Begin replaces an index.
        index=await readIndex(session);
        if (!needsUpload(session,index)) return;
      }
      // A matching active index also recovers an unacknowledged begin. After a
      // successful batch its cursor advances only upon receipt for this artifact.
      const active=index?.status==='indexing' && compatible(index) && (!session.model || session.model===index.embedding_model);
      if (!active || !session.beginAttempt) {
        session.beginAttempt=true;
        session.offset=0;
        const ack=await account.write(session.base+'/rag-index/begin',{consent:true,pdf_sha256:session.sha,chunker:ChatRetrieval.CHUNKER});
        if (!current(session)) return;
        if (ack?.artifact_id!==session.id || ack.status!=='indexing' || !compatible(ack)) throw new Error();
        session.model=ack.embedding_model;
      } else session.model=index.embedding_model;
      while (session.offset<session.chunks.length) {
        transition(session,'indexing','이 판본의 색인을 만드는 중이에요. '+session.offset+' / '+session.chunks.length+'구절 저장됨');
        const chunks=session.chunks.slice(session.offset,session.offset+batchSize).map(({n:page,start,end,text})=>({page,start,end,text}));
        const ack=await account.write(session.base+'/rag-index/chunks',{chunks});
        if (!current(session)) return;
        if (ack?.artifact_id!==session.id || ack.received!==chunks.length || !Number.isSafeInteger(ack.stored)) throw new Error();
        if (ack.stored<session.offset+chunks.length) {
          // Another begin can discard earlier batches. Reconcile on the next explicit retry.
          session.offset=0;
          return transition(session,'index-error','이 판본의 색인 진행 상태가 바뀌었어요. 상태를 확인하고 처음부터 다시 시도해 주세요.');
        }
        session.offset+=chunks.length;
      }
      transition(session,'indexing','모든 구절을 보냈어요. 색인 저장을 확인하는 중이에요.');
      const ack=await account.write(session.base+'/rag-index/finish',{chunk_count:session.chunks.length});
      if (!current(session)) return;
      if (ack?.artifact_id!==session.id || !isReady(ack) || ack.chunk_count!==session.chunks.length || ack.embedding_model!==session.model) throw new Error();
      enableQuestions(session);
    } catch {
      transition(session,'index-error','이 판본의 색인 준비를 마치지 못했어요. 저장이 확인된 구절은 '+session.offset+'개예요.');
    }
  }
  function checkedAnswer(result,session,pages) {
    if (!['answer','notfound','refuse'].includes(result?.kind) || typeof result.text!=='string' || !result.text.trim()) throw new Error();
    const evidence=result.evidence;
    if (!Array.isArray(evidence)) throw new Error();
    if (result.kind==='answer') {
      const belongsHere=e=>e?.artifact_id===session.id && e.document_use_id===session.use && Number.isSafeInteger(e.page) &&
        e.page>=1 && e.page<=pages && typeof e.quote==='string' && e.quote.trim();
      if (!evidence.length || !evidence.every(belongsHere)) throw new Error();
    } else if (evidence.length) throw new Error();
    return {role:'bot',text:result.text,evidence};
  }
  async function submitQuestion(session) {
    if (!session.consent || session.stage!=='ready') return;
    const question=session.draft.trim();
    if (!question || question.length>1000) {
      session.error='질문을 1자에서 1,000자 사이로 적어 주세요.';
      return render(session);
    }
    const ctx=pdf.context(session.task,session.id);
    if (!ctx?.doc) return transition(session,'unavailable','질문할 PDF 판본을 다시 열어 주세요.');
    const body={question,scope:'open_pdf',consent:true,answer_depth:session.depth,current_page:ctx.page,
      history:session.messages.slice(-6).map(({role,text})=>({role,text:text.slice(0,1200)}))};
    if (session.selection) body.selection=session.selection;
    session.error='';
    session.checkIndex=false;
    transition(session,'asking','이 PDF에서 근거를 찾아 답변을 준비하는 중이에요.');
    try {
      const result=await account.write(session.base+'/ask',body);
      if (!current(session)) return;
      const answer=checkedAnswer(result,session,ctx.doc.numPages);
      session.messages.push({role:'user',text:question},answer);
      session.draft='';
      session.selection=null;
    } catch {
      if (!current(session)) return;
      session.checkIndex=true;
      session.error='답변을 확인하지 못했어요. 입력한 질문을 다시 보낼 수 있어요.';
    }
    transition(session,'ready','이 판본의 검색 색인이 준비됐어요.');
    if (!box.hidden) box.querySelector('#chatQ')?.focus();
  }

  box.addEventListener('input',e=>{if (current(activeSession) && e.target.id==='chatQ' && activeSession.stage==='ready') activeSession.draft=e.target.value;});
  box.addEventListener('change',e=>{
    if (!current(activeSession) || activeSession.stage!=='ready' || e.target.name!=='chatEffort' || !CHAT_EFFORT_CHOICES.includes(e.target.value)) return;
    activeSession.depth=e.target.value;
    render(activeSession);
    box.querySelector('.chat-effort summary')?.focus();
  });
  box.addEventListener('submit',e=>{e.preventDefault();if (current(activeSession)) submitQuestion(activeSession);});
  box.addEventListener('keydown',e=>{
    if (current(activeSession) && e.target.id==='chatQ' && e.key==='Enter' && !e.shiftKey && !e.isComposing && e.keyCode!==229) {
      e.preventDefault(); submitQuestion(activeSession);
    }
  });
  box.addEventListener('click',async e=>{
    const session=activeSession, button=e.target.closest('[data-chat-action]');
    if (!current(session) || !button) return;
    const key=button.dataset.chatAction;
    if (key==='consent' && session.stage==='consent') {
      session.consent=true;
      if (isReady(session.index)) enableQuestions(session); else await prepare(session);
    } else if (key==='decline' && session.stage==='consent') {
      transition(session,'declined','PDF 본문이나 질문을 보내지 않았어요. 계속 읽을 수 있어요.');
    } else if (key==='review' && session.stage==='declined') offerConsent(session,session.index);
    else if (key==='refresh' && (['consent','status-error'].includes(session.stage) || (session.stage==='ready' && session.checkIndex))) await check(session);
    else if (key==='retry-index' && session.stage==='index-error' && session.consent) await prepare(session);
    else if (key==='cite' && ['ready','asking'].includes(session.stage)) {
      const page=Number(button.dataset.page);
      if (!session.messages.some(m=>m.evidence?.some(e=>e.page===page))) return;
      const ok=await pdf.goToPage(session.task,session.id,page);
      if (!current(session)) return;
      if (ok) { syncSelection(); revealPage(); }
      else {session.error='인용한 쪽을 열지 못했어요. PDF 로딩이나 읽기 위치 저장 상태를 확인한 뒤 다시 눌러 주세요.';render(session);}
    } else if (key==='example' && session.stage==='ready') {
      session.draft=button.textContent;
      render(session);
      box.querySelector('#chatQ')?.focus();
    } else if (key==='clear' && session.stage==='ready') {
      ask('이 판본의 대화를 지울까요?','지금까지 나눈 질문과 답이 사라져요.','지우기',()=>{
        if (!current(session)) return;
        session.messages=[];
        session.draft='';
        session.error='';
        session.checkIndex=false;
        session.selection=null;
        render(session);
        box.querySelector('#chatQ')?.focus();
      },true);
    } else if (key==='unselect' && session.stage==='ready') {session.selection=null;render(session);}
  });
  return {open,close,show,syncSelection};
}
