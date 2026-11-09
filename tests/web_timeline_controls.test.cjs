// UI regression draft; human review pending. User-requested tag lanes and timeline range.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('web/js/timeline.js','utf8');
const c={S:{zoom:'quarter',filterTag:null,tags:[{id:'empty',name:'Empty',color:'#888'}],papers:[]},NOTAG:{name:'태그 없음',color:'#888'},visible:()=>true,dnum:s=>Math.floor(Date.parse(s)/864e5),todayStr:()=> '2026-11-08',tagBy:id=>c.S.tags.find(t=>t.id===id)};
vm.createContext(c);
for(const [a,b] of [['function rng(){','function ppd(){'],['function bandList(by){','function lblSvg(']])vm.runInContext(source.slice(source.indexOf(a),source.indexOf(b)),c);
assert.equal(c.rng()[1]-c.rng()[0],1826,'five-year navigation range around today');
assert.equal(c.bandList(true)[0].id,'empty','empty registered tags get their own row');
c.S.filterTag='empty';assert.equal(c.bandList(true).length,1);
c.S.zoom='all';assert.equal(c.rng()[1]-c.rng()[0],60,'overview fits data rather than five empty years');
console.log('PASS: five-year range, empty tag row, filtered empty row and data-fit overview.');
