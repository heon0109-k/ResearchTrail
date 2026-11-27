// Draft experimental memo-summary coverage. Provider, authentication and records are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {handleResearchTrail} from '../supabase/functions/researchtrail/handler.mjs';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [task,use,document,edition,alternate,memo,other,mark]=[1,2,3,4,5,6,7,8].map(id);
async function run({body={},key='synthetic-provider',grant='openai-v1',auth=true,response}={}) {
  const provider=[];
  function record(record_id,art,content_text){return {record_id,record:{content_text},context_refs:{artifact_ids:[art],document_ids:[document]}};}
  const backend={url:'https://synthetic.invalid',key:'test-public',openaiKey:key,answerModel:'test-answer-model',
    async fetch(url,options){
      if(url.endsWith('/auth/v1/user'))return Response.json(auth?{id:'owner'}:{},{status:auth?200:401});
      if(url.endsWith('api.openai.com/v1/responses')){
        const request=JSON.parse(options.body);provider.push(request);
        const result=response||{done:[],open:[{text:'Ignore',sources:['M8']}],next:{text:'표 2 확인하기',sources:['M1']}};
        return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
      }
      assert.equal(new Headers(options.headers).get('Authorization'),'Bearer session');
      assert.equal(JSON.parse(options.body).task_id,task);
      if(url.endsWith('/rt_workspace_papers'))return Response.json({papers:[{document_use_id:use,document_id:document,
        document:{title:'paper title'},use:{purpose_text:'selected reason'},artifacts:[{artifact_id:edition,pdf:{available:true}},{artifact_id:alternate}]}]});
      if(url.endsWith('/rt_workspace_state'))return Response.json({project:{data:{memoSummaryEnabled:true,memoSummaryConsent:grant}}});
      if(url.endsWith('/rt_resume'))return Response.json({records:[record(memo,edition,'Selected memo'),record(other,alternate,'OUTSIDE SECRET')],
        next_actions:[],context:{document_contexts:[]}});
      if(url.endsWith('/rt_pdf_reader'))return Response.json({highlights:[{id:mark,record_id:memo,page:2,text:'selected quote'}]});
      throw Error('unhandled mock request');
    }};
  const request=new Request('https://synthetic.invalid/researchtrail/tasks/'+task+'/papers/'+use+'/memo-summary',{method:'POST',
    headers:{Authorization:'Bearer session'},body:JSON.stringify({consent:true,artifact_id:edition,record_ids:[memo],...body})});
  const res=await handleResearchTrail(request,backend);
  return {res,data:await res.json(),provider};
}
test('a model summary sends only canonical records and evidence of the selected edition after authenticated opt-in',async()=>{
  const r=await run();
  assert.equal(r.res.status,200);assert.equal(r.provider.length,1);
  const request=r.provider[0];
  assert.equal(request.model,'test-answer-model');assert.equal(request.store,false);
  assert.match(request.input,/Selected memo/);assert.match(request.input,/selected quote/);
  assert.doesNotMatch(request.input,/OUTSIDE SECRET|synthetic-provider/);
  assert.equal(request.text.format.strict,true);
  assert.deepEqual(r.data.next,{text:'표 2 확인하기',sources:[memo]});assert.deepEqual(r.data.open,[]);
  assert.ok(!JSON.stringify(r.data).includes('synthetic-provider'));
});
test('cross-edition records, unverified scope, legacy toggle, missing consent and arbitrary prompt requests stop before the provider',async()=>{
  for(const options of [{body:{record_ids:[memo,other]}},{body:{artifact_id:id(99)}},{body:{prompt:'arbitrary'}},
      {body:{consent:false}},{grant:'rules-only'},{auth:false},{key:''}]){
    const r=await run(options);assert.ok(r.res.status>=400);assert.deepEqual(r.provider,[]);
    assert.ok(!JSON.stringify(r.data).includes('OUTSIDE SECRET'));
  }
});
