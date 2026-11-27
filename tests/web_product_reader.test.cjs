// Draft AC4, AC5 and AC7 regressions for the existing reader's account data adapter.
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),{randomUUID,webcrypto}=require('node:crypto');
const paper=randomUUID(),doc=randomUUID(),edition=randomUUID(),other=randomUUID(),task=randomUUID();
function setup(records=[],requests={}) {
  const extras={}, calls=[],status=new Map(),storage=new Map();
  const p={id:paper,document_id:doc,title:'논문',artifactId:edition,artifacts:[{artifact_id:edition,pdf:{available:true}},{artifact_id:other,pdf:{available:true}}]};
  const w={current:()=>true,recordRequests:requests,resume:{records,next_actions:[]},extra:(target,id)=>extras[id]||{},
    patchExtra:async(target,id,patch)=>{extras[id]??={};for (const [k,v] of Object.entries(patch)) extras[id][k]={...extras[id][k],...v};},
    saves:{read:k=>storage.get(k),store:(k,v)=>v?storage.set(k,v):storage.delete(k),track:(k,t,kind,phase)=>status.set(k,phase)},
    write:async(path,body)=>{calls.push({path,body});if(w.fail){w.fail=false;throw Error('offline');}
      if(path.endsWith('/records'))return {record_id:randomUUID()};
      return {highlights:[]};},
    mutate:async(label,path,body,options={})=>{const ack=path.endsWith('/next-actions')?
      {next_action_id:randomUUID(),source_record_id:body.source_record_id,saved_action:body.reviewed_action}:
      await w.write(path,body);options.onAck?.(ack);return ack;}};
  const c=vm.createContext({accountWorkspace:w,S:{source:'account',taskId:task,reader:paper},crypto:webcrypto,
    $:()=>null,document:{},paperBy:()=>p,Map,Set,console,structuredClone});
  vm.runInContext(fs.readFileSync('web/js/product-reader.js','utf8'),c);
  return {p,w,c,calls,status,extras};
}
function row(id,text,parent=null,artifact=edition) {return {record_id:id,revises_record_id:parent,
  record:{content_text:text},created_at:'2026-11-01',context_refs:{document_ids:[doc],artifact_ids:[artifact]}};}
test('canonical reader restores exact-edition memos, versions, mark association and last page',()=>{
  const first=randomUUID(),second=randomUUID(),mark=randomUUID();
  const {c,w,p}=setup([row(second,'정정',first),row(first,'  원문  '),row(randomUUID(),'다른 판본',null,other)]);
  c.accountHydratePaperRecords(p,w.resume,{last_page:4,highlights:[{id:mark,record_id:first,text:'quote',page:2,rects:[[0,.1,.2,.3]]}]});
  assert.equal(p.page,'4'); assert.equal(p.hl.length,1); assert.equal(p.hl[0].mine,'정정');
  assert.equal(p.hl[0].record_id,first);
  assert.deepEqual(Array.from(p.noteHistory,n=>n.content_text),['  원문  ','정정']);
});
test('failed card save keeps retry identity and original edition while corrections preserve the first record',async()=>{
  const {c,p,w,calls,status}=setup(),h={id:randomUUID(),type:'note',mine:'  최초  ',rects:[],page:2};
  p.hl=[h];w.fail=true;
  await assert.rejects(c.accountReaderCompleteMemo(p,h));
  assert.ok([...status.values()].includes('failed'));
  await c.accountReaderCompleteMemo(p,h);
  h.mine='정정';await c.accountReaderCompleteMemo(p,h);
  const writes=calls.filter(c=>c.path.endsWith('/records'));
  assert.equal(writes.length,3);assert.deepEqual(writes[0].body,writes[1].body);
  assert.equal(writes[0].body.request_id,h.id);
  assert.equal(writes[0].body.record.content_text,'  최초  ');
  assert.equal(writes[0].body.context.document_contexts[0].artifact_ref.artifact_id,edition);
  assert.equal(writes[2].body.revises_record_id,h.record_id);
  assert.ok(writes[2].body.request_id!==writes[0].body.request_id);
});

