// 팀 승인 전 초안. 근거: docs/spikes/linked_papers_rag.md 3.5·3.6절, 7절 L5·L6·L9.
// 고정 응답으로 검사 함수만 확인한다. 실제 모델의 답변 품질과 의미 정확성은 미검증이다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelPapers, buildPrompt, verifyAnswer, NOT_FOUND, REFUSE } from '../supabase/functions/_rag/answer.mjs';
import { GAP } from '../supabase/functions/_rag/ranking.mjs';

const passages = [
  { label: 'A', page: 3, text: 'We evaluate on the HotpotQA benchmark with 500 sampled questions.' },
  { label: 'B', page: 7, text: 'Global summaries are built from community reports.' + GAP + 'The map step runs in parallel over chunks.' },
];
const reply = extra => ({ in_scope: true, found: true, answer: '문서 A는 HotpotQA로 평가했어요.', used_docs: ['A'],
  evidence: [{ doc: 'A', page: 3, quote: 'evaluate on the HotpotQA benchmark' }], ...extra });

test('labels follow the given order and never expose internal IDs', () => {
  const labels = labelPapers(['11111111-aaaa', '22222222-bbbb']);
  assert.deepEqual([...labels.values()], ['A', 'B']);
  assert.equal([...labelPapers(Array.from({ length: 28 }, (_, i) => 'id' + i)).values()].at(-1), 'AB');
  const prompt = buildPrompt({ papers: [{ label: 'A', title: 'First' }, { label: 'B', title: null }], passages, question: '무엇으로 평가했어?' });
  assert.match(prompt, /\[문서 A · p\.3\] We evaluate/);
  assert.match(prompt, /문서 B: \(제목 미기록\)/);
  assert.doesNotMatch(prompt, /11111111|22222222/);
});

test('the prompt says when linked papers were left out of the search', () => {
  const base = { papers: [{ label: 'A', title: 'First' }], passages, question: 'q' };
  assert.doesNotMatch(buildPrompt(base), /포함되지 않았다/);
  assert.match(buildPrompt({ ...base, excludedCount: 2 }), /2편은 이번 검색에 포함되지 않았다/);
});

test('an answer passes when its quote is in the cited paper and page', () => {
  const result = verifyAnswer(reply(), passages);
  assert.equal(result.kind, 'answer');
  assert.deepEqual(result.evidence, [{ label: 'A', page: 3, quote: 'evaluate on the HotpotQA benchmark' }]);
});

test('L5: a quote attributed to the wrong paper or page is not accepted', () => {
  const quote = 'evaluate on the HotpotQA benchmark';
  for (const evidence of [[{ doc: 'B', page: 3, quote }], [{ doc: 'A', page: 4, quote }], [{ doc: 'C', page: 3, quote }]]) {
    assert.deepEqual(verifyAnswer(reply({ evidence }), passages), { kind: 'notfound', text: NOT_FOUND, evidence: [] });
  }
});

test('L5: an invented, too-short or gap-spanning quote is not accepted', () => {
  for (const quote of ['evaluate on the SQuAD benchmark', 'HotpotQA', '']) {
    assert.equal(verifyAnswer(reply({ evidence: [{ doc: 'A', page: 3, quote }] }), passages).kind, 'notfound');
  }
  const spanning = [{ doc: 'B', page: 7, quote: 'community reports. The map step runs' }];
  assert.equal(verifyAnswer(reply({ used_docs: ['B'], evidence: spanning }), passages).kind, 'notfound');
});

test('L6: a comparison needs a verified quote from every paper it relies on', () => {
  const both = { answer: '문서 A는 HotpotQA로 평가했고, 문서 B는 요약을 병렬로 만들어요.', used_docs: ['A', 'B'] };
  assert.equal(verifyAnswer(reply(both), passages).kind, 'notfound');
  const supported = reply({ ...both, evidence: [{ doc: 'A', page: 3, quote: 'evaluate on the HotpotQA benchmark' },
    { doc: 'B', page: 7, quote: 'The map step runs in parallel' }] });
  assert.deepEqual(verifyAnswer(supported, passages).evidence.map(e => e.label), ['A', 'B']);
  const oneBad = reply({ ...both, evidence: [{ doc: 'A', page: 3, quote: 'evaluate on the HotpotQA benchmark' },
    { doc: 'B', page: 7, quote: 'This sentence is not in the passage' }] });
  assert.equal(verifyAnswer(oneBad, passages).kind, 'notfound');
});

test('an answer with no evidence at all is not accepted', () => {
  assert.equal(verifyAnswer(reply({ evidence: [] }), passages).kind, 'notfound');
  assert.equal(verifyAnswer(reply({ evidence: undefined }), passages).kind, 'notfound');
});

test('L9: the prompt forbids guessing about figures, and found=false becomes the fixed notice', () => {
  assert.match(buildPrompt({ papers: [{ label: 'A', title: 'First' }], passages, question: '그림 2의 값은?' }), /그림은 볼 수 없다/);
  const result = verifyAnswer({ in_scope: true, found: false, answer: '아마 0.8쯤일 거예요.', used_docs: [], evidence: [] }, passages);
  assert.deepEqual(result, { kind: 'notfound', text: NOT_FOUND, evidence: [] });
});

test('out-of-scope replies show the fixed refusal, and malformed replies are errors', () => {
  assert.deepEqual(verifyAnswer({ in_scope: false, answer: '모델이 쓴 글' }, passages), { kind: 'refuse', text: REFUSE, evidence: [] });
  for (const raw of [null, 'text', {}, { in_scope: true, found: true, answer: '  ' }]) {
    assert.equal(verifyAnswer(raw, passages).kind, 'error');
  }
});

test('inline document tags are removed from the answer text; links come from verified evidence only', () => {
  const result = verifyAnswer(reply({ answer: 'HotpotQA로 평가했어요 [문서 A · p.3]. 자세한 건 [B · p.99]를 보세요.' }), passages);
  assert.equal(result.text, 'HotpotQA로 평가했어요 . 자세한 건 를 보세요.');
  assert.deepEqual(result.evidence.map(e => e.label + e.page), ['A3']);
});
