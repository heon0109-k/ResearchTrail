// Draft AC5/AC7. Both clients must be signed in before the first mutation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export async function runProductPersistenceJourney({first,second,pdf,allowRetry=false}) {
  assert.notEqual(first.page.context(),second.page.context());
  const prefix='/functions/v1/researchtrail/tasks',project='두 기기 읽기 검증';
  const original='합성 관측 원문',other='합성 후속 분석',reason='두 연구의 관측값 비교',memo='  2쪽의 관측 방법을 다시 대조하기  ';
  const {el}=first,hash=createHash('sha256').update(pdf).digest('hex');
  function response(client,method,target,match) {
    return client.page.waitForResponse(r=>r.request().method()===method && new URL(r.url()).pathname===target &&
      (!match || match(r.request().postDataJSON(),r)));
  }
  async function receipt(r){assert.ok(r.ok(),'Expected account acknowledgement, HTTP '+r.status());return r.json();}
  async function after(result,action){const [r]=await Promise.all([result,action()]);return r;}
  async function navigatePage(client,taskPath,n){
    const result=response(client,'POST',taskPath,b=>b.last_page===n);
    await receipt(await after(result,()=>client.el('#pvNext').click()));
    await client.page.waitForFunction(n=>document.querySelector('#authWorkspace iframe').contentDocument.querySelector('#pvNum')?.value===String(n),n);
  }
  await el('#tName').click();await el('[data-pj-new]').click();await el('#pjmNew').fill(project);
  const created=await receipt(await after(response(first,'POST',prefix),()=>el('#pjmNew').press('Enter')));
  const base=prefix+'/'+created.task_id;await el('#tName').filter({hasText:project}).waitFor();
  // Park the already-open second client on the empty project before inserting either paper.
  await second.page.reload();await second.page.locator('#authWorkspace iframe[title="계정 타임라인"]').waitFor();await second.el('#tName').waitFor();await second.el('#tName').click();
  await second.el('[data-pj-go="'+created.task_id+'"]').click();await second.el('#tName').filter({hasText:project}).waitFor();
  assert.equal(await second.el('.card[data-id]').count(),0);
  async function register(title,attach) {
    await el('#addBtn').click();await el('#aTitle').fill(title);await el('#aMemo').fill(title+' 읽기');
    if(attach)await el('#aFile').setInputFiles({name:'판본.pdf',mimeType:'application/pdf',buffer:pdf});
    const uploaded=attach && first.page.waitForResponse(r=>r.request().method()==='POST'&&
      new URL(r.url()).pathname.startsWith(base+'/papers/') && r.url().endsWith('/pdf'));
    const row=await receipt(await after(response(first,'POST',base+'/papers'),()=>el('#addForm button[type=submit]').click()));
    const edition=uploaded?await receipt(await uploaded):null;
    await el('#panel #pRead').waitFor();return {row,edition};
  }
  const {row:a,edition}=await register(original,true),{row:b}=await register(other,false);
  const id=edition.artifact_id,statePath=base+'/artifacts/'+id+'/reader';
  await el('#lkStart').click();await el('.card[data-id="'+a.document_use_id+'"]').press('Enter');
  await el('#lkWhy').fill(reason);
  const link=await receipt(await after(response(first,'POST',base+'/paper-links'),()=>el('#lkOk').click()));
  assert.equal(link.from_document_use_id,b.document_use_id);assert.equal(link.to_document_use_id,a.document_use_id);
  await el('#panel').filter({hasText:reason}).waitFor();await el('#vList').click();
  await el('[data-list-paper="'+a.document_use_id+'"]').click();
  await el('#pvTot').filter({hasText:'34'}).waitFor();
  await navigatePage(first,statePath,2);
  await el('.pgbox[data-n="2"] .textLayer span').filter({hasText:'Draft passage 2'}).first().dblclick();
  const highlightAck=()=>response(first,'POST',statePath,b=>b.highlight);
  let highlighted=await after(highlightAck(),()=>el('#hlbar [data-a=hl]').click());
  if(!highlighted.ok()&&allowRetry){
    highlighted=await after(highlightAck(),()=>el('.product-retries button').filter({hasText:'하이라이트 다시 저장'}).click());
  }
  const savedMark=(await receipt(highlighted)).highlights[0],anchor=highlighted.request().postDataJSON().highlight;
  assert.equal(savedMark.id,anchor.id);assert.equal(anchor.page,2);assert.ok(anchor.text && 'Draft passage 2'.includes(anchor.text));
  assert.ok(anchor.rects.length && anchor.rects.every(r=>r.length===4&&r.every(n=>n>=0&&n<=1)&&r[2]>0&&r[3]>0));
  const card=el('#rRecords [data-rid="'+anchor.id+'"]'),field=card.locator('textarea');
  if(!await field.isVisible())await card.locator('[data-rv=edit]').click();
  await field.fill(memo);
  async function saveMemo(){
    let recorded=await after(response(first,'POST',base+'/records'),()=>field.press('Tab'));
    if(!recorded.ok()&&allowRetry) {
      const retry=el('#accountReaderNotice button').filter({hasText:'메모 다시 저장'});
      recorded=await after(response(first,'POST',base+'/records'),()=>retry.click());
    }
    return receipt(recorded);
  }
  const [associated,record]=await Promise.all([response(first,'POST',statePath,b=>b.link?.id===anchor.id),saveMemo()]);
  assert.deepEqual((await receipt(associated)).highlights,[{...anchor,record_id:record.record_id}]);
  await navigatePage(first,statePath,3);
  await el('#memoStatus').filter({hasText:'이제 닫아도 돼요'}).waitFor();
  const [catalog,links]=await Promise.all([response(second,'GET',base+'/papers'),response(second,'GET',base+'/paper-links'),second.page.reload()]);
  const rows=(await receipt(catalog)).papers;
  assert.deepEqual(rows.map(p=>p.document_use_id).sort(),[a.document_use_id,b.document_use_id].sort());
  const stored=rows.find(p=>p.document_use_id===a.document_use_id).artifacts.find(v=>v.artifact_id===id);
  assert.equal(stored.label_text,'판본.pdf');assert.equal(stored.pdf.sha256,hash);
  const [edge]=(await receipt(links)).links;
  assert.equal(edge.link_id,link.link_id);assert.equal(edge.reason_text,reason);
  await second.el('#tName').filter({hasText:project}).waitFor();
  await second.el('#vDot').click();
  for(const row of rows)await second.el('#dotsvg .dn[data-id="'+row.document_use_id+'"]').waitFor();
  await second.el('#dotsvg .dn[data-id="'+a.document_use_id+'"]').press('Enter');
  await second.el('#dotsvg .de.on[data-id="'+link.link_id+'"] .dlab').filter({hasText:reason}).waitFor();
  await second.el('#vList').click();
  for(const [row,title] of [[a,original],[b,other]])await second.el('[data-list-paper="'+row.document_use_id+'"]').filter({hasText:title}).waitFor();
  const [raw,state,resume]=await Promise.all([response(second,'GET',base+'/artifacts/'+id+'/pdf'),response(second,'GET',statePath),
    response(second,'GET',base+'/resume'),second.el('[data-list-paper="'+a.document_use_id+'"]').click()]);
  assert.ok(raw.ok());assert.deepEqual(await raw.body(),pdf);
  assert.deepEqual(await receipt(state),{last_page:3,highlights:[{...anchor,record_id:record.record_id}]});
  const [restored]=(await receipt(resume)).records;
  assert.equal(restored.record_id,record.record_id);assert.equal(restored.record.content_text,memo);
  assert.deepEqual(restored.context_refs.document_ids,[a.document_id]);assert.deepEqual(restored.context_refs.artifact_ids,[id]);
  await second.page.waitForFunction(()=>document.querySelector('#authWorkspace iframe')?.contentDocument.querySelector('#pvNum')?.value==='3');
  await second.el('.pgbox[data-n="3"] .textLayer span').filter({hasText:'Draft passage 3'}).first().waitFor();
  const restoredCard=second.el('#rRecords [data-rid="'+anchor.id+'"]');
  await restoredCard.locator('.rc-preview').filter({hasText:memo.trim()}).waitFor();
  assert.equal(await restoredCard.locator('.rv-quote mark').innerText(),anchor.text);
  assert.equal(await restoredCard.locator('textarea').inputValue(),memo);
  await second.el('.pgbox[data-n="2"] [data-hid="'+anchor.id+'"]').first().waitFor({state:'attached'});
  return {task:created.task_id,edition:id,anchor:anchor.id,record:record.record_id};
}
