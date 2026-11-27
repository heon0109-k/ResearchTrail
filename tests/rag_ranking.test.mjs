// 팀 승인 전 초안. 근거: docs/spikes/linked_papers_rag.md 3.4절.
// 순위 결합 방식과 예산 값은 측정 전 초안이며, 통과가 검색 품질을 뜻하지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankChunks, figureChunks, selectPassages, GAP } from '../supabase/functions/_rag/ranking.mjs';

const chunk = (paper, page, start, text, scores = {}) => ({ paper, page, start, end: start + text.length, text, ...scores });

test('a passage found by both keyword and embedding outranks one found by either alone', () => {
  const both = chunk('a', 1, 0, 'both', { keyword: 1, similarity: 0.5 });
  const keywordOnly = chunk('a', 2, 0, 'keyword', { keyword: 9 });
  const embeddingOnly = chunk('b', 1, 0, 'embedding', { similarity: 0.9 });
  const unmatched = chunk('b', 2, 0, 'unmatched', { keyword: 0 });
  const ranked = rankChunks([unmatched, embeddingOnly, keywordOnly, both]);
  assert.equal(ranked[0], both);
  assert.equal(ranked.includes(unmatched), false);
});

test('a Korean question with no keyword overlap still ranks by embedding similarity', () => {
  const far = chunk('a', 1, 0, 'far', { keyword: 0, similarity: 0.1 });
  const close = chunk('b', 4, 0, 'close', { keyword: 0, similarity: 0.8 });
  assert.deepEqual(rankChunks([far, close]), [close, far]);
});

test('equal scores keep a fixed order: paper, page, then position', () => {
  const chunks = [chunk('b', 1, 0, 'x', { similarity: 0.5 }), chunk('a', 2, 0, 'x', { similarity: 0.5 }),
    chunk('a', 1, 9, 'x', { similarity: 0.5 }), chunk('a', 1, 0, 'x', { similarity: 0.5 })];
  const order = rankChunks(chunks).map(c => c.paper + c.page + ':' + c.start);
  assert.deepEqual(order, ['a1:0', 'a1:9', 'a2:0', 'b1:0']);
  assert.deepEqual(rankChunks([...chunks].reverse()).map(c => c.paper + c.page + ':' + c.start), order);
});

test('one long paper cannot take every slot while other papers have matches', () => {
  const long = Array.from({ length: 6 }, (_, i) => chunk('long', i + 1, 0, 'L' + i, { similarity: 0.9 - i * 0.01 }));
  const other = [chunk('b', 1, 0, 'B', { similarity: 0.3 }), chunk('c', 1, 0, 'C', { similarity: 0.2 })];
  const { passages, chunkCount } = selectPassages(rankChunks([...long, ...other]), { maxChunks: 4, maxPerPaper: 2 });
  assert.equal(chunkCount, 4);
  assert.deepEqual(passages.map(p => p.paper), ['b', 'c', 'long', 'long']);
});

test('a single-paper question still fills the budget from that paper', () => {
  const only = Array.from({ length: 6 }, (_, i) => chunk('a', i + 1, 0, 'A' + i, { similarity: 0.9 - i * 0.01 }));
  assert.equal(selectPassages(rankChunks(only), { maxChunks: 6, maxPerPaper: 2 }).chunkCount, 6);
});

test('the character budget is never exceeded and no passage is cut short', () => {
  const chunks = [chunk('a', 1, 0, 'x'.repeat(60), { similarity: 0.9 }), chunk('b', 1, 0, 'y'.repeat(60), { similarity: 0.8 }),
    chunk('c', 1, 0, 'z'.repeat(30), { similarity: 0.7 })];
  const { passages } = selectPassages(rankChunks(chunks), { maxChars: 100 });
  assert.deepEqual(passages.map(p => p.text.length), [60, 30]);
});

test('requested passages are reserved before ranked ones', () => {
  const requested = chunk('a', 7, 0, 'requested', { similarity: 0.01 });
  const ranked = rankChunks([requested, chunk('b', 1, 0, 'top', { similarity: 0.9 }), chunk('c', 1, 0, 'next', { similarity: 0.8 })]);
  const { passages } = selectPassages(ranked, { priority: [requested], maxChunks: 2 });
  assert.deepEqual(passages.map(p => p.text), ['requested', 'top']);
});

test('overlapping chunks merge without repeating text, and separate ranges are marked', () => {
  const source = 'abcdefghijklmnopqrstuvwxyz';
  const first = chunk('a', 3, 0, source.slice(0, 10), { similarity: 0.9 });
  const overlap = chunk('a', 3, 6, source.slice(6, 16), { similarity: 0.8 });
  const later = chunk('a', 3, 20, source.slice(20, 26), { similarity: 0.7 });
  const { passages } = selectPassages(rankChunks([later, overlap, first]), { maxPerPaper: 3 });
  assert.deepEqual(passages, [{ paper: 'a', page: 3, text: source.slice(0, 16) + GAP + source.slice(20, 26) }]);
});

test('a figure number in the question finds its caption and mentions in the open paper only', () => {
  const chunks = [
    chunk('a', 2, 0, 'Figure 3: Overview of the pipeline.'),
    chunk('a', 5, 0, 'As shown in Fig. 3, recall improves.'),
    chunk('a', 6, 0, 'Figure 30 shows an unrelated ablation.'),
    chunk('b', 1, 0, 'Figure 3: A different paper.'),
  ];
  assert.deepEqual(figureChunks('그림 3은 뭘 보여 줘?', chunks, 'a').map(c => c.page), [2, 5]);
  assert.deepEqual(figureChunks('What does Fig. 3 show?', chunks, 'a').map(c => c.page), [2, 5]);
  assert.deepEqual(figureChunks('이 논문의 핵심은 뭐야?', chunks, 'a'), []);
});
