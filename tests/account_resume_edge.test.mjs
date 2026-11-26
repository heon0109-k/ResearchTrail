import test from 'node:test';
import assert from 'node:assert/strict';
import { handleResearchTrail } from '../supabase/functions/researchtrail/handler.mjs';

const base = 'https://synthetic.example.invalid';
const task = '66000000-0000-4000-8000-000000000001';
const empty = {task_id:task, task:{goal_text:'합성 과업',scope_text:null,target_output_text:null,progress_text:null},
  records:[],context:{questions:[],decisions:[],document_contexts:[]},next_actions:[]};

function fixture(dbReply = empty, sqlError) {
  const calls = [];
  const backend = {url:base,key:'synthetic-public',async fetch(url, init) {
    calls.push(url);
    assert.equal(init.headers.apikey, 'synthetic-public');
    if (url === base + '/auth/v1/user') {
      return init.headers.Authorization === 'Bearer synthetic-user'
        ? Response.json({id:'synthetic-user'}) : Response.json({}, {status:401});
    }
    assert.equal(url, base + '/rest/v1/rpc/rt_resume');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-user');
    assert.deepEqual(JSON.parse(init.body), {task_id:task});
    return sqlError ? Response.json({code:sqlError, message:'private diagnostic'}, {status:400}) : Response.json(dbReply);
  }};
  function call(method='GET', token='synthetic-user', id=task) {
    return handleResearchTrail(new Request(base+'/functions/v1/researchtrail/tasks/'+id+'/resume', {
      method, headers: token ? {Authorization:'Bearer '+token} : {},
    }),backend);
  }
  return {calls,call};
}

test('resume returns populated and empty snapshots using only authenticated project services',async()=>{
  const unavailablePdf = 'https://offline.example.invalid/fixture.pdf';
  const populated = {...empty, records:[{record_id:'r1',record:{content_text:'  합성 메모\n'}}],
    context:{...empty.context,document_contexts:[{artifacts:[{access_locator_text:unavailablePdf}]}]}};
  for (const data of [empty, populated]) {
    const {call,calls} = fixture(data);
    const reply = await call();
    assert.equal(reply.status,200);
    assert.equal(reply.headers.get('Cache-Control'),'no-store');
    assert.deepEqual(await reply.json(),data);
    assert.deepEqual(calls,[base+'/auth/v1/user',base+'/rest/v1/rpc/rt_resume']);
  }
});

test('missing and inaccessible task responses disclose the same error',async()=>{
  const errors = [];
  for (const code of ['P0002','42501']) {
    const {call,calls} = fixture(null,code);
    const response = await call();
    assert.equal(response.status,404);
    assert.deepEqual(calls,[base+'/auth/v1/user',base+'/rest/v1/rpc/rt_resume']);
    errors.push(await response.json());
  }
  assert.deepEqual(errors[0],errors[1]);
  assert.equal(errors[0].error.code,'RESOURCE_UNAVAILABLE');
  assert.ok(!errors[0].error.message.includes('private diagnostic'));
});

test('invalid sessions, malformed task IDs, and write methods cannot invoke resume',async()=>{
  const {call,calls} = fixture();
  assert.equal((await call('GET',null)).status,401);
  assert.equal((await call('GET','invalid')).status,401);
  assert.equal((await call('GET','synthetic-user','invalid-id')).status,404);
  for (const method of ['POST','PATCH','DELETE']) assert.equal((await call(method)).status,405);
  assert.ok(calls.every(url=>url===base+'/auth/v1/user'));
});
