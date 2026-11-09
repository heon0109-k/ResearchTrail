// Draft UI regression: nearby cards need an outside route, not a compressed vertical arrow.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c={};vm.createContext(c);const source=fs.readFileSync('web/js/timeline.js','utf8');vm.runInContext(source.slice(source.indexOf('function rpath('),source.indexOf('function renderCards(){')),c);
const A={x:100,y:100,w:184,h:94},B={x:140,y:204,w:184,h:94};
let r=c.route(A,B);assert.ok(r.d.endsWith('L329,251'),'tight gap enters the target from its right, five pixels away');assert.ok(r.d.includes('348'),'outside corridor clears both right edges');
r=c.route(B,A);assert.ok(r.d.endsWith('L289,147'),'reverse connection also stays outside');
r=c.route(A,{x:140,y:300,w:184,h:94});assert.ok(r.d.endsWith('L232,295'),'large vertical gap enters above target');
r=c.route(A,{x:400,y:100,w:184,h:94});assert.ok(r.d.endsWith('L395,147'),'separated cards enter target from left');
console.log('PASS: close-card outside corridor, reversed edge and normal vertical/horizontal approaches.');
