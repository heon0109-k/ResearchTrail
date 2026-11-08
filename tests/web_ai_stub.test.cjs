// Regression draft for the rule-based demo stub (web/js/ai-stub.js). Human approval pending.
// Basis: AGENTS.md 절대 규칙 1 / SPEC AC3 — a completed action in the memo must not become the next action.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/js/ai-stub.js'), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(source, context);
const pick = (memo) => context.pickAction(memo).action;

const cases = [
  // [memo, expected action (null = clarification)]
  ['RAG 논문 표 2 성능 비교는 봤는데 retriever 설정이 왜 다른지 모르겠음. 금요일까지 부록에서 retriever 설정 확인하기',
    '금요일까지 부록에서 retriever 설정 확인하기'],
  ['논문 A의 표 2 확인', '논문 A의 표 2 확인'],
  ['A 논문은 다 읽었고 B 논문 실험 설정 정리해야 함', 'B 논문 실험 설정 정리해야 함'],
  ['표 2는 다 비교했음', null],
  ['지난번 하던 거 이어갈래', null],
  ['내일 교수님께 메일 보내줘', null],
  // 완료 표현 (리뷰에서 추가)
  ['표 2 확인은 끝냄.', null],
  ['표 2 확인했고 이제 할 일이 없어.', null],
  ['표 2 확인함', null],
  // 복수 작업: 사용자가 고르지 않았으면 재질문 (SPEC AC2, parse_query.md 규칙 5·예시 10)
  ['표 2 확인하기. 부록 비교하기.', null],
  ['논문 A의 표 2를 확인하고 논문 B의 식 (4)도 설명할 거야. 무엇부터 할지는 못 정했어.', null],
  // 복수 작업 중 사용자가 하나를 골랐을 때
  ['표 2 확인하기. 부록 비교는 먼저 하기.', '부록 비교는 먼저 하기'],
];
for (const [memo, expected] of cases) {
  assert.equal(pick(memo), expected, `memo: ${memo}`);
}
console.log(`PASS: ${cases.length} stub cases — completed clauses skipped, unclear memos return null.`);
