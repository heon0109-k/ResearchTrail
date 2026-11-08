// Startup scroll visibility regression draft; team review pending.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const sc = {clientWidth: 800, clientHeight: 500, scrollWidth: 3000, scrollHeight: 1600, scrollLeft: 0, scrollTop: 0};
const q = {x: 1200, y: 600, w: 184, h: 98};
const c = {S: {view: 'card', zoom: 'month', panel: 'none'}, L: {pos: {p: q}}, LABELW: 120, AXISH: 52,
  $: selector => selector === '#scroller' ? sc : null, curPaper: () => ({id: 'p'}), updateMinimapWin() {}, setTimeout};
vm.createContext(c);
for (const [file, start, end] of [['timeline.js','function focusStart(){','function scrollToDay('], ['frame.js','function ensureVisible(id){','function visible(']]) {
 const source = fs.readFileSync(path.join(__dirname, '../web/js', file), 'utf8');
 vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), c);
}
function check(saved, panel = 'none') {
 c.S.scroll = saved; c.S.panel = panel; c.focusStart();
 assert.ok(q.x >= sc.scrollLeft + c.LABELW, 'card hidden behind tag labels');
 assert.ok(q.x + q.w <= sc.scrollLeft + sc.clientWidth - (panel === 'none' ? 0 : 372), 'card right edge clipped');
 assert.ok(q.y >= sc.scrollTop + c.AXISH, 'card hidden behind date axis');
 assert.ok(q.y + q.h <= sc.scrollTop + sc.clientHeight, 'card bottom clipped');
}
check({l: 1150, t: 620, z: 'month'});
check({l: 0, t: 0, z: 'month'});
check({l: 2000, t: 1000, z: 'month'});
check({l: 850, t: 400, z: 'month'});
assert.equal(sc.scrollLeft, 850, 'keep a saved position when card is already fully visible');
assert.equal(sc.scrollTop, 400);
check(null);
check({l: 0, t: 0, z: 'month'}, 'detail');
console.log('PASS: clipped/offscreen saved positions, visible-position preservation, initial focus and detail panel.');
