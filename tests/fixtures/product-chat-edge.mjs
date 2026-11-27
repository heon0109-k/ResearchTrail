// Full Edge handler with fake Auth, PostgREST, Storage and provider HTTP endpoints.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture} from './account-chat-api.cjs';
import {handleResearchTrail} from '../../supabase/functions/researchtrail/handler.mjs';

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
export const [owner,task,use,edition,sibling,linked,otherUse,doc]=[1,2,3,4,5,6,7,8].map(id);
export const token='fixture-researcher',origin='http://localhost',functionPath='/functions/v1/researchtrail';
export const question='열어 둔 판본의 2쪽 결과를 비교해 주세요.';
const selected='Draft passage 2',outside=['Different published edition','Linked paper private passage'];
function merge(a,b) {
  for(const [k,v] of Object.entries(b)){
    if(v===null)delete a[k];else a[k]=typeof v==='object'&&!Array.isArray(v)?merge({...a[k]},v):v;
  }
  return a;
}
export function chatEdge() {
  const pdf=fixture().files,sha=createHash('sha256').update(pdf.draft).digest('hex');
  const artifacts=[{artifact_id:sibling,label_text:'논문.pdf',version_text:'이전',pdf:{available:true,sha256:createHash('sha256').update(pdf.published).digest('hex')}},
    {artifact_id:edition,label_text:'논문.pdf',version_text:'검토 중',pdf:{available:true,sha256:sha}}];
  const papers=[{document_use_id:use,document_id:doc,document:{title:'합성 판본'},use:{reading_state_text:'읽는 중'},date:null,artifacts}];
  const metadata={project:{version:1,data:{tourSeen:true}},papers:{},artifacts:{},reading_pages:{},record_requests:{}};
  const calls=[],edge=[],delivered=[],unexpected=[],assetPath=owner+'/'+use+'/'+sha+'.pdf';
  const index={status:'ready',chunker:'pages-1600-320',embedding_model:'existing-index-model',chunk_count:2};
  const reader={last_page:1,highlights:[]};
  let answerGate;
  function pauseNextAnswer(){answerGate=Promise.withResolvers();return answerGate.resolve;}
  async function transport(url,init) {
    const {host,pathname}=new URL(url),name=pathname.split('/').at(-1),auth=new Headers(init.headers).get('Authorization');
    const body=init.body?JSON.parse(init.body):null;calls.push({host,name,auth,body});
    if(host==='api.openai.com') {
      assert.equal(auth,'Bearer synthetic-model-only');
      if(name==='embeddings')return Response.json({data:[{index:0,embedding:Array(1536).fill(0.1)}]});
      if(name==='responses'){
        if(answerGate){const gate=answerGate;answerGate=null;await gate.promise;}
        return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(
        {in_scope:true,found:true,answer:'두 번째 쪽의 합성 답변',used_docs:['A'],evidence:[{doc:'A',page:2,quote:selected}]})}]}]});
      }
    }
    assert.equal(host,'database.invalid');
    if(name==='user') return Response.json(auth==='Bearer '+token?{id:owner}:{},{status:auth==='Bearer '+token?200:401});
    assert.equal(auth,'Bearer '+token);
    if(pathname.includes('/storage/v1/object/')){
      assert.ok(pathname.endsWith(assetPath));return new Response(pdf.draft,{headers:{'Content-Type':'application/pdf'}});
    }
    if(body?.task_id)assert.equal(body.task_id,task);
    switch(name) {
      case 'rt_workspace_tasks':return Response.json({selection:{revision:0,task_id:null},tasks:[{task_id:task,task:{goal_text:'질문 실험'},paper_count:1}]});
      case 'rt_workspace_papers':return Response.json({papers});
      case 'rt_paper_links':return Response.json({links:[]});
      case 'rt_resume':return Response.json({task_id:task,task:{goal_text:'질문 실험'},records:[],next_actions:[],context:{document_contexts:papers,questions:[],decisions:[]}});
      case 'rt_workspace_state':return Response.json(metadata);
      case 'rt_workspace_change': {
        const p=body.payload,groups={project:metadata,paper:metadata.papers,artifact:metadata.artifacts};
        assert.equal(body.operation,'patch_state');
        const key=p.target==='project'?'project':p.id;
        const leaf=groups[p.target][key]??={version:0,data:{}};
        assert.equal(p.version,leaf.version);merge(leaf.data,p.patch);leaf.version++;
        return Response.json(leaf);
      }
      case 'rt_paper_pdf':
        assert.equal(body.artifact_id,edition);return Response.json({artifact_id:edition,object_name:assetPath,size_bytes:pdf.draft.length,sha256:sha,available:true});
      case 'rt_pdf_reader':assert.equal(body.artifact_id,edition);return Response.json(reader);
      case 'rt_save_pdf_reader':assert.equal(body.artifact_id,edition);reader.last_page=body.payload.last_page;return Response.json(reader);
      case 'rt_rag_index_status':return Response.json({artifacts:[{document_use_id:use,artifact_id:edition,index},
        {document_use_id:use,artifact_id:sibling,index},{document_use_id:otherUse,artifact_id:linked,index}]});
      case 'rt_rag_search': {
        const row=(artifact_id,document_use_id,page,text)=>({artifact_id,document_use_id,page,text,start:0,end:text.length,similarity:.9});
        const rows=[row(linked,otherUse,2,outside[1]),row(sibling,use,2,outside[0]),row(edition,use,2,selected)];
        return Response.json({matches:rows,current:rows});
      }
      default:unexpected.push(name);throw Error('Unhandled mock RPC '+name);
    }
  }
  const backend={url:'https://database.invalid',key:'synthetic-public',openaiKey:'synthetic-model-only',embeddingModel:'new-index-model',answerModel:'synthetic-answer',fetch:transport};
  async function handle(request) {
    edge.push({path:new URL(request.url).pathname,method:request.method,auth:request.headers.get('Authorization'),
      body:request.body?await request.clone().json():null});
    const result=await handleResearchTrail(request,backend);
    delivered.push(new URL(request.url).pathname);return result;
  }
  function verify() {
    assert.deepEqual(unexpected,[]);
    const ask=edge.find(c=>c.path.endsWith('/ask'));
    assert.equal(ask.path,functionPath+'/tasks/'+task+'/artifacts/'+edition+'/ask');
    assert.ok(edge.every(c=>c.auth==='Bearer '+token));
    assert.equal(ask.body.scope,'open_pdf');assert.equal(ask.body.consent,true);assert.equal(ask.body.answer_depth,'medium');
    assert.equal(ask.body.question,question);
    assert.equal(calls.filter(c=>c.name==='user').length,edge.length);
    assert.ok(!calls.some(c=>c.name==='rt_rag_scope'||c.name==='rt_rag_begin_index'));
    const find=name=>calls.find(c=>c.name===name).body;
    assert.deepEqual(find('rt_rag_search').payload.artifact_ids,[edition]);
    assert.equal(find('embeddings').model,'existing-index-model');assert.equal(find('embeddings').reasoning,undefined);
    const response=find('responses');
    assert.equal(response.model,'synthetic-answer');assert.equal(response.reasoning.effort,'medium');
    assert.equal(response.input.split('<본문>\n')[1].split('\n</본문>')[0],'[문서 A · p.2] '+selected);
    for(const text of outside)assert.ok(!response.input.includes(text));
    const saved=metadata.artifacts[edition].data.qa;
    assert.equal(saved.depth,'medium');
    const [turn]=Object.values(saved.turns);
    assert.equal(turn.question,question);
    const evidence=turn.answer.evidence[0];
    assert.equal(evidence.document_use_id,use);assert.equal(evidence.artifact_id,edition);assert.equal(evidence.page,2);
    assert.equal(evidence.quote,selected);
  }
  return {handle,papers,metadata,pdf,verify,edge,calls,delivered,reader,pauseNextAnswer};
}
