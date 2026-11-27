// 팀 승인 전 초안. 근거: docs/spikes/linked_papers_rag.md 3.1절, 7절 L1~L4.
// 통과해도 실제 검색 품질이나 제품 수용 완료를 뜻하지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectScope, MAX_LINKED } from '../supabase/functions/_rag/scope.mjs';

const paper = (id, extra = {}) => ({ id, hasPdf: true, indexed: true, ...extra });
const chain = ids => ids.slice(1).map((to, i) => ({ from: ids[i], to }));

test('L1: a paper with no path to the open paper is neither searched nor reported', () => {
  const result = selectScope({
    current: 'a',
    papers: ['a', 'b', 'x', 'y'].map(id => paper(id)),
    links: [{ from: 'a', to: 'b' }, { from: 'x', to: 'y' }],
  });
  assert.deepEqual(result, { searched: ['a', 'b'], excluded: [] });
});

test('L1: links that name papers outside the caller\'s list are ignored', () => {
  const result = selectScope({
    current: 'a', papers: [paper('a'), paper('b')],
    links: [{ from: 'a', to: 'other-owner' }, { from: 'other-owner', to: 'b' }],
  });
  assert.deepEqual(result.searched, ['a']);
});

test('L2: a paper three links away is searched, and link direction does not matter', () => {
  const result = selectScope({
    current: 'a', papers: ['a', 'b', 'c', 'd'].map(id => paper(id)),
    links: [{ from: 'b', to: 'a' }, { from: 'b', to: 'c' }, { from: 'd', to: 'c' }],
  });
  assert.deepEqual(result.searched, ['a', 'b', 'c', 'd']);
});

test('L3: nearer papers come first, and the shortest path decides the distance', () => {
  const ids = ['a', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'near'];
  const result = selectScope({
    current: 'a', papers: ids.map(id => paper(id)),
    // "near" is nine links away along the chain but one link away directly, which also
    // shortens n8 to two links. n5 ends up farthest (five links by either route) and is left out.
    links: [...chain(ids), { from: 'near', to: 'a' }],
  });
  assert.equal(result.searched.length, MAX_LINKED + 1);
  assert.deepEqual(result.searched, ['a', 'n1', 'near', 'n2', 'n8', 'n3', 'n7', 'n4', 'n6']);
  assert.deepEqual(result.excluded, [{ id: 'n5', reason: 'over_limit', distance: 5 }]);
});

test('L3: at the same distance, question relevance decides, then paper ID', () => {
  const others = Array.from({ length: 10 }, (_, i) => 'p' + String(i).padStart(2, '0'));
  const input = {
    current: 'a', papers: ['a', ...others].map(id => paper(id)),
    links: others.map(to => ({ from: 'a', to })),
    relevance: { p09: 0.9, p08: 0.9, p07: 0.2 },
  };
  const result = selectScope(input);
  assert.deepEqual(result.searched, ['a', 'p08', 'p09', 'p07', 'p00', 'p01', 'p02', 'p03', 'p04']);
  assert.deepEqual(result.excluded.map(e => e.id), ['p05', 'p06']);
  // The same question and links always give the same papers, whatever order the rows arrive in.
  const shuffled = { ...input, papers: [...input.papers].reverse(), links: [...input.links].reverse() };
  assert.deepEqual(selectScope(shuffled), result);
});

test('L4: linked papers without a PDF or a finished index are reported and do not use a slot', () => {
  const others = Array.from({ length: 9 }, (_, i) => 'p' + i);
  const result = selectScope({
    current: 'a',
    papers: [paper('a'), paper('nopdf', { hasPdf: false, indexed: false }), paper('pending', { indexed: false }),
      ...others.map(id => paper(id))],
    links: ['nopdf', 'pending', ...others].map(to => ({ from: 'a', to })),
  });
  assert.equal(result.searched.length, MAX_LINKED + 1);
  assert.equal(result.searched.includes('nopdf') || result.searched.includes('pending'), false);
  assert.deepEqual(result.excluded, [
    { id: 'nopdf', reason: 'no_pdf', distance: 1 },
    { id: 'p8', reason: 'over_limit', distance: 1 },
    { id: 'pending', reason: 'not_indexed', distance: 1 },
  ]);
});

test('L4: an open paper that is not indexed is reported instead of silently skipped', () => {
  const result = selectScope({
    current: 'a', papers: [paper('a', { indexed: false }), paper('b')], links: [{ from: 'a', to: 'b' }],
  });
  assert.deepEqual(result, { searched: ['b'], excluded: [{ id: 'a', reason: 'not_indexed', distance: 0 }] });
});

test('an unknown open paper searches nothing', () => {
  assert.deepEqual(selectScope({ current: 'missing', papers: [paper('a')], links: [] }), { searched: [], excluded: [] });
});
