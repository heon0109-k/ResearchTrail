// Draft: single-PDF RAG extension; SPEC AC6/AC7/NF3/NF5 and user-requested cross-language retrieval.
// Synthetic transport and retrieval checks; human acceptance and Gemini semantics are separate.
'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const retrieval = require('../web/js/chat-retrieval.js');
const root = path.join(__dirname, '../web/js');
const cfg = { key: 'synthetic-test-key', consent: true, model: 'test-model', endpoint: 'https://example.invalid' };
function setup(fetcher, timers = {}) {
  const c = vm.createContext({ fetch: fetcher, AbortController, setTimeout, clearTimeout, Date, ...timers });
  vm.runInContext(fs.readFileSync(path.join(root, 'chat-query-expansion.js'), 'utf8'), c);
  return c;
}
function response(terms) {
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ terms }) }] } }] }) };
}
function pdf(texts) {
  return { numPages: texts.length, getPage: async n => ({ getTextContent: async () => ({ items: [{ str: texts[n - 1] }] }) }) };
}

test('query expansion sends only the current question once and returns bounded English terms', async () => {
  const sent = [];
  const c = setup(async (url, options) => { sent.push({ url, body: JSON.parse(options.body) }); return response(['chlorophyll', 'photosynthesis', 'chlorophyll', '광합성', '42', 'x'.repeat(70)]); });
  const q = '식물이 빛 에너지를 이용하는 과정은?';
  const result = await c.ChatQueryExpansion.expand(q, cfg, () => true);
  assert.equal(sent.length, 1);
  assert.equal(result.status, 'expanded');
  assert.deepEqual(Array.from(result.terms), ['chlorophyll', 'photosynthesis']);
  assert.ok(sent[0].body.contents[0].parts[0].text.includes(q));
  assert.ok(!sent[0].body.contents[0].parts[0].text.includes('PDF 본문'));
  assert.ok(result.elapsedMs >= 0);
});

test('English-only and unconsented questions do not make expansion requests', async () => {
  let calls = 0;
  const c = setup(async () => { calls++; return response(['unused']); });
  assert.equal((await c.ChatQueryExpansion.expand('How do plants grow?', cfg, () => true)).status, 'not_needed');
  await c.ChatQueryExpansion.expand('식물 성장?', { ...cfg, consent: false }, () => true);
  await c.ChatQueryExpansion.expand('식물 성장?', cfg, () => false);
  assert.equal(calls, 0);
});

test('PDF vocabulary is bounded and contains words rather than pages or excerpts', async () => {
  let prompt;
  const c = setup(async (url, options) => { prompt = JSON.parse(options.body).contents[0].parts[0].text; return response(['chlorophyll']); });
  const pages = [{ n: 99, text: 'Chlorophyll enables photosynthesis. '.repeat(10) }];
  const vocabulary = c.ChatQueryExpansion.vocabulary(pages);
  assert.ok(vocabulary.includes('chlorophyll'));
  assert.ok(vocabulary.includes('photosynthesis'));
  assert.ok(vocabulary.every(w => /^[a-z-]+$/.test(w)));
  assert.ok(vocabulary.length <= 1800);
  assert.ok(vocabulary.join(' ').length <= 14000);
  await c.ChatQueryExpansion.expand('식물 성장?', cfg, () => true, pages);
  assert.ok(prompt.includes('chlorophyll'));
  assert.ok(!prompt.includes('99'));
  assert.ok(!prompt.includes('Chlorophyll enables photosynthesis.'));
});

test('expanded terms supplement original terms without changing explicit page priority', async () => {
  const index = await retrieval.buildIndex(pdf(['Introduction', 'OriginalAnchor and its experiment.', 'Chlorophyll enables photosynthesis.']));
  const ctx = retrieval.search(index, 'OriginalAnchor 광합성 원리는?', { currentPage: 1, expandedTerms: ['chlorophyll', 'photosynthesis'] });
  assert.ok(ctx.pages.some(p => p.n === 2));
  assert.ok(ctx.pages.some(p => p.n === 3));
  assert.equal(retrieval.search(index, 'p.1 광합성?', { currentPage: 2, expandedTerms: ['chlorophyll'] }).pages[0].n, 1);
});

