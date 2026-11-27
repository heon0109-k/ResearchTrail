// Draft regressions for the experimental PDF Q&A release (SPEC §4.2, Prompt 6).
// The real Edge handler builds both outbound HTTP bodies. Every destination is mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleResearchTrail } from '../supabase/functions/researchtrail/handler.mjs';

const origin = 'https://project.example.invalid';
const task = '11111111-1111-4111-8111-111111111111';
const artifact = n => '22222222-2222-4222-8222-' + String(n).padStart(12, '0');
const openText = 'The open edition used fourteen observations.';
const linkedText = 'The linked paper used a different measure.';
const siblingText = 'Another edition of the open work used forty observations.';
const wrongUseText = 'This row has the wrong document use.';
const savedModel = 'fixture-index-model';
const endpoint = '/tasks/' + task + '/artifacts/' + artifact(1) + '/ask';

function post(path, body, token = 'fixture-user') {
  return new Request(origin + '/functions/v1/researchtrail' + path, {
    method:'POST', headers:{Authorization:'Bearer ' + token, 'Content-Type':'application/json'}, body:JSON.stringify(body),
  });
}

function fixture({answerModel, dirty = false, reply, status = 'ready', noOpenPassages = false} = {}) {
  const calls = [];
  const open = {document_use_id:'use-a', artifact_id:artifact(1), index:{status, embedding_model:savedModel}};
  const edition = n => ({artifact_id:artifact(n), status:'ready', embedding_model:savedModel, similarity:n/10});
  function row(n, use, page, text) {
    return {artifact_id:artifact(n), document_use_id:use, page, start:0, end:text.length, text, similarity:n/10};
  }
  const current = row(1, 'use-a', 1, openText);
  const linked = row(2, 'use-b', 2, linkedText);
  const sibling = row(3, 'use-a', 3, siblingText);
  const wrongUse = row(1, 'use-b', 4, wrongUseText);
  async function transport(url, init) {
    const {host, pathname} = new URL(url);
    const name = pathname.split('/').pop();
    const authorization = new Headers(init.headers).get('Authorization');
    const body = init.body && JSON.parse(init.body);
    calls.push({name, body, host, pathname, method:init.method, authorization});
    switch (name) {
      case 'user': return authorization === 'Bearer fixture-user' ? Response.json({id:'account'}) : Response.json({}, {status:401});
      case 'rt_rag_begin_index': case 'rt_rag_add_chunks': return Response.json({artifact_id:artifact(1)});
      case 'rt_rag_index_status': return Response.json({artifacts:[open]});
      case 'rt_rag_scope': return Response.json({
        papers:[{document_use_id:'use-a', title:'Open work', editions:[edition(1), edition(3)]},
          {document_use_id:'use-b', title:'Linked title', editions:[edition(2)]}],
        links:[{from_document_use_id:'use-a', to_document_use_id:'use-b'}],
      });
      case 'rt_rag_search': {
        const opened = noOpenPassages ? [] : [current];
        // Deliberately return stray rows in BOTH collections to exercise the model-input boundary.
        const stray = [linked, sibling, wrongUse];
        return Response.json({
          matches:dirty ? [...stray, ...opened] : [...opened, linked].filter(r => body.payload.artifact_ids.includes(r.artifact_id)),
          current:dirty ? [...stray, ...opened] : opened,
        });
      }
      case 'embeddings': return Response.json({data:[{index:0, embedding:Array(1536).fill(0.1)}]});
      case 'responses': return Response.json({status:'completed', output:[{content:[{type:'output_text',
        text:JSON.stringify(reply ?? {in_scope:true, found:true, answer:'관측값 14개를 사용했어요.',
          used_docs:['A'], evidence:[{doc:'A',page:1,quote:openText}]})}]}]});
      default: throw new Error('Unexpected mock destination');
    }
  }
  async function ask(fields, token = 'fixture-user') {
    return handleResearchTrail(post(endpoint, {consent:true, question:'표 1을 설명해 주세요.', ...fields}, token),
      {url:origin, key:'fixture-public', openaiKey:'fixture-provider', answerModel,
        embeddingModel:'fixture-new-index-setting', fetch:transport});
  }
  const sent = name => calls.find(call => call.name === name)?.body;
  return {ask, calls, sent, transport};
}

