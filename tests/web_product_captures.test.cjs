// Draft AC5/AC6/AC7 regression. Real capture and memo event handlers, isolated clients.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto,randomUUID}=require('node:crypto');
const task=randomUUID(),doc=randomUUID(),use=randomUUID(),edition=randomUUID(),later=randomUUID();
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAOU0fpcAAAAASUVORK5CYII=';
const json=x=>JSON.parse(JSON.stringify(x));
const settle=()=>new Promise(resolve=>setImmediate(resolve));
class Control extends EventTarget {
  constructor(){super();Object.assign(this,{style:{},dataset:{},attributes:{},classList:{toggle(){}},children:[]});}
  setAttribute(k,v){this.attributes[k]=String(v);}
  getAttribute(k){return this.attributes[k];}
  appendChild(node){this.children.push(node);}
  remove(){}
  focus(){}
}
function fire(el,name,props={}){
  const e=new Event(name,{cancelable:true});
  for(const [k,v] of Object.entries(props))Object.defineProperty(e,k,{value:v});
  el.dispatchEvent(e);
}
function merge(data,patch) {
  for(const [k,v] of Object.entries(patch)){
    if(v===null)delete data[k];
    else if(typeof v==='object' && !Array.isArray(v))data[k]=merge(data[k]||{},v);
    else data[k]=v;
  }
  return data;
}
function server(){
  const head={version:0,data:{}},rows=[],requests={},legacy=randomUUID();
  // Existing private anchor from an older account client, without any UI metadata.
  const marks={[later]:[{id:legacy,page:3,text:'예전 판본의 인용',record_id:null,rects:[[.2,.1,.2,.02]]}]};
  const gate=Promise.withResolvers();let delayed=true;
  const calls=[];
  return {head,rows,requests,marks,gate,legacy,calls,async write(path,body) {
    calls.push({path,body:json(body)});
    if(path.endsWith('/workspace')){
      assert.equal(body.target,'artifact');assert.equal(body.id,edition);
      if(delayed){delayed=false;await gate.promise;}
      assert.equal(body.version,head.version);head.data=merge(head.data,json(body.patch));head.version++;return json(head);
    }
    if(path.endsWith('/records')){
      const id=randomUUID(),ref=body.context.document_contexts[0];
      assert.equal(ref.artifact_ref.artifact_id,edition);
      const row={record_id:id,record:body.record,revises_record_id:body.revises_record_id,
        context_refs:{document_ids:[doc],artifact_ids:[edition]}};
      rows.unshift(row);requests[id]=body.request_id;return json(row);
    }
    if(path.endsWith('/reader')){
      const list=marks[edition]||=[];
      if(body.highlight)list.push(json(body.highlight));
      if(body.link)list.find(h=>h.id===body.link.id).record_id=body.link.record_id;
      if(body.remove_highlight)marks[edition]=list.filter(h=>h.id!==body.remove_highlight);
      return json({last_page:2,highlights:marks[edition]});
    }
    assert.fail('unexpected route');
  }};
}
function client(srv){
  const nodes=new Map(),get=k=>{if(!nodes.has(k))nodes.set(k,new Control());return nodes.get(k);};
  const storage=new Map(),session={get length(){return storage.size;},key:i=>[...storage.keys()][i],getItem:k=>storage.get(k),
    setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  const paper={id:use,document_id:doc,title:'같은 제목',artifactId:edition,artifacts:[edition,later].map(id=>({artifact_id:id,label_text:'논문.pdf',pdf:{available:true}}))};
  const other={...paper,id:randomUUID(),document_id:randomUUID(),artifacts:[],artifactId:null,hl:[]};
  const document=new Control(),editor=new Map(),page=new Control(),crop=[];
  const bitmap={width:400,height:800};
  page.dataset.n='2';page.nodeType=1;page.closest=()=>page;page.querySelector=()=>bitmap;
  page.getBoundingClientRect=()=>({left:0,top:0,width:200,height:400});
  document.createElement=tag=>tag==='canvas'?{getContext:()=>({drawImage:(...args)=>crop.push(args.slice(1))}),toDataURL:()=>png}:new Control();
  document.body={appendChild:n=>nodes.set('#'+n.id,n)};
  function fields(selector,node) {
    if(node!==get('#rHl'))return [];
    const attr=({'textarea[data-hm]':'hm','[data-hm]':'hm','[data-hd]':'hd','[data-hk]':'hk'})[selector];
    if(!attr)return [];
    return [...node.innerHTML.matchAll(new RegExp('data-'+attr+'="([^"]+)"(?: data-kind="([^"]+)")?','g'))].map(([,id,kind])=>{
      const key=[attr,id,kind||''].join('/');
      if(!editor.has(key)){const b=new Control();Object.assign(b.dataset,{[attr]:id,kind});b.closest=()=>get('#menu');editor.set(key,b);}
      return editor.get(key);
    });
  }
  Object.defineProperty(get('#rHl'),'innerHTML',{get(){return this.markup;},set(v){this.markup=v;editor.clear();}});
  const $=key=>key==='#accountReaderNotice'?null:nodes.get(key)||null;
  for(const key of ['#pvs','#pvCap','#memoStatus','#memoRetry','#pdfUploadRetry','#menu','.kind-label','summary','#rHl'])get(key);
  const api={accountId:'synthetic',projectUrl:'http://localhost',current:()=>true,write:srv.write,
    resume:{records:json(srv.rows)},recordRequests:json(srv.requests),readerHighlights:json(srv.marks)};
  const c=vm.createContext({console,structuredClone,Map,Set,sessionStorage:session,crypto:webcrypto,document,
    window:{getSelection:()=>c.selection,innerWidth:1000,innerHeight:750},$: $, $$:fields,
    S:{source:'account',taskId:task,reader:use,papers:[paper,other]},accountWorkspace:api,paperBy:id=>[paper,other].find(p=>p.id===id),
    short:s=>s,esc:s=>String(s||''),save(){},renderHistory(){},ask:(title,message,label,confirm)=>{c.confirm=confirm;}});
  for (const file of ['account-save-status','workspace-store','product-reader','reader','pdf-viewer','capture','find','account-pdfs'])
    vm.runInContext(fs.readFileSync('web/js/'+file+'.js','utf8'),c,{filename:file+'.js'});
  api.saves=c.createAccountSaveStatus(api.write,api.current,api);api.saves.focus(task);
  const store=c.createWorkspaceStore(api,(job,phase)=>api.saves.track(job.id,task,job.label,phase));
  store.load(task,{artifacts:{[edition]:json(srv.head)}});
  api.extra=(target,id)=>store.read(task,target,id).data;api.patchExtra=(target,id,patch,opts)=>store.patch(task,target,id,patch,opts);
  api.mutate=store.mutate;
  c.PV={pid:use,cur:2,pages:[]};c.accountHydratePaperRecords(paper,api.resume);
  c.pvCapInit(paper);c.drawHlList();
  function memo(id,text){const b=editor.get('hm/'+id+'/');b.value=text;fire(b,'input');fire(b,'change');}
  return {c,paper,get,editor,store,memo,crop,status:()=>get('#memoStatus').textContent,
    capture(){fire(get('#pvCap'),'click');fire(get('#pvs'),'mousedown',{target:page,button:0,clientX:20,clientY:40});
      fire(document,'mousemove',{clientX:100,clientY:120});fire(document,'mouseup');},
    highlight(){const range={startContainer:page,getClientRects:()=>[{left:20,top:40,right:100,bottom:48}]};
      c.selection={rangeCount:1,isCollapsed:false,toString:()=>'Figure 2',getRangeAt:()=>range,removeAllRanges(){}};
      c.onSel(paper);const button=new Control();button.setAttribute('data-a','hl');fire(get('#hlbar'),'click',{target:button});},
    chooseKind(id,kind){fire(editor.get('hk/'+id+'/'+kind),'click');},
    remove(id){fire(editor.get('hd/'+id+'/'),'click');c.confirm();}};
}

test('drag, highlight, classify, edit and delete in the original reader round-trip across independent clients',async()=>{
  const srv=server(),a=client(srv);a.capture();
  const imageId=a.paper.hl[0].id;
  assert.match(a.status(),/영역 캡처 저장 중/);assert.doesNotMatch(a.status(),/이제 닫아도/);
  assert.equal(srv.head.data.cards,undefined);
  srv.gate.resolve();await a.store.flush(task);
  assert.deepEqual(a.crop,[[40,80,160,160,0,0,160,160]]);
  a.highlight();await a.store.flush(task);const quoteId=a.paper.hl[1].id;
  a.chooseKind(imageId,'수식');await a.store.flush(task);
  const kindPatch=srv.calls.filter(c=>c.body?.patch).at(-1).body.patch;
  assert.deepEqual(kindPatch,{cards:{[imageId]:{kind:'수식'}}});
  a.memo(imageId,'캡처 메모');await settle();a.memo(imageId,'정정한 캡처 메모');await settle();
  a.memo(quoteId,'인용 메모');await settle();
  assert.match(a.status(),/이제 닫아도 돼요/);
  assert.equal(srv.rows.length,3);assert.equal(srv.rows[1].revises_record_id,srv.rows[2].record_id);
  assert.equal(srv.marks[edition][0].record_id,srv.rows[0].record_id);

  const b=client(srv);
  const found=b.c.findItems('예전 판본의 인용','');assert.equal(found.length,1);
  assert.equal(found[0].artifactId,later);assert.equal(found[0].cardId,srv.legacy);
  assert.match(b.c.accountReaderResultLabel(b.paper,later),new RegExp(use.slice(0,8)));
  const restored=b.paper.hl.find(h=>h.id===imageId),mark=b.paper.hl.find(h=>h.id===quoteId);
  assert.equal(restored.img,png);assert.deepEqual(json(restored.rects),[[.1,.1,.4,.2]]);
  assert.equal(restored.page,2);assert.equal(restored.kind,'수식');assert.equal(restored.mine,'정정한 캡처 메모');
  assert.equal(mark.text,'Figure 2');assert.equal(mark.mine,'인용 메모');assert.deepEqual(Array.from(mark.rects[0],value=>Number(value.toFixed(6))),[.1,.1,.4,.02]);
  assert.match(b.get('#rHl').innerHTML,/정정한 캡처 메모/);assert.ok(b.get('#rHl').innerHTML.includes(png));
  b.remove(imageId);await b.store.flush(task);await settle();b.remove(quoteId);await b.store.flush(task);await settle();
  const fresh=client(srv);assert.equal(fresh.paper.hl.length,0);assert.equal(srv.head.data.cards[imageId].img,undefined);
  assert.equal(srv.rows.length,3);assert.equal(fresh.c.findItems('예전 판본의 인용','').length,1);
});
