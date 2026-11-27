// 팀 승인 전 초안. 근거: docs/spikes/linked_papers_rag.md 3.4절(기존 키워드 검색과 쪽 우선 규칙 유지).
// web/js/chat-retrieval.js의 규칙을 서버로 옮긴 것이 같은 결과를 내는지 고정 입력으로 확인한다. 검색 품질은 미검증이다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokens, keywordScores, priorityPages, pagePriority } from '../supabase/functions/_rag/keyword.mjs';

const chunk = (page, start, text) => ({ page, start, end: start + text.length, text });

test('words are split, stemmed and stripped of filler the same way for questions and passages', () => {
  assert.deepEqual(tokens('The models are trained on pre-training tasks'), ['model', 'train', 'pre-training', 'pre', 'train', 'task']);
  assert.deepEqual(tokens('이 논문의 평가 지표는 무엇 인가요? 0.85'), ['평가', '지표는', '인가요', '0.85']);
});

test('a passage sharing more distinct question terms scores higher, and unrelated passages score zero', () => {
  const chunks = [chunk(1, 0, 'We evaluate retrieval on the benchmark.'), chunk(1, 100, 'Retrieval is evaluated on a benchmark with dense retrieval baselines.'),
    chunk(2, 0, 'Appendix: hyperparameters and hardware.')];
  const scores = keywordScores('How is dense retrieval evaluated?', chunks);
  assert.ok(scores[1] > scores[0] && scores[0] > 0);
  assert.equal(scores[2], 0);
  assert.deepEqual(keywordScores('평가 지표', chunks), [0, 0, 0]);
  assert.deepEqual(keywordScores('How is dense retrieval evaluated?', chunks), scores);
  // One passage, one matching term: (1 + ln(1 + passages / passages with the term)) × (1 + matched terms).
  assert.ok(Math.abs(keywordScores('benchmark', [chunks[0]])[0] - 2 * (1 + Math.log(2))) < 1e-9);
});

test('priority pages: named pages first (two at most), then the selection, "this page", and page 1 for a summary', () => {
  assert.deepEqual(priorityPages('p.4 와 7쪽, 그리고 page 9 를 비교해 줘'), [4, 7]);
  assert.deepEqual(priorityPages('이 쪽의 표를 설명해 줘', { currentPage: 6, selectedPage: 3 }), [3, 6]);
  assert.deepEqual(priorityPages('이 논문의 핵심 기여를 알려줘', { currentPage: 6 }), [1]);
  assert.deepEqual(priorityPages('무엇으로 평가했어?', { currentPage: 6 }), []);
});

test('each priority page reserves up to two passages, starting with the one that holds the selected sentence', () => {
  const chunks = [chunk(3, 0, 'First passage about training.'), chunk(3, 200, 'Second passage with the exact selected sentence here.'),
    chunk(3, 400, 'Third passage about evaluation metrics.'), chunk(5, 0, 'Another page.')];
  keywordScores('evaluation metrics', chunks).forEach((score, i) => { chunks[i].keyword = score; });
  const chosen = pagePriority('3쪽을 설명해 줘', chunks, { selection: { text: 'the exact selected sentence', page: 3 } });
  assert.deepEqual(chosen.map(c => c.start), [200, 400]);
  assert.deepEqual(pagePriority('무엇으로 평가했어?', chunks, {}), []);
});
