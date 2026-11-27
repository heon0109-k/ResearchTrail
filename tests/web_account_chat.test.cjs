// Draft cases for SPEC §4.2. Drive the shipped panel's click, input, change and submit
// listeners with a small event host. The browser suite also exercises iframe auth and page rendering.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {fixture}=require('./fixtures/account-chat-api.cjs');
const pdfjs=require('../web/vendor/pdfjs-3.11.174/pdf.min.js');
const retrieval=require('../web/js/chat-retrieval.js');
pdfjs.GlobalWorkerOptions.workerSrc=require.resolve('../web/vendor/pdfjs-3.11.174/pdf.worker.min.js');

class Panel extends EventTarget {
  innerHTML='';
  querySelector(){return null;}
  send(type, node={}) {
    const target={closest:()=>target, dataset:{}, ...node};
    const event=new Event(type,{cancelable:true});
    Object.defineProperty(event,'target',{get:()=>target});
    this.dispatchEvent(event);
  }
  click(action){this.send('click',{dataset:{chatAction:action}});}
  fill(value){this.send('input',{id:'chatQ',value});}
  async shows(pattern){await wait(()=>pattern.test(this.innerHTML),String(pattern));}
}
async function wait(predicate,label){
  for(let i=0;i<500;i++){if(predicate()) return;await new Promise(r=>setTimeout(r,5));}
  assert.fail('Timed out waiting for '+label);
}
function setup(t,api=fixture()) {
  const box=new Panel(), nav=[], extracted=[];
  const extraction={...retrieval,buildIndex:doc=>{extracted.push(doc);return retrieval.buildIndex(doc);}};
  const env=vm.createContext({ChatRetrieval:extraction,crypto:globalThis.crypto,TextEncoder,document:{getElementById:()=>null},location:{search:'?workspace=account'}});
  for(const file of ['core','chat','account-pdfs','account-chat']) {
    vm.runInContext(fs.readFileSync('web/js/'+file+'.js','utf8'),env);
  }
  let connected=true, doc, load, id;
  const account={current:()=>connected,write:(path,body)=>api.request(path,body)};
  const pdf={
    context:(task,artifact)=>artifact===id?{doc,page:1}:null,
    async goToPage(task,artifact,page){nav.push({task,artifact,page});return artifact===id && page<=doc.numPages;}
  };
  const chat=env.createAccountReaderChat(box,account,pdf,()=>{});
  async function open(edition,task='A'){
    chat.close();
    if(load) await load.destroy();
    id=edition;
    load=pdfjs.getDocument({data:new Uint8Array(api.files[id]),isEvalSupported:false,useSystemFonts:true});
    doc=await load.promise;
    const paper=api.papers.find(p=>p.artifacts.some(a=>a.artifact_id===id));
    chat.open(task,paper.document_use_id,paper.artifacts.find(a=>a.artifact_id===id),Promise.resolve());
    chat.show();
  }
  t.after(async()=>{chat.close();await load?.destroy()});
  return {api,box,chat,open,nav,extracted,disconnect:()=>{connected=false;}};
}
test('decline, consent, exact digest, chunk retry and verified question through the account panel',async t=>{
  const {api,box,open,nav}=setup(t); await open('draft');
  await box.shows(/동의하지 않음/);
  assert.match(box.innerHTML,/추출한.*구절.*임베딩 서비스/);
  box.click('decline'); await box.shows(/보내지 않았어요/);
  assert.equal(api.rag().filter(c=>c.body).length,0);
  box.click('review'); box.click('consent');
  await box.shows(/색인 다시 시도/); box.click('retry-index');
  await box.shows(/준비됐어요/);
  const posts=api.rag().filter(c=>c.body);
  assert.deepEqual(posts.map(c=>c.path.split('/').at(-1)),['begin','chunks','chunks','chunks','finish']);
  assert.deepEqual(posts[0].body.pdf_sha256,api.papers[0].artifacts[0].pdf.sha256);
  assert.equal(posts[0].body.consent,true);
  assert.deepEqual(JSON.parse(JSON.stringify(posts[1].body.chunks[1])),{page:2,start:0,end:15,text:'Draft passage 2'});
  assert.deepEqual(posts.slice(1,-1).map(c=>c.body.chunks[0].page),[1,33,33]);
  assert.equal(posts.at(-1).body.chunk_count,34);
  box.fill('합성 질문'); box.send('change',{name:'chatEffort',value:'medium'}); box.send('submit');
  await box.shows(/role="alert"/); assert.match(box.innerHTML,/합성 질문/);
  box.send('submit'); await box.shows(/Draft passage 2/);
  const asks=api.rag().filter(c=>c.path.endsWith('/ask'));
  assert.equal(asks.length,2);
  assert.deepEqual(asks[0],asks[1]); assert.equal(asks[0].body.answer_depth,'medium');
  assert.equal(asks[0].body.scope,'open_pdf'); assert.equal(asks[0].body.current_page,1);
  box.send('click',{dataset:{chatAction:'cite',page:'2'}});
  assert.deepEqual(nav,[{task:'A',artifact:'draft',page:2}]);
  box.fill('missing'); box.send('submit'); await box.shows(/근거를 찾지 못/);
  assert.equal(api.rag().at(-1).body.history.length,2);
});
test('compatible ready index is reused, blank PDF never starts indexing, wrong checksum stops before begin',async t=>{
  const {api,box,open,extracted}=setup(t);
  await open('published'); await box.shows(/저장된 색인/); box.click('consent'); await box.shows(/준비됐어요/);
  assert.equal(extracted.length,0);
  await open('blank'); await box.shows(/동의하지 않음/); box.click('consent'); await box.shows(/추출할 수 있는 텍스트가 없/);
  api.papers[0].artifacts[0].pdf.sha256='f'.repeat(64);
  api.indexes.draft=api.indexes.published;
  await open('draft'); await box.shows(/판본.*다시 열/);
  assert.equal(extracted.length,1);
  assert.equal(api.rag().filter(c=>c.body).length,0);
});
test('a delayed answer is discarded on edition, paper, project and account changes',async t=>{
  const {api,box,chat,open,disconnect,nav}=setup(t);
  api.failAsk=false; api.indexes.draft=api.indexes.published;
  for(const change of ['edition','paper','project','account']){
    await open('draft'); await box.shows(/저장된 색인/); box.click('consent');
    let release; api.wait=new Promise(r=>{release=r;});
    box.fill('이전 판본의 질문'); box.send('submit'); await box.shows(/답변을 준비/);
    if(change==='account') {disconnect();chat.close();}
    else {
      if(change==='project') await open('draft','B');
      else await open(change==='paper'?'other':'published');
      await box.shows(/저장된 색인/); box.click('consent');
      box.fill('현재 열어 둔 판본의 질문');
    }
    release(); await new Promise(r=>setImmediate(r));
    assert.doesNotMatch(box.innerHTML,/이전 판본의 질문|합성 답변|Draft passage/);
    if(change!=='account') {
      box.send('click',{dataset:{chatAction:'cite',page:'2'}});
      assert.deepEqual(nav,[]);
    }
  }
});
test('an already acknowledged finish is recovered on retry and reused by a second reader',async t=>{
  const api=fixture(), a=setup(t,api), b=setup(t,api);
  api.failPage=null;
  const request=api.request;
  api.request=async (path,body)=>{
    const result=await request(path,body);
    if(path.endsWith('/finish')) throw Error('Response lost after commit');
    return result;
  };
  await a.open('draft'); await a.box.shows(/동의하지 않음/); a.box.click('consent');
  await a.box.shows(/색인 다시 시도/); a.box.click('retry-index'); await a.box.shows(/준비됐어요/);
  await b.open('draft'); await b.box.shows(/저장된 색인/); b.box.click('consent'); await b.box.shows(/준비됐어요/);
  assert.deepEqual(api.rag().filter(c=>c.body).map(c=>c.path.split('/').pop()),['begin','chunks','chunks','finish']);
  b.box.fill('missing'); api.failAsk=false; b.box.send('submit'); await b.box.shows(/근거를 찾지 못/);
  assert.doesNotMatch(a.box.innerHTML,/missing|근거를 찾지 못/);
});
test('a project switch during a batch stops further uploads; an active index needs explicit restart',async t=>{
  const {api,box,open}=setup(t), request=api.request;
  let release,hold=new Promise(r=>{release=r;});
  api.request=async(path,body)=>{
    const result=await request(path,body);
    if(path.endsWith('/chunks')) await hold;
    return result;
  };
  await open('draft'); await box.shows(/동의하지 않음/); box.click('consent');
  assert.match(box.innerHTML,/색인을 준비하는 중/);
  await wait(()=>api.chunks.length===32,'first batch');
  assert.match(box.innerHTML,/색인을 만드는 중.*0 \/ 34구절/);
  await open('other','B'); await box.shows(/저장된 색인/); release();
  await new Promise(r=>setImmediate(r));
  assert.equal(api.calls.some(c=>c.path.endsWith('/finish')),false);
  await open('draft'); await box.shows(/작업이 중단/); box.click('refresh'); await box.shows(/작업이 중단/);
  assert.equal(api.calls.filter(c=>c.path.endsWith('/begin')).length,1);
  assert.equal(api.calls.filter(c=>c.path.endsWith('/chunks')).length,1);
});
test('the panel rejects an answer with a sibling edition citation and keeps the question for retry',async t=>{
  const {api,box,open,nav}=setup(t);
  api.indexes.draft=api.indexes.published;
  const request=api.request;
  api.request=(path,body)=>path.endsWith('/ask')?Promise.resolve({kind:'answer',text:'WRONG_EDITION',
    evidence:[{document_use_id:'draft',artifact_id:'published',page:1,quote:'Other edition'}]}):request(path,body);
  await open('draft'); await box.shows(/동의하지 않음/); box.click('consent'); box.fill('원문을 알려줘'); box.send('submit');
  await box.shows(/role="alert"/); assert.match(box.innerHTML,/원문을 알려줘/);
  assert.doesNotMatch(box.innerHTML,/WRONG_EDITION|Other edition|data-chat-action="cite"/);
  box.send('click',{dataset:{chatAction:'cite',page:'1'}}); assert.deepEqual(nav,[]);
});
test('an incompatible index needs consent and a concurrent restart can recover missing batches',async t=>{
  const {api,box,open}=setup(t), request=api.request;
  api.indexes.draft={...api.indexes.published,chunker:'older-chunker'};
  api.failPage=null;
  let restart=true;
  api.request=async(path,body)=>{
    if(restart && path.endsWith('/chunks') && body.chunks[0].page===33){
      api.chunks.length=0; restart=false;
    }
    return request(path,body);
  };
  await open('draft'); await box.shows(/색인 형식이 달라요/);
  assert.equal(api.rag().filter(c=>c.body).length,0);
  box.click('consent'); await box.shows(/색인 진행 상태가 바뀌었어요/);
  box.click('retry-index'); await box.shows(/준비됐어요/);
  assert.equal(api.chunks.length,34);
  assert.deepEqual(api.rag().filter(c=>c.path.endsWith('/chunks')).map(c=>c.body.chunks[0].page),[1,33,1,33]);
});
