// SPEC AC2/AC3, AC7 and NF6 regression proposals; team acceptance review pending.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const c = { URL };
vm.createContext(c);
for (const file of ['ai-stub.js', 'import.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/js', file), 'utf8'), c);
for (const memo of ['월요일부터 표 2 확인하기. 부록 비교하기.', '내일부터 표 2 확인하기. 부록 비교하기.', '표 2 확인 취소', '표 2 확인하지 않기', '"표 2 확인하기"는 참고용 예시일 뿐이야'])
  assert.equal(c.pickAction(memo).action, null, memo);
assert.equal(c.pickAction('표 2 확인하기. 부록 비교는 먼저 하기.').action, '부록 비교는 먼저 하기');
assert.equal(c.pickAction('표 2부터 확인하기. 부록 비교하기.').action, '표 2부터 확인하기');
assert.equal(c.pickAction('표 2 확인하기. 부록 비교 취소.').action, '표 2 확인하기');
for (const link of ['javascript:void(0)', 'data:text/html,hello', 'file:///tmp/a.pdf', 'java\nscript:void(0)', 'https://', 'javascript:arxiv.org/abs/2005.11401', 'data:10.1000/test']) {
  assert.equal(c.safeExternalUrl(link), null, link);
  assert.equal(c.parseRef(link).type, 'invalid', link);
  assert.equal(c.pdfUrlOf(link), '', link);
}
assert.equal(c.parseRef('2005.11401').type, 'arxiv');
assert.equal(c.parseRef('10.1000/test').type, 'doi');
assert.equal(c.parseRef('example.org/paper').url, 'https://example.org/paper');
assert.equal(c.safeExternalUrl('https://example.org/paper'), 'https://example.org/paper');
// Use the real detail-edit handler; invalid edits cannot replace an existing link.
c.$=()=>({setCustomValidity(){},reportValidity(){}});
c.save=()=>true;
vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/js/panel.js'),'utf8'),c);
const linked={link:'https://example.org/old'};
assert.equal(c.persistPaperLink(linked,'javascript:void(0)'),false);
assert.equal(linked.link,'https://example.org/old');
assert.equal(c.persistPaperLink(linked,'https://example.org/new'),true);
assert.equal(linked.link,'https://example.org/new');
(async () => {
  c.indexedDB = { open() { throw Error('denied'); } };
  const paper = {id:'p',pdf:true,fname:'old.pdf'};
  await assert.rejects(c.attachPaperPdf(paper,{name:'new.pdf'}));
  assert.equal(paper.fname,'old.pdf');
  const fresh = {id:'new'};
  await assert.rejects(c.attachPaperPdf(fresh,{name:'new.pdf'}));
  assert.equal(fresh.pdf,undefined);
  c.idbPut = () => Promise.resolve();
  await c.attachPaperPdf(fresh,{name:'new.pdf'});
  assert.equal(fresh.pdf,true);
  assert.equal(fresh.fname,'new.pdf');
  // Transaction aborts must reject rather than remain pending or appear successful.
  let transaction;
  c._db={transaction(){transaction={objectStore(){return {put(){}}}};return transaction}};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/js/import.js'),'utf8'),c);
  c._db={transaction(){transaction={objectStore(){return {put(){}}}};return transaction}};
  const aborted=c.idbPut('p',{});
  await Promise.resolve();
  transaction.onabort();
  await assert.rejects(aborted);
  console.log('PASS: action selection, unsafe URLs, PDF failure preservation, success and transaction abort.');
})().catch(error=>{console.error(error);process.exitCode=1});
