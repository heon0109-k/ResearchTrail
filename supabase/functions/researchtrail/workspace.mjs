import {boundedBytes} from './bytes.mjs';

// Keep the wire format within PostgreSQL's merge-patch contract before
// serializing an RPC request. In particular a deeply nested body gets a 400.
export function validWorkspaceJson(value,depth=0) {
  if (depth>32) return false;
  if (value===null || typeof value!=='object') return true;
  return Object.entries(value).every(([key,child])=>!['__proto__','constructor','prototype'].includes(key) &&
    (child===null || typeof child!=='object' || validWorkspaceJson(child,depth+1)));
}

// The same authenticated transport serves the product controls and legacy account callers.
export async function workspaceControl(request, route, {rpc,fail,cors,uuid}) {
  const {task,kind,id}=route;
  if (!uuid.test(task) || (id && !uuid.test(id))) return fail(404,'RESOURCE_UNAVAILABLE');
  const method=request.method;
  if (kind==='workspace' && method==='GET') {
    const result=await rpc('rt_workspace_state',{task_id:task});
    return result.ok ? Response.json(await result.json(),{headers:cors}) : result;
  }
  const operations={
    task:{PATCH:'rename_task',DELETE:'archive_task'},
    papers:{PATCH:'edit_paper',DELETE:'archive_paper'},
    workspace:{PATCH:'patch_state'},
    'tag-removal':{POST:'remove_tag'},
    'active-project':{PATCH:'select_task'},
  };
  const operation=operations[kind][method];
  if (!operation) return fail(405,'INVALID_INPUT');
  let body;
  try {
    if (!request.body) return fail(400,'INVALID_INPUT');
    const bytes=await boundedBytes(request,10*1024*1024);
    if (!bytes) return fail(413,'INVALID_INPUT');
    body=JSON.parse(new TextDecoder().decode(bytes));
  } catch { return fail(400,'INVALID_INPUT'); }
  if (!body || typeof body!=='object' || Array.isArray(body) || typeof body.request_id!=='string' || !uuid.test(body.request_id))
    return fail(400,'INVALID_INPUT');
  const {request_id,...payload}=body;
  if (!validWorkspaceJson(payload)) return fail(400,'INVALID_INPUT');
  if(operation==='select_task') {
    if (Object.keys(payload).length!==1 || !Number.isSafeInteger(payload.revision) || payload.revision<1)
      return fail(400,'INVALID_INPUT');
    const selection=await rpc('rt_select_workspace_task',{task_id:task,revision:payload.revision,request_id});
    return selection.ok ? Response.json(await selection.json(),{headers:cors}) : selection;
  }
  const paperFields=['title','date','purpose_text','reading_state_text','access_locator_text'];
  const fields={
    rename_task:['goal_text'],archive_task:[],archive_paper:[],
    edit_paper:paperFields,patch_state:['target','id','version','patch','paper_fields','changes'],
    remove_tag:['tag_id','archive_papers','version','expected_papers'],
  };
  if (Object.keys(payload).some(k=>!fields[operation].includes(k))) return fail(400,'INVALID_INPUT');
  if (operation==='remove_tag' && 'expected_papers' in payload &&
      (payload.archive_papers!==true || !Array.isArray(payload.expected_papers) ||
       !payload.expected_papers.every(id=>typeof id==='string' && uuid.test(id)) ||
       new Set(payload.expected_papers.map(id=>id.toLowerCase())).size!==payload.expected_papers.length))
    return fail(400,'INVALID_INPUT');
  const validLeaf=leaf => leaf && typeof leaf==='object' && !Array.isArray(leaf) &&
    ['project','paper','artifact'].includes(leaf.target) &&
    (leaf.target==='project' ? leaf.id===undefined || leaf.id===task : typeof leaf.id==='string' && uuid.test(leaf.id)) &&
    Number.isSafeInteger(leaf.version) && leaf.version>=0 &&
    leaf.patch && typeof leaf.patch==='object' && !Array.isArray(leaf.patch) &&
    Object.keys(leaf).every(k=>['target','id','version','patch','paper_fields'].includes(k)) &&
    (!Object.hasOwn(leaf,'paper_fields') || (leaf.target==='paper' && leaf.paper_fields &&
      typeof leaf.paper_fields==='object' && !Array.isArray(leaf.paper_fields) && Object.keys(leaf.paper_fields).length>0 &&
      Object.keys(leaf.paper_fields).every(key=>paperFields.includes(key))));
  if (operation==='patch_state') {
    if ('changes' in payload) {
      if (Object.keys(payload).length!==1 || !Array.isArray(payload.changes) || !payload.changes.length ||
          !payload.changes.every(validLeaf)) return fail(400,'INVALID_INPUT');
    } else if (!validLeaf(payload)) return fail(400,'INVALID_INPUT');
  }
  const result=await rpc('rt_workspace_change',{task_id:task,target_id:id||null,operation,payload,request_id});
  return result.ok ? Response.json(await result.json(),{headers:cors}) : result;
}
