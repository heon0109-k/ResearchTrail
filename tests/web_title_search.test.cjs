// Draft AC6/UI regression: registered papers remain discoverable without reading notes.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c={S:{papers:[{id:'bert',title:'BERT: Pre-training of Deep Bidirectional Transformers',note:'',hl:[]},{id:'other',title:'Attention Is All You Need',note:'BERT is mentioned here'}],filterTag:null},visible:p=>c.S.filterTag==null||p.id===c.S.filterTag};vm.createContext(c);vm.runInContext(fs.readFileSync('web/js/find.js','utf8'),c);
assert.equal(c.findPapers('bert').length,1);assert.equal(c.findPapers('  BeRt  ')[0].id,'bert');assert.equal(c.findPapers('not registered').length,0);assert.equal(c.findPapers('').length,0);
c.S.filterTag='other';assert.equal(c.findPapers('bert').length,0);assert.equal(c.S.papers[0].note,'');assert.equal(c.S.papers[0].hl.length,0);
console.log('PASS: title-only discovery, case/space handling, no false memo-title match, tag scope and unchanged records.');
