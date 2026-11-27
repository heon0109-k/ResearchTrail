// One research project, represented as device data and as authenticated account rows.
import {createHash} from 'node:crypto';
import synthetic from './account-chat-api.cjs';

export const referenceCommit='0d9d5340bec110e24ac0eb26d6b42082dad2b109';
export const project={
  name:'읽기 기록 예시',zoom:'month',
  tags:[{id:'method',name:'방법',color:'#9970cf'},{id:'result',name:'결과',color:'#297d91'}],
  papers:[
    {id:'ref1',title:'합성 실험의 측정 방법',date:'2026-11-25',tag:'method',state:'reading',memo:'두 측정 방법을 비교하려고 저장함',pdf:true,fname:'reading-sample.pdf',page:1},
    {id:'ref2',title:'측정 결과 비교',date:'2026-11-27',tag:'result',state:'skim',memo:'표의 정의를 확인하기'}
  ],
  links:[{id:'link1',from:'ref1',to:'ref2',reason:'실험 방법 비교'}]
};
export const pdf=synthetic.fixture().files.draft;

export function makeAccount() {
  const task='visual-project', edition='edition-ref1';
  const types={reading:'읽는 중',skim:'읽을 것'};
  const papers=project.papers.map(p=>({
    document_use_id:p.id,document_id:'work-'+p.id,document:{title:p.title},date:p.date,
    use:{reading_state_text:types[p.state],purpose_text:p.memo},
    artifacts:p.pdf?[{artifact_id:edition,label_text:p.fname,pdf:{available:true,
      sha256:createHash('sha256').update(pdf).digest('hex'),document_use_id:p.id}}]:[]
  }));
  const head=data=>({version:1,data});
  const metadata={project:head({tags:structuredClone(project.tags),zoom:project.zoom,tourSeen:true}),
    papers:Object.fromEntries(project.papers.map(p=>[p.id,head({tag:p.tag})])),artifacts:{},reading_pages:{[edition]:1}};
  const taskRow={task_id:task,task:{goal_text:project.name},paper_count:papers.length};
  const reader={last_page:1,highlights:[]};

  function merge(data,patch) {
    for (const [key,value] of Object.entries(patch)) {
      if (value===null) delete data[key];
      else if (value && typeof value==='object' && !Array.isArray(value)) data[key]=merge({...data[key]},value);
      else data[key]=value;
    }
    return data;
  }

  return async function respond(route,name) {
    const request=route.request(), method=request.method();
    if (request.headers().authorization!=='Bearer visual-session') throw Error('Expected the synthetic signed-in bearer.');
    const json=value=>route.fulfill({json:value});
    if (name==='tasks' && method==='GET') return json({tasks:[taskRow],selection:{revision:1,task_id:task}});
    const [,id,resource,record,action]=name.split('/');
    if (id!==task) throw Error('Unexpected task in '+name);
    if (method==='GET') {
      if (resource==='papers') return json({papers});
      if (resource==='paper-links') return json({links:project.links.map(l=>({link_id:l.id,from_document_use_id:l.from,to_document_use_id:l.to,reason_text:l.reason}))});
      if (resource==='resume') return json({...taskRow,records:[],next_actions:[],context:{document_contexts:papers,questions:[],decisions:[]}});
      if (resource==='workspace') return json(metadata);
      if (resource==='artifacts' && record===edition && action==='reader') return json(reader);
      if (resource==='artifacts' && record===edition && action==='pdf') return route.fulfill({body:pdf,contentType:'application/pdf'});
    }
    const body=method==='GET'?null:request.postDataJSON();
    if (resource==='workspace' && method==='PATCH') {
      const item=body.target==='project'?metadata.project:(metadata[body.target+'s'][body.id]||={version:0,data:{}});
      if(item.version!==body.version) throw Error('Unexpected metadata revision');
      merge(item.data,body.patch); item.version++;
      return json(item);
    }
    if (resource==='active-project' && method==='PATCH') return json({task_id:task,...body});
    if (resource==='artifacts' && record===edition && action==='reader' && method==='POST' && body.last_page) {
      reader.last_page=body.last_page; return json(reader);
    }
    throw Error('Unexpected workspace request '+method+' '+name);
  };
}
