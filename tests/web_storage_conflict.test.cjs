// Draft AC4/AC7 regression: stale windows must not resurrect deleted personal records.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let raw=null;
function tab(){const nodes=new Map();const c={S:{papers:[{id:'a',note:'original'},{id:'b',note:'keep'}],tags:[],links:[],example:false},uid:1,localStorage:{getItem:()=>raw,setItem:(k,v)=>{raw=v}},$:s=>nodes.get(s)||null,document:{createElement:()=>({setAttribute(){},remove(){}}),body:{appendChild:n=>nodes.set('#'+n.id,n)}}};vm.createContext(c);vm.runInContext(fs.readFileSync('web/js/helpers.js','utf8'),c);return c}
const old=tab();assert.equal(old.save(),true);const latest=tab();latest.STORE_REVISION=JSON.parse(raw).storageRevision;latest.S.papers=[{id:'b',note:'new memo'}];assert.equal(latest.save(),true);const saved=raw;
assert.equal(old.save(),false);assert.equal(raw,saved);assert.equal(JSON.parse(raw).papers.length,1);assert.equal(JSON.parse(raw).papers[0].note,'new memo');
console.log('PASS: stale-tab writes blocked; deletion and newer memo remain intact.');
