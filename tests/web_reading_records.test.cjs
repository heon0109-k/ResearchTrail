// Draft: user's unified reading-record flow. SPEC AC4/AC7 confirmation and source preservation.
// Team acceptance review pending; no model-quality claims.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const nodes=new Map(),stored=new Map();let fail=false,inputs=[];
function element(){return {value:'',hidden:false,handlers:{},style:{},scrollHeight:64,focus(){},setAttribute(){},remove(){nodes.delete('#'+this.id)},addEventListener(k,f){this.handlers[k]=f},set innerHTML(html){this.html=html;for(const m of html.matchAll(/id="([^"]+)"/g)){const n=element(),tail=html.slice(m.index);n.value=(tail.match(/^id="[^"]+"[^>]*value="([^"]*)"/)||tail.match(/^id="[^"]+"[^>]*>([^<]*)/))?.[1]||'';nodes.set('#'+m[1],n)}}}}
for(const id of ['naBox','rTodo','rHistory'])nodes.set('#'+id,element());
const c={URL,document:{getElementById:()=>null,querySelector:s=>nodes.get(s)||null,querySelectorAll:()=>[],createElement:element,body:{appendChild:n=>nodes.set('#'+n.id,n)}},localStorage:{getItem:k=>stored.get(k)||null,setItem(k,v){if(fail)throw Error('quota');stored.set(k,v)}},D:{pos:new Map(),inited:false}};
vm.createContext(c);for(const f of ['core.js','helpers.js','reader.js','next-action.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/js',f),'utf8'),c);
c.showMain=()=>{};
const p={id:'p',title:'Paper',note:'원래 전체 메모',todo:'기존 작업',hl:[{id:'one',page:4,text:'Do not extract this quotation',mine:'부록에서 설정 확인하기',rects:[]},{id:'two',page:7,text:'Other quotation',mine:'표 2 비교하기',rects:[]}]},other={id:'other',title:'Other',note:'다른 논문 메모',hl:[]};c.S.papers=[p,other];c.S.reader=p.id;c.RR.pid=p.id;c.preparePaperHistory(p);
const originalLegacy=p.note,originalOther=JSON.stringify(other);
c.aiSuggest=memo=>{inputs.push(memo);return Promise.resolve({ok:true,action:memo,source:memo})};
const select=id=>{c.RR.selected=id;c.naChooseSource(p,id)};
(async()=>{
 select('one');await c.naRun(p);assert.deepEqual(inputs,['부록에서 설정 확인하기']);assert.equal(p.note,originalLegacy);assert.equal(p.todo,'기존 작업');
 const candidate=p.actionHistory.at(-1);assert.equal(candidate.source_highlight_id,'one');assert.equal(candidate.source_page,4);assert.equal(candidate.source_note,p.hl[0].mine);
 nodes.get('#naCand').value='수정한 최종 작업';fail=true;nodes.get('#naOk').handlers.click();assert.equal(p.todo,'기존 작업');assert.equal(c.NA.st,'cand');
 fail=false;nodes.get('#naOk').handlers.click();assert.equal(p.todo,'수정한 최종 작업');const final=p.actionHistory.at(-1);assert.equal(final.source_highlight_id,'one');assert.equal(final.original_candidate,'부록에서 설정 확인하기');assert.equal(final.final_action,'수정한 최종 작업');
 select('two');await c.naRun(p);nodes.get('#naCancel').handlers.click();assert.equal(p.todo,'수정한 최종 작업');
 const before=c.rememberReadingMemo(p,'one',p.hl[0].mine);p.hl[0].mine='바뀐 메모';const after=c.rememberReadingMemo(p,'one',p.hl[0].mine);assert.notEqual(before.id,after.id);assert.equal(before.content_text,'부록에서 설정 확인하기');
 const count=p.noteHistory.length;c.preparePaperHistory(p);assert.equal(p.noteHistory.length,count);
 let resolve;c.aiSuggest=memo=>new Promise(r=>{inputs.push(memo);resolve=r});select('one');const pending=c.naRun(p);select('two');const countActions=p.actionHistory.length;resolve({ok:true,action:'늦은 후보',source:'바뀐 메모'});await pending;assert.equal(p.actionHistory.length,countActions);assert.equal(c.NA.sourceId,'two');
 select('one');const deleted=c.naRun(p);p.hl=p.hl.filter(h=>h.id!=='one');resolve({ok:true,action:'삭제한 기록 후보',source:'바뀐 메모'});await deleted;assert.equal(p.actionHistory.length,countActions);
 select('two');p.hl[0].mine='';const calls=inputs.length;await c.naRun(p);assert.equal(inputs.length,calls);assert.equal(c.NA.st,'empty');
 assert.equal(p.note,originalLegacy);assert.equal(JSON.stringify(other),originalOther);c.save();assert.equal(c.load({timeline:true}),true);const restored=c.S.papers[0];assert.equal(restored.todo,'수정한 최종 작업');assert.equal(restored.actionHistory.find(e=>e.kind==='confirmed').source_page,4);assert.ok(restored.noteHistory.some(e=>e.source_highlight_id==='one'&&e.content_text==='부록에서 설정 확인하기'));
 console.log('PASS: selected memo only, page/source tracing, immutable versions, confirm rollback/retry, cancel, selection/deletion races, empty input, legacy/other-paper isolation and reload.');
})().catch(e=>{console.error(e);process.exitCode=1});
