'use strict';

const actionDetails = [
  ['progress_text','진행 상태','reviewProgress'], ['blocker_text','장애','reviewBlocker'], ['deadline_text','기한','reviewDeadline'],
];

function accountActionHistory(actions, records) {
  if (!actions.length) return '';
  const sources = new Map(records.map(r => [r.record_id,r.record.content_text]));
  return '<h3>확인한 다음 작업</h3><ul>' + actions.map(action => {
    const saved = action.saved_action;
    const candidate = action.original_candidate;
    const original = candidate === null ? '등록된 후보 없음' : candidate?.action_text ??
      (candidate ? '구체적인 행동을 찾지 못함' : '미기록/확인 필요');
    const details = [['원문 메모',sources.get(action.source_record_id)],['최초 후보',original],
      ...actionDetails.map(([key,label]) => [label,saved[key]])];
    return '<li><details><summary>'+esc(saved.action_text)+'</summary><dl>'+details.map(([label,text]) =>
      '<dt>'+label+'</dt><dd>'+esc(text ?? '미기록/확인 필요')+'</dd>').join('')+'</dl></details></li>';
  }).join('')+'</ul>';
}

function actionLinksForm(snapshot, selected={}) {
  const ctx=snapshot.context;
  const artifacts=new Map();
  for(const doc of ctx.document_contexts) for(const a of doc.artifacts){
    artifacts.set(a.artifact_id,a.label_text || a.access_locator_text || doc.document.title || '표현물');
  }
  const groups=[
    ['question_ids','질문',ctx.questions.map(q=>[q.question_id,q.question_text])],
    ['decision_ids','판단',ctx.decisions.map(d=>[d.decision_id,d.decision_text])],
    ['artifact_ids','표현물',[...artifacts]],
    ['target_record_ids','대상 기록',snapshot.records.map(r=>[r.record_id,r.record.content_text])],
  ];
  const choices=groups.filter(([, ,items])=>items.length).map(([key,label,items])=>
    '<fieldset><legend>'+label+'</legend>'+items.map(([id,text])=>
      '<label><input type="checkbox" data-link-kind="'+key+'" value="'+esc(id)+'"'+
      (selected[key]?.includes(id)?' checked':'')+'> '+esc(text)+'</label>').join('')+'</fieldset>').join('');
  return choices ? '<details><summary>관련 항목 연결 (선택)</summary>'+choices+'</details>' : '';
}

