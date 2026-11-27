// 팀 승인 전 초안. 근거: docs/spikes/linked_papers_rag.md 3.3·3.7절, 5절, 7절 L7·L10, SPEC 5.1절 오류 규약.
// 가짜 전송으로 경로, 호출 순서, 오류 변환만 확인한다. 실제 임베딩 서비스는 부르지 않으며 임베딩 품질은 미검증이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleResearchTrail } from '../supabase/functions/researchtrail/handler.mjs';
import { EMBEDDING_DIMENSIONS, DEFAULT_EMBEDDING_MODEL } from '../supabase/functions/_rag/embedding.mjs';
import { MAX_BATCH } from '../supabase/functions/_rag/index-route.mjs';

const base = 'https://project.example.invalid';
const task = 'aaaaaaaa-0000-4000-8000-000000000001';
const artifact = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const other = 'aaaaaaaa-0000-4000-8000-0000000000a2';
const route = '/tasks/' + task + '/artifacts/' + artifact + '/rag-index/';
const vector = value => Array(EMBEDDING_DIMENSIONS).fill(value);
const chunk = (start, text) => ({ page: 1, start, end: start + 1600, text });

function fixture({ index = { status: 'indexing', chunk_count: null, chunker: 'pages-1600-320', embedding_model: 'recorded-model' },
  openaiKey = 'fixture-secret', embeddings } = {}) {
  const calls = [];
  let databaseError;
  async function transport(url, init) {
    const { hostname, pathname } = new URL(url);
    const headers = new Headers(init.headers);
    const token = headers.get('Authorization')?.slice(7);
    const args = init.body && JSON.parse(init.body);
    calls.push({ host: hostname, path: pathname, token, args });
    if (hostname === 'api.openai.com') {
      return embeddings ? embeddings(args) : Response.json({ data: args.input.map((text, i) => ({ index: i, embedding: vector(i) })) });
    }
    if (pathname === '/auth/v1/user') return token === 'fixture-a' ? Response.json({ id: 'a' }) : Response.json({}, { status: 401 });
    if (databaseError) return Response.json({ code: databaseError, message: 'private detail' }, { status: 400 });
    if (pathname.endsWith('/rt_rag_index_status')) {
      return Response.json({ artifacts: [{ document_use_id: 'u', artifact_id: artifact, index }] });
    }
    return Response.json({ fixture: true });
  }
  function call(path, body, { token = 'fixture-a', method = body ? 'POST' : 'GET' } = {}) {
    return handleResearchTrail(new Request(base + '/functions/v1/researchtrail' + path, {
      method, headers: token ? { Authorization: 'Bearer ' + token } : {}, body: body && JSON.stringify(body),
    }), { url: base, key: 'fixture-public', openaiKey, fetch: transport });
  }
  const rpcs = () => calls.filter(c => c.path.includes('/rpc/')).map(c => c.path.split('/').pop());
  const outside = () => calls.filter(c => c.host === 'api.openai.com');
  return { call, calls, rpcs, outside, fail: code => { databaseError = code; } };
}
const code = async response => (await response.json()).error.code;

test('index status is read for the verified caller only', async () => {
  const { call, calls, outside } = fixture();
  const listed = await call('/tasks/' + task + '/rag-index');
  assert.equal(listed.status, 200);
  assert.deepEqual(calls.at(-1), { host: 'project.example.invalid', path: '/rest/v1/rpc/rt_rag_index_status', token: 'fixture-a', args: { task_id: task } });
  assert.equal((await call('/tasks/' + task + '/rag-index', undefined, { token: null })).status, 401);
  assert.equal((await call('/tasks/' + task + '/rag-index', { any: 1 })).status, 405);
  assert.equal(outside().length, 0);
});

