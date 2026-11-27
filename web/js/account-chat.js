'use strict';

// Each opening owns its consent and indexing cursor. Saved turns belong to the exact account edition. The parent transport
// supplies the signed-in session. The local development chatbot has a separate entry point.
function createAccountReaderChat(box,account,pdf,revealPage,store) {
  const batchSize=32, maxChunks=5000; // researchtrail rag-index/chunks and rt_rag_add_chunks
  let activeSession=null;
  const current=session=>session && activeSession===session && account.current();
  const compatible=index=>index?.chunker===ChatRetrieval.CHUNKER && typeof index.embedding_model==='string' && !!index.embedding_model.trim();
  const isReady=index=>compatible(index) && index.status==='ready' && Number.isSafeInteger(index.chunk_count) && index.chunk_count>0;
  const action=(key,label,style='btn sm')=>'<button type="button" class="'+style+'" data-chat-action="'+key+'">'+label+'</button>';

  function open(task,use,artifact,loaded,paper) {
    close();
    activeSession={task,use,id:artifact.artifact_id,sha:artifact.pdf.sha256,available:artifact.pdf.available,loaded,
      base:'/tasks/'+task+'/artifacts/'+artifact.artifact_id,stage:'idle',messages:[],draft:'',depth:'auto',
      consent:false,offset:0,beginAttempt:false,paper:paper||{},turns:{}};
    restore(activeSession);
  }
  function close() {
    activeSession=null;
    if (box) box.innerHTML='';
  }
  function transition(session,stage,status) {
    if (!current(session)) return;
    session.stage=stage;
    session.status=status;
    render(session);
  }
  function render(session) {
    if (!current(session) || !box) return;
    let controls='';
    if (session.stage==='consent') {
      const reuse=isReady(session.index);
      controls=chatSetupHtml({
        details:'색인을 준비하면 PDF에서 추출한 본문을 구절로 나누어 OpenAI 임베딩 서비스에 보내고, 이 판본의 검색 색인을 계정에 저장해요. 질문할 때는 질문과 최근 대화, 선택한 문장이나 첨부한 캡처의 텍스트·메모, 검색한 구절을 OpenAI에 보내요. 질문과 답은 이 계정에 저장해요.',
        label:reuse?'동의하고 질문하기':session.index?'동의하고 색인 다시 만들기':'동의하고 색인 준비',
        actions:action('decline','동의하지 않음')+(session.index?.status==='indexing'?action('refresh','색인 상태 다시 확인'):'')
      });
      if(session.messages.length) controls='<div class="chat-list" id="chatList">'+chatMessagesHtml(session.paper,session.messages)+'</div>'+controls;
    } else if (session.stage==='declined') controls=action('review','동의 안내 보기');
    else if (session.stage==='status-error') controls=action('refresh','색인 상태 다시 확인');
    else if (session.stage==='index-error') controls=action('retry-index','색인 다시 시도');
    else if (['ready','asking','saving'].includes(session.stage)) controls=conversation(session);
    box.innerHTML='<p class="reader-hint" role="status">'+esc(session.status)+'</p>'+controls;
    chatWireEffort(box.querySelector('.chat-effort'),false);
    chatWireExamples(box.querySelector('#chatEx'));
    const list=box.querySelector('#chatList');
    if (list) list.scrollTop=list.scrollHeight;
  }
  function restore(session) {
    const qa=store?.extra('artifact',session.id)?.qa;
    if (!qa) return;
    if (CHAT_EFFORT_CHOICES.includes(qa.depth)) session.depth=qa.depth;
    session.turns=Object.fromEntries(Object.entries(qa.turns || {}).filter(([,turn])=>
      turn && typeof turn.question==='string' && turn.answer?.role==='bot' && typeof turn.answer.text==='string' &&
      Array.isArray(turn.answer.evidence) && turn.answer.evidence.every(e=>e?.artifact_id===session.id &&
        e.document_use_id===session.use && Number.isSafeInteger(e.page) && e.page>0 && typeof e.quote==='string')));
    showTurns(session);
  }
  function orderedTurns(session) {
    return Object.entries(session.turns).sort(([a,x],[b,y])=>x.at-y.at || a.localeCompare(b));
  }
  function showTurns(session) {
    session.messages=orderedTurns(session)
      .flatMap(([,turn])=>[{role:'user',text:turn.question,att:turn.att,sel:turn.sel},turn.answer]);
  }
  function conversation(session) {
    const locked=session.stage!=='ready' || !!session.pending;
    const state={busy:locked,lockInput:locked,err:session.error,sel:session.selection,att:session.att,
      pick:session.pick,draft:session.draft};
    return chatConversationHtml(session.paper,state,session.messages,session.depth,1000)+
      (session.checkIndex?action('refresh','색인 상태 다시 확인'):'')+
      (session.pending && session.stage==='ready'?action('retry-save','대화 저장 다시 시도'):'');
  }
  async function saveChange(session,patch,ack) {
    const job=session.pending || {id:crypto.randomUUID(),patch,ack};
    session.pending=job;
    function saved() {
      if (!current(session) || session.pending!==job) return;
      job.ack();
      session.pending=null;
      session.error='';
      restore(session);
      transition(session,'ready','이 판본의 검색 색인이 준비됐어요.');
    }
    transition(session,'saving','질문하기 변경을 계정에 저장하고 있어요.');
    try {
      if (store) await store.patchExtra('artifact',session.id,{qa:job.patch},
        {request_id:job.id,task:session.task,label:'질문 대화·설정',onAck:saved});
      saved();
    } catch {
      if (!current(session) || session.pending!==job) return;
      session.error='대화나 설정 저장을 확인하지 못했어요. 대화 저장 다시 시도를 눌러 주세요.';
      transition(session,'ready','이 판본의 검색 색인이 준비됐어요.');
    }
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
    render(session);
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
    if (session.pending || !session.consent || session.stage!=='ready') return;
    const question=session.draft.trim();
    if (!question || question.length>1000) {
      session.error='질문을 1자에서 1,000자 사이로 적어 주세요.';
      return render(session);
    }
    const ctx=pdf.context(session.task,session.id);
    if (!ctx?.doc) return transition(session,'unavailable','질문할 PDF 판본을 다시 열어 주세요.');
    const cap=session.att && chatCaptureById(session.paper,session.att);
    const body={question,scope:'open_pdf',consent:true,answer_depth:session.depth,current_page:ctx.page,
      history:session.messages.slice(-6).map(({role,text})=>({role,text:text.slice(0,1200)}))};
    if (session.selection) body.selection=session.selection;
    session.error='';
    session.checkIndex=false;
    transition(session,'asking','이 PDF에서 근거를 찾아 답변을 준비하는 중이에요.');
    try {
      if (cap) {
        const attachment=await chatCaptureContext(ctx.doc,cap);
        if (!current(session)) return;
        body.current_page=attachment.page;
        const text=attachment.text || attachment.caption;
        if (text) body.selection={text:text.slice(0,1000),page:attachment.page};
        body.capture={page:attachment.page,note:attachment.mine};
      }
      const result=await account.write(session.base+'/ask',body);
      if (!current(session)) return;
      const answer=checkedAnswer(result,session,ctx.doc.numPages);
      const turnId=crypto.randomUUID();
      const turn={at:Date.now(),question,answer};
      if (cap) turn.att={id:cap.id,page:cap.page};
      if (session.selection) turn.sel=session.selection.text;
      const older=orderedTurns(session).slice(0,Math.max(0,Object.keys(session.turns).length+1-Math.floor(CHAT_KEEP/2)));
      const turns=Object.fromEntries(older.map(([id])=>[id,null]));
      turns[turnId]=turn;
      await saveChange(session,{turns},()=>{
        for(const [id] of older)delete session.turns[id];
        session.turns[turnId]=turn;
        showTurns(session);
        session.draft='';session.att=null;session.selection=null;session.pick=false;
      });
      return;
    } catch {
      if (!current(session)) return;
      session.checkIndex=true;
      session.error='답변을 확인하지 못했어요. 입력한 질문을 다시 보낼 수 있어요.';
    }
    transition(session,'ready','이 판본의 검색 색인이 준비됐어요.');
    if (!box.hidden) box.querySelector('#chatQ')?.focus();
  }

  const wired=new WeakSet();
  function mount(host) {
    box=host;
    if (!host || wired.has(host)) return;
    wired.add(host);
    host.addEventListener('input',e=>{if (host===box && current(activeSession) && e.target.id==='chatQ' && activeSession.stage==='ready') activeSession.draft=e.target.value;});
    host.addEventListener('change',e=>{
      if (host!==box || !current(activeSession) || activeSession.stage!=='ready' || e.target.name!=='chatEffort' || !CHAT_EFFORT_CHOICES.includes(e.target.value)) return;
      if (activeSession.pending) return;
      const session=activeSession,depth=e.target.value;
      saveChange(session,{depth},()=>{session.depth=depth;});
    });
    host.addEventListener('submit',e=>{e.preventDefault();if (host===box && current(activeSession)) submitQuestion(activeSession);});
    host.addEventListener('keydown',e=>{
      if (host===box && current(activeSession) && e.target.id==='chatQ' && e.key==='Enter' && !e.shiftKey && !e.isComposing && e.keyCode!==229) {
        e.preventDefault(); submitQuestion(activeSession);
      }
    });
    host.addEventListener('click',async e=>{
      const session=activeSession, button=e.target.closest('[data-chat-action]');
      if (box!==host || !current(session) || !button) return;
      const key=button.dataset.chatAction;
      if (key==='retry-save' && session.pending && session.stage==='ready') {
        await saveChange(session,session.pending.patch,session.pending.ack);
      } else if (session.pending) return;
      else if (key==='send' && session.stage==='ready') await submitQuestion(session);
      else if (key==='pick' && session.stage==='ready') {session.pick=!session.pick;render(session);}
      else if (key==='detach' && session.stage==='ready') {session.att=null;render(session);}
      else if (key==='attach' && session.stage==='ready' && chatCaptureById(session.paper,button.dataset.att)) {
        session.att=button.dataset.att;session.pick=false;render(session);
      } else if (key==='consent' && session.stage==='consent') {
        const checkbox=box.querySelector('#chatConsent');
        if (checkbox && !checkbox.checked) {
          box.querySelector('#chatMsg').textContent='PDF 본문과 질문 전송에 동의해 주세요.';
          checkbox.focus();
          return;
        }
        session.consent=true;
        if (isReady(session.index)) enableQuestions(session); else await prepare(session);
      } else if (key==='decline' && session.stage==='consent') {
        transition(session,'declined','PDF 본문이나 질문을 보내지 않았어요. 계속 읽을 수 있어요.');
      } else if (key==='review' && session.stage==='declined') offerConsent(session,session.index);
      else if (key==='refresh' && (['consent','status-error'].includes(session.stage) || (session.stage==='ready' && session.checkIndex))) await check(session);
      else if (key==='retry-index' && session.stage==='index-error' && session.consent) await prepare(session);
      else if (key==='cite' && ['ready','asking','consent'].includes(session.stage)) {
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
          const removed=Object.fromEntries(Object.keys(session.turns).map(id=>[id,null]));
          saveChange(session,{turns:removed},()=>{
            session.turns={};session.messages=[];session.draft='';session.att=null;session.pick=false;
            session.checkIndex=false;session.selection=null;
          });
        },true);
      } else if (key==='unselect' && session.stage==='ready') {session.selection=null;render(session);}
    });
  }
  mount(box);
  return {open,close,show,syncSelection,mount,attach(id){
    if (current(activeSession) && chatCaptureById(activeSession.paper,id)) {
      activeSession.att=id;activeSession.pick=false;
    }
  }};
}

