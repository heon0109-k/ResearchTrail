// Draft navigation regression: reload restores view; new navigation opens timeline.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const main=fs.readFileSync('web/js/main.js','utf8');
function nav(type){let option;vm.runInNewContext(main,{window:{name:''},location:{search:''},performance:{getEntriesByType:()=>[{type}]},load:o=>{option=o;return true}});return option}
assert.equal(nav('reload').timeline,false);assert.equal(nav('reload').restoreView,true);assert.equal(nav('navigate').timeline,true);assert.equal(nav('back_forward').timeline,true);
console.log('PASS: reload-only view restoration and fresh-navigation timeline.');
