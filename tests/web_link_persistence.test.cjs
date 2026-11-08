// AC4/AC7 browser link persistence regression. Acceptance review pending.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const nodes=new Map(),stored=new Map();let fail=false;
function node(){return {handlers:{},value:'',querySelectorAll:()=>[],classList:{toggle(){},remove(){}},addEventListener(k,f){this.handlers[k]=f},setAttribute(){},remove(){nodes.delete('#'+this.id)}}}
for(const id of ['panel','pin','pClose','pRead','pTag','pState','pMemo','pTitle','pLink','pDate','pDel','lkStart','saved'])nodes.set('#'+id,node());
const c={document:{getElementById:()=>null,querySelector:s=>nodes.get(s)||null,querySelectorAll:()=>[],createElement:node,body:{appendChild:e=>nodes.set('#'+e.id,e)}},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>{if(fail)throw Error('quota');stored.set(k,v)}},D:{pos:new Map(),inited:false}};
vm.createContext(c);
for(const file of ['core.js','helpers.js','panel.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/js',file),'utf8'),c);
c.showMain=()=>{};
c.S.papers=[{id:'a',title:'논문 A',date:'2026-11-08',link:'https://example.org/old',memo:'저장 이유',state:'reading'},{id:'b',title:'논문 B',date:'2026-11-07',link:'https://example.org/b'}];
c.S.sel='a';c.S.panel='detail';assert.equal(c.save(),true);c.renderPanel();
const link=nodes.get('#pLink');assert.equal(typeof link.handlers.input,'function');
for(const value of [' https://example.org/new ','']){
 link.value=value;link.handlers.input({target:link});
 assert.equal(JSON.parse(stored.get(c.KEY)).papers[0].link,value.trim());
 assert.equal(c.load({timeline:true}),true);
 assert.equal(c.S.papers[0].link,value.trim());
 assert.equal(c.S.papers[1].link,'https://example.org/b');
 c.S.sel='a';c.S.panel='detail';c.renderPanel();
}
fail=true;link.value='https://example.org/retry';link.handlers.input({target:link});
assert.equal(c.S.saved,false);assert.ok(nodes.get('#saveError').textContent.includes('저장하지 못했어요'));
assert.equal(JSON.parse(stored.get(c.KEY)).papers[0].link,'');
assert.equal(c.S.papers[0].link,'https://example.org/retry');
fail=false;link.handlers.change({target:link});
assert.equal(c.S.saved,true);assert.equal(nodes.has('#saveError'),false);
assert.equal(c.load({timeline:true}),true);assert.equal(c.S.papers[0].link,'https://example.org/retry');
console.log('PASS: link edit/clear, immediate input persistence, reload, other-paper isolation and storage failure/retry.');
