// SPEC §5.4 / AC4, AC5, AC7. Use the account page's scripts and its existing offline candidate generator.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const t1=randomUUID(), t2=randomUUID(), rid=randomUUID();
const memo='  이전 표 확인함.\n부록 비교하기  ';
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function workspace({memoText=memo,search='',submit,storage=new Map(),timer=fn=>fn(),actions=[]}={}) {
  const nodes=new Map(), writes=[], reads=[];
  let valid=true;
  function node(id) {
    const listeners={}, el={value:'',textContent:'',disabled:false,hidden:false,dataset:{},focus(){},
      querySelectorAll(selector){return (this.choices||[]).filter(c=>!selector.endsWith(':checked')||c.checked);},
      addEventListener(type,fn){listeners[type]=fn;},emit(type,target=el){return listeners[type]?.({target});}};
    Object.defineProperty(el,'innerHTML',{get(){return this.html||'';},set(html){
      this.html=html;
      this.choices=[...html.matchAll(/data-link-kind="([^"]+)" value="([^"]+)"( checked)?/g)].map(([,linkKind,value,checked])=>
        ({dataset:{linkKind},value,checked:!!checked}));
      for (const child of this.children||[]) nodes.delete(child);
      this.children=[];
      for(const [,child] of html.matchAll(/\bid="([^"]+)"/g)){
        nodes.set(child,node(child)); this.children.push(child);
      }
    }});
    return el;
  }
  const html=fs.readFileSync('web/views/account-projects.html','utf8');
  for(const [,id] of html.matchAll(/\bid="([^"]+)"/g))nodes.set(id,node(id));
  const ctx=vm.createContext({document:{getElementById:id=>nodes.get(id),querySelector:s=>nodes.get(s.slice(1)),querySelectorAll:()=>[]},
    window:{},crypto:{randomUUID},setTimeout:timer,location:{search},URL,
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
  for(const [,src] of html.matchAll(/<script src="([^"]+)"/g))vm.runInContext(fs.readFileSync('web/'+src,'utf8'),ctx);
  const records=[{record_id:rid,record:{content_text:memoText},context_refs:{document_ids:[]}}];
  const task=(id)=>({task_id:id,task:{goal_text:id}});
  const nodeBy=id=>{assert.ok(nodes.has(id),'missing control '+id); return nodes.get(id);};
  const api=async(path,body)=>{
    if(body){
      writes.push({path,body:structuredClone(body)});
      if(submit)return submit(body);
      const ack={next_action_id:randomUUID(),source_record_id:rid,saved_action:structuredClone(body.reviewed_action)};
      actions.push({...ack,original_candidate:structuredClone(body.original_candidate),links:structuredClone(body.links)});
      return ack;
    }
    reads.push(path);
    if(path==='/tasks')return {tasks:[task(t1),task(t2)]};
    const id=path.split('/')[2];
    return {...task(id),records:id===t1?records:[],context:{questions:[],decisions:[],document_contexts:[]},next_actions:id===t1?actions:[]};
  };
  return {writes,reads,storage,node:nodeBy,stop(){valid=false;},
    start:()=>ctx.startAccountProjects(api,{projectUrl:'synthetic',accountId:'fixture',current:()=>valid}),
    open(mode){assert.match(nodeBy('accountRecords').innerHTML,/data-review-record/);
      return nodeBy('accountRecords').emit('click',{closest:()=>({dataset:{reviewRecord:rid,mode}})});},
    select:id=>ctx.projAccountMenu.select(id),click:id=>nodeBy(id).emit('click'),
    type(id,text){const el=nodeBy(id);el.value=text;el.emit('input');}};
}

test('offline review shows the original memo and candidate; editing or cancelling sends nothing',async()=>{
  const ui=workspace();await ui.start();await ui.open('candidate');await tick();
  assert.match(ui.node('naBox').innerHTML,/이전 표 확인함/);
  assert.equal(ui.node('naCand').value,'부록 비교하기');
  ui.type('naCand','사용자가 고친 작업');
  await ui.click('naCancel');
  assert.equal(ui.writes.length,0);assert.equal(ui.node('naBox').hidden,true);
  await ui.open('candidate');await tick();
  assert.equal(ui.node('naCand').value,'부록 비교하기');
  ui.type('naCand','  사용자가 고친 작업  ');ui.type('reviewDeadline','다음 모임');
  await ui.click('naOk');
  const [{path,body}]=ui.writes;
  assert.equal(path,'/tasks/'+t1+'/next-actions');assert.equal(body.source_record_id,rid);
  assert.equal(body.confirmed,true);assert.deepEqual(body.original_candidate,{action_text:'부록 비교하기'});
  assert.deepEqual(body.reviewed_action,{action_text:'  사용자가 고친 작업  ',deadline_text:'다음 모임'});
  assert.match(ui.node('accountRecords').innerHTML,/이전 표 확인함/);
  assert.equal(ui.reads.at(-1),'/tasks/'+t1+'/resume');
});

test('manual, unclear and failed suggestions all require explicit confirmation of a nonblank action',async()=>{
  for(const [mode,memoText,search,original] of [['manual',memo,'',null],['candidate','읽던 곳이 모호하다','',{action_text:null}],
    ['candidate',memo,'?aifail=1',null]]){
    const ui=workspace({memoText,search});await ui.start();await ui.open(mode);await tick();
    assert.equal(ui.writes.length,0);
    ui.type('naCand','   ');await ui.click('naOk');assert.equal(ui.writes.length,0);
    ui.type('naCand','직접 정한 합성 작업');assert.equal(ui.writes.length,0);await ui.click('naOk');
    assert.equal(ui.writes.length,1);assert.equal(ui.writes[0].body.original_candidate?.action_text??null,null);
    assert.deepEqual(ui.writes[0].body.original_candidate??null,original);
    assert.equal(ui.writes[0].body.reviewed_action.action_text,'직접 정한 합성 작업');
  }
});

test('double confirmation coalesces; a lost receipt retries the frozen request after reopening',async()=>{
  let reject;
  const ui=workspace({submit:()=>new Promise((_,no)=>{reject=no;})});await ui.start();
  await ui.open('manual');ui.type('naCand','대조하기');
  const button=ui.node('naOk'), sending=button.emit('click');await button.emit('click');
  assert.equal(ui.writes.length,1);
  reject(Error('lost acknowledgement'));await sending;
  const other=workspace({storage:ui.storage});await other.start();await other.open('manual');
  assert.equal(other.node('naCand').value,'대조하기');
  assert.equal(other.writes.length,0);await other.click('naOk');
  assert.deepEqual(other.writes,ui.writes);
});

test('switching tasks or accounts invalidates the candidate, confirmation button, and late receipt',async()=>{
  let next,ack;
  const ui=workspace({timer:fn=>{next=fn;},submit:()=>new Promise(ok=>{ack=ok;})});
  await ui.start();const pending=ui.open('candidate');await ui.select(t2);next();await pending;await tick();
  assert.equal(ui.node('naBox').hidden,true);
  await ui.select(t1);await ui.open('manual');ui.type('naCand','이전 과업');
  const oldButton=ui.node('naOk');await ui.select(t2);await oldButton.emit('click');assert.equal(ui.writes.length,0);
  await ui.select(t1);await ui.open('manual');ui.type('naCand','확인한 작업');
  const sending=ui.click('naOk');const count=ui.reads.length;ui.stop();
  ack({next_action_id:randomUUID(),source_record_id:rid,saved_action:{action_text:'확인한 작업'}});await sending;
  assert.equal(ui.reads.length,count);
});

test('a second client reopens source, candidate and edited final separately; later cancellation preserves that history',async()=>{
  const actions=[],first=workspace({actions}),second=workspace({actions});
  await first.start();await first.open('candidate');
  first.type('naCand','새로 작성한 최종 작업');
  const [target]=first.node('naBox').querySelectorAll('input[data-link-kind]');
  target.checked=true;
  await first.click('naOk');
  assert.deepEqual(first.writes[0].body.links,{target_record_ids:[rid]});
  await second.start();
  const history=second.node('accountActions').innerHTML;
  assert.match(history,/원문 메모<\/dt><dd>  이전 표 확인함\.\n부록 비교하기  /);
  assert.match(history,/최초 후보<\/dt><dd>부록 비교하기</);
  assert.match(history,/<summary>새로 작성한 최종 작업</);
  await second.open('manual');second.type('naCand','취소된 작업');await second.click('naCancel');
  assert.equal(second.writes.length,0);
  assert.equal(second.node('accountActions').innerHTML,history);
  await second.select(t2);assert.equal(second.node('accountActions').innerHTML,'');
});

test('a rejected link can be removed and reviewed again under a new confirmation ID',async()=>{
  let calls=0;
  const ui=workspace({submit:async body=>{
    if(++calls===1)throw Object.assign(new Error('선택한 연결을 확인해 주세요.'),{code:'INVALID_LINK'});
    return {next_action_id:randomUUID(),source_record_id:rid,saved_action:body.reviewed_action};
  }});
  await ui.start();await ui.open('manual');ui.type('naCand','연결 확인');
  ui.node('naBox').choices[0].checked=true;
  await ui.click('naOk');assert.equal(ui.node('naCand').value,'연결 확인');
  assert.equal(ui.node('naBox').choices[0].checked,true);
  ui.node('naBox').choices[0].checked=false;await ui.click('naOk');
  assert.deepEqual(ui.writes[0].body.links,{target_record_ids:[rid]});
  assert.equal(ui.writes[1].body.links,undefined);
  assert.notEqual(ui.writes[0].body.request_id,ui.writes[1].body.request_id);
});

test('cancelling an in-flight suggestion does not reopen it; explicitly accepting an unchanged candidate saves once',async()=>{
  let finishSuggestion;
  const ui=workspace({timer:fn=>{finishSuggestion=fn;}});
  await ui.start();
  const first=ui.open('candidate');
  await ui.click('naCancel');finishSuggestion();await first;
  assert.equal(ui.node('naBox').hidden,true);assert.equal(ui.writes.length,0);
  const next=ui.open('candidate');finishSuggestion();await next;
  const confirm=ui.node('naOk');await confirm.emit('click');await confirm.emit('click');
  assert.equal(ui.writes.length,1);
  assert.deepEqual(ui.writes[0].body.reviewed_action,ui.writes[0].body.original_candidate);
  assert.equal(ui.writes[0].body.links,undefined);
});
