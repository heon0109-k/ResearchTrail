// AC5 resume-selection regression draft. Human review pending.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const stored = new Map();
const c = {
  localStorage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) },
  document: { getElementById: () => null, querySelector: () => null },
  D: { pos: new Map(), inited: false },
};
vm.createContext(c);
for (const name of ['core.js', 'helpers.js', 'reader.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/js', name), 'utf8'), c);
}
c.renderAll = () => c.save();
c.renderRbar = () => {};
c.ensureVisible = () => {};
c.showMain = () => {};
const papers = () => [
  { id: 'older', date: '2026-09-01', state: 'reading', title: '오래된 논문' },
  { id: 'newer', date: '2026-11-07', state: 'reading', title: '최근 등록 논문' },
];
c.S.papers = papers();
assert.equal(c.curPaper().id, 'newer'); // No history: retain the legacy fallback.
c.openReader('older');
assert.equal(c.curPaper().id, 'older');
assert.equal(c.S.papers[0].lastReadOrder, 1);
c.closeReader();
c.reset();
assert.equal(c.load({ timeline: true }), true);
assert.equal(c.S.reader, null);
assert.equal(c.curPaper().id, 'older'); // Restored independently of the open reader.
c.openReader('newer');
c.openReader('older');
assert.equal(c.S.papers[0].lastReadOrder, 3);
assert.equal(c.curPaper().id, 'older');
c.S.papers = c.S.papers.filter(p => p.id !== 'older');
assert.equal(c.curPaper().id, 'newer'); // Deleting the last reader falls back to remaining history.
stored.set(c.KEY, JSON.stringify({ papers: papers(), reader: 'older' }));
assert.equal(c.load({ timeline: true }), true);
assert.equal(c.curPaper().id, 'older'); // Legacy saved reader is usable evidence of a prior open.
stored.set(c.KEY, JSON.stringify({ papers: papers() }));
assert.equal(c.load({ timeline: true }), true);
assert.equal(c.curPaper().id, 'newer');
c.S.papers = [];
assert.equal(c.curPaper(), undefined);
console.log('PASS: last-open selection, persistence, repeated opens, deletion, legacy records and empty state.');
