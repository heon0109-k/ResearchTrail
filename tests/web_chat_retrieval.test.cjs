// Draft: docs/spikes/single_pdf_rag.md R1–R7; SPEC AC6/AC7/NF3/NF5.
// Team acceptance pending. Synthetic retrieval/response checks do not measure Gemini quality.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const retrieval = require('../web/js/chat-retrieval.js');

function pdf(texts) {
  let reads = 0;
  return { numPages: texts.length, get reads() { return reads; }, async getPage(n) {
    reads++;
    return { async getTextContent() { return { items: [{ str: texts[n - 1] }] }; } };
  } };
}
const description = '3.3 Conditions. TS. Source texts rather than community summaries are shuffled and chunked for map-reduce summarization. SS. Text chunks are retrieved and added to the available context window until the specified token limit is reached.';

test('R1: from page 1, acronym keywords retrieve both conditions on page 7', async () => {
  const doc = pdf(['Introduction to Graph RAG', 'TS overview only', 'Methods', 'Community summaries', 'Dataset', 'Setup', description]);
  const index = await retrieval.buildIndex(doc);
  const ctx = retrieval.search(index, 'TS와 SS 실험 조건은 각각 어떤 문맥을 사용해?', { currentPage: 1 });
  assert.equal(ctx.pages[0].n, 7);
  assert.match(ctx.pages[0].text, /3\.3 Conditions/);
  assert.match(ctx.pages[0].text, /TS\. Source texts/);
  assert.match(ctx.pages[0].text, /SS\. Text chunks/);
});

test('R2: explicit and selected pages precede keyword hits; page-local questions retain their page', async () => {
  const index = await retrieval.buildIndex(pdf(['Intro', 'TS', 'SS', description]));
  assert.equal(retrieval.search(index, 'p.2 TS와 SS 비교', { currentPage: 1 }).pages[0].n, 2);
  assert.equal(retrieval.search(index, 'TS와 SS 비교', { currentPage: 1, selectedPage: 3 }).pages[0].n, 3);
  assert.equal(retrieval.search(index, '이 쪽 쉽게 설명해 줘', { currentPage: 2 }).pages[0].n, 2);
  assert.equal(retrieval.search(index, '핵심은 뭐야?', { currentPage: 4 }).pages[0].n, 1);
});

test('R3: late-page text is searchable and transmission stays bounded and deterministic', async () => {
  const text = 'Background text. '.repeat(650) + 'LateMarker is the exact late-page evidence.';
  const index = await retrieval.buildIndex(pdf([text, description.repeat(60)]));
  const a = retrieval.search(index, 'LateMarker', { currentPage: 2 });
  assert.match(a.pages[0].text, /LateMarker is the exact late-page evidence/);
  assert.ok(a.pages.reduce((n, p) => n + p.text.length, 0) <= retrieval.MAX_CONTEXT_CHARS);
  assert.ok(a.chunkCount <= retrieval.MAX_CHUNKS);
  assert.deepEqual(a, retrieval.search(index, 'LateMarker', { currentPage: 2 }));
});

test('R2: a selected passage late on the page is included even for a generic question', async () => {
  const selected = 'Selected passage explains the unusual context construction in detail.';
  const index = await retrieval.buildIndex(pdf(['Introduction. '.repeat(700) + selected]));
  const ctx = retrieval.search(index, '선택한 부분 쉽게 풀어 줘', { currentPage: 1, selectedPage: 1, selectedText: selected });
  assert.ok(ctx.pages.some(p => p.n === 1 && p.text.includes(selected)));
});

test('R5: no keyword hit is explicit, and short acronyms match whole tokens', async () => {
  const index = await retrieval.buildIndex(pdf(['assets, tests, timestamps', 'Introductory material']));
  assert.equal(retrieval.search(index, 'TS SS', { currentPage: 1 }).matched, false);
  assert.equal(retrieval.search(index, 'quantumunicorn clinicaltrial', { currentPage: 1 }).matched, false);
});

test('R6: concurrent index requests share reads; different PDF objects never share text', async () => {
  const a = pdf(['alpha', description]), b = pdf(['beta']);
  const [first, again] = await Promise.all([retrieval.buildIndex(a), retrieval.buildIndex(a)]);
  assert.equal(first, again);
  assert.equal(a.reads, 2);
  assert.equal(retrieval.search(await retrieval.buildIndex(b), 'TS SS', { currentPage: 1 }).matched, false);
});

test('R6: extraction failure is surfaced and can be retried rather than caching partial success', async () => {
  let fail = true;
  const doc = { numPages: 2, async getPage(n) {
    if (n === 2 && fail) throw Error('extraction failed');
    return { async getTextContent() { return { items: [{ str: description }] }; } };
  } };
  await assert.rejects(retrieval.buildIndex(doc));
  fail = false;
  assert.equal((await retrieval.buildIndex(doc)).totalPages, 2);
});

