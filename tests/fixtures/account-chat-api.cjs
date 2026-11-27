// A text stream per page lets the same fixture exercise PDF.js, blank pages and multi-batch retries.
const {createHash} = require('node:crypto');
function pdf(pages) {
  const refs = pages.map((_,i)=>4+i*2);
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids ['+refs.map(id=>id+' 0 R').join(' ')+'] /Count '+refs.length+' >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  pages.forEach((text,i)=>{
    const stream = text ? 'BT /F1 12 Tf 12 128 Td ('+text+') Tj ET\n' : '';
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 180] /Resources << /Font << /F1 3 0 R >> >> /Contents '+(refs[i]+1)+' 0 R >>',
      '<< /Length '+stream.length+' >>\nstream\n'+stream+'endstream');
  });
  let data='%PDF-1.4\n';
  const offsets=objects.map((object,i)=>{
    const at=data.length;
    data+=(i+1)+' 0 obj\n'+object+'\nendobj\n';
    return String(at).padStart(10,'0')+' 00000 n \n';
  });
  const size=objects.length+1, xref=data.length;
  return Buffer.from(data+'xref\n0 '+size+'\n0000000000 65535 f \n'+offsets.join('')+
    'trailer\n<< /Size '+size+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
}
function fixture() {
  const files={draft:pdf(Array.from({length:34},(_,i)=>'Draft passage '+(i+1))), published:pdf(['Other edition']), other:pdf(['Distinct paper']), blank:pdf([''])};
  const papers=Object.entries(files).map(([id,bytes])=>({document_use_id:id==='published'?'draft':id,
    document_id:id==='published'?'draft':id,document:{title:id},use:{},date:null,
    artifacts:[{artifact_id:id,label_text:'paper.pdf',pdf:{available:true,sha256:createHash('sha256').update(bytes).digest('hex')}}]}));
  papers[0].artifacts.push(...papers.splice(1,1)[0].artifacts);
  const info=(status,count)=>({status,chunker:'pages-1600-320',embedding_model:'recorded-embedding',chunk_count:count});
  const indexes={published:info('ready',1),other:info('ready',1)}, chunks=[], calls=[];
  const api={papers,files,indexes,calls,chunks,failPage:33,failAsk:true,position:1};
  api.request=async (path,body)=>{
    calls.push({path,body});
    const [,resource,task,kind,artifact,operation,step]=path.split('/');
    if(resource!=='tasks') throw Error('Unexpected resource');
    if(!task) return {tasks:[{task_id:'A',task:{goal_text:'A'}}]};
    if(!['A','B'].includes(task)) throw Error('Unknown project');
    if(kind==='papers') return {papers};
    if(kind==='paper-links') return {links:[]};
    if(kind==='resume') return {task_id:task,task:{goal_text:task},records:[],next_actions:[],
      context:{document_contexts:papers,questions:[],decisions:[]}};
    if(kind==='rag-index') return {artifacts:papers.flatMap(p=>p.artifacts.map(a=>({document_use_id:p.document_use_id,
      artifact_id:a.artifact_id,index:indexes[a.artifact_id]||null})))};
    if(!files[artifact]) throw Error('Unexpected edition');
    if(operation==='reader') {
      if(body?.last_page) api.position=body.last_page;
      return {last_page:artifact==='draft'?api.position:1,highlights:[]};
    }
    if(operation==='rag-index' && step==='begin') {
      chunks.length=0;
      indexes[artifact]=info('indexing',null);
      return {artifact_id:artifact,...indexes[artifact]};
    }
    if(step==='chunks'){
      if(api.failPage===body.chunks[0].page){api.failPage=null;throw Error('Synthetic chunk failure');}
      for(const chunk of body.chunks){
        if(!chunks.some(c=>c.page===chunk.page && c.start===chunk.start)) chunks.push(chunk);
      }
      return {artifact_id:artifact,received:body.chunks.length,stored:chunks.length};
    }
    if(step==='finish') {
      indexes[artifact]=info('ready',chunks.length);
      return {artifact_id:artifact,...indexes[artifact]};
    }
    if(operation==='ask') {
      if(api.failAsk){api.failAsk=false;throw Error('Synthetic answer failure');}
      if(api.wait) await api.wait;
      if(body.question==='missing') return {kind:'notfound',text:'검색한 구절에서 답할 근거를 찾지 못했어요.',evidence:[]};
      return {kind:'answer',text:'합성 답변',evidence:[{document_use_id:'draft',artifact_id:artifact,label:'A',page:2,quote:'Draft passage 2'}]};
    }
    throw Error('Unexpected route');
  };
  api.rag=()=>calls.filter(c=>/rag-index|\/ask$/.test(c.path));
  return api;
}
module.exports={fixture};