// The original reader reconstructs its notes sidebar when a record changes. Keep
// the session bound to the selected edition and remount it on the original tab.
var accountProductChat=null;
function productAccountChatClose() {
  accountProductChat?.close();
  accountProductChat=null;
  CHAT.token++;
  CHAT.sel=null;CHAT.att=null;CHAT.pick=false;CHAT.draft='';CHAT.tab='notes';
}
function productAccountChatOpen(task,use,artifact,account,pdfLoaded) {
  productAccountChatClose();
  if (!artifact?.pdf) return;
  const paper=paperBy(use);
  let controller;
  // A paper may change editions before its next PDF.js document is mounted.
  // Recheck the product selection even when the Auth session has not changed.
  const readerSession={write:account.write,current:()=>account.current() && accountProductChat===controller &&
    S.taskId===task && S.reader===use && paperBy(use)===paper &&
    (!paper?.artifactId || paper.artifactId===artifact.artifact_id)};
  const active=(t,id)=>readerSession.current() && t===task && id===artifact.artifact_id &&
    typeof PV!=='undefined' && PV?.pid===use && PV.doc;
  const pdf={
    context(t,id) {
      if (!active(t,id)) return null;
      const selected=CHAT.sel;
      return {doc:PV.doc,page:PV.cur||1,selection:selected?.page ?
        {page:selected.page,text:selected.text.slice(0,1000)}:null};
    },
    async goToPage(t,id,page) {
      if (!active(t,id) || page>PV.doc.numPages) return false;
      pvGo(page);
      return true;
    }
  };
  controller=createAccountReaderChat(null,readerSession,pdf,()=>{
    if (window.matchMedia('(max-width:600px)').matches) {MTAB='pdf';applyMobileTab(paper,false);}
    $('#pvs')?.focus();
  },account);
  accountProductChat=controller;
  controller.open(task,use,artifact,pdfLoaded,paper);
}
