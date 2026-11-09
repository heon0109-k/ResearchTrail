// Draft regression: AC4/AC7 preserve edited proposals without confirming them.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
const p={id:'p',todo:'confirmed work',note:'new memo',actionHistory:[{id:'old',kind:'candidate',source_note:'old memo',original_candidate:'original'}]};
let response={ok:true,action:'new candidate'},seq=0;
const c={S:{example:false},localStorage:storage,sessionStorage:storage,$:()=>null,save:()=>true,renderHistory(){},rememberNote:()=>({id:'r'}),nid:()=>String(++seq),paperBy:()=>p,aiSuggest:()=>Promise.resolve(response),rememberAction:(p,e)=>{e.id='new'+seq;p.actionHistory.push(e);return e}};
vm.createContext(c);vm.runInContext(fs.readFileSync('web/js/next-action.js','utf8'),c);
function old(){Object.assign(c.NA,{pid:'p',st:'cand',cand:'my edited draft',candidateId:'old',sourceId:null,noteText:'old memo',previousDraft:null});c.naStoreDraft(p)}
(async()=>{old();await c.naRun(p);assert.equal(c.NA.cand,'new candidate');assert.equal(c.NA.previousDraft.cand,'my edited draft');c.naStoreDraft(p);c.NA={};assert(c.naRestoreDraft(p));assert.equal(c.NA.previousDraft.cand,'my edited draft');c.naRestorePrevious(p);assert.equal(c.NA.cand,'my edited draft');assert.equal(c.NA.noteText,'old memo');assert.equal(p.todo,'confirmed work');
for(const r of [{ok:false},{ok:true,action:null}]){old();response=r;await c.naRun(p);c.NA={};assert(c.naRestoreDraft(p));assert.equal(c.NA.cand,'my edited draft')}
old();c.aiSuggest=()=>Promise.reject(new Error('failure'));await c.naRun(p);c.NA={};assert(c.naRestoreDraft(p));assert.equal(c.NA.cand,'my edited draft');
old();const before=seq;storage.setItem=()=>{throw Error('full')};await c.naRun(p);assert.equal(c.NA.st,'cand');assert.equal(c.NA.cand,'my edited draft');assert.equal(seq,before);assert.equal(p.todo,'confirmed work');console.log('PASS: rerun/reload recovery, failure/null/rejection preservation, storage failure blocks replacement; confirmed task unchanged.');})().catch(e=>{console.error(e);process.exit(1)});
