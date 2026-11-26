import test from 'node:test';
import assert from 'node:assert/strict';
import { handleResearchTrail } from '../supabase/functions/researchtrail/handler.mjs';

const base = 'https://project.example.invalid';
const tokens = new Map([['fixture-a','a'], ['fixture-b','b']]);
const task = 'aaaaaaaa-0000-4000-8000-000000000001';
const requestId = '00000000-0000-4000-8000-000000000000';
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
  function call(route, token, body, method = body ? 'POST' : 'GET') {
    const headers = token ? {Authorization: 'Bearer ' + token} : {};
    return handleResearchTrail(new Request(base + '/functions/v1/researchtrail' + route, {
      method, headers, body: body && JSON.stringify(body),
    }), {url:base, key:'fixture-public', fetch:transport});
  }
  return {call, calls, fail: code => { databaseError=code; }};
}

test('each task and paper endpoint verifies the caller and forwards only that session to its RPC', async () => {
  const { call, calls } = fixture();
  for (const token of tokens.keys()) {
    for (const [route, body, rpc, args] of [
      ['/tasks', undefined, 'rt_tasks', {}],
      ['/tasks', {goal_text:'Synthetic',request_id:requestId}, 'rt_create_task', {payload:{goal_text:'Synthetic'},request_id:requestId}],
      ['/documents', undefined, 'rt_documents', {}],
      ['/tasks/'+task+'/papers', undefined, 'rt_papers', {task_id:task}],
      ['/tasks/'+task+'/papers', {document:{title:'Synthetic'},request_id:requestId}, 'rt_register_paper',
        {payload:{document:{title:'Synthetic'}},task_id:task,request_id:requestId}],
    ]) {
      const result = await call(route,token,body);
      assert.equal(result.ok,true);
      assert.equal(calls.at(-2).path,'/auth/v1/user');
      assert.deepEqual(calls.at(-1),{path:'/rest/v1/rpc/'+rpc,token,key:'fixture-public',args});
    }
  }
});

test('missing or invalid sessions and caller-supplied ownership cannot dispatch a write', async () => {
  const { call,calls } = fixture();
  for (const token of [null,'invalid']) assert.equal((await call('/tasks',token,{goal_text:'x'})).status,401);
  assert.equal((await call('/tasks','fixture-a',{goal_text:'x',owner_id:'b'})).status,400);
  assert.equal(calls.some(c=>c.path.includes('/rpc/')),false);
});

test('every data route rejects a public key alone before it can reach the database', async () => {
  const { call, calls } = fixture();
  for (const [path, body] of [
    ['/tasks'], ['/tasks', {goal_text:'합성 과업'}], ['/documents'],
    ['/tasks/'+task+'/papers'], ['/tasks/'+task+'/papers', {document:{title:'합성 논문'}}],
  ]) {
    const result = await call(path, 'fixture-public', body);
    assert.equal(result.status, 401);
    assert.equal((await result.json()).error.code, 'RESOURCE_UNAVAILABLE');
  }
  assert.equal(calls.length, 5);
  assert.ok(calls.every(c => c.path === '/auth/v1/user'));
});

test('foreign and absent resources are indistinguishable; database diagnostics stay private', async () => {
  const { call,fail } = fixture();
  for (const [sql,code,status] of [['P0002','RESOURCE_UNAVAILABLE',404],['22023','INVALID_INPUT',400],['XX000','STORAGE_FAILURE',500]]) {
    fail(sql);
    const response = await call('/tasks/'+task+'/papers','fixture-b');
    assert.equal(response.status,status);
    const data = await response.json();
    assert.equal(data.error.code,code);
    assert.ok(!data.error.message.includes('private detail'));
  }
  const preflight = await call('/tasks',null,undefined,'OPTIONS');
  assert.equal(preflight.status,204);
  assert.match(preflight.headers.get('access-control-allow-headers'),/authorization/i);
});

test('the Deno entrypoint supplies the public project key and handles browser preflight', async () => {
  // Execute the same entrypoint with Deno's two host bindings supplied by the test.
  let handler;
  const env = {SUPABASE_URL:base, SUPABASE_PUBLISHABLE_KEYS:JSON.stringify({default:'synthetic-public'})};
  globalThis.Deno = {env:{get:name=>env[name]},serve:fn=>{handler=fn;}};
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(init.headers.apikey,'synthetic-public');
      assert.equal(init.headers.Authorization,'Bearer fixture-a');
      calls++;
      return url.endsWith('/user') ? Response.json({id:'a'}) : Response.json({tasks:[]});
    };
    await import('../supabase/functions/researchtrail/index.mjs');
    const url = base+'/researchtrail/tasks';
    assert.equal((await handler(new Request(url,{method:'OPTIONS'}))).status,204);
    const response=await handler(new Request(url,{headers:{Authorization:'Bearer fixture-a'}}));
    assert.deepEqual(await response.json(),{tasks:[]});
    assert.equal(calls,2);
  } finally {globalThis.fetch=original;delete globalThis.Deno;}
});
