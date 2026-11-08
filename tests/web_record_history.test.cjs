// AC4/AC7 history regression draft. Human review pending.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const nodes = new Map();
function element() {
  return {
    value: '', handlers: {}, childIds: [],
    querySelector: selector => nodes.get(selector) || null,
    querySelectorAll: () => [],
    setAttribute() {}, removeAttribute() {}, focus() {},
    addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); },
    emit(type) { for (const fn of this.handlers[type] || []) fn({ target: this }); },
    remove() { nodes.delete('#' + this.id); },
    set innerHTML(html) {
      this.html = html;
      for (const id of this.childIds) nodes.delete('#' + id);
      this.childIds = [];
      for (const match of html.matchAll(/id="([^"]+)"/g)) {
        const node = element();
        const value = html.slice(match.index).match(/^id="[^"]+"[^>]*value="([^"]*)"/);
        if (value) node.value = value[1];
        this.childIds.push(match[1]);
        nodes.set('#' + match[1], node);
      }
    },
  };
}
for (const id of ['rdnotes', 'rdTitle', 'rdOpen']) nodes.set('#' + id, element());
const stored = new Map();
let fail = false;
const c = {
  URL,
  document: {
    getElementById: () => null,
    querySelector: selector => nodes.get(selector) || null,
    querySelectorAll: () => [],
    createElement: element,
    body: { appendChild(node) { nodes.set('#' + node.id, node); } },
  },
  localStorage: {
    getItem: key => stored.get(key) || null,
    setItem(key, value) { if (fail) throw new Error('QuotaExceededError'); stored.set(key, value); },
  },
  D: { pos: new Map(), inited: false }, pdfUrlOf: () => '', drawHlList() {},
};
vm.createContext(c);
for (const name of ['core.js', 'helpers.js', 'import.js', 'next-action.js', 'reader.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/js', name), 'utf8'), c);
}
c.showMain = () => {};
const paper = { id: 'p1', title: '검증용 논문', date: '2026-11-07', state: 'reading', note: '기존 원문 메모', todo: '이전 작업' };
c.S.papers = [paper]; c.S.reader = paper.id;
c.renderRNotes();
assert.equal(paper.noteHistory.length, 1);
assert.equal(paper.actionHistory[0].kind, 'legacy');
assert.equal(paper.actionHistory[0].created_at, null);
assert.equal(paper.actionHistory[0].original_candidate, undefined);
const originalVersion = JSON.stringify(paper.noteHistory[0]);
const noteInput = nodes.get('#rNote');
for (const text of ['수', '수정', '수정한 원문 메모. 부록 확인하기']) {
  noteInput.value = text;
  noteInput.emit('input');
}
assert.equal(paper.noteHistory.length, 1); // Draft keystrokes do not create permanent versions.
noteInput.emit('change');
assert.equal(paper.noteHistory.length, 2);
assert.equal(JSON.stringify(paper.noteHistory[0]), originalVersion);
c.aiSuggest = memo => Promise.resolve({ ok: true, action: '부록 확인하기', source: memo });
(async () => {
  await c.naRun(paper);
  assert.equal(paper.noteHistory.length, 2);
  const candidate = paper.actionHistory.find(entry => entry.kind === 'candidate');
  const originalCandidate = JSON.stringify(candidate);
  assert.equal(candidate.source_record_id, paper.noteHistory[1].id);
  assert.equal(candidate.source_note, '수정한 원문 메모. 부록 확인하기');
  nodes.get('#naCand').value = '부록의 retriever 설정 확인하기';
  nodes.get('#naCand').emit('input');
  const beforeFailure = stored.get(c.KEY);
  const firstConfirm = nodes.get('#naOk').handlers.click[0];
  fail = true;
  nodes.get('#naOk').emit('click');
  assert.equal(stored.get(c.KEY), beforeFailure);
  assert.equal(paper.todo, '이전 작업');
  assert.equal(paper.actionHistory.filter(entry => entry.kind === 'confirmed').length, 0);
  const confirmationId = c.NA.confirmationId;
  fail = false;
  nodes.get('#naOk').emit('click');
  const confirmed = paper.actionHistory.find(entry => entry.kind === 'confirmed');
  assert.equal(confirmed.id, confirmationId);
  assert.equal(confirmed.candidate_id, candidate.id);
  assert.equal(confirmed.source_record_id, paper.noteHistory[1].id);
  assert.equal(confirmed.original_candidate, '부록 확인하기');
  assert.equal(confirmed.final_action, '부록의 retriever 설정 확인하기');
  assert.equal(JSON.stringify(candidate), originalCandidate);
  firstConfirm(); // A stale repeated click cannot create a second confirmed event.
  assert.equal(paper.actionHistory.filter(entry => entry.kind === 'confirmed').length, 1);
  const confirmationCount = paper.actionHistory.length;
  await c.naRun(paper);
  nodes.get('#naCancel').emit('click');
  assert.equal(paper.actionHistory.length, confirmationCount + 1);
  assert.equal(paper.todo, '부록의 retriever 설정 확인하기');

  let resolvePending;
  c.aiSuggest = () => new Promise(resolve => { resolvePending = resolve; });
  const requestNote = paper.note;
  const pending = c.naRun(paper);
  noteInput.value = '변경한 새 메모 <script>원문 그대로</script>';
  noteInput.emit('input'); noteInput.emit('change');
  resolvePending({ ok: true, action: '부록 확인하기', source: requestNote });
  await pending;
  const latest = paper.actionHistory.at(-1);
  assert.equal(latest.source_note, requestNote);
  assert.notEqual(latest.source_note, paper.note);
  assert.ok(nodes.get('#naBox').html.includes('생성 요청 당시 메모'));
  assert.ok(nodes.get('#rHistory').html.includes('&lt;script&gt;'));
  assert.ok(!nodes.get('#rHistory').html.includes('<script>'));

  const queue = [];
  c.aiSuggest = () => new Promise(resolve => queue.push(resolve));
  const firstRequest = c.naRun(paper);
  const secondRequest = c.naRun(paper);
  const historyCount = paper.actionHistory.length;
  queue[0]({ ok: true, action: '늦게 도착한 이전 후보', source: paper.note });
  await firstRequest;
  assert.equal(paper.actionHistory.length, historyCount);
  queue[1]({ ok: true, action: '현재 요청의 후보', source: paper.note });
  await secondRequest;
  assert.equal(paper.actionHistory.length, historyCount + 1);
  nodes.get('#naCancel').emit('click');
  c.aiSuggest = () => Promise.reject(new Error('transport failure'));
  const beforeError = paper.actionHistory.length;
  await c.naRun(paper);
  assert.equal(c.NA.st, 'fail');
  assert.equal(paper.actionHistory.length, beforeError);
  c.save();
  const storedNoteCount = paper.noteHistory.length;
  const storedActionCount = paper.actionHistory.length;
  assert.equal(c.load({ timeline: true }), true);
  const restored = c.S.papers[0];
  assert.equal(restored.noteHistory.length, storedNoteCount);
  assert.equal(restored.actionHistory.length, storedActionCount);
  assert.equal(restored.actionHistory.find(entry => entry.kind === 'confirmed').original_candidate, '부록 확인하기');
  assert.equal(restored.actionHistory.find(entry => entry.kind === 'confirmed').final_action, '부록의 retriever 설정 확인하기');
  c.rememberNote(restored, '');
  assert.equal(restored.noteHistory.at(-1).content_text, '');
  assert.equal(restored.noteHistory[0].content_text, '기존 원문 메모');
  console.log('PASS: note versions, immutable candidates, edited confirmations, rollback/retry, cancellation, async isolation, escaping and reload.');
})().catch(error => { console.error(error); process.exitCode = 1; });
