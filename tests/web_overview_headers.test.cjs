// Draft UI regression: transformed overview headers stay at viewport edges.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sc={scrollLeft:320,scrollTop:180},sheet={style:{setProperty(){}}},axis={style:{}},corner={style:{}},label={style:{}},dot={style:{}},month={style:{}},tick={style:{}},today={style:{}};
const c={S:{zoom:'all'},L:{scale:2},AXISH:52,LABELW:120,$:s=>s==='#scroller'?sc:s==='.overview-sheet'?sheet:s==='.axis'?axis:s==='.acorner'?corner:s==='i'?dot:null,$$:s=>s==='.blabel'?[label]:s==='.mo'?[month]:s==='.tk'?[tick]:s==='.tdlab'?[today]:[]};vm.createContext(c);
const source=fs.readFileSync('web/js/timeline.js','utf8');vm.runInContext(source.slice(source.indexOf('function pinOverviewHeaders(){'),source.indexOf('function updateMinimapWin(){')),c);c.pinOverviewHeaders();assert.equal(axis.style.top,'90px');assert.equal(corner.style.left,'160px');assert.equal(label.style.left,'160px');assert.equal(label.style.width,'60px');assert.equal(tick.style.height,'9px');assert.equal(month.style.fontSize,'6px');
console.log('PASS: inverse-scaled header position, label width and readable axis geometry.');
