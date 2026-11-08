// Reading-state preservation regression; acceptance approval pending.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const stored = new Map();
const c = {localStorage: {getItem: k => stored.get(k) || null, setItem: (k,v) => stored.set(k,v)},
 document: {getElementById: () => null, querySelector: () => null}, D: {pos: new Map(), inited: false}};
vm.createContext(c);
for (const f of ['core.js','helpers.js','reader.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/js',f),'utf8'),c);
c.showMain = () => {}; c.renderAll = () => {}; c.renderRbar = () => {};
const expected = {skim:'읽을 것', reading:'읽는 중', done:'다 읽음'};
for (const [state,label] of Object.entries(expected)) assert.equal(c.readingState(state).t,label);
for (const state of [null,undefined,'','legacy-state','toString','__proto__','<img src=x onerror=alert(1)>']) {
 assert.equal(c.readingState(state).t,'미기록/확인 필요');
 assert.equal(c.readingStateKey(state),'unknown');
 assert.match(c.stateOpts(state), /value="" selected/);
 assert.doesNotMatch(c.stateOpts(state), /<img/);
 assert.match(c.sg(state), /sg-unknown/);
 const p = {id:'p1',title:'논문',date:'2026-11-08',state};
 stored.set(c.KEY,JSON.stringify({papers:[p],tags:[],links:[]}));
 assert.equal(c.load({timeline:true}),true);
 const preserved = state == null ? null : state;
 assert.equal(c.S.papers[0].state,preserved);
 c.openReader('p1');
 assert.equal(c.S.papers[0].state,preserved,'opening reader must not invent a known state');
 assert.equal(c.save(),true);
 assert.equal(JSON.parse(stored.get(c.KEY)).papers[0].state,preserved);
 assert.equal(c.load({timeline:true}),true);
 assert.equal(c.S.papers[0].state,preserved,'roundtrip must preserve unknown raw value');
}
console.log('PASS: missing/legacy/prototype-like states, safe labels, reader entry and persistence roundtrip.');
