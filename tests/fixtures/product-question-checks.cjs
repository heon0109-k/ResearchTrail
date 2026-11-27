// Draft SPEC §4.2. Called after PKCE login and navigation through the product paper controls.
const assert=require('node:assert/strict');

async function runProductQuestionChecks(page,el,qa) {
  const askCalls=()=>qa.rag().filter(c=>c.path.endsWith('/ask'));
  const status=message=>el('#rChat [role=status]').filter({hasText:message}).first().waitFor();
  const panel=el('#rChat');
  await el('#pvTot').filter({hasText:'34'}).waitFor();
  assert.equal(qa.rag().length,0);
  await el('[data-rtab="chat"]').click();
  await el('#chatConsent').waitFor();
  await el('#chatSaveKey').click();
  await el('#chatMsg').filter({hasText:'동의해 주세요'}).waitFor();
  assert.equal(qa.rag().filter(c=>c.body).length,0);
  await el('[data-chat-action="decline"]').click();
  await status(/보내지 않았어요/);
  await el('[data-chat-action="review"]').click();
  await el('#chatConsent').check();
  await el('#chatSaveKey').click();
  await el('[data-chat-action="retry-index"]').waitFor();
  await el('[data-chat-action="retry-index"]').click();
  await status(/준비됐어요/);
  assert.deepEqual(qa.rag().filter(c=>c.path.endsWith('/chunks')).map(c=>c.body.chunks[0].page),[1,33,33]);
  assert.equal(qa.chunks.length,34);
  assert.equal(qa.chunks[1].text,'Draft passage 2');
  await el('#chatClip').click();
  await el('.chat-pick').waitFor();
  await el('#chatClip').click();
  await el('.chat-effort summary').click();
  await el('.chat-effort input[value="medium"]').check();
  await status(/준비됐어요/);
  await el('#chatQ').fill('합성 질문');
  await el('#chatSend').click();
  await panel.locator('[role=alert]').waitFor();
  assert.equal(await el('#chatQ').inputValue(),'합성 질문');
  await el('#chatQ').press('Enter');
  const cite=el('#chatList button[data-chat-action="cite"]');
  await cite.waitFor();
  assert.deepEqual(askCalls().map(c=>[c.path,c.body.scope,c.body.answer_depth]),[
    ['/tasks/A/artifacts/draft/ask','open_pdf','medium'],['/tasks/A/artifacts/draft/ask','open_pdf','medium']
  ]);
  assert.match(await el('#chatList').innerText(),/Draft passage 2/);
  await cite.click();
  await page.waitForFunction(()=>document.querySelector('#authWorkspace iframe')?.contentDocument
    ?.querySelector('#pvNum')?.value==='2');
  await el('[data-rtab="notes"]').click();
}
module.exports={runProductQuestionChecks};
