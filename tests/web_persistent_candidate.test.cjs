// Draft regression: user's persistent unconfirmed edit; SPEC AC4/AC5/AC7.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const disk=new Map();
function tab(){const session=new Map(),store=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)});const c={S:{example:false},localStorage:store(disk),sessionStorage:store(session),readingSource:(p,id)=>p.hl.find(h=>h.id===id)||null};vm.createContext(c);vm.runInContext(fs.readFileSync('web/js/next-action.js','utf8'),c);return c}
const p={id:'p',todo:'확정 작업',hl:[{id:'h',text:'표 확인하기'}],actionHistory:[{id:'a',kind:'candidate',source_highlight_id:'h',source_note:'표 확인하기',original_candidate:'표 확인하기'}]};
let c=tab();Object.assign(c.NA,{pid:'p',st:'cand',cand:'닫기 전에 편집한 초안',candidateId:'a',sourceId:'h'});c.naStoreDraft(p);
c=tab();assert.equal(c.naRestoreDraft(p),true,'fresh tab with empty session restores draft');assert.equal(c.NA.cand,'닫기 전에 편집한 초안');assert.equal(p.todo,'확정 작업');
c.naDropDraft(p);c=tab();assert.equal(c.naRestoreDraft(p),false,'cancel remains discarded after reopening');
Object.assign(c.NA,{pid:'p',st:'cand',cand:'초안',candidateId:'a',sourceId:'h'});c.naStoreDraft(p);p.actionHistory.push({kind:'confirmed',candidate_id:'a'});assert.equal(tab().naRestoreDraft(p),false,'confirmed candidate never reappears as a draft');
c.S.example=true;c.naStoreDraft(p);assert.equal(tab().naRestoreDraft(p),false,'example never becomes a personal draft');
console.log('PASS: fresh-tab recovery, separate confirmed action, persistent cancellation, confirmation cleanup and demo isolation.');
