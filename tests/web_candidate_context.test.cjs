// AC3 demo regression only; does not establish four-field semantic accuracy.
// Acceptance approval pending. Basis: SPEC AC2/AC3 and NA-SEM-01/02.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const c = {location:{search:''},setTimeout:fn=>fn()};
vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/js/ai-stub.js'),'utf8'), c);
const cases = [
 ['논문 읽기는 완료. 다음 작업은 표 2 확인. 표 2 확인은 아직 시작하지 않았어.', '표 2 확인'],
 ['다음 작업은 표 2 확인. 내일 모임 전까지 해야 해.', '표 2 확인'],
 ['다음 작업은 부록 비교. 부록 비교는 아직 시작하지 않았어.', '부록 비교'],
 ['다음 작업은 표 2 확인. 표 2 확인은 아직 시작하지 않았음.', '표 2 확인'],
 ['표 2 확인하기. 금요일까지 해야 함.', '표 2 확인하기'],
 ['표 2 확인하기\n내일 모임 전까지 해야 해', '표 2 확인하기'],
 ['내일 모임 전까지 해야 해. 다음 작업은 표 2 확인.', '표 2 확인'],
 ['논문 읽기는 완료. 다음 작업은 표 2 확인. 내일 모임 전까지 해야 해.', '표 2 확인'],
 // Distinct actions must not disappear when a state/deadline sentence is present.
 ['다음 작업은 표 2 확인. 부록 비교는 아직 시작하지 않았어.', null],
 ['다음 작업은 표 2 확인. 부록 비교하기. 내일 모임 전까지 해야 해.', null],
 ['다음 작업은 표 2 확인. 내일까지 부록 비교해야 해.', null],
 ['다음 작업은 표 2 확인. 먼저 부록 비교하기. 내일 모임 전까지 해야 해.', '먼저 부록 비교하기'],
 ['내일 모임 전까지 해야 해.', null],
 ['표 2 확인은 아직 시작하지 않았어.', null],
 ['논문 읽기는 완료. 내일까지 해야 해.', null],
];
for (const [memo,expected] of cases) {
 const r=c.pickAction(memo);
 assert.equal(r.action,expected,memo);
 if (expected!==null) {
  assert.ok(memo.includes(r.action),'action must remain a contiguous source span');
  assert.ok(memo.includes(r.source),'source must be verbatim memo text');
  assert.deepEqual(Object.keys(r).sort(),['action','source']);
 }
}
const deadlineMemo=cases[1][0];
assert.ok(c.pickAction(deadlineMemo).source.includes('내일 모임 전까지 해야 해'),'show original deadline in source without extracting a new field');
console.log('PASS: 15 state/deadline context and independent-action boundary cases.');

// Exercise the actual async suggestion -> pending confirmation flow without changing storage.
vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/js/next-action.js'),'utf8'), c);
(async () => {
 const paper={id:'p1',todo:'기존 작업'};
 c.$=()=>null; c.naRender=()=>{}; c.renderHistory=()=>{};
 c.rememberNote=()=>({id:'record1'}); c.nid=()=> 'request1';
 c.save=()=>true; c.paperBy=()=>paper;
 c.rememberAction=(p,fields)=>Object.assign({id:'candidate1'},fields);
 for (const [memo] of cases.slice(0,2)) {
  paper.note=memo;c.NA.pid=paper.id;
  await c.naRun(paper);
  assert.equal(c.NA.st,'cand');
  assert.equal(c.NA.cand,'표 2 확인');
  assert.equal(c.NA.src,memo);
  assert.equal(paper.todo,'기존 작업','no auto-confirmation');
  assert.equal(paper.note,memo);
 }
 console.log('PASS: real aiSuggest/naRun flow preserves context and awaits confirmation.');
})().catch(error=>{console.error(error);process.exitCode=1});
