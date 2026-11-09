// Draft UI regression: the overview minimap pans without changing the fit scale.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sc={clientWidth:1000,scrollLeft:0},c={S:{view:'card',zoom:'all'},L:{a:10,b:110,panPadding:500,scale:.7,px:10},$:()=>sc,updateMinimapWin(){}};vm.createContext(c);
const source=fs.readFileSync('web/js/timeline.js','utf8');
vm.runInContext(source.slice(source.indexOf('function scrollToDay(day){'),source.indexOf('function rpath(')),c);
vm.runInContext(source.slice(source.indexOf('function minimapRange(){'),source.indexOf('function renderMinimap(){')),c);
c.scrollToDay(60);assert.equal(sc.scrollLeft,500);c.scrollToDay(85);assert.equal(sc.scrollLeft,750);c.scrollToDay(35);assert.equal(sc.scrollLeft,250);assert.equal(c.L.scale,.7);assert.equal(JSON.stringify(c.minimapRange()),'[-40,160]');
console.log('PASS: centered overview, left/right panning, unchanged scale and padded minimap range.');