function createAccountActionReview(request, {current,refresh,read,store,saves,lookup=$}) {
  const box=lookup('#naBox'), status=lookup('#accountActionStatus');
  const pending=new Map();
  let review=null;

  function clear() {
    if (review?.operation) phase(review,'failed');
    review=null;
    box.hidden=true;
    box.innerHTML='';
    status.textContent='';
  }
  function active(r) { return review===r && current(r.view); }
  function phase(r,value) {
    saves.track(r.key,r.view.id,'다음 작업',value,r.view.scope?.label || '프로젝트 기록');
  }
  function remember(r,entry) {
    if (entry) pending.set(r.key,entry); else pending.delete(r.key);
    store(r.key,entry);
    r.rejected=entry?.rejected;
    r.operation=r.rejected ? null : entry;
  }
  function show(r, message='', draft=r.operation) {
    const op=r.operation;
    const value=draft?.reviewed_action || {action_text:r.candidate?.action_text || ''};
    const inputs=actionDetails.map(([,label,id])=>'<label>'+label+
      ' (선택)<input type="text" id="'+id+'"></label>').join('');
    const candidate=r.candidate?.action_text;
    box.innerHTML='<div class="na-h"><b>다음 작업 확인</b><span>'+esc(r.view.snapshot.task.goal_text)+'</span></div>'+
      (candidate?'<div><span class="k">최초 후보 · 규칙 기반</span><p class="na-q">'+esc(candidate)+'</p></div>':'')+
      naReviewControls(value.action_text,r.record.record.content_text,true,op?'같은 요청 다시 확인':'확인하고 저장',
        inputs+actionLinksForm(r.view.snapshot,draft?.links))+'<p id="reviewStatus" role="status"></p>';
    lookup('#reviewStatus').textContent=message;
    const field=lookup('#naCand');
    field.value=value.action_text;
    field.readOnly=!!op;
    for(const [key,,id] of actionDetails) {
      const input=lookup('#'+id);
      input.value=value[key] ?? '';
      input.readOnly=!!op;
    }
    for(const link of $$('input[data-link-kind]',box)) link.disabled=!!op;
    if (op) lookup('#naCancel').textContent='닫기';
    wireActionConfirmation(text=>confirm(r,text),()=>{
      if (!active(r) || r.sending) return;
      if (r.rejected) { remember(r,null); phase(r,'idle'); }
      clear();
    });
    if(!r.sending)field.focus();
  }
  async function open(view,record,mode) {
    clear();
    const key='action.'+view.id+'.'+record.record_id;
    const entry=pending.get(key) || read(key), rejected=entry?.rejected;
    const draft=rejected || entry, operation=rejected ? null : entry;
    const r=review={view,record,key,operation,rejected,candidate:draft?.original_candidate ?? null,sending:false};
    box.hidden=false;
    if (rejected) { show(r,'저장 요청을 처리하지 못했어요. 입력과 연결을 다시 확인해 주세요.',rejected); return; }
    if(operation) { show(r,'이전에 확인한 저장 요청의 결과를 다시 확인해 주세요.');return; }
    if(mode==='manual') { show(r);return; }
    box.innerHTML='<span role="status">메모에서 다음 할 일을 찾는 중…</span><button type="button" class="btn" id="naCancel">취소</button>';
    lookup('#naCancel').addEventListener('click',()=>{if(active(r))clear();});
    let suggestion;
    try { suggestion=await aiSuggest(record.record.content_text); } catch { /* Offer manual entry below. */ }
    if(!active(r))return;
    if(suggestion?.ok) r.candidate={action_text:suggestion.action};
    show(r,r.candidate?.action_text ? '' : '다음 할 일을 찾지 못했어요. 직접 입력한 뒤 확인해 주세요.');
  }
  async function confirm(r,text) {
    if(!active(r) || r.sending)return;
    if(!r.operation){
      const reviewed_action={action_text:text}, links={};
      for(const [key,,id] of actionDetails) {
        const value=lookup('#'+id).value;
        if(value.trim())reviewed_action[key]=value;
      }
      for(const link of $$('input[data-link-kind]:checked',box))
        (links[link.dataset.linkKind] ||= []).push(link.value);
      const op={request_id:crypto.randomUUID(),confirmed:true,source_record_id:r.record.record_id,
        original_candidate:r.candidate,reviewed_action};
      if(Object.keys(links).length) op.links=links;
      remember(r,op);
    }
    r.sending=true;
    phase(r,'saving');
    show(r,'계정에 저장 중…');
    lookup('#naOk').disabled=lookup('#naCancel').disabled=true;
    try {
      const ack=await request('/tasks/'+r.view.id+'/next-actions',r.operation);
      if(!active(r))return;
      if(!ack?.next_action_id || ack.source_record_id!==r.record.record_id ||
          ack.saved_action?.action_text!==r.operation.reviewed_action.action_text) throw new Error();
    } catch(error) {
      if(!active(r))return;
      r.sending=false;
      if(error.code==='INVALID_LINK' || error.code==='INVALID_INPUT'){
        // The server rejected the entire operation. Keep the fields editable for a new review.
        const rejected=r.operation;
        remember(r,{rejected});
        phase(r,'rejected');
        show(r,error.message,rejected);
      } else { phase(r,'failed'); show(r,'저장 결과를 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.'); }
      return;
    }
    remember(r,null);
    phase(r,'saved');
    clear();
    status.textContent='확인한 다음 작업을 계정에 저장했어요.';
    try { await refresh(r.view); }
    catch { if(current(r.view) && !review) status.textContent+=' 목록을 다시 보려면 프로젝트를 열어 주세요.'; }
  }
  return {open,clear};
}
