// Draft UI regression for the single-click resume flow.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const listeners = [];
const scroller = {
  addEventListener(type, handler) {
    if (type === 'click') listeners.push(handler);
  }
};
const paper = { id: 'saved-paper', state: 'reading' };
const state = { papers: [paper], bubble: paper.id, sel: null, reader: null };
const context = vm.createContext({
  S: state,
  $: () => scroller,
  document: { addEventListener() {}, createElement: () => ({}), body: { appendChild() {} } },
  window: { addEventListener() {} },
  paperBy: id => id === paper.id ? paper : null
});
for (const file of ['timeline.js', 'reader.js', 'frame.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/js', file), 'utf8'), context);
}
context.renderAll = () => {};
context.wireScroller();
const bubble = {};
const bubbleClick = { target: { closest: selector => selector === '#rbub' ? bubble : null } };
const backgroundClick = { target: { closest: () => null } };

// The button opens the reader before its click bubbles to the scroller.
context.openReader(state.bubble);
listeners.forEach(handler => handler(bubbleClick));
assert.equal(state.reader, paper.id, 'one click in the resume bubble keeps the reader open');

state.reader = null;
state.panel = 'detail';
listeners.forEach(handler => handler(backgroundClick));
assert.equal(state.panel, 'none', 'a click on the timeline background still closes the detail panel');
console.log('PASS: resume click keeps the reader open and background click closes the detail panel.');
