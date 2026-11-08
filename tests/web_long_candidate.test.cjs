// AC3/AC7 regression draft: preserve the complete selected clause. Human review pending.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const c = { location: { search: '' }, setTimeout: fn => fn() };
vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/js/ai-stub.js'), 'utf8'), c);
const longAction = '금요일까지 ' + 'retriever 설정의 각 항목과 데이터 전처리 조건을 '.repeat(5) + '부록 확인하기';
for (const action of [longAction, ...[69, 70, 71, 240, 2048].map(n => '가'.repeat(n - 4) + '확인하기'), '🔍'.repeat(40) + ' 부록 확인하기']) {
  const result = c.pickAction(action);
  assert.equal(result.action, action);
  assert.equal(result.source, action);
  assert.ok(result.action.endsWith('확인하기'));
}
const memo = '표 2 비교는 끝냄. ' + longAction;
assert.equal(c.pickAction(memo).action, longAction);
(async () => {
  const result = await c.aiSuggest(memo);
  assert.equal(result.ok, true);
  assert.equal(result.action, longAction);
  assert.equal(result.source, longAction);
  c.location.search = '?aifail=1';
  assert.equal((await c.aiSuggest(memo)).ok, false);
  console.log('PASS: complete long clauses, 70-character boundaries, Unicode, source and async response.');
})().catch(error => { console.error(error); process.exitCode = 1; });
