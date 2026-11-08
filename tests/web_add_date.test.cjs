// Regression draft for the user-requested date default. Human approval pending.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/js/frame.js'), 'utf8');
const context = {
  S: {},
  document: { addEventListener() {} },
  todayStr: () => '2026-11-07',
  $: () => null,
};
vm.createContext(context);
vm.runInContext(source, context);
context.renderAll = () => {};
for (const draft of [null, { date: '1970-01-13', tag: 't1' }]) {
  context.openAdd(draft);
  assert.equal(context.S.draft.date, '2026-11-07');
  if (draft) assert.equal(context.S.draft.tag, 't1');
}
console.log('PASS: both add entry paths default to today; tag preserved.');
