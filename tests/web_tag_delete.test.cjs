// Draft UI regression: explicitly requested tag-only and cascading deletion.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c={document:{addEventListener(){}},S:{},D:{pos:new Map()},NA:{},save:()=>true,renderAll(){},toast(){},idbDel:id=>c.deleted.push(id),deleted:[]};vm.createContext(c);
const src=fs.readFileSync('web/js/frame.js','utf8');vm.runInContext(src.slice(src.indexOf('function applyTagDeletion(')),c);
function seed(){c.deleted=[];Object.assign(c.S,{example:false,papers:[{id:'a',tag:'t',note:'memo',hl:[{mine:'original'}],actionHistory:[{text:'history'}]},{id:'b',tag:'u',note:'other'}],tags:[{id:'t'},{id:'u'}],links:[{from:'a',to:'b'},{from:'b',to:'b'}],sel:'a',reader:'a',bubble:'a',panel:'detail',filterTag:'t',hidden:new Set(),linking:{from:'a'}});c.NA={pid:'a',requestId:'pending',st:'loading'}}
seed();assert.equal(c.applyTagDeletion('t',false),true);assert.equal(c.S.papers.length,2);assert.equal(c.S.papers[0].tag,'');assert.equal(c.S.papers[0].note,'memo');assert.equal(c.S.papers[0].hl[0].mine,'original');assert.equal(c.S.links.length,2);assert.equal(c.deleted.length,0);
seed();assert.equal(c.applyTagDeletion('t',true),true);assert.equal(c.S.papers.length,1);assert.equal(c.S.papers[0].id,'b');assert.equal(c.S.links.length,1);assert.equal(c.S.reader,null);assert.equal(c.S.sel,null);assert.equal(c.NA.requestId,null);assert.deepEqual(c.deleted,['a']);
seed();c.save=()=>false;assert.equal(c.applyTagDeletion('t',true),false);assert.equal(c.S.papers.length,2);assert.equal(c.S.tags.length,2);assert.equal(c.S.links.length,2);assert.equal(c.deleted.length,0);assert.equal(c.NA.requestId,'pending');
seed();c.S.example=true;assert.equal(c.applyTagDeletion('t',true),true);assert.equal(c.deleted.length,0,'demo deletion cannot remove personal PDF files');
console.log('PASS: tag-only preservation, isolated cascade, pending request invalidation, save rollback and demo PDF isolation.');
