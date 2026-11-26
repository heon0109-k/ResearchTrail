// Exercise two independent reader documents against one synthetic account API.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function gate(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
const task=randomUUID(), edition=randomUUID(), different=randomUUID(), memo=randomUUID();

function device(width,request,{rendered,textReady}={}){
  const nodes=new Map(), listeners={};
  const html=fs.readFileSync('web/views/account-projects.html','utf8');
  for(const [,id] of html.matchAll(/id="([^"]+)"/g)){
    const events={};
    nodes.set(id,{id,hidden:false,value:'',innerHTML:'',textContent:'',style:{setProperty(){}},dataset:{},clientWidth:width,
      getContext:()=>({}),getBoundingClientRect:()=>({left:20,top:10,width,height:width*2}),
      addEventListener:(type,fn)=>events[type]=fn, emit(type,target=this){return events[type]?.({target,preventDefault(){}});}});
  }
  const $=s=>nodes.get(s.slice(1)), sheet=$('#accountPdfSheet'), layer=$('#accountPdfText');
  let selection=null;
  const pages=[];
  const document={addEventListener:(type,fn)=>listeners[type]=fn};
  const window={addEventListener(){},getSelection:()=>selection};
  const pdfjsLib={getDocument:()=>({destroy:async()=>{},promise:Promise.resolve({numPages:4,async getPage(n){
    pages.push(n);return {getViewport:({scale})=>({width:500*scale,height:1000*scale}),
      render:()=>({promise:rendered?.(n) || Promise.resolve(),cancel(){}}),getTextContent:async()=>{await textReady?.(n);return {items:[]};}};
  }})}),renderTextLayer:()=>({promise:Promise.resolve()})};
  const ctx=vm.createContext({window,document,$,crypto:{randomUUID},pdfjsLib,esc:s=>String(s??''),setTimeout,clearTimeout});
  for(const file of ['pdf-viewer','account-pdfs'])vm.runInContext(fs.readFileSync('web/js/'+file+'.js','utf8'),ctx);
  ctx.loadPdfJs=async()=>{};
  const reader=ctx.createAccountPdfReader(request,()=>true,()=>[{record_id:memo,record:{content_text:'합성 메모'}}]);
  return {$,pages,reader,select(){
    const child={nodeType:1,closest:()=>sheet};
    layer.contains=el=>el===child;
    const range={startContainer:child,endContainer:child,getClientRects:()=>[
      {left:20+width*.125,top:10+width*.5,right:20+width*.625,bottom:10+width*.625}]};
    selection={isCollapsed:false,rangeCount:1,toString:()=>'Synthetic passage',getRangeAt:()=>range,removeAllRanges(){selection=null;}};
    sheet.emit('pointerup');listeners.selectionchange?.();
  }};
}

test('a linked selection and last page survive a delayed file on a narrower device and stay isolated from a same-name edition',async()=>{
  const state=new Map(),writes=[];
  let delay=null;
  async function request(path,body){
    const id=path.split('/')[4];
    if(path.endsWith('/pdf')){if(delay)await delay.promise;return new Blob(['synthetic bytes']);}
    assert.ok(path.endsWith('/reader'));
    if(!state.has(id))state.set(id,{last_page:null,highlights:[]});
    const snapshot=state.get(id);
    if(body){writes.push(structuredClone(body));if(body.last_page)snapshot.last_page=body.last_page;
      if(body.highlight)snapshot.highlights.push(structuredClone(body.highlight));}
    return structuredClone(snapshot);
  }
  const wide=device(800,request);
  await wide.reader.open(task,edition,'판본.pdf');await wide.$('#accountPdfNext').emit('click');
  wide.select();wide.$('#pdfMemoRef').value=memo;await wide.$('#pdfMarkButton').emit('click');
  assert.equal(state.get(edition).last_page,2);
  const [h]=state.get(edition).highlights;
  assert.deepEqual(h.rects,[[.125,.25,.5,.0625]]);assert.equal(h.page,2);assert.equal(h.record_id,memo);
  const saved=writes.length;
  delay=gate();const narrow=device(320,request), opening=narrow.reader.open(task,edition,'판본.pdf');
  await turn();assert.match(narrow.$('#pdfReadingLocator').textContent,/2쪽/);
  assert.match(narrow.$('#pdfMarks').innerHTML,/Synthetic passage/);
  assert.match(narrow.$('#pdfMarks').innerHTML,/합성 메모/);
  assert.deepEqual(narrow.pages,[]);assert.equal(narrow.$('#accountPdfOverlay').innerHTML,'');
  delay.resolve();await opening;
  assert.deepEqual(narrow.pages,[2]);assert.equal(narrow.$('#accountPdfPage').width,320);
  assert.match(narrow.$('#accountPdfOverlay').innerHTML,/left:12.5%;top:25%;width:50%;height:6.25%/);
  assert.equal(writes.length,saved,'restoration must not write page 1 or copy an anchor');
  await narrow.reader.open(task,different,'판본.pdf');assert.deepEqual(narrow.pages,[2,1]);
  assert.equal(narrow.$('#accountPdfOverlay').innerHTML,'');assert.doesNotMatch(narrow.$('#pdfMarks').innerHTML,/Synthetic passage/);
});