function setup() {
  let calls = 0;
  const p = { id: 'a', title: 'Test paper', todo: 'keep this task', abs: '' };
  const store = new Map(), input = { value: 'TS와 SS 실험 조건은 각각 어떤 문맥을 사용해?' };
  const c = vm.createContext({ console, setTimeout, clearTimeout, ChatRetrieval: retrieval,
    PV: { pid: p.id, cur: 1, doc: pdf(['Introduction', description]) },
    S: { reader: p.id }, esc: String,
    localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v) },
    $: selector => selector === '#chatQ' ? input : null, $$: () => [],
    aiCfg: () => ({ key: 'synthetic-test-key', consent: true }), aiErrorText: () => '통신 실패',
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/js/chat.js'), 'utf8'), c);
  c.chatRender = () => {};
  c.chatCall = async () => { calls++; return { in_scope: true, found: true, answer: '조건 설명 [p.99]', pages: [99], evidence: { page: 2, quote: 'Source texts rather than community summaries' } }; };
  return { c, p, input, calls: () => calls };
}

test('R4/R7: real chat flow verifies quote, keeps page link, and leaves next action untouched', async () => {
  const { c, p, calls } = setup();
  await c.chatAsk(p);
  assert.equal(calls(), 1);
  const answer = c.chatLoad(p.id).at(-1);
  assert.equal(answer.kind, 'answer');
  assert.match(c.chatAnswerHtml(answer), /data-chat-pg="2"/);
  assert.doesNotMatch(c.chatAnswerHtml(answer), /99/);
  assert.equal(p.todo, 'keep this task');
  const ctx = { pages: [{ n: 2, text: description }], abs: '' };
  for (const evidence of [{ page: 99, quote: description }, { page: 2, quote: 'fabricated evidence that was never present' }]) {
    assert.equal(c.chatVerifyAnswer({ in_scope: true, found: true, answer: 'fake', evidence }, ctx).kind, 'notfound');
  }
  assert.equal(c.chatVerifyAnswer({ in_scope: true, found: false }, ctx).kind, 'notfound');
  const gapContext = { pages: [{ n: 2, text: 'First continuous evidence.\n[중략]\nSeparate continuous evidence.' }], abs: '' };
  assert.equal(c.chatVerifyAnswer({ in_scope: true, found: true, answer: 'fake', evidence: { page: 2, quote: 'continuous evidence. [중략] Separate continuous' } }, gapContext).kind, 'notfound');
});

test('R6: leaving the PDF while indexing prevents a Gemini request and bot storage', async () => {
  const { c, p, calls } = setup();
  let release;
  c.PV.doc = { numPages: 1, getPage: () => new Promise(resolve => { release = () => resolve({ getTextContent: async () => ({ items: [{ str: description }] }) }); }) };
  const pending = c.chatAsk(p);
  c.S.reader = null;
  release();
  await pending;
  assert.equal(calls(), 0);
  assert.equal(c.chatLoad(p.id).filter(m => m.role === 'bot').length, 0);
});

test('R7: no consent or unavailable PDF never calls Gemini', async () => {
  for (const reason of ['consent', 'pdf']) {
    const { c, p, calls } = setup();
    if (reason === 'consent') c.aiCfg = () => ({ key: 'synthetic-test-key', consent: false });
    else c.PV = null;
    await c.chatAsk(p);
    assert.equal(calls(), 0);
  }
});

test('R6: a response arriving after PDF replacement cannot become a stored answer', async () => {
  const { c, p } = setup();
  let release;
  c.chatCall = () => new Promise(resolve => { release = resolve; });
  const pending = c.chatAsk(p);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  c.PV.doc = pdf(['A replacement document']);
  release({ in_scope: true, found: true, answer: 'stale answer', evidence: { page: 2, quote: description } });
  await pending;
  assert.equal(c.chatLoad(p.id).filter(m => m.role === 'bot').length, 0);
});

test('Korean paraphrases retrieve English method passages without model search hints', async () => {
  const mask = 'Masked LM. Selected token positions are used for prediction. Replace with a [MASK] token 80%, a random token 10%, or the unchanged token 10%.';
  const vocab = 'We used the original BERT vocabulary for compatibility and reuse. New words can be represented and fine-tuned for the biomedical domain using the original WordPiece vocabulary.';
  const cases = [
    ['가린 낱말을 맞히는 학습에서 예측 대상으로 뽑은 낱말을 가림 표시로 바꾸거나, 임의 낱말로 바꾸거나, 그대로 두는 비율은 각각 얼마야?', mask],
    ['의생명 분야에 맞춰 추가 학습하면서도 기존 낱말 사전을 새로 만들지 않은 두 가지 이유는?', vocab]
  ];
  for (const [question, passage] of cases) {
    const index = await retrieval.buildIndex(pdf(['Overview', 'Other models predict tokens', passage]));
    const ctx = retrieval.search(index, question, { currentPage: 1, expandedTerms: [] });
    assert.equal(ctx.pages[0].n, 3);
    assert.ok(ctx.pages[0].text.includes(passage));
  }
});