test('L10: an index starts only with explicit consent, and the server chooses the embedding model', async () => {
  const { call, calls, rpcs, outside } = fixture();
  const settings = { pdf_sha256: '1'.repeat(64), chunker: 'pages-1600-320' };
  for (const body of [settings, { ...settings, consent: false }, { ...settings, consent: 'true' },
    { ...settings, consent: true, embedding_model: 'chosen-by-client' }, { ...settings, consent: true, owner_id: 'b' }]) {
    const refused = await call(route + 'begin', body);
    assert.equal(refused.status, 400);
    assert.equal(await code(refused), 'INVALID_INPUT');
  }
  assert.deepEqual(rpcs(), []);
  const started = await call(route + 'begin', { ...settings, consent: true });
  assert.equal(started.status, 201);
  assert.deepEqual(calls.at(-1).args, { task_id: task, artifact_id: artifact,
    payload: { ...settings, embedding_model: DEFAULT_EMBEDDING_MODEL } });
  assert.equal(outside().length, 0);
});

test('passages are embedded once, in order, and stored with their vectors', async () => {
  // The service may answer out of order; each vector must return to the passage it was made from.
  const reversed = args => Response.json({ data: args.input.map((text, i) => ({ index: i, embedding: vector(i) })).reverse() });
  const { call, calls, rpcs, outside } = fixture({ embeddings: reversed });
  const chunks = [chunk(0, '합성 구절 하나'), chunk(1280, '합성 구절 둘')];
  const stored = await call(route + 'chunks', { chunks });
  assert.equal(stored.status, 201);
  assert.deepEqual(rpcs(), ['rt_rag_index_status', 'rt_rag_add_chunks']);
  assert.equal(outside().length, 1);
  // Only the passage text goes out, with the server's key and the model recorded when the index started.
  assert.deepEqual(outside()[0].args, { model: 'recorded-model', input: ['합성 구절 하나', '합성 구절 둘'],
    dimensions: EMBEDDING_DIMENSIONS, encoding_format: 'float' });
  assert.equal(outside()[0].token, 'fixture-secret');
  assert.deepEqual(calls.at(-1).args, { task_id: task, artifact_id: artifact,
    chunks: [{ ...chunks[0], embedding: vector(0) }, { ...chunks[1], embedding: vector(1) }] });
  // The account's session never goes to the embedding service, and the server's key never goes to the database.
  assert.ok(calls.every(c => (c.host === 'api.openai.com') === (c.token === 'fixture-secret')));
});

test('L7 and L10: no text leaves unless this caller has a started index for this edition', async () => {
  const chunks = [chunk(0, '합성 구절')];
  for (const index of [null, { status: 'ready', chunk_count: 3, chunker: 'c', embedding_model: 'm' }]) {
    const { call, rpcs, outside } = fixture({ index });
    const refused = await call(route + 'chunks', { chunks });
    assert.equal(refused.status, 400);
    assert.deepEqual(rpcs(), ['rt_rag_index_status']);
    assert.equal(outside().length, 0);
  }
  const { call, rpcs, outside, fail } = fixture();
  // An edition that is not in the caller's list answers like an absent one.
  const absent = await call('/tasks/' + task + '/artifacts/' + other + '/rag-index/chunks', { chunks });
  assert.equal(absent.status, 404);
  assert.equal(await code(absent), 'RESOURCE_UNAVAILABLE');
  fail('P0002');
  assert.equal((await call(route + 'chunks', { chunks })).status, 404);
  assert.equal((await call(route + 'chunks', { chunks }, { token: 'invalid' })).status, 401);
  assert.equal(outside().length, 0);
  assert.equal(rpcs().includes('rt_rag_add_chunks'), false);
});

