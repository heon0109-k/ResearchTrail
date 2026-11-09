// Draft AC4/UI regression: one explicit click starts the local stub; confirmation remains separate.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let calls=0,renders=0;const p={note:'부록 확인하기',todo:'기존 다음 작업'};
const c={NA:{st:'idle'},naInput:()=>({text:p.note}),naConsent:()=>false,naRender(){renders++},naRun(){calls++;c.NA.st='loading';return Promise.resolve()}};vm.createContext(c);
const source=fs.readFileSync('web/js/next-action.js','utf8');vm.runInContext(source.slice(source.indexOf('function naStart(p){'),source.indexOf('function naRun(p){')),c);
c.naStart(p);assert.equal(calls,1);assert.notEqual(c.NA.st,'consent');assert.equal(p.todo,'기존 다음 작업');c.naStart(p);assert.equal(calls,1,'repeated loading click does not start another request');
c.NA.st='idle';p.note='   ';c.naStart(p);assert.equal(calls,1);assert.equal(c.NA.st,'empty');assert.equal(renders,1);
console.log('PASS: first click executes without notice gate, duplicate loading blocked, empty memo blocked, todo unchanged.');