test('a delayed memo change cannot acknowledge later input, and the original editor retains its failed revision',async()=>{
  const {c,p,w,calls,status}=setup();
  vm.runInContext(fs.readFileSync('web/js/reader.js','utf8'),c);
  const field=new EventTarget(), h={id:randomUUID(),type:'note',mine:'',rects:[]};
  p.hl=[h];
  const started=Promise.withResolvers(),first=Promise.withResolvers();
  const write=w.write;
  let count=0;
  w.write=async(path,body)=>{
    if (++count===1) {calls.push({path,body});started.resolve();return first.promise;}
    return write(path,body);
  };
  let completion;
  c.wireMemoEditor(field,text=>{h.mine=text;c.accountReaderDraftMemo(p,h);},
    ()=>{completion=c.accountReaderCompleteMemo(p,h);completion.catch(()=>{});});
  field.value='첫 내용';field.dispatchEvent(new Event('input'));
  field.dispatchEvent(new Event('change'));
  await started.promise;
  field.value='나중에 쓴 내용';field.dispatchEvent(new Event('input'));
  first.resolve({record_id:randomUUID()});await completion;
  assert.deepEqual([...status.values()],['draft']);
  w.fail=true;field.dispatchEvent(new Event('blur'));await assert.rejects(completion);
  assert.deepEqual([...status.values()],['failed']);
  const key='draft.'+task+'.'+edition+'.'+h.id;
  const pending=w.saves.read(key);
  assert.equal(pending.operations[0].body.revises_record_id,h.record_id);
  const retryId=pending.operations[0].request_id;
  const fresh=setup();fresh.w.saves=w.saves;
  fresh.c.accountHydratePaperRecords(fresh.p,{records:[]});
  await fresh.c.accountReaderCompleteMemo(fresh.p,fresh.p.hl[0]);
  assert.equal(fresh.calls[0].path,'/tasks/'+task+'/records');
  assert.equal(fresh.calls[0].body.request_id,retryId);
  assert.equal(fresh.calls[0].body.record.content_text,'나중에 쓴 내용');
  assert.deepEqual([...status.values()],['saved']);
});

test('open edition restores its acknowledged page and a switched-away PDF cannot render late',async()=>{
  const {c,p,w}=setup(), opened=[];
  const delay=Promise.withResolvers();
  let readPdf=0;
  const panel={inert:true},box={};
  c.$=sel=>sel==='#rdnotes'?panel:null;
  c.renderRNotes=()=>{};
  c.openPv=async(p,src,page,current)=>opened.push({bytes:new Uint8Array(src.data)[0],page,current:current()});
  w.write=async(path,body)=>{
    assert.ok(body==null, 'opening a PDF must issue reads only');
    if (path.endsWith('/resume')) return {records:[]};
    if (path.endsWith('/reader')) return {last_page:path.includes(other)?3:5,highlights:[]};
    if (path.endsWith('/pdf')) return ++readPdf===1?delay.promise:new Blob([Uint8Array.of(2)]);
    assert.fail('unexpected route '+path);
  };
  const old=c.accountReaderPrepare(p,box);
  p.artifactId=other;
  await c.accountReaderPrepare(p,box);
  delay.resolve(new Blob([Uint8Array.of(1)]));await old;
  assert.deepEqual(opened,[{bytes:2,page:'3',current:true}]);
  assert.equal(panel.inert,false);
});

test('confirmed action uses the saved record for the reviewed text, even when another revision exists',async()=>{
  const id=randomUUID(),second=randomUUID();
  const {c,p,w}=setup([row(second,'정정',id),row(id,'첫 메모')]);
  c.accountHydratePaperRecords(p,w.resume);
  const h=p.hl[0],writes=[];
  w.mutate=async(label,path,body)=>{
    writes.push({label,path,body});
    return {next_action_id:randomUUID(),source_record_id:body.source_record_id,saved_action:body.reviewed_action};
  };
  await c.accountReaderConfirmAction(p,{sourceId:h.id,sourceText:'첫 메모',recordId:id,
    original:'원래 후보',reviewed:'사용자가 확인한 행동',key:'review'});
  assert.equal(writes.length,1);
  assert.equal(writes[0].body.source_record_id,id);
  assert.deepEqual({...writes[0].body.original_candidate},{action_text:'원래 후보'});
  assert.equal(writes[0].body.confirmed,true);
  assert.deepEqual({...writes[0].body.reviewed_action},{action_text:'사용자가 확인한 행동'});
});

test('only valid capture images and rectangle coordinates are restored from account metadata',()=>{
  const {c,p,w,extras}=setup(),good=randomUUID(),bad=randomUUID(),outside=randomUUID();
  extras[edition]={cards:{[good]:{img:'data:image/png;base64,AAAA',rects:[[.1,.2,.1,.1]],page:2},
    [bad]:{img:'x" onerror="bad',rects:[[.1,.2,.1,.1]],page:2},
    [outside]:{img:'data:image/png;base64,AAAA',rects:[[0,1,2,3]],page:2}}};
  c.accountHydratePaperRecords(p,w.resume);
  assert.deepEqual(Array.from(p.hl,h=>h.id),[good]);
});

