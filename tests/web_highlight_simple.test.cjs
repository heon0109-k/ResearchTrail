// Draft regression for the approved simplified highlight UI; SPEC AC6/AC7 source preservation.
// Team acceptance review pending. Clipboard text is not a model response.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const box={innerHTML:''},paper={id:'p',title:'Paper title',hl:[{id:'a',page:4,text:'Original passage',kind:'개념·방법',mine:'원래 메모',unsure:'이전 질문',stuck:'term',solved:false,rects:[[.1,.2,.3,.04]]},{id:'b',page:5,text:'',img:'data:image/png;base64,test',kind:'그래프·표',mine:'',rects:[[.1,.2,.3,.04]]}]};
const c={S:{reader:'p'},paperBy:()=>paper,$:()=>box,$$:()=>[],esc:v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),short:s=>s};vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/js/pdf-viewer.js'),'utf8'),c);
const before=JSON.stringify(paper);c.drawHlList();assert.equal(JSON.stringify(paper),before);
assert.equal((box.innerHTML.match(/<textarea /g)||[]).length,2);
assert.equal((box.innerHTML.match(/class="kind-picker"/g)||[]).length,2);assert.ok(!/data-hr=|data-hu=|data-hs=/.test(box.innerHTML));assert.ok(!box.innerHTML.includes('이전에 남긴 질문'));assert.ok(!box.innerHTML.includes('data-hb='));
assert.equal((box.innerHTML.match(/aria-label="AI에게 물어볼 질문 복사"/g)||[]).length,2);
for(const h of paper.hl){
 const old={...h};c.setHighlightBlocked(h,true);assert.equal(c.highlightBlocked(h),true);
 c.setHighlightBlocked(h,false);assert.equal(c.highlightBlocked(h),false);
 const restored={...h};delete restored.blocked;assert.deepEqual(restored,old);
}
const text=c.stuckPrompt(paper,paper.hl[0]);assert.ok(text.includes('원래 메모')&&text.includes('이전 질문')&&text.includes('용어가 낯설어요'));
const image=c.stuckPrompt(paper,paper.hl[1]);assert.ok(image.includes('캡처 이미지를 이 질문과 함께 첨부합니다'));assert.ok(!image.includes('용어가 낯설어요'));
const current=c.highlightQuestion(paper,paper.hl[0]);assert.ok(current.includes('원래 메모'));assert.ok(!current.includes('이전 질문')&&!current.includes('용어가 낯설어요'));
const neutral=c.highlightQuestion(paper,{page:1,text:'Plain passage'});assert.ok(!neutral.includes('막힌 이유:'));assert.ok(neutral.includes('Plain passage'));
assert.equal(c.highlightBlocked({stuck:'term',solved:true}),false);
console.log('PASS: one memo field, optional kind selector, no reason selector, compact copy icons, no mark/disclosure controls, legacy data intact, visible-memo-only question text and capture attachment guidance.');
