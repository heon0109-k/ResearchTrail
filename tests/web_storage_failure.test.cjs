// AC4/AC7 regression draft. Human review pending.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const nodes = new Map();
function element() {
  return {
    value: '', hidden: false, handlers: {},
    setAttribute() {}, focus() {},
    addEventListener(type, fn) { this.handlers[type] = fn; },
    remove() { nodes.delete('#' + this.id); },
    set innerHTML(html) {
      this.html = html;
      for (const id of ['naCand', 'naOk', 'naCancel', 'naMake']) nodes.delete('#' + id);
      for (const match of html.matchAll(/id="([^"]+)"/g)) {
        const node = element();
        const value = html.slice(match.index).match(/^id="[^"]+"[^>]*value="([^"]*)"/);
        if (value) node.value = value[1];
        nodes.set('#' + match[1], node);
      }
    },
  };
}
const box = element();
nodes.set('#naBox', box);
nodes.set('#rTodo', element());
const paper = { id: 'p1', note: '새 작업 확인하기', todo: '기존 작업', todoSrc: 'manual' };
let fail = false;
let persisted = null;
let writes = 0;
const c = {
  S: { papers: [paper], tags: [], links: [], example: false }, uid: 100,
  $: selector => nodes.get(selector) || null,
  esc: value => String(value == null ? '' : value),
  localStorage: {
    setItem(key, value) {
      writes++;
      if (fail) throw new Error('QuotaExceededError');
      persisted = JSON.parse(value);
    },
    getItem() { return null; },
  },
  document: { createElement: element, body: { appendChild(node) { nodes.set('#' + node.id, node); } } },
};
c.nid = prefix => prefix + c.uid++;
vm.createContext(c);
for (const name of ['helpers.js', 'next-action.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/js', name), 'utf8'), c);
}
assert.equal(c.save(), true);
assert.equal(persisted.papers[0].todo, '기존 작업');
fail = true;
assert.equal(c.save(), false);
assert.equal(c.S.saved, false);
assert.ok(nodes.get('#saveError'));
assert.match(nodes.get('#saveError').textContent, /저장/);
c.NA.pid = paper.id;
c.NA.st = 'cand';
c.NA.cand = '새 작업 확인하기';
c.NA.src = paper.note;
c.naRender(paper);
nodes.get('#naOk').handlers.click();
assert.equal(paper.todo, '기존 작업');
assert.equal(paper.todoSrc, 'manual');
assert.equal(paper.note, '새 작업 확인하기');
assert.equal(persisted.papers[0].todo, '기존 작업');
assert.equal(c.NA.st, 'cand');
assert.equal(nodes.get('#naCand').value, '새 작업 확인하기');
assert.doesNotMatch(box.html, /후보를 확인해 저장함/);
assert.match(box.html, /다시 저장/);
fail = false;
nodes.get('#naOk').handlers.click();
assert.equal(c.S.saved, true);
assert.equal(c.NA.st, 'idle');
assert.equal(persisted.papers[0].todo, '새 작업 확인하기');
assert.equal(persisted.papers[0].todoSrc, 'confirmed');
assert.equal(nodes.has('#saveError'), false);
assert.match(box.html, /후보를 확인해 저장함/);
const before = writes;
c.S.example = true;
assert.equal(c.save(), false);
assert.equal(writes, before);
console.log('PASS: failure warning, rollback, candidate preservation, retry persistence and demo isolation.');
