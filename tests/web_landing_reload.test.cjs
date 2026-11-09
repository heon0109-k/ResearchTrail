// Draft regression: pagehide or delayed saves may not replace the visible landing screen with stale example state.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const values=new Map();let landing=true;const c={window:{name:''},location:{search:''},sessionStorage:{setItem:(k,v)=>values.set(k,v)},$:s=>s==='#lp'&&landing?{}:null,S:{example:true,papers:[],tags:[],links:[],view:'card'},uid:1};vm.createContext(c);
const source=fs.readFileSync('web/js/helpers.js','utf8');vm.runInContext(source.slice(source.indexOf('function rememberTabView(){'),source.indexOf("if(typeof window!=='undefined'&&window.addEventListener)")),c);
c.rememberTabView();assert.equal(values.get('researchtrail.screen'),'landing');assert.equal(values.has('researchtrail.example'),false);
landing=false;c.rememberTabView();assert.equal(values.get('researchtrail.screen'),'example');assert.ok(values.has('researchtrail.example'));
c.S.example=false;landing=true;c.rememberTabView();assert.equal(values.get('researchtrail.screen'),'landing');
console.log('PASS: visible landing screen wins over stale example/personal state; example saving still works.');