for (const [depth, question, effort] of [
  ['auto', '관측값은 몇 개였나요?', 'none'],
  ['auto', 'What does the acronym stand for?', 'none'],
  ['auto', 'Which dataset did the paper use?', 'none'],
  ['auto', '이 방법을 설명해 주세요.', 'low'],
  ['auto', 'Explain the procedure.', 'low'],
  ['auto', '두 결과의 차이를 종합해 주세요.', 'medium'],
  ['auto', 'Compare how many observations the two methods used.', 'medium'],
  ['auto', 'Give a synthesis of the results.', 'medium'],
  ['none', '두 방법을 비교해 주세요.', 'none'],
  ['low', 'How many observations?', 'low'],
  ['medium', '관측값은 몇 개인가요?', 'medium'],
]) {
  test('open PDF provider request: ' + depth + ' / ' + question + ' → ' + effort, async () => {
    const {ask, calls, sent} = fixture({dirty:true});
    const res = await ask({scope:'open_pdf', answer_depth:depth, question});
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.kind, 'answer');
    assert.deepEqual(data.searched.map(p => p.artifact_id), [artifact(1)]);
    assert.deepEqual(data.excluded, []);
    assert.deepEqual(data.evidence.map(e => [e.artifact_id,e.page]), [[artifact(1),1]]);
    assert.deepEqual(calls.map(c => c.name), ['user','rt_rag_index_status','embeddings','rt_rag_search','responses']);
    assert.deepEqual(calls.filter(c => c.host === 'api.openai.com').map(c => [c.method, c.pathname]),
      [['POST', '/v1/embeddings'], ['POST', '/v1/responses']]);
    assert.deepEqual(sent('embeddings'), {model:savedModel, input:[question], dimensions:1536, encoding_format:'float'});
    assert.deepEqual(sent('rt_rag_search').payload.artifact_ids, [artifact(1)]);
    assert.equal(sent('rt_rag_search').payload.current_artifact_id, artifact(1));
    const outgoing = sent('responses');
    assert.equal(outgoing.model, 'gpt-6-luna');
    assert.deepEqual(outgoing.reasoning, {effort});
    assert.equal(outgoing.store, false);
    assert.equal(outgoing.input.split('<본문>\n').at(-1).split('\n</본문>')[0], '[문서 A · p.1] ' + openText);
    for (const outside of [siblingText, linkedText, wrongUseText, 'Linked title']) assert.ok(!outgoing.input.includes(outside));
    assert.ok(calls.every(c => c.authorization === (c.host === 'api.openai.com' ? 'Bearer fixture-provider' : 'Bearer fixture-user')));
  });
}

test('legacy omission keeps linked search and none; explicit linked scope supports an independent answer-model override', async () => {
  for (const fields of [{}, {answer_depth:'low'}, {scope:'linked_papers', answer_depth:'medium'}]) {
    const {ask,sent} = fixture({answerModel:'fixture-answer-model'});
    const res = await ask({question:'두 방법을 비교해 줘.', ...fields});
    assert.equal(res.status,200);
    const data = await res.json();
    assert.deepEqual(data.searched.map(p=>p.artifact_id),[artifact(1),artifact(2)]);
    assert.deepEqual(sent('rt_rag_search').payload.artifact_ids,[artifact(1),artifact(2)]);
    const outgoing=sent('responses');
    assert.equal(outgoing.model,'fixture-answer-model');
    assert.deepEqual(outgoing.reasoning,{effort:fields.answer_depth ?? 'none'});
    assert.ok(outgoing.input.includes('[문서 B · p.2] '+linkedText));
    assert.ok(!outgoing.input.includes(siblingText));
    assert.equal(sent('embeddings').model,savedModel);
  }
});

test('unknown scope or depth, missing consent, and an invalid account stop before retrieval and provider calls', async () => {
  const {ask,calls}=fixture();
  for (const fields of [
    {answer_depth:'high'}, {answer_depth:'other'}, {answer_depth:null}, {answer_depth:['low']},
    {scope:'all'}, {scope:null}, {scope:'open_pdf',artifact_ids:[artifact(2)]}, {scope:'open_pdf',consent:false},
  ]) {
    const res=await ask(fields);
    assert.equal(res.status,400);
    assert.equal((await res.json()).error.code,'INVALID_INPUT');
  }
  assert.equal((await ask({scope:'open_pdf'}, 'other-user')).status,401);
  assert.ok(calls.every(c=>c.name==='user'));
  const unready=fixture({status:'indexing'});
  assert.equal((await unready.ask({scope:'open_pdf'})).status,400);
  assert.deepEqual(unready.calls.map(c=>c.name),['user','rt_rag_index_status']);
});

test('a stray passage cannot trigger generation, validate a quote, or stand in for an open-PDF selection', async () => {
  const empty=fixture({dirty:true,noOpenPassages:true});
  assert.equal((await (await empty.ask({scope:'open_pdf'})).json()).kind,'notfound');
  assert.equal(empty.sent('responses'),undefined);
  const other=fixture({dirty:true,reply:{in_scope:true,found:true,answer:'다른 판본의 결과예요.',
    used_docs:['A'], evidence:[{doc:'A',page:1,quote:siblingText}]}});
  const res=await other.ask({scope:'open_pdf',selection:{page:1,text:siblingText}});
  assert.equal((await res.json()).kind,'notfound');
  assert.ok(!other.sent('responses').input.includes(siblingText));
  const good=fixture();
  await good.ask({scope:'open_pdf',selection:{page:1,text:'fourteen observations'},history:[{role:'user',text:'앞선 질문'}]});
  assert.ok(good.sent('responses').input.includes('<선택한 문장 문서 A p.1>fourteen observations</선택한 문장>'));
  assert.ok(good.sent('responses').input.includes('학생: 앞선 질문'));
  assert.deepEqual(good.sent('responses').reasoning,{effort:'none'});
});

