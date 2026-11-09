// Draft: user-requested resume ordering. SPEC AC5/AC6 state/context isolation.
// Human acceptance review pending. No recommendations inferred by AI.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const nodes=new Map(),stored=new Map();let focused;
function element(){return {value:'',handlers:{},style:{},scrollHeight:66,hidden:false,querySelectorAll:()=>[],setAttribute(){},removeAttribute(){},addEventListener(k,f){this.handlers[k]=f},set innerHTML(h){this.html=h;for(const m of h.matchAll(/id="([^"]+)"/g))nodes.set('#'+m[1],element())}}}
for(const id of ['rdnotes','rdTitle','rdOpen','rbar'])nodes.set('#'+id,element());
const c={URL,document:{getElementById:()=>null,querySelector:s=>nodes.get(s)||null,querySelectorAll:()=>[]},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},D:{pos:new Map(),inited:false},drawHlList(){},pdfUrlOf:()=>''};vm.createContext(c);
for(const f of ['core.js','helpers.js','import.js','next-action.js','reader.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/js',f),'utf8'),c);
c.renderAll=()=>c.save();c.ensureVisible=id=>focused=id;c.showMain=()=>{};
const papers=[{id:'completed',title:'완료 논문',state:'done',lastReadOrder:100,date:'2026-11-08',todo:'기존 작업 유지'},{id:'readingOld',title:'읽는 중 A',state:'reading',lastReadOrder:3,date:'2026-10-01'},{id:'readingNew',title:'읽는 중 B',state:'reading',lastReadOrder:2,date:'2026-11-07'},{id:'waiting',title:'읽을 것',state:'skim',lastReadOrder:90,date:'2026-11-08'}];c.S.papers=papers;
assert.equal(c.curPaper().id,'readingOld');
c.S.reader='readingOld';c.S.sel='readingOld';c.renderRNotes();nodes.get('#rDone').handlers.click();assert.equal(papers[1].state,'done');assert.equal(c.curPaper().id,'readingNew');assert.equal(focused,'readingNew');assert.equal(c.S.reader,null);
c.S.reader='readingNew';c.renderRNotes();nodes.get('#rDone').handlers.click();assert.equal(c.curPaper().id,'waiting');assert.equal(focused,'waiting');c.renderRbar();assert.equal(nodes.get('#rbar').hidden,false);assert.match(nodes.get('#rbar').html,/읽기 시작/);assert.match(nodes.get('#rbar').html,/다음에 읽을 논문/);
c.openReader('waiting');assert.equal(papers[3].state,'reading');assert.equal(c.curPaper().id,'waiting');c.S.reader='waiting';c.renderRNotes();nodes.get('#rDone').handlers.click();assert.equal(c.curPaper(),undefined);c.renderRbar();assert.equal(nodes.get('#rbar').hidden,true);assert.equal(papers[0].todo,'기존 작업 유지');
assert.equal(c.load({timeline:true}),true);assert.equal(c.curPaper(),undefined);assert.equal(c.S.papers[0].todo,'기존 작업 유지');
c.S.papers=[{id:'old',date:'2026-10-01',state:'skim'},{id:'new',date:'2026-11-08',state:'skim'}];assert.equal(c.curPaper().id,'new');const before=JSON.stringify(c.S.papers);c.curPaper();assert.equal(JSON.stringify(c.S.papers),before);
console.log('PASS: reading before waiting, history ordering, done-button focus, start-reading label/state, all-done hiding, preserved tasks, persistence and date fallback.');
