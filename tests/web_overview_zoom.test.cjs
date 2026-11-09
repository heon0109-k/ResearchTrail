// Draft UI regression: explicit user-requested overview zoom controls.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sc={scrollLeft:0,scrollTop:0,clientWidth:1000,clientHeight:700};let saved=0;
const c={S:{zoom:'all',view:'card',overviewZoom:1},L:{scale:.5},$:()=>sc,renderCards(){c.L.scale=.5*c.S.overviewZoom},renderRbar(){},renderMinimap(){},save(){saved++}};vm.createContext(c);
const source=fs.readFileSync('web/js/timeline.js','utf8');vm.runInContext(source.slice(source.indexOf('function adjustOverviewZoom('),source.indexOf('function focusStart(){')),c);
c.adjustOverviewZoom(1);assert.equal(c.S.overviewZoom,1.25);assert.equal(sc.scrollLeft,125);assert.equal(sc.scrollTop,87.5);
for(let i=0;i<30;i++)c.adjustOverviewZoom(1);assert.equal(c.S.overviewZoom,4);
for(let i=0;i<30;i++)c.adjustOverviewZoom(-1);assert.equal(c.S.overviewZoom,1);
c.adjustOverviewZoom(1);c.adjustOverviewZoom(0);assert.equal(c.S.overviewZoom,1);assert.equal(sc.scrollLeft,0);assert.equal(sc.scrollTop,0);
const before=saved;c.S.zoom='month';c.adjustOverviewZoom(1);assert.equal(saved,before);
console.log('PASS: centered magnification, bounds, fit reset, save and overview-only controls.');
