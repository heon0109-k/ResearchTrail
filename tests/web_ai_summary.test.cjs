'use strict';
const assert = require('assert');
const path = require('path');
const ai = require(path.join(__dirname, '..', 'web', 'js', 'ai-summary.js'));

const paper = {
  title: 'Retrieval-Augmented Generation',
  memo: '발표 전까지 RAG 구조 설명할 수 있게',
  note: '',
  todo: '',
  hl: [
    { id: 'h1', page: 6, text: 'Table 2: Open-domain QA test scores', mine: '표 2 성능 비교는 봤는데 retriever 설정이 왜 다른지 모르겠음. 금요일까지 부록에서 retriever 설정 확인하기.' },
    { id: 'h2', page: 9, text: 'Ablations', mine: '' },
    { id: 'h3', page: null, type: 'note', text: '', mine: '식 (1) marginalize 이해 안 됨' },
  ],
};

// 메모가 있는 기록만 정리 대상으로 보낸다.
const sources = ai.aiSources(paper);
assert.deepStrictEqual(sources.map((s) => s.id), ['reason', 'h1', 'h3']);
assert.strictEqual(sources[1].label, 'p.6 메모');
assert.strictEqual(sources[2].quote, '', '직접 쓴 메모에는 원문 인용을 붙이지 않는다');

// 프롬프트에는 메모 id와 "메모에 없는 내용 금지" 규칙이 들어간다.
const prompt = ai.aiPrompt(paper, sources);
assert.match(prompt, /id: h1/);
assert.match(prompt, /메모에 없는 사실/);
assert.doesNotMatch(prompt, /id: h2/, '빈 메모는 보내지 않는다');

// 근거 id가 실제 메모에 없거나 비어 있으면 그 줄을 버린다.
const valid = sources.map((s) => s.id);
const out = ai.aiNormalize({
  done: [
    { text: '표 2 성능 비교 확인', sources: ['h1'] },
    { text: '논문에 없는 지어낸 사실', sources: ['h999'] },
    { text: '근거 없는 줄', sources: [] },
    { text: '   ', sources: ['h1'] },
  ],
  open: [{ text: 'retriever 설정이 왜 다른지', sources: ['h1', 'h1', 'h3'] }],
  next: { text: '금요일까지 부록에서 retriever 설정 확인하기', sources: ['h1'] },
}, valid);
assert.deepStrictEqual(out.done, [{ text: '표 2 성능 비교 확인', sources: ['h1'] }]);
assert.deepStrictEqual(out.open[0].sources, ['h1', 'h3'], '중복 근거는 한 번만');
assert.strictEqual(out.next.text, '금요일까지 부록에서 retriever 설정 확인하기');

// 다음 할 일이 비었거나 근거가 없으면 제안하지 않는다(임의로 고르지 않음).
assert.strictEqual(ai.aiNormalize({ done: [], open: [], next: { text: '', sources: [] } }, valid).next, null);
assert.strictEqual(ai.aiNormalize({ next: { text: '지어낸 할 일', sources: ['nope'] } }, valid).next, null);
assert.deepStrictEqual(ai.aiNormalize(null, valid), { done: [], open: [], next: null });

// 항목은 3개까지만.
const many = Array.from({ length: 5 }, (_, i) => ({ text: '항목 ' + i, sources: ['h1'] }));
assert.strictEqual(ai.aiNormalize({ done: many }, valid).done.length, 3);

// 코드 블록으로 감싼 JSON도 읽는다.
assert.deepStrictEqual(ai.aiParseText('```json\n{"done":[]}\n```'), { done: [] });

// 메모가 바뀌면 해시가 바뀌어 다시 정리한다.
const h1 = ai.aiHash(sources, '');
const changed = ai.aiSources({ ...paper, hl: [{ ...paper.hl[0], mine: '수정한 메모' }] });
assert.notStrictEqual(h1, ai.aiHash(changed, ''));
assert.strictEqual(h1, ai.aiHash(ai.aiSources(paper), ''));

// Draft regression: a later edit takes precedence even if its source appears earlier in the list.
const priorityPaper = {
  ...paper,
  todo: '7쪽 3.3절에서 TS와 SS의 문맥 구성 차이를 비교표에 적기',
  noteHistory: [
    { source_highlight_id: 'h1', created_at: 3000 },
    { source_highlight_id: 'h3', created_at: 2000 },
    { source_highlight_id: 'h2', created_at: 4000 },
  ],
};
const prioritySources = ai.aiSources(priorityPaper);
assert.deepStrictEqual(prioritySources.filter(s => s.recent).map(s => s.id), ['h1']);
const priorityPrompt = ai.aiPrompt(priorityPaper, prioritySources);
assert.match(priorityPrompt, /id: h1[^\n]*\| 가장 최근 메모/);
assert.doesNotMatch(priorityPrompt, /id: h3[^\n]*\| 가장 최근 메모/);
assert.match(priorityPrompt, /"먼저", "부터", "다음엔", "우선"[^\n]*그 메모의 할 일을 next에 우선한다/);
assert.match(priorityPrompt, /우선순위가 충돌하면 가장 최근 메모를 따른다/);
assert.match(priorityPrompt, /현재 저장된 다음 할 일 \(참고용\)/);
assert.match(priorityPrompt, /메모가 바뀌지 않았을 때만 그대로 유지/);
assert.strictEqual(ai.aiSameTodo(priorityPaper.todo, '7쪽 3.3절을 보면서 TS와 SS의 문맥 구성 차이를 비교표에 적기'), true);
assert.strictEqual(ai.aiSameTodo(priorityPaper.todo, '9쪽 그림 4의 직접성 결과부터 확인하기'), false);
assert.strictEqual(ai.aiSameTodo(priorityPaper.todo, priorityPaper.todo.replace('3.3절', '3.4절')), false);
assert.strictEqual(ai.aiSameTodo(priorityPaper.todo, priorityPaper.todo.replace('3.3절', '33절')), false);

console.log('web_ai_summary: ok');
