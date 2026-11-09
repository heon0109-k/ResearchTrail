// Draft UI regression: list supplements the timeline without altering records.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c={S:{filterTag:null,papers:[{id:'b',title:'BERT',date:'2026-10-01',tag:'a',lastReadOrder:3,todo:'表確認'},{id:'c',title:'Clinical paper',date:'2026-11-08',tag:'b',lastReadOrder:0},{id:'a',title:'Earlier reading',date:'2026-09-01',tag:'a',lastReadOrder:5},{id:'d',title:'New unread',date:'2026-11-07',tag:'a'}]},visible:p=>c.S.filterTag==null||p.tag===c.S.filterTag};vm.createContext(c);vm.runInContext(fs.readFileSync('web/js/paper-list.js','utf8'),c);
const original=JSON.stringify(c.S.papers);
assert.equal(c.paperListItems('')[0].id,'a');assert.equal(c.paperListItems('')[1].id,'b');assert.equal(c.paperListItems('')[2].id,'c');assert.equal(c.paperListItems('  bert  ')[0].id,'b');assert.equal(c.paperListItems('missing').length,0);
c.S.filterTag='a';assert.equal(c.paperListItems('').length,3);assert.equal(c.paperListItems('clinical').length,0);assert.equal(JSON.stringify(c.S.papers),original);
console.log('PASS: recent-read then date/id ordering, title search, tag filtering and unchanged records.');