test('missing bytes preserve the saved page and memo locator, and a late file cannot paint over the next edition',async()=>{
  const wait=gate(), calls=[];
  async function request(path,body){
    assert.equal(body,undefined);calls.push(path);
    const id=path.split('/')[4];
    if(path.endsWith('/pdf')){await wait.promise;throw Error('unavailable');}
    return {last_page:id===edition?3:4,highlights:[{id:randomUUID(),record_id:memo,page:2,text:id,rects:[[.1,.2,.3,.04]]}]};
  }
  const d=device(320,request), old=d.reader.open(task,edition,'같은 이름');
  await turn();await d.reader.open(task,different,'같은 이름',false);
  wait.resolve();await old;
  assert.deepEqual(d.pages,[]);assert.match(d.$('#pdfReadingLocator').textContent,/4쪽/);
  assert.match(d.$('#pdfMarks').innerHTML,new RegExp(different));assert.doesNotMatch(d.$('#pdfMarks').innerHTML,new RegExp(edition));
  assert.equal(calls.filter(p=>p.endsWith('/pdf')).length,1);
  await d.reader.open(task,edition,'같은 이름');
  assert.match(d.$('#pdfReadingLocator').textContent,/3쪽/);assert.match(d.$('#pdfMarks').innerHTML,new RegExp(edition));
});

test('the overlay waits for canvas rendering and the last visible page persists while text is still loading',async()=>{
  const painted=gate(),text=gate(), requested=[];
  const h={id:randomUUID(),record_id:null,page:2,text:'합성 선택',rects:[[.25,.25,.25,.05]]};
  const state={last_page:2,highlights:[h]};
  const d=device(320,async(path,body)=>{
    if(path.endsWith('/pdf'))return new Blob();
    if(body){requested.push(body.last_page);state.last_page=body.last_page;}
    return structuredClone(state);
  },{rendered:n=>n===2?painted.promise:undefined,textReady:n=>n===3?text.promise:undefined});
  const opening=d.reader.open(task,edition,'합성');
  await turn();assert.equal(d.$('#accountPdfOverlay').innerHTML,'');assert.match(d.$('#pdfMarks').innerHTML,/합성 선택/);
  painted.resolve();await opening;assert.match(d.$('#accountPdfOverlay').innerHTML,/25%/);
  const moving=d.$('#accountPdfNext').emit('click');await turn();
  assert.deepEqual(requested,[3]);
  d.reader.close();text.resolve();await moving;
  assert.equal(d.$('#accountPdfReader').hidden,true);assert.equal(d.$('#accountPdfOverlay').innerHTML,'');
});

test('a lost highlight acknowledgement retries the original anchor and a memo can be linked later',async()=>{
  const state={last_page:1,highlights:[]}, sent=[];
  const d=device(320,async(path,body)=>{
    if(path.endsWith('/pdf'))return new Blob();
    if(body){
      sent.push(structuredClone(body));
      if(body.highlight && !state.highlights.length){state.highlights.push(structuredClone(body.highlight));throw Error('lost');}
      if(body.link)state.highlights[0].record_id=body.link.record_id;
    }
    return structuredClone(state);
  });
  await d.reader.open(task,edition,'합성');d.select();
  await d.$('#pdfMarkButton').emit('click');assert.equal(d.$('#pdfReaderRetry').hidden,false);
  await d.$('#pdfReaderRetry').emit('click');assert.equal(d.$('#pdfReaderRetry').hidden,true);
  assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);assert.equal(state.highlights.length,1);
  const h=state.highlights[0];assert.equal(h.record_id,null);
  d.$('#pdfMemoRef').value=memo;
  await d.$('#pdfMarks').emit('click',{closest:()=>({dataset:{linkMark:h.id}})});
  assert.deepEqual(sent[2],{link:{id:h.id,record_id:memo}});
  assert.match(d.$('#pdfMarks').innerHTML,/합성 메모/);
});
