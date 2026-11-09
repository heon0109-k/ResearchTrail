// Draft: user's single-tag filter request. SPEC AC5 context separation; not team acceptance evidence.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const nodes=new Map(),stored=new Map();function node(){return {style:{},innerHTML:'',clientHeight:600,clientWidth:1000,querySelector:()=>null,querySelectorAll:()=>[],focus(){},addEventListener(){},setAttribute(){}}}
for(const id of ['chips','canvas','scroller'])nodes.set('#'+id,node());
const c={document:{getElementById:()=>null,querySelector:s=>nodes.get(s)||null,querySelectorAll:()=>[],addEventListener(){}},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},D:{pos:new Map(),inited:false}};vm.createContext(c);
for(const f of ['core.js','helpers.js','frame.js','timeline.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/js',f),'utf8'),c);
c.renderAll=()=>c.save();c.updateMinimapWin=()=>{};c.ensureVisible=()=>{};c.showMain=()=>{};
c.S.tags=[{id:'a',name:'RAG',color:'#123456'},{id:'b',name:'의료',color:'#987654'},{id:'empty',name:'빈 태그',color:'#777777'}];
c.S.papers=[{id:'a1',tag:'a',title:'A1',date:'2026-10-01',state:'reading'},{id:'a2',tag:'a',title:'A2',date:'2026-10-03',state:'done'},{id:'b1',tag:'b',title:'B1',date:'2026-11-01',state:'reading'},{id:'none',tag:'',title:'태그 없음',date:'2026-11-02',state:'skim'}];
c.S.links=[{id:'aa',from:'a1',to:'a2',reason:'same tag'},{id:'ab',from:'a1',to:'b1'},{id:'bn',from:'b1',to:'none'}];
const raw=JSON.stringify({papers:c.S.papers,links:c.S.links});
c.setTagFilter('a');assert.equal(c.S.filterTag,'a');assert.equal(c.S.papers.filter(c.visible).length,2);assert.equal(c.curPaper().id,'a1');c.renderCards();assert.equal(Object.keys(c.L.pos).length,2);assert.ok(nodes.get('#canvas').innerHTML.includes('data-id="aa"'));assert.ok(!nodes.get('#canvas').innerHTML.includes('data-id="ab"'));assert.ok(!nodes.get('#canvas').innerHTML.includes('data-id="b1"'));
c.renderTagbar();assert.ok(nodes.get('#chips').innerHTML.includes('data-filter-tag="a" aria-pressed="true"'));assert.ok(nodes.get('#chips').innerHTML.includes('전체</span><em>4</em>'));
assert.equal(JSON.parse(stored.get(c.KEY)).papers.length,4);assert.equal(c.load({timeline:true}),true);assert.equal(c.S.filterTag,'a');
c.setTagFilter('a');assert.equal(c.S.filterTag,null);assert.equal(c.S.papers.filter(c.visible).length,4);
c.setTagFilter('');assert.equal(c.S.papers.filter(c.visible)[0].id,'none');c.setTagFilter(null);assert.equal(c.S.filterTag,null);
c.setTagFilter('empty');assert.equal(c.S.papers.filter(c.visible).length,0);assert.equal(c.curPaper(),undefined);c.renderCards();assert.equal(Object.keys(c.L.pos).length,0);
// Original record fields and all relationships survive filters and serialization defaults.
const original=JSON.parse(raw);assert.equal(c.S.papers.length,original.papers.length);
for(const p of original.papers){const restored=c.S.papers.find(x=>x.id===p.id);for(const [k,v] of Object.entries(p))assert.equal(restored[k],v)}
assert.equal(JSON.stringify(c.S.links),JSON.stringify(original.links));
c.S.filterTag='removed';c.save();assert.equal(c.load({timeline:true}),true);assert.equal(c.S.filterTag,null);
c.reset();assert.equal(c.S.filterTag,null);
console.log('PASS: same-tag-only cards/edges, active tag/counts, resume scope, toggle/all/untagged/empty, persistence, invalid filter reset and retained data.');
