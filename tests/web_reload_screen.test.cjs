// Draft: restoring example/landing on reload must not load or overwrite personal records.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function run(screen){const calls=[],stored=new Map([['researchtrail.screen',screen],['researchtrail.example',JSON.stringify({name:'example',tags:[],papers:[{id:'s8'}],view:'dot',reader:null,uid:50})]]);const c={window:{name:''},location:{search:''},performance:{getEntriesByType:()=>[{type:'reload'}]},sessionStorage:{getItem:k=>stored.get(k)||null},S:{},uid:1,RET:false,load:()=>{calls.push('personal');return true},reset(){c.S={}},showMain:()=>calls.push('example'),showLanding:()=>calls.push('landing'),hasMine:()=>true};vm.runInNewContext(fs.readFileSync('web/js/main.js','utf8'),c);return {c,calls}}
let r=run('example');assert.deepEqual(r.calls,['example']);assert.equal(r.c.S.example,true);assert.equal(r.c.S.view,'dot');assert.equal(r.c.S.restoreViewOnce,true);assert.equal(r.c.RET,true);
r=run('landing');assert.deepEqual(r.calls,['landing']);r=run('main');assert.deepEqual(r.calls,['personal']);
console.log('PASS: example and landing restored without personal load; personal view still uses saved records.');
