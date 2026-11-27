'use strict';
// Persistence for the product reader. The reader markup and PDF.js selection model are shared.
var accountReaderView=null;
const accountMemoQueues=new Map();
function accountReaderEnabled() {
  return typeof S!=='undefined' && S.source==='account' && typeof accountWorkspace!=='undefined' && !!accountWorkspace;
}
function accountReaderScope(p) {
  const w=accountWorkspace,task=p.accountTaskId||S.taskId,artifact=p.artifactId||null;
  return {w,task,artifact,privatePdf:!!accountReaderEdition(p)?.pdf,target:artifact?'artifact':'paper',id:artifact||p.id,
    path:'/tasks/'+task,active:()=>w.current() && S.taskId===task && paperBy(p.id)===p && (p.artifactId||null)===artifact};
}
function accountReaderEdition(p) {
  return (p.artifacts||[]).find(a=>a.artifact_id===p.artifactId);
}
function accountReaderPdf(p,id) {
  const selected=id||p.artifactId, available=(p.artifacts||[]).filter(a=>a.pdf?.available);
  const a=selected?available.find(a=>a.artifact_id===selected):available.length===1?available[0]:null;
  if (!a?.pdf?.available) return Promise.reject(Error('열 PDF 판본을 선택해 주세요.'));
  return accountWorkspace.write('/tasks/'+S.taskId+'/artifacts/'+a.artifact_id+'/pdf',null,{pdf:true});
}
function accountReaderNewId() { return accountReaderEnabled()?crypto.randomUUID():nid('h'); }
function accountReaderBackground(work) { if (work?.catch) work.catch(()=>{}); }
function accountReaderExtra(p,patch,label) {
  const s=accountReaderScope(p);
  return s.w.patchExtra(s.target,s.id,patch,{task:s.task,label});
}
function accountCardMetadata(h,includeQuote=false) {
  const result={};
  for (const k of ['at','kind','blocked','stuck','solved','type','page','img','record_id']) {
    if (h[k]!=null) result[k]=h[k];
  }
  if (h.img || includeQuote) {result.rects=h.rects;result.text=h.text||'';}
  return result;
}
function accountReaderCardChanged(p,h) {
  const label=h.img?'영역 캡처':h.type==='note'?'메모 위치':'하이라이트 표시';
  return accountReaderExtra(p,{cards:{[h.id]:accountCardMetadata(h,!accountReaderEdition(p)?.pdf)}},label);
}
function accountReaderPath(s) { return s.path+'/artifacts/'+s.artifact+'/reader'; }
function accountReaderNewCard(p,h) {
  if (!accountReaderEnabled()) return;
  accountReaderBackground(accountReaderCardChanged(p,h));
  if (h.type!=='note' && !h.img && h.text) accountReaderBackground(accountReaderAnchor(p,h));
}
function accountReaderAnchor(p,h) {
  const s=accountReaderScope(p);
  if (!s.privatePdf || h.anchorReady || h.type==='note'||h.img) return Promise.resolve();
  if (!h.anchorRequest) {
    const highlight={id:h.id,page:h.page,text:h.text,rects:h.rects,record_id:null};
    h.anchorRequest=s.w.mutate('하이라이트',accountReaderPath(s),{highlight},{requestId:h.id,onAck:()=>{h.anchorReady=true;}})
      .then(ack=>{h.anchorReady=true;return ack;});
    h.anchorRequest.finally(()=>{delete h.anchorRequest;}).catch(()=>{});
  }
  return h.anchorRequest;
}
async function accountReaderRemoveCard(p,h) {
  const s=accountReaderScope(p);
  if (!s.active()) return;
  const item=accountMemo(p,h);
  // Keep the last edited version in correction history before removing its card.
  if (item.draft.operations.length || (h.mine||'')!==item.draft.original)
    await accountReaderCompleteMemo(p,h);
  if (!s.active()) return;
  const writes=[accountReaderExtra(p,{cards:{[h.id]:{deleted:true}}},'읽기 기록 삭제')];
  if (s.privatePdf && h.type!=='note' && !h.img)
    writes.push(s.w.mutate('하이라이트 삭제',accountReaderPath(s),{remove_highlight:h.id}));
  await Promise.all(writes);
  if (!s.active()) return;
  p.hl=p.hl.filter(card=>card.id!==h.id);
  if (S.reader===p.id) {
    if (RR.selected===h.id) clearReadingSelection(p);
    drawHl(p,h.page);drawHlList();renderHistory(p);
  }
}
function accountCardId(id) {
  return typeof id==='string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id);
}
function accountCardRects(rects) {
  return Array.isArray(rects) && rects.every(r=>Array.isArray(r)&&r.length===4&&
    r.every(v=>Number.isFinite(v)&&v>=0&&v<=1)&&r[2]>0&&r[3]>0&&r[0]+r[2]<=1.000000000000001&&r[1]+r[3]<=1.000000000000001);
}
function accountReadCard(id,raw) {
  if (!accountCardId(id) || !raw || typeof raw!=='object') return null;
  const h={id,text:'',rects:[],mine:''};
  if (raw.type==='note') h.type='note';
  if (accountCardId(raw.record_id)) h.record_id=raw.record_id;
  if (Number.isSafeInteger(raw.at)&&raw.at>0) h.at=raw.at;
  if (Number.isSafeInteger(raw.page)&&raw.page>0) h.page=raw.page;
  for(const key of ['cleared','blocked','deleted','solved']) if(typeof raw[key]==='boolean') h[key]=raw[key];
  for(const key of ['kind','stuck','text']) if(typeof raw[key]==='string') h[key]=raw[key];
  if (accountCardRects(raw.rects)) h.rects=raw.rects;
  if (h.rects.length && typeof raw.img==='string' && /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(raw.img)) h.img=raw.img;
  return h;
}
function accountHydratePaperRecords(p,snapshot,state) {
  if (!p.artifactId) {
    const chosen=accountWorkspace.extra('paper',p.id)?.selectedArtifactId;
    const a=chosen && p.artifacts?.find(a=>a.artifact_id===chosen);
    if(a){p.artifactId=chosen;p.pdf=!!a.pdf?.available;p.fname=a.label_text||'';}
  }
  const s=accountReaderScope(p),extra=s.w.extra(s.target,s.id)||{},cards=extra.cards||{};
  if(Number.isSafeInteger(extra.totalPages)&&extra.totalPages>0)p.total=String(extra.totalPages);
  if(!state){
    const page=s.privatePdf?s.w.readingPages?.[s.artifact]:extra.externalLastPage;
    p.page=Number.isSafeInteger(page)&&page>0?String(page):'';
  }
  p.accountTaskId=s.task;
  const records=snapshot?.records||[],byId=new Map(records.map(r=>[r.record_id,r]));
  const anchors=state?.highlights||[],byRecord=new Map(anchors.filter(h=>h.record_id).map(h=>[h.record_id,h.id]));
  const models=new Map();
  for (const [id,raw] of Object.entries(cards)) {
    const h=accountReadCard(id,raw);
    if (!h) continue;
    if (h.record_id) byRecord.set(h.record_id,id);
    if (!h.deleted && (h.img || h.type==='note' || h.text)) models.set(id,h);
  }
  for (const raw of anchors) {
    const anchor=accountReadCard(raw.id,raw);
    if (!anchor || cards[anchor.id]?.deleted) continue;
    const extras=accountReadCard(anchor.id,cards[anchor.id]);
    models.set(anchor.id,{...extras,...anchor,anchorReady:true});
  }
  const history=[],recordCards=new Map(),latestByRoot=new Map(),hidden=s.w.extra('paper',p.id)?.hiddenHistory||{};
  for (const r of records.slice().reverse()) {
    const refs=r.context_refs||{};
    let root=r, seen=new Set();
    while (byId.has(root.revises_record_id) && !seen.has(root.record_id)) {
      seen.add(root.record_id);root=byId.get(root.revises_record_id);
    }
    const id=byRecord.get(root.record_id)||byRecord.get(r.record_id)||s.w.recordRequests?.[root.record_id]||root.record_id;
    const included=(refs.artifact_ids||[]).length ? refs.artifact_ids.includes(s.artifact) :
      refs.document_ids?.includes(p.document_id);
    if (!included && !byRecord.has(root.record_id) && !byRecord.has(r.record_id)) continue;
    if (!accountCardId(id)) continue;
    recordCards.set(r.record_id,id);latestByRoot.set(root.record_id,r);
    const h=models.get(id)||{id,type:'note',mine:'',text:'',rects:[],at:Date.parse(root.created_at)||null};
    h.record_id=h.record_id||root.record_id;h.latestRecordId=r.record_id;
    h.mine=r.record.content_text;h.savedMemo=h.mine;
    const contexts=(snapshot.context?.document_contexts||[]).filter(row=>row.record_id===r.record_id);
    if (contexts.length) h.recordContexts=contexts.map(row=>{
      const cited=row.artifacts?.find(a=>refs.artifact_ids?.includes(a.artifact_id));
      return {document_ref:{document_id:row.document_id},use:{},...(cited?{artifact_ref:{artifact_id:cited.artifact_id}}:{})};
    });
    history.push({id:r.record_id,content_text:h.mine,source_highlight_id:id,source_page:h.page,
      created_at:Date.parse(r.created_at)||null,hidden_in_history:!!hidden[r.record_id]});
    if (h.cleared) h.mine='';
    if (!cards[id]?.deleted) models.set(id,h);
  }
  for (const h of models.values()) {
    const version=latestByRoot.get(h.record_id);
    if (version && !h.latestRecordId) {
      h.latestRecordId=version.record_id;h.savedMemo=version.record.content_text;
      h.mine=h.cleared?'':h.savedMemo;
    }
  }
  p.hl=[...models.values()];
  p.note='';p.noteHistory=history;
  p.actionHistory=(snapshot?.next_actions||[]).filter(a=>recordCards.has(a.source_record_id)).slice().reverse().map(a=>({
    id:a.next_action_id,kind:'confirmed',source_record_id:a.source_record_id,source_highlight_id:recordCards.get(a.source_record_id),
    source_note:byId.get(a.source_record_id)?.record.content_text,final_action:a.saved_action?.action_text,
    original_candidate:a.original_candidate?.action_text,created_at:Date.parse(a.created_at)||null
  }));
  const saved=p.actionHistory.at(-1);
  if (saved) {p.todo=saved.final_action;p.todoSrc='confirmed';}
  else {p.todo='';p.todoSrc='';}
  for (const [id,event] of Object.entries(extra.candidates||{})) {
    if(accountCardId(id)&&event?.kind==='candidate'&&typeof event.original_candidate==='string'&&
        accountCardId(event.source_highlight_id) && accountCardId(event.source_record_id)) {
      p.actionHistory.push({id,kind:'candidate',source_note:String(event.source_note||''),
        source_record_id:event.source_record_id,source_highlight_id:event.source_highlight_id,source_page:event.source_page,
        original_candidate:event.original_candidate,created_at:event.created_at});
    }
  }
  if (state) p.page=state.last_page?String(state.last_page):'';
  const pending=s.w.saves.read('memoCards.'+s.task+'.'+s.id)||{};
  for (const [id,metadata] of Object.entries(pending)) {
    const d=s.w.saves.read('draft.'+s.task+'.'+s.id+'.'+id);
    if (!d) continue;
    let h=p.hl.find(h=>h.id===id);
    if (!h) { h=accountReadCard(id,metadata);if(!h)continue;p.hl.push(h); }
    h.mine=d.text;
  }
}
function accountMemo(p,h) {
  const s=accountReaderScope(p),key='draft.'+s.task+'.'+s.id+'.'+h.id;
  const cache=[s.w.projectUrl,s.w.accountId,key].join('|');
  let item=accountMemoQueues.get(cache);
  if (!item) {
    const draft=s.w.saves.read(key)||{operations:[],text:h.mine||'',original:h.cleared?'':h.savedMemo||'',latest:h.latestRecordId||null,root:h.record_id||null};
    item={...s,draft,key,h,p};accountMemoQueues.set(cache,item);
  } else {
    if (!item.sending && !item.draft.operations.length && item.draft.text===item.draft.original &&
        h.latestRecordId && h.latestRecordId!==item.draft.latest) {
      Object.assign(item.draft,{text:h.mine,original:h.savedMemo,latest:h.latestRecordId,root:h.record_id});
    }
    item.h=h;item.p=p;item.active=s.active;
  }
  return item;
}
function accountMemoKeep(item,phase) {
  const {w,task,id,key,draft,h,p}=item, index='memoCards.'+task+'.'+id;
  const cards=w.saves.read(index)||{}, confirmed=phase==='saved';
  if (confirmed) delete cards[h.id]; else cards[h.id]=accountCardMetadata(h,true);
  w.saves.store(index,Object.keys(cards).length?cards:null);
  w.saves.store(key,confirmed?null:{...draft,label:p.title});
  w.saves.track(key,task,'메모',phase,p.title);
  if (item.active() && S.reader===p.id) {
    const notice=$('#accountReaderNotice');
    if (notice) {
      let msg=notice.querySelector('[data-memo-status="'+h.id+'"]');
      if (!msg) {msg=document.createElement('div');msg.dataset.memoStatus=h.id;notice.appendChild(msg);}
      msg.textContent=phase==='failed'?'이 메모의 계정 저장을 확인하지 못했어요.':phase==='saving'?'메모를 계정에 저장하는 중…':
        phase==='draft'?'메모를 편집 중이에요.':'메모를 계정에 저장했어요.';
      if (phase==='failed' || phase==='draft') {
        const b=document.createElement('button');b.className='btn sm';b.textContent=phase==='failed'?'메모 다시 저장':'메모 저장';
        b.onclick=()=>accountReaderBackground(accountReaderCompleteMemo(p,h));msg.appendChild(b);
      }
    }
  }
}
function accountReaderDraftMemo(p,h) {
  if (!accountReaderEnabled()) return;
  const item=accountMemo(p,h);item.draft.text=h.mine;accountMemoKeep(item,'draft');
}
async function accountReaderCompleteMemo(p,h) {
  const item=accountMemo(p,h),d=item.draft,w=item.w;
  d.text=h.mine;
  const pending=d.operations.at(-1);
  if (d.text.trim() && d.text!==(pending?pending.text:d.original)) {
    d.operations.push({request_id:!d.latest && !pending?h.id:crypto.randomUUID(),text:d.text});
  }
  // Empty edits are deliberate cleared annotations. Retain their saved record history.
  if (!d.text.trim() && !d.operations.length) {
    await accountReaderExtra(p,{cards:{[h.id]:{cleared:true}}});
    h.cleared=true;d.original='';
    accountMemoKeep(item,'saved');return null;
  }
  if (!d.operations.length) {accountMemoKeep(item,'saved');return d.latest;}
  if (item.sending) return item.sending;
  item.sending=(async()=>{
    try {
      while (d.operations.length) {
        const op=d.operations[0];
        const entry={document_ref:{document_id:p.document_id},use:{}};
        if (item.artifact) entry.artifact_ref={artifact_id:item.artifact};
        if (!op.body) {
          op.body={request_id:op.request_id,record:{content_text:op.text},context:{document_contexts:item.h.recordContexts||[entry]}};
          if (d.latest) op.body.revises_record_id=d.latest;
        }
        accountMemoKeep(item,'saving');
        if (!op.receipt) {
          const ack=await w.write(item.path+'/records',op.body);
          if (typeof ack?.record_id!=='string' || !ack.record_id) throw Error('메모 저장 응답을 확인하지 못했어요.');
          op.receipt=ack.record_id;
          if (w.recordRequests && S.taskId===item.task) w.recordRequests[op.receipt]=op.request_id;
          accountMemoKeep(item,'saving');
        }
        const root=d.root||op.receipt;
        if (item.privatePdf && item.h.type!=='note' && !item.h.img && !d.root) {
          if (item.active()) await accountReaderAnchor(item.p,item.h);
          const linked=await w.write(accountReaderPath(item),{link:{id:item.h.id,record_id:root}});
          if (!linked?.highlights?.some(a=>a.id===item.h.id && a.record_id===root)) throw Error('하이라이트와 메모의 연결을 확인하지 못했어요.');
        }
        d.latest=op.receipt;d.root=root;d.original=op.text;d.operations.shift();
        Object.assign(item.h,{record_id:root,latestRecordId:d.latest,savedMemo:op.text});
        if (item.active()) {
          const hist=item.p.noteHistory||=[];
          if (!hist.some(r=>r.id===op.receipt)) hist.push({id:op.receipt,content_text:op.text,created_at:Date.now(),source_highlight_id:h.id,source_page:h.page});
          if (h.cleared) { h.cleared=false;accountReaderBackground(accountReaderExtra(p,{cards:{[h.id]:{cleared:false}}})); }
        }
      }
      accountMemoKeep(item,d.text===d.original?'saved':'draft');
      if (d.text===d.original && item.active() && S.reader===item.p.id && typeof aiOn==='function' && aiOn())
        aiSchedule(item.p,300);
      return d.latest;
    } catch(error) {accountMemoKeep(item,'failed');throw error;}
    finally {item.sending=null;}
  })();
  return item.sending;
}
function accountReaderSavePage(p,page) {
  if (!accountReaderEnabled()||!accountReaderView?.current()||RD.guide) return;
  const s=accountReaderScope(p);
  if (!s.privatePdf) {accountReaderBackground(accountReaderExtra(p,{externalLastPage:Number(page)}));return;}
  accountReaderBackground(s.w.mutate('읽기 위치',accountReaderPath(s),{last_page:Number(page)}));
}
function accountReaderRefreshMarks(job,ack) {
  const view=accountReaderView;
  if (!view?.current() || !Array.isArray(ack?.highlights)) return;
  const p=view.p,s=accountReaderScope(p);
  if (job.path!==accountReaderPath(s)) return;
  const id=job.body.highlight?.id||job.body.link?.id||job.body.remove_highlight;
  if (!id) return;
  const match=ack.highlights.find(h=>h.id===id);
  if (job.body.remove_highlight) p.hl=p.hl.filter(h=>h.id!==id);
  else if (match) {
    const mark=accountReadCard(id,match);
    if (!mark) return;
    const h=p.hl.find(h=>h.id===id);
    if (h) {h.anchorReady=true;if(mark.record_id)h.record_id=mark.record_id;}
    else if (!s.w.extra(s.target,s.id)?.cards?.[id]?.deleted) {
      const metadata=accountReadCard(id,s.w.extra(s.target,s.id)?.cards?.[id]);
      p.hl.push({...metadata,...mark,anchorReady:true});
    }
  }
  drawHlList();
  if (typeof PV!=='undefined' && PV) for (const pg of PV.pages) if(pg?.el) drawHl(p,Number(pg.el.dataset.n));
}
function accountCloseProductReader() {
  if (!accountReaderView) return;
  const open=accountReaderView;
  accountReaderView=null;
  if (typeof document!=='undefined' && $('#rdnotes')?.contains?.(document.activeElement)) document.activeElement.blur();
  if (typeof PV!=='undefined' && PV?.pid===open.p.id && typeof killPv==='function') killPv();
  if (typeof productAccountChatClose==='function') productAccountChatClose();
}
function accountReaderPrepare(p,box) {
  accountCloseProductReader();
  const s=accountReaderScope(p),a=accountReaderEdition(p);
  const v=accountReaderView={p,current:()=>accountReaderView===v && s.active() && S.reader===p.id};
  const loaded=(async()=>{
    const stateRead=a?.pdf?s.w.write(accountReaderPath(s)):Promise.resolve(null);
    const fileRead=Promise.allSettled(a?.pdf?.available?[accountReaderPdf(p,a.artifact_id)]:[]);
    const [data,state]=await Promise.all([s.w.write(s.path+'/resume'),stateRead]);
    if (!v.current()) return;
    v.ready=true;accountHydratePaperRecords(p,data,state);
    renderRNotes();$('#rdnotes').inert=false;
    const [file]=await fileRead;
    if (!v.current()) return;
    if (file?.status==='rejected') throw file.reason;
    if (file?.value) {
      const bytes=await file.value.arrayBuffer();
      if (v.current()) await openPv(p,{data:bytes},p.page,v.current);
    } else if (a?.pdf) box.textContent='이 판본의 PDF를 열 수 없어요. 저장된 기록을 확인하거나 같은 파일을 다시 첨부해 주세요.';
  })().catch(()=>{
    if (v.current()) {
      box.innerHTML='<p role="alert">이 판본의 계정 자료를 불러오지 못했어요.</p><button class="btn sm" id="readerReload">다시 불러오기</button>';
      $('#readerReload').onclick=()=>readerSrc(p,p.page);
    }
  });
  if (a?.pdf && typeof productAccountChatOpen==='function') productAccountChatOpen(s.task,p.document_use_id||p.id,a,s.w,loaded);
  return loaded;
}
function accountReaderPendingNotice(p) {
  const s=accountReaderScope(p),pending=s.w.saves.read('memoCards.'+s.task+'.'+s.id)||{};
  for (const h of p.hl) if (pending[h.id]) {
    const item=accountMemo(p,h);
    accountMemoKeep(item,item.sending?'saving':item.draft.operations.length?'failed':'draft');
  }
  const notice=$('#accountReaderNotice');
  if(notice && typeof productLegacyReaderRecovery==='function')productLegacyReaderRecovery(p,s,notice);
}
function accountReaderCandidate(p,entry) {
  return accountReaderExtra(p,{candidates:{[entry.id]:entry}},'다음 작업 후보');
}
async function accountReaderSourceRecord(p,h,sourceText,recordId) {
  const matches=r=>r.source_highlight_id===h?.id && r.content_text===sourceText;
  const source=()=>p.noteHistory?.find(r=>r.id===recordId && matches(r)) || p.noteHistory?.findLast(matches);
  if (!source() && h?.mine===sourceText) await accountReaderCompleteMemo(p,h);
  return source()?.id || null;
}
async function accountReaderConfirmAction(p,{sourceId,sourceText,recordId,original,reviewed,key}) {
  const s=accountReaderScope(p);
  const h=(p.hl||[]).find(h=>h.id===sourceId);
  const record=await accountReaderSourceRecord(p,h,sourceText,recordId);
  if (!record||!s.active()) throw Error('원문 메모를 먼저 계정에 저장하고 다시 확인해 주세요.');
  const saved=s.w.saves,storage='proposal.'+s.task+'.'+s.id+'.'+key;
  const prior=saved.read(storage);
  const body=prior||{request_id:accountCardId(key)?key:crypto.randomUUID(),source_record_id:record,confirmed:true,
    reviewed_action:{action_text:reviewed},original_candidate:original?{action_text:original}:null};
  if (prior && (prior.source_record_id!==record||prior.reviewed_action.action_text!==reviewed))
    throw Error('이전 확인 요청을 먼저 다시 저장해 주세요.');
  saved.store(storage,body);
  const ack=await s.w.mutate('다음 작업',s.path+'/next-actions',body);
  if (!ack?.next_action_id||ack.source_record_id!==record||ack.saved_action?.action_text!==reviewed)
    throw Error('다음 작업의 계정 저장을 확인하지 못했어요.');
  saved.store(storage,null);
  if (s.active()) {
    p.actionHistory||=[];
    if (!p.actionHistory.some(event=>event.id===ack.next_action_id)) p.actionHistory.push({
      id:ack.next_action_id,kind:'confirmed',candidate_id:key,source_record_id:record,
      source_highlight_id:sourceId,source_page:h?.page,source_note:sourceText,original_candidate:original,
      final_action:reviewed,created_at:Date.now()
    });
  }
  return ack;
}
function accountReaderManualTodo(p,text) {
  if (!text.trim()) return;
  const s=accountReaderScope(p);
  ask('이 다음 작업을 확인하고 저장할까요?',text,'확인하고 저장',async()=>{
    if (!s.active()) return;
    const extra=s.w.extra('paper',p.id)||{};
    const key=extra.manualSourceId||crypto.randomUUID();
    try {
      await s.w.patchExtra('paper',p.id,{manualSourceId:key});
      if (!s.active()) return;
      let h=p.hl.find(h=>h.id===key);
      if (!h) {h={id:key,type:'note',rects:[],mine:text,text:''};p.hl.push(h);}
      h.mine=text;
      const id=await accountReaderCompleteMemo(p,h);
      if (!id||!s.active()) return;
      const ack=await accountReaderConfirmAction(p,{sourceId:key,sourceText:text,original:null,reviewed:text,key:id});
      if (!s.active()) return;
      p.todo=text;p.todoSrc='manual';
      await s.w.patchExtra('paper',p.id,{manualTodoDraft:null});
      if (S.reader===p.id) {renderRNotes();toast('다음 작업을 계정에 저장했어요.');}
      return ack;
    } catch { if(s.active())toast('다음 작업 저장을 확인하지 못했어요. 다시 확인해 주세요.'); }
  });
}
