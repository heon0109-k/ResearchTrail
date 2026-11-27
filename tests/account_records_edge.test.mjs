import test from 'node:test';
import assert from 'node:assert/strict';
import { handleResearchTrail } from '../supabase/functions/researchtrail/handler.mjs';

const base = 'https://synthetic.example.invalid';
const task = 'aaaaaaaa-0000-4000-8000-000000000001';
const save = 'bbbbbbbb-0000-4000-8000-000000000001';
const record = {content_text: '  합성\r\n메모\t ', authorship_text: null};
const savedRecord = {
  record_id: 'cccccccc-0000-4000-8000-000000000001',
  context_refs: {question_ids:[], decision_ids:[], document_ids:[], document_use_ids:[], artifact_ids:[], excerpt_ids:[]},
};

function fixture(databaseError) {
  const calls = [];
  const backend = {url: base, key: 'synthetic-public', async fetch(url, init) {
    calls.push({url, init});
    if (url === base+'/auth/v1/user') return Response.json({id:'synthetic-user'});
    if (databaseError) return Response.json({code:databaseError, message:'private diagnostics'}, {status:400});
    return Response.json(savedRecord);
  }};
  return {calls, run(body, key, method = 'POST', auth = true) {
    const headers = {};
    if (auth) headers.Authorization = 'Bearer synthetic-session';
    if (key !== undefined) headers['Idempotency-Key'] = key;
    return handleResearchTrail(new Request(base+'/functions/v1/researchtrail/tasks/'+task+'/records', {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    }), backend);
  }};
}

test('an authenticated save sends the exact record to one database write and returns its IDs', async () => {
  const {run, calls} = fixture();
  for (const [body, key] of [[{record},save], [{record,request_id:save},undefined]]) {
    const result = await run(body,key);
    assert.equal(result.status,201);
    assert.deepEqual(await result.json(),savedRecord);
  }
  assert.deepEqual(calls.map(c=>c.url),Array(2).fill([base+'/auth/v1/user',base+'/rest/v1/rpc/rt_save_record']).flat());
  for (const {init} of [calls[1],calls[3]]) {
    assert.equal(init.headers.Authorization,'Bearer synthetic-session');
    assert.deepEqual(JSON.parse(init.body),{task_id:task,request_id:save,payload:{record}});
  }
});

test('an invalid or missing save key, caller-owned fields and unrelated methods cannot write', async () => {
  const {run, calls} = fixture();
  for (const [body, key] of [[{record},undefined],[{record},'bad'],[{record,request_id:task},save],
      [{record,owner_id:task},save],[{record,next_action:{action_text:'합성 작업'}},save]]) {
    assert.equal((await run(body,key)).status,400);
  }
  assert.equal((await run(undefined,undefined,'GET')).status,405);
  assert.equal((await run({record},save,'POST',false)).status,401);
  assert.ok(calls.every(c=>c.url.endsWith('/auth/v1/user')));
  assert.match((await run(undefined,undefined,'OPTIONS',false)).headers.get('access-control-allow-headers'), /idempotency-key/i);
});

test('invalid links are indistinguishable and distinct from invalid input or an unavailable task', async () => {
  for (const [sql, status, code] of [['RT001',400,'INVALID_LINK'],['22023',400,'INVALID_INPUT'],['P0002',404,'RESOURCE_UNAVAILABLE']]) {
    const result = await fixture(sql).run({record},save);
    assert.equal(result.status,status);
    const body = await result.json();
    assert.equal(body.error.code,code);
    assert.ok(!body.error.message.includes('private diagnostics'));
  }
});