test('a malformed or oversized batch is refused before any database or embedding call', async () => {
  const { call, rpcs, outside } = fixture();
  const good = chunk(0, '합성 구절');
  for (const body of [{}, { chunks: [] }, { chunks: 'text' }, { chunks: [good], extra: 1 },
    { chunks: Array.from({ length: MAX_BATCH + 1 }, (_, i) => chunk(i * 1280, '합성 구절')) },
    { chunks: [{ ...good, embedding: vector(0) }] }, { chunks: [{ ...good, page: 0 }] }, { chunks: [{ ...good, page: 1.5 }] },
    { chunks: [{ ...good, end: 0 }] }, { chunks: [{ ...good, text: '   ' }] }, { chunks: [{ ...good, text: 'x'.repeat(4001) }] },
    { chunks: [good, null] }]) {
    const refused = await call(route + 'chunks', body);
    assert.equal(refused.status, 400, JSON.stringify(body).slice(0, 60));
    assert.equal(await code(refused), 'INVALID_INPUT');
  }
  assert.deepEqual(rpcs(), []);
  assert.equal(outside().length, 0);
});

test('when the embedding service fails or answers wrongly, nothing is stored and its message stays private', async () => {
  const good = args => args.input.map((text, i) => ({ index: i, embedding: vector(i) }));
  for (const embeddings of [
    () => Response.json({ error: { message: 'private detail' } }, { status: 429 }),
    () => { throw new Error('private detail'); },
    () => new Response('private detail'),
    args => Response.json({ data: good(args).slice(1) }),
    args => Response.json({ data: good(args).map(row => ({ ...row, index: 0 })) }),
    args => Response.json({ data: good(args).map(row => ({ ...row, embedding: row.embedding.slice(1) })) }),
    args => Response.json({ data: good(args).map(row => ({ ...row, embedding: row.embedding.map(() => null) })) }),
  ]) {
    const { call, rpcs } = fixture({ embeddings });
    const failed = await call(route + 'chunks', { chunks: [chunk(0, '합성 구절 하나'), chunk(1280, '합성 구절 둘')] });
    assert.equal(failed.status, 503);
    const data = await failed.json();
    assert.equal(data.error.code, 'STORAGE_FAILURE');
    assert.ok(!JSON.stringify(data).includes('private detail'));
    assert.deepEqual(rpcs(), ['rt_rag_index_status']);
  }
});

test('without a server key, indexing neither starts nor sends passages', async () => {
  const { call, rpcs, outside } = fixture({ openaiKey: null });
  const begin = await call(route + 'begin', { pdf_sha256: '1'.repeat(64), chunker: 'pages-1600-320', consent: true });
  const chunks = await call(route + 'chunks', { chunks: [chunk(0, '합성 구절')] });
  for (const response of [begin, chunks]) {
    assert.equal(response.status, 500);
    assert.equal(await code(response), 'STORAGE_FAILURE');
  }
  assert.deepEqual(rpcs(), []);
  assert.equal(outside().length, 0);
});

test('finishing forwards the count the browser produced; database refusals keep the four public codes', async () => {
  const { call, calls, outside, fail } = fixture();
  const done = await call(route + 'finish', { chunk_count: 3 });
  assert.equal(done.status, 200);
  assert.deepEqual(calls.at(-1).args, { task_id: task, artifact_id: artifact, chunk_count: 3 });
  for (const body of [{}, { chunk_count: 0 }, { chunk_count: 2.5 }, { chunk_count: '3' }, { chunk_count: 3, status: 'ready' }]) {
    assert.equal((await call(route + 'finish', body)).status, 400);
  }
  for (const [sql, expected, status] of [['22023', 'INVALID_INPUT', 400], ['P0002', 'RESOURCE_UNAVAILABLE', 404], ['XX000', 'STORAGE_FAILURE', 500]]) {
    fail(sql);
    const refused = await call(route + 'finish', { chunk_count: 3 });
    assert.equal(refused.status, status);
    const data = await refused.json();
    assert.equal(data.error.code, expected);
    assert.ok(!data.error.message.includes('private detail'));
  }
  assert.equal((await call(route + 'finish', undefined, { method: 'GET' })).status, 405);
  assert.equal((await call('/tasks/' + task + '/artifacts/not-an-id/rag-index/finish', { chunk_count: 3 })).status, 404);
  assert.equal((await call('/tasks/' + task + '/artifacts/' + artifact + '/rag-index', { chunk_count: 3 })).status, 404);
  assert.equal(outside().length, 0);
});
