// 팀 승인 전 초안. 근거: SPEC 5.1절 오류 규약, NF6. 가짜 전송으로 경로와 오류 변환만 확인한다.
// 실제 DB 규칙은 tests/sql/account_paper_links.sql에서 검사한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleResearchTrail } from '../supabase/functions/researchtrail/handler.mjs';

const base = 'https://project.example.invalid';
const tokens = new Map([['fixture-a','a'], ['fixture-b','b']]);
const task = 'aaaaaaaa-0000-4000-8000-000000000001';
const from = 'aaaaaaaa-0000-4000-8000-0000000000f1';
const to = 'aaaaaaaa-0000-4000-8000-0000000000f2';
const requestId = '00000000-0000-4000-8000-000000000000';
const route = '/tasks/' + task + '/paper-links';
function fixture() {
  const calls = [];
  let databaseError;
  async function transport(url, init) {
    const path = new URL(url).pathname;
    const headers = new Headers(init.headers);
    const token = headers.get('Authorization')?.slice(7);
    calls.push({ path, token, key: headers.get('apikey'), args: init.body && JSON.parse(init.body) });
    if (path === '/auth/v1/user') return tokens.has(token) ? Response.json({id: tokens.get(token)}) : Response.json({}, {status:401});
    if (databaseError) return Response.json({ code: databaseError, message:'private detail' }, {status:400});
    return Response.json({fixture:true});
  }
  function call(path, token, body, method = body ? 'POST' : 'GET') {
    const headers = token ? {Authorization: 'Bearer ' + token} : {};
    return handleResearchTrail(new Request(base + '/functions/v1/researchtrail' + path, {
      method, headers, body: body && JSON.stringify(body),
    }), {url:base, key:'fixture-public', fetch:transport});
  }
  return {call, calls, fail: code => { databaseError=code; }};
}

test('listing and saving paper links verify the caller and forward only that session to the link RPCs', async () => {
  const { call, calls } = fixture();
  const link = {from_document_use_id:from, to_document_use_id:to, reason_text:'합성 이유'};
  for (const token of tokens.keys()) {
    const listed = await call(route, token);
    assert.equal(listed.status, 200);
    assert.equal(calls.at(-2).path, '/auth/v1/user');
    assert.deepEqual(calls.at(-1), {path:'/rest/v1/rpc/rt_paper_links', token, key:'fixture-public', args:{task_id:task}});
    const saved = await call(route, token, {...link, request_id:requestId});
    assert.equal(saved.status, 201);
    assert.deepEqual(calls.at(-1), {path:'/rest/v1/rpc/rt_link_papers', token, key:'fixture-public',
      args:{task_id:task, request_id:requestId, payload:link}});
  }
});

test('a save without a request ID gets one, so the database can recognise a repeat', async () => {
  const { call, calls } = fixture();
  await call(route, 'fixture-a', {from_document_use_id:from, to_document_use_id:to});
  assert.match(calls.at(-1).args.request_id, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  assert.deepEqual(calls.at(-1).args.payload, {from_document_use_id:from, to_document_use_id:to});
});

test('no session, an unknown field or a malformed request never reaches the database', async () => {
  const { call, calls } = fixture();
  for (const token of [null, 'invalid', 'fixture-public']) assert.equal((await call(route, token)).status, 401);
  for (const body of [
    {from_document_use_id:from, to_document_use_id:to, owner_id:'b'},
    {from_document_use_id:from, to_document_use_id:to, task_id:task},
    {from_document_use_id:from, to_document_use_id:to, request_id:'not-an-id'},
    [from, to],
  ]) {
    const result = await call(route, 'fixture-a', body);
    assert.equal(result.status, 400);
    assert.equal((await result.json()).error.code, 'INVALID_INPUT');
  }
  assert.equal((await call('/tasks/not-an-id/paper-links', 'fixture-a')).status, 404);
  assert.equal((await call(route, 'fixture-a', undefined, 'DELETE')).status, 405);
  assert.equal(calls.some(c => c.path.includes('/rpc/')), false);
});

test('a rejected link is INVALID_LINK, an unreachable task is RESOURCE_UNAVAILABLE, and database detail stays private', async () => {
  const { call, fail } = fixture();
  for (const [sql, code, status] of [['RT001','INVALID_LINK',400], ['P0002','RESOURCE_UNAVAILABLE',404],
    ['22023','INVALID_INPUT',400], ['XX000','STORAGE_FAILURE',500]]) {
    fail(sql);
    const response = await call(route, 'fixture-b', {from_document_use_id:from, to_document_use_id:to});
    assert.equal(response.status, status);
    const data = await response.json();
    assert.equal(data.error.code, code);
    assert.ok(!data.error.message.includes('private detail'));
  }
});