test('the guided reader step leaves account reading state, recency, and saved page intact',()=>{
  const {c,p,w,calls}=setup();
  Object.assign(c.S,{reader:null,papers:[p],panel:'none'});
  Object.assign(c,{NA:{},RC:{},renderAll(){}});
  p.state='skim';p.lastReadOrder=4;
  w.papers={update:async(...args)=>{calls.push(args);}};
  vm.runInContext(fs.readFileSync('web/js/reader.js','utf8'),c);
  vm.runInContext(fs.readFileSync('web/js/tour.js','utf8'),c);
  c.tourEnsure('reader');
  assert.equal(c.S.reader,p.id);assert.equal(c.RD.guide,true);
  assert.equal(p.state,'skim');assert.equal(p.lastReadOrder,4);
  c.accountReaderView={p,current:()=>true};
  c.accountReaderSavePage(p,1);
  assert.equal(calls.length,0);
  let destroyed=false,blurred=false;
  c.PV={pid:p.id};c.killPv=()=>{destroyed=true;};
  c.document.activeElement={blur:()=>{blurred=true;}};
  c.$=id=>id==='#rdnotes'?{contains:()=>true}:null;
  c.accountCloseProductReader();
  assert.ok(destroyed && blurred);assert.equal(c.accountReaderView,null);
  c.openReader(p.id);
  assert.equal(c.RD.guide,false);assert.equal(p.lastReadOrder,5);
  assert.deepEqual(calls.map(call=>({...call[1]})),[{state:'reading'}]);
});

test('legacy flags and question survive canonical highlight hydration and a document memo appears once across editions',()=>{
  const root=randomUUID(),mark=randomUUID(),{w,c,p,extras}=setup([
    {record_id:root,record:{content_text:'논문 공통 메모'},context_refs:{document_ids:[doc],artifact_ids:[]}}
  ]);
  extras[edition]={cards:{[mark]:{kind:'수식',blocked:true,stuck:'eq',unsure:'수식 질문',solved:false,at:23}}};
  w.readerHighlights={[edition]:[{id:mark,page:5,text:'x=y',rects:[[0,.2,.5,.1]]}]};
  c.accountHydratePaperRecords(p,w.resume);
  const cards=Array.from(c.accountReaderFindRecords(p)), image=cards.find(r=>r.card.id===mark);
  assert.equal(image.artifactId,edition);assert.equal(image.card.unsure,'수식 질문');assert.equal(image.card.blocked,true);
  assert.equal(image.card.solved,false);assert.equal(image.card.stuck,'eq');
  assert.equal(cards.filter(r=>r.card.id===root).length,1);
  assert.equal(cards.find(r=>r.card.id===root).artifactId,null);
});
test('a selected metadata-only edition never downloads a different PDF from the paper link',()=>{
  const {c,p}=setup();p.artifacts[0]={artifact_id:edition,label_text:'첨부 대기',can_attach_pdf:true};
  p.link='https://arxiv.org/abs/1234.56789v2';
  vm.runInContext(fs.readFileSync('web/js/reader.js','utf8'),c);
  assert.equal(c.pdfDownloadSource(p),null);
});

test('search destination waits for the chosen edition, then reveals the requested capture instead of its saved page',()=>{
  const {c,p}=setup(),id=randomUUID(),calls=[];
  const h={id,page:3,img:'data:image/png;base64,AAAA',rects:[[.1,.2,.3,.1]]};p.hl=[h];p.page='8';
  c.chooseReadingRecord=(paper,card)=>calls.push([paper.id,card]);c.pvReveal=card=>calls.push(['reveal',card.page]);
  c.pvGo=page=>calls.push(['page',page]);
  const view={p,current:()=>true,ready:true,pdfReady:false,destination:{cardId:id,page:3}};
  c.accountReaderApplyDestination(view);
  assert.deepEqual(calls,[[p.id,id]]);assert.equal(view.destination.cardId,id);
  view.pdfReady=true;c.accountReaderApplyDestination(view);
  assert.deepEqual(calls.at(-1),['reveal',3]);assert.equal(view.destination,null);
});

test('a completed clear while its original memo is saving hides the annotation and keeps the earlier revision',async()=>{
  const {w,c,p,status}=setup(),h={id:randomUUID(),type:'note',mine:'처음 기록',rects:[]};
  p.hl=[h];const original=Promise.withResolvers(),patches=[];
  w.write=()=>original.promise;w.patchExtra=async(target,id,patch,options)=>{patches.push({target,id,patch,options});};
  const first=c.accountReaderCompleteMemo(p,h);
  h.mine='';c.accountReaderDraftMemo(p,h);const clear=c.accountReaderCompleteMemo(p,h);
  assert.ok(![...status.values()].includes('saved'));
  const record=randomUUID();original.resolve({record_id:record});
  await Promise.all([first,clear]);
  assert.equal(patches.length,1);assert.equal(patches[0].id,edition);assert.equal(patches[0].patch.cards[h.id].cleared,true);
  assert.equal(h.cleared,true);assert.equal(h.latestRecordId,record);
  assert.equal(p.noteHistory[0].content_text,'처음 기록');assert.deepEqual([...status.values()],['saved']);
});