test('the open-edition refusal names the current PDF and an unreadable model reply retains the storage error', async () => {
  const refused = fixture({reply:{in_scope:false, found:false, answer:'ignored', used_docs:[], evidence:[]}});
  const reply = await (await refused.ask({scope:'open_pdf'})).json();
  assert.equal(reply.kind, 'refuse');
  assert.match(reply.text, /현재 열어 둔 PDF/);
  assert.deepEqual(reply.evidence, []);
  const invalid = fixture({reply:{unexpected:'fixture diagnostic'}});
  const res = await invalid.ask({scope:'open_pdf', answer_depth:'medium'});
  assert.equal(res.status,503);
  const error = await res.json();
  assert.equal(error.error.code,'STORAGE_FAILURE');
  assert.ok(!error.error.message.includes('fixture diagnostic'));
});

test('function entry reads server settings, keeps the template blank and embeds batches with the recorded model', async t => {
  const template = await readFile(new URL('../.env.example',import.meta.url),'utf8');
  const settings = template.split(/\r?\n/).filter(line => line && !line.startsWith('#'));
  assert.ok(settings.includes('OPENAI_API_KEY=') && settings.includes('OPENAI_MODEL=') && settings.includes('RAG_EMBEDDING_MODEL='));
  assert.ok(settings.every(line => /^[A-Z_]+=$/.test(line)), 'Template settings must be blank');
  const env = {SUPABASE_URL:origin, SUPABASE_ANON_KEY:'fixture-public', OPENAI_API_KEY:'fixture-provider'};
  let handler, backend;
  const previous = Object.getOwnPropertyDescriptor(globalThis,'Deno');
  t.after(() => {
    if (previous) Object.defineProperty(globalThis,'Deno',previous);
    else delete globalThis.Deno;
  });
  globalThis.Deno = {env:{get:name => env[name]}, serve:callback => {handler = callback;}};
  t.mock.method(globalThis,'fetch',(...args) => backend.transport(...args));

  for (const [answerModel, embeddingModel] of [['',''], ['fixture-answer-override','fixture-index-override']]) {
    Object.assign(env,{OPENAI_MODEL:answerModel, RAG_EMBEDDING_MODEL:embeddingModel});
    await import('../supabase/functions/researchtrail/index.mjs?settings=' + (answerModel || 'blank'));
    backend = fixture();
    const res = await handler(post(endpoint,{scope:'open_pdf', question:'두 결과를 비교해 줘.', consent:true, answer_depth:'auto'}));
    assert.equal(res.status,200);
    assert.equal(backend.sent('responses').model, answerModel || 'gpt-6-luna');
    assert.deepEqual(backend.sent('responses').reasoning,{effort:'medium'});
    assert.equal(backend.sent('embeddings').model,savedModel);

    const index = endpoint.replace(/\/ask$/, '/rag-index/');
    const begin = await handler(post(index+'begin',{pdf_sha256:'0'.repeat(64),chunker:'pages-1600-320',consent:true}));
    assert.equal(begin.status,201);
    assert.equal(backend.sent('rt_rag_begin_index').payload.embedding_model, embeddingModel || 'text-embedding-3-small');
    backend = fixture({status:'indexing'});
    const chunks = await handler(post(index+'chunks',{chunks:[{page:1,start:0,end:openText.length,text:openText}]}));
    assert.equal(chunks.status,201);
    assert.deepEqual(backend.sent('embeddings'),{model:savedModel,input:[openText],dimensions:1536,encoding_format:'float'});
    assert.equal(backend.sent('responses'),undefined);
  }
});

// Draft SPEC §4.2. A capture is an explicit question attachment to the current PDF.
test('an attached capture targets its source page and keeps its note distinct from verified passages',async () => {
  const backend=fixture({dirty:true});
  const result=await backend.ask({scope:'open_pdf',capture:{page:1,note:'내가 확인할 비교 기준'},selection:{page:1,text:'fourteen observations'}});
  assert.equal(result.status,200);
  assert.deepEqual(backend.sent('rt_rag_search').payload.artifact_ids,[artifact(1)]);
  const prompt=backend.sent('responses').input;
  assert.match(prompt,/첨부한 캡처.*p\.1/);
  assert.match(prompt,/내가 확인할 비교 기준/);
  assert.doesNotMatch(prompt.split('<본문>\n').at(-1).split('</본문>')[0],/내가 확인할 비교 기준/);
  for(const capture of [{page:0,note:''},{page:1,note:'x'.repeat(401)},{page:1,note:'',image:'data:'}]) {
    const bad=fixture();
    assert.equal((await bad.ask({scope:'open_pdf',capture})).status,400);
    assert.equal(bad.sent('responses'),undefined);
  }
});
