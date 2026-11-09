// Draft UI regression: current year/month remains visible through month/year boundaries.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const label={textContent:''},sc={scrollLeft:0};const c={S:{view:'card'},L:{a:Date.parse('2026-10-01')/864e5,px:34,scale:1},LABELW:120,$:s=>s==='#timelineMonth'?label:sc};vm.createContext(c);
const source=fs.readFileSync('web/js/timeline.js','utf8');vm.runInContext(source.slice(source.indexOf('function updateVisibleMonth(){'),source.indexOf('function updateMinimapWin(){')),c);
c.updateVisibleMonth();assert.equal(label.textContent,'2026.10');sc.scrollLeft=31*34;c.updateVisibleMonth();assert.equal(label.textContent,'2026.11');sc.scrollLeft=123*34;c.updateVisibleMonth();assert.equal(label.textContent,'2027.02');
console.log('PASS: pinned month label tracks month and year crossings without changing records.');
