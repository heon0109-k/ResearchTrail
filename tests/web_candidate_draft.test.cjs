// Draft regression for user-requested editing recovery; AC4/AC7: confirmation and source preservation.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const storage=new Map();const p={id:'p',title:'Paper',todo:'확정 작업',hl:[{id:'h',mine:'표 확인하기',page:2}],actionHistory:[{id:'a',kind:'candidate',source_highlight_id:'h',source_page:2,source_note:'표 확인하기',source_record_id:'r',original_candidate:'표 확인하기',original_output:{source:'표 확인하기'}}]};
const c={S:{example:false},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},readingSource:(p,id)=>p.hl.find(h=>h.id===id)?{text:p.hl.find(h=>h.id===id).mine}:null};vm.createContext(c);vm.runInContext(fs.readFileSync('web/js/next-action.js','utf8'),c);
Object.assign(c.NA,{pid:'p',st:'cand',cand:'편집한 후보',sourceId:'h',noteText:'표 확인하기',candidateId:'a'});
c.naStoreDraft(p);c.NA={pid:'p',st:'idle'};assert.equal(c.naRestoreDraft(p),true);assert.equal(c.NA.cand,'편집한 후보');assert.equal(p.todo,'확정 작업');
p.hl[0].mine='메모 변경';c.NA={pid:'p',st:'idle'};assert.equal(c.naRestoreDraft(p),true);assert.equal(c.NA.noteText,'표 확인하기','original source preserved for warning');
c.naDropDraft(p);assert.equal(c.naRestoreDraft(p),false);
Object.assign(c.NA,{pid:'p',st:'cand',cand:'삭제된 기록의 후보',sourceId:'h',noteText:'표 확인하기',candidateId:'a'});c.naStoreDraft(p);p.hl=[];assert.equal(c.naRestoreDraft(p),false);
p.hl=[{id:'h',mine:'메모 변경'}];c.naStoreDraft(p);p.actionHistory.push({kind:'confirmed',candidate_id:'a'});assert.equal(c.naRestoreDraft(p),false);
assert.match(fs.readFileSync('web/style.css','utf8'),/\.record-candidate\{display:inline-flex/);
assert.match(fs.readFileSync('web/js/pdf-viewer.js','utf8'),/이 메모를 삭제할까요/);
assert.match(fs.readFileSync('web/js/next-action.js','utf8'),/수정한 메모로 다시 찾기/);
console.log('PASS: draft recovery, unchanged confirmed action, changed/deleted sources, confirmation cleanup and visible controls.');