test('English inflections use the same search keys for singular/plural and verb forms', async () => {
  const index = await retrieval.buildIndex(pdf(['Introduction only', 'Cells modeled parameters in the experiment.']));
  const ctx = retrieval.search(index, 'cell model parameter', { currentPage: 1 });
  assert.equal(ctx.matched, true);
  assert.equal(ctx.pages[0].n, 2);
});

test('hyphenated English terms are also searchable as separate words', async () => {
  const index = await retrieval.buildIndex(pdf(['Introduction only', 'The loss is cross-entropy.']));
  assert.equal(retrieval.search(index, 'cross entropy', { currentPage: 1 }).pages[0].n, 2);
});

test('a method question containing summarization does not pin the introduction', async () => {
  const index = await retrieval.buildIndex(pdf(['Introduction only', 'Embedding configuration uses a frozen encoder.']));
  assert.equal(retrieval.search(index, '긴 문서를 요약하는 방법의 embedding 설정은?', { currentPage: 1 }).pages[0].n, 2);
});

test('HTTP or malformed expansion results fall back with no retry', async () => {
  for (const reply of [{ ok: false }, response([]), { ok: true, json: async () => ({ candidates: [] }) }]) {
    let calls = 0;
    const c = setup(async () => { calls++; return reply; });
    const result = await c.ChatQueryExpansion.expand('식물 성장?', cfg, () => true);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.terms.length, 0);
    assert.equal(calls, 1);
  }
});

test('the expansion deadline aborts a slow request and ignores late completion', async () => {
  let expire, finish, signal;
  const c = setup((url, options) => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); }, { setTimeout(fn, ms) { assert.equal(ms, 8000); expire = fn; return 1; }, clearTimeout() {} });
  const pending = c.ChatQueryExpansion.expand('식물 성장?', cfg, () => true);
  expire();
  const result = await pending;
  assert.equal(result.status, 'unavailable');
  assert.equal(signal.aborted, true);
  finish(response(['late']));
  assert.equal(result.terms.length, 0);
});

test('an obsolete expansion cannot feed a new document question', async () => {
  let finish, current = true;
  const c = setup(() => new Promise(resolve => { finish = resolve; }));
  const pending = c.ChatQueryExpansion.expand('식물 성장?', cfg, () => current);
  current = false; finish(response(['chlorophyll']));
  const result = await pending;
  assert.equal(result.status, 'cancelled');
  assert.equal(result.terms.length, 0);
});

test('chat uses generated terms for retrieval, retains the original question and existing quote validation', async () => {
  let expansions = 0, answerCalls = 0;
  const c = setup(async () => { expansions++; return response(['chlorophyll', 'photosynthesis']); });
  const p = { id: 'p', title: 'Plants', todo: 'keep the confirmed task' }, store = new Map();
  Object.assign(c, { ChatRetrieval: retrieval, S: { reader: p.id }, PV: { pid: p.id, cur: 1, doc: pdf(['Introduction', 'Chlorophyll enables photosynthesis in green plants.']) },
    $: selector => selector === '#chatQ' ? { value: '식물이 빛 에너지를 이용하는 과정은?' } : null, $$: () => [],
    localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v) }, aiCfg: () => cfg, AI_MODEL: cfg.model, AI_ENDPOINT: cfg.endpoint, esc: String });
  vm.runInContext(fs.readFileSync(path.join(root, 'chat.js'), 'utf8'), c);
  c.chatRender = () => {};
  c.chatCall = async (config, prompt) => {
    answerCalls++;
    assert.match(prompt, /학생 질문: 식물이 빛 에너지를 이용하는 과정은\?/);
    assert.match(prompt, /\[p\.2\] Chlorophyll enables photosynthesis/);
    return { in_scope: true, found: true, answer: '빛 에너지 설명', evidence: { page: 2, quote: 'Chlorophyll enables photosynthesis' } };
  };
  await c.chatAsk(p);
  assert.equal(expansions, 1); assert.equal(answerCalls, 1);
  assert.equal(c.chatLoad(p.id).at(-1).kind, 'answer');
  assert.deepEqual(Array.from(c.chatLoad(p.id).at(-1).pages), [2]);
  assert.equal(p.todo, 'keep the confirmed task');
});
