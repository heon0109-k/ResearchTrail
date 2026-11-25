'use strict';
// Draft migration regression for the user-requested server-side OpenAI connection.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const root = require('node:path').join(__dirname, '../web/js');

test('all AI features use the local proxy and browser settings hold consent only', async () => {
  const storage = new Map([['researchtrail.ai', JSON.stringify({
    key: 'old-provider-secret', on: true, consent: true,
  })]]);
  const requests = [];
  const context = vm.createContext({
    console, setTimeout, clearTimeout, AbortController,
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      const body = !options.method
        ? { configured: true, model: 'gpt-6-luna' }
        : { candidates: [{ content: { parts: [{ text: JSON.stringify({
          done: [], open: [], next: { text: '원문 확인하기', sources: ['n1'] },
          in_scope: true, found: true, answer: '본문 답변', pages: [3],
          evidence: { page: 3, quote: 'source quote' }, terms: ['vocabulary'],
        }) }] } }] };
      return { ok: true, text: async () => JSON.stringify(body), json: async () => body };
    },
  });
  for (const file of ['ai-summary.js', 'chat.js', 'chat-query-expansion.js']) {
    vm.runInContext(fs.readFileSync(require('node:path').join(root, file), 'utf8'), context);
  }
  assert.equal(context.aiOn(), false, 'old-provider consent does not enable OpenAI');
  context.aiSaveCfg({ on: true, consent: true, key: 'should-not-be-saved' });
  assert.equal(context.aiOn(), true);
  assert.deepEqual(JSON.parse(storage.get('researchtrail.ai.openai')), { on: true, consent: true });
  await context.aiCheckModel();
  const cfg = context.aiCfg();
  const summary = await context.aiCall(cfg, '메모 정리', () => true);
  assert.equal(summary.next.text, '원문 확인하기');
  const answer = await context.chatCall(cfg, '본문 질문');
  assert.equal(answer.answer, '본문 답변');
  const expanded = await context.ChatQueryExpansion.expand('한국어 질문', {
    ...cfg, model: context.AI_MODEL, endpoint: context.AI_ENDPOINT,
  }, () => true);
  assert.equal(expanded.status, 'expanded');
  assert.equal(requests.length, 4);
  for (const { url, options } of requests) {
    assert.ok(url.startsWith('/api/openai/models/gpt-6-luna'));
    assert.ok(!JSON.stringify(options).includes('should-not-be-saved'));
    assert.ok(!JSON.stringify(options).includes('old-provider-secret'));
    assert.ok(!options.headers || !options.headers['x-goog-api-key']);
  }
});

test('OpenAI consent screens use server configuration and have no browser key fields', () => {
  const context = vm.createContext({ esc: String });
  for (const file of ['ai-summary.js', 'chat.js']) {
    vm.runInContext(fs.readFileSync(require('node:path').join(root, file), 'utf8'), context);
  }
  for (const html of [context.aiSetupHtml({ consent: false }), context.chatSetupHtml()]) {
    assert.ok(html.includes('OpenAI'));
    assert.ok(!html.includes('type="password"'));
    assert.ok(!html.includes('Gemini'));
  }
});

test('paper questions resolve automatic effort before sending, and respect a manual override', async () => {
  let sent;
  const c = vm.createContext({
    AI_MODEL: 'gpt-6-luna', AI_ENDPOINT: '/api/openai', aiParseText: JSON.parse,
    aiFetch: async (_url, options) => {
      sent = JSON.parse(options.body).generationConfig.reasoningEffort;
      return { candidates: [{ content: { parts: [{ text: '{}' }] } }] };
    },
  });
  vm.runInContext(fs.readFileSync(require('node:path').join(root, 'chat.js'), 'utf8'), c);
  for (const [choice, question, expected] of [
    ['auto', '데이터는 몇 개야?', 'none'], ['auto', '표 2와 표 4를 비교해 줘', 'medium'],
    ['auto', '이 부분 설명해 줘', 'low'], ['high', '몇 개야?', 'high'],
    ['none', '결과를 종합해 줘', 'none'],
  ]) {
    await c.chatCall({}, question, c.chatResolveEffort(choice, question));
    assert.equal(sent, expected);
  }
});

test('compact effort picker offers auto plus three levels and handles old browser preferences', () => {
  for (const stored of [null, 'auto', 'xhigh', 'none', 'low', 'medium']) {
    let onChange, saved;
    const c = vm.createContext({
      localStorage: { getItem: () => stored, setItem: (_key, value) => { saved = value; } },
      $: () => ({
        querySelector: () => ({}), ownerDocument: { addEventListener() {} },
        addEventListener: (name, fn) => { if (name === "change") onChange = fn; },
      }),
    });
    vm.runInContext(fs.readFileSync(require('node:path').join(root, 'chat.js'), 'utf8'), c);
    const html = c.chatEffortHtml();
    assert.deepEqual([...html.matchAll(/type="radio" name="chatEffort" value="([^"]+)"/g)].map(m => m[1]), ['auto', 'none', 'low', 'medium']);
    const expected = ['auto', 'none', 'low', 'medium'].includes(stored) ? stored : 'auto';
    assert.ok(html.includes('value="' + expected + '" checked'));
    c.chatWireEffort();
    onChange({target: {value: 'medium'}});
    assert.equal(saved, 'medium');
    assert.equal(c.chatEffortChoice, 'medium');
  }
});
