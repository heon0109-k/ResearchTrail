// 형광펜 사각형: 같은 줄은 하나로 합치고(겹침·띄어쓰기 빈틈 제거), 단 사이처럼 크게 벌어진 곳은 나눈다.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('web/js/pdf-viewer.js','utf8');const i=src.indexOf('function mergeLineRects('),j=src.indexOf('function fitInk(');
const c={};vm.createContext(c);vm.runInContext(src.slice(i,j),c);
const r=c.mergeLineRects([[0.516,0.492,0.095,0.016],[0.539,0.494,0.072,0.013],[0.557,0.492,0.054,0.016],[0.516,0.514,0.026,0.016],[0.545,0.514,0.005,0.016],[0.558,0.514,0.069,0.016]]);
assert.equal(r.length,2,'두 줄 → 사각형 2개');
assert.ok(Math.abs(r[0][0]-0.516)<1e-9&&Math.abs(r[0][0]+r[0][2]-0.611)<1e-9,'첫 줄은 겹친 조각을 덮는 하나');
assert.ok(Math.abs(r[1][0]+r[1][2]-0.627)<1e-9,'둘째 줄은 띄어쓰기 빈틈 없이 끝까지');
const cols=c.mergeLineRects([[0.08,0.5,0.38,0.015],[0.52,0.5,0.38,0.015]]);
assert.equal(cols.length,2,'같은 높이라도 단이 다르면 합치지 않는다');
console.log('PASS: 형광펜 줄 단위 합치기와 단 구분');
