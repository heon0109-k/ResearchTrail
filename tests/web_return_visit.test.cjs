// Regression draft for startup navigation. Human approval pending.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/js/main.js'), 'utf8');
function visit({ seen = false, saved = false, demo = false } = {}) {
  const calls = [];
  const context = {
    window: { name: '' }, location: { search: demo ? '?demo=1' : '' },
    document: { documentElement: { classList: { add() {} } } }, S: {},
    load: (options) => { calls.push(['load', options]); return saved; },
    landingSeen: () => seen, landingMark: () => calls.push(['mark']),
    startEmpty: () => calls.push(['timeline']), showLanding: () => calls.push(['landing']),
    loadSample: () => calls.push(['demo']), renderAll() {},
  };
  vm.runInNewContext(source, context);
  return calls;
}
assert.equal(visit().filter(c => c[0] === 'landing').length, 1);
assert.equal(visit().filter(c => c[0] === 'mark').length, 1);
assert.equal(visit({ seen: true }).filter(c => c[0] === 'timeline').length, 1);
const restored = visit({ saved: true });
assert.equal(restored[0][1].timeline, true);
assert.equal(restored.some(c => c[0] === 'timeline' || c[0] === 'landing'), false);
assert.equal(visit({ demo: true }).some(c => c[0] === 'mark' || c[0] === 'load'), false);
console.log('PASS: first visit, repeat visit, saved restore and embedded demo startup.');
