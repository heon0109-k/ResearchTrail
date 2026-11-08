// AC4/AC5/AC6 regression draft: per-paper next action is the shared source. Human review pending.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const nodes = new Map();
function element() {
  return {
    value: '', handlers: {}, querySelector: () => null,
    addEventListener(type, fn) { this.handlers[type] = fn; },
    set innerHTML(html) {
      this.html = html;
      for (const match of html.matchAll(/id="([^"]+)"/g)) {
        const node = element();
        const tail = html.slice(match.index);
        const input = tail.match(/^id="[^"]+"[^>]*value="([^"]*)"/);
        const textarea = tail.match(/^id="[^"]+"[^>]*>([^<]*)<\/textarea>/);
        if (input) node.value = input[1];
        if (textarea) node.value = textarea[1];
        nodes.set('#' + match[1], node);
      }
    },
    focus() {},
  };
}
for (const id of ['resume', 'rbar', 'naBox', 'rTodo']) nodes.set('#' + id, element());
const stored = new Map();
const c = {
  document: { getElementById: () => null, querySelector: s => nodes.get(s) || null },
  localStorage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) },
  D: { pos: new Map(), inited: false },
};
vm.createContext(c);
for (const name of ['core.js', 'helpers.js', 'next-action.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/js', name), 'utf8'), c);
}
c.showMain = () => {};
c.S.papers = [
  { id: 'a', title: '논문 A', date: '2026-11-07', state: 'reading', todo: 'A 표 확인', lastReadOrder: 2 },
  { id: 'b', title: '논문 B', date: '2026-11-06', state: 'reading', todo: 'B 부록 확인', lastReadOrder: 1 },
];
c.S.next = '이전 전체 작업 메모';
assert.equal(c.save(), true);
c.renderResume();
c.renderRbar();
assert.equal(nodes.get('#rsNext').value, 'A 표 확인');
assert.ok(nodes.get('#resume').html.includes('이전 전체 메모'));
assert.ok(nodes.get('#resume').html.includes('이전 전체 작업 메모'));
assert.ok(nodes.get('#rbar').html.includes('A 표 확인'));
assert.ok(!nodes.get('#rbar').html.includes('이전 전체 작업 메모'));
nodes.get('#rsNext').value = 'A 새 작업';
nodes.get('#rsNext').handlers.input();
assert.equal(c.S.papers[0].todo, 'A 새 작업');
assert.equal(c.S.papers[1].todo, 'B 부록 확인');
assert.equal(c.S.next, '이전 전체 작업 메모');
assert.equal(JSON.parse(stored.get(c.KEY)).papers[0].todoSrc, 'manual');
c.NA.pid = 'a'; c.NA.st = 'cand'; c.NA.cand = 'A 후보 확인'; c.NA.src = 'A 후보 확인';
c.naRender(c.S.papers[0]);
nodes.get('#naOk').handlers.click();
c.renderResume(); c.renderRbar();
assert.equal(nodes.get('#rsNext').value, 'A 후보 확인');
assert.equal(nodes.get('#rTodo').value, 'A 후보 확인');
assert.ok(nodes.get('#rbar').html.includes('A 후보 확인'));
assert.equal(c.load({ timeline: true }), true);
assert.equal(c.S.papers[0].todo, 'A 후보 확인');
assert.equal(c.S.next, '이전 전체 작업 메모');
c.S.papers[0].todo = '';
c.renderResume(); c.renderRbar();
assert.equal(nodes.get('#rsNext').value, '');
assert.ok(!nodes.get('#rbar').html.includes('이전 전체 작업 메모'));
c.S.papers[1].lastReadOrder = 3;
c.renderResume();
assert.equal(nodes.get('#rsNext').value, 'B 부록 확인');
console.log('PASS: shared per-paper action, manual and confirmed saves, legacy preservation and paper isolation.');
