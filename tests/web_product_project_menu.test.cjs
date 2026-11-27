// Draft AC5/AC7 cases for the original project menu backed by an account.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function fixture() {
  const calls=[],refreshes=[],c=vm.createContext({
    document:{getElementById(){return null;}},window:{},crypto:require('node:crypto').webcrypto,
    S:{source:'account',papers:[],tags:[]},esc:s=>String(s),loadSample(){},
    localStorage:new Proxy({},{get(){throw Error('device data accessed by account menu');}})
  });
  vm.runInContext(fs.readFileSync('web/js/projects.js','utf8'),c);
  const catalog={active:'a',list:[{id:'a',name:'등록 과업',count:0},{id:'b',name:'두 번째 과업',count:2}]};
  let reply=async()=>({task_id:'created'});
  const menu=c.createAccountProjectMenu({catalog:()=>catalog,refresh:async id=>refreshes.push(id),select:async()=>{},
    request:async(path,body,options)=>{calls.push({path,body,options});return reply();}});
  c.projAccountMenu=menu;
  return {c,menu,calls,refreshes,setReply:f=>{reply=f;}};
}
test('the account menu retains original project controls, explicit demo and stored counts without consulting guest storage',()=>{
  const {c}=fixture(), html=c.projMenuHtml();
  assert.match(html,/data-pj-more="a"/);
  assert.match(html,/data-pj-sample/);
  assert.match(html,/>2편</);
  c.PJM.more='b';
  assert.match(c.projMenuHtml(),/data-pj-rename="b"/);
  assert.match(c.projMenuHtml(),/data-pj-del="b"/);
});
test('create refreshes only after acknowledgement; lost acknowledgement retries the same request',async()=>{
  const {menu,calls,refreshes,setReply}=fixture();
  let reject;
  setReply(()=>new Promise((_,r)=>{reject=r;}));
  const result=menu.create('새 프로젝트');
  assert.equal(refreshes.length,0);
  reject(Error('lost acknowledgement'));
  await assert.rejects(result);
  setReply(async()=>({task_id:'created'}));
  await menu.create('새 프로젝트');
  assert.equal(calls.length,2);
  assert.equal(calls[0].body.request_id,calls[1].body.request_id);
  assert.equal(calls[0].path,'/tasks');
  assert.deepEqual(refreshes,['created']);
});
test('renaming and removing another project preserve active selection and send only the intended operation',async()=>{
  const {menu,calls,refreshes}=fixture();
  await menu.rename('b','새 이름'); await menu.remove('b');
  assert.deepEqual(calls.map(c=>[c.path,c.options.method]),[['/tasks/b','PATCH'],['/tasks/b','DELETE']]);
  assert.equal(calls[0].body.goal_text,'새 이름');
  assert.deepEqual(Object.keys(calls[1].body),['request_id']);
  assert.notEqual(calls[0].body.request_id,calls[1].body.request_id);
  assert.deepEqual(refreshes,['a','a']);
});
test('a create acknowledged after the user switched projects refreshes their current selection',async()=>{
  const {menu,refreshes,setReply}=fixture();
  let acknowledge;
  setReply(()=>new Promise(resolve=>{acknowledge=resolve;}));
  const pending=menu.create('과업');
  menu.catalog().active='b';
  acknowledge({task_id:'created'});
  await pending;
  assert.deepEqual(refreshes,['b']);
});

function tagFixture() {
  const effects=[], group={};
  const c=vm.createContext({
    S:{source:'account',taskId:'A',tags:[{id:'tag',name:'검토'}],papers:[{id:'paper',title:'합성 논문',tag:'tag',date:null}],sel:null},
    accountWorkspace:{current:()=>true, flush:async()=>{},extraVersion:()=>3,
      mutate:async(label,path,body)=>effects.push([label,path,body]),select:async id=>effects.push(id)},
    toast:text=>effects.push(text),document:{addEventListener(){}},$:()=>group,visible:()=>true,
    esc:s=>String(s??''),readingState:()=>({t:'미기록'}),readingStateKey:()=>'unknown',sg:()=>''
  });
  for(const file of ['frame','timeline'])vm.runInContext(fs.readFileSync('web/js/'+file+'.js','utf8'),c);
  return {c,effects,group};
}
test('tag deletion sends a single versioned operation; a rejected deletion leaves the paper and tag intact',async()=>{
  const {c,effects}=tagFixture();
  c.accountWorkspace.mutate=async(label,path,body)=>{effects.push([label,path,body]);throw Error('conflict');};
  assert.equal(await c.applyTagDeletion('tag',true),false);
  assert.deepEqual(JSON.parse(JSON.stringify(effects[0])),['태그 삭제','/tasks/A/tag-removal',{tag_id:'tag',archive_papers:true,version:3}]);
  assert.match(effects[1],/삭제를 확인하지 못했어요/);
  assert.equal(c.S.papers.length,1);
  assert.equal(c.S.tags.length,1);
});
test('late acknowledgement of tag removal does not open the old project again',async()=>{
  const {c,effects}=tagFixture();
  let done,start;
  const started=new Promise(resolve=>{start=resolve;});
  c.accountWorkspace.mutate=()=>{start();return new Promise(resolve=>{done=resolve;});};
  const saving=c.applyTagDeletion('tag',false);
  await started;
  c.S.taskId='B';done();await saving;
  assert.deepEqual(effects,[]);
});
test('undated data has a labelled selectable card without a synthetic date in either workspace',()=>{
  const {c,group}=tagFixture();
  for(const source of ['account','browser-local']){
    c.S.source=source;
    assert.equal(c.renderUndatedPapers(true),true);
    assert.match(group.innerHTML,/날짜 미기록/);
    assert.match(group.innerHTML,/data-id="paper"/);
    assert.equal(c.S.papers[0].date,null);
    c.renderUndatedPapers(false);
    assert.equal(group.hidden,true);
  }
});
