// Draft regression for the requested highlight controls; SPEC AC6/AC7 context preservation.
// Team acceptance review pending. No model calls or meaning-quality assertions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const c={};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/js/pdf-viewer.js'),'utf8'),c);
for(const h of [{id:'text',page:2,text:'Original sentence',mine:'내 이해',unsure:'남겨 둔 질문',rects:[[.1,.2,.3,.04]]},{id:'image',page:4,text:'',img:'data:image/png;base64,test',kind:'그래프·표',mine:'내 이해',unsure:'남겨 둔 질문',rects:[[.1,.2,.3,.04]]}]){
 const original=JSON.stringify(h);
 for(const reason of ['term','eq','why','bg']){
  assert.equal(c.setHighlightStuck(h,reason),true);assert.equal(h.stuck,reason);assert.equal(h.solved,false);
  h.solved=true;assert.equal(c.setHighlightStuck(h,reason),true);assert.equal(h.solved,true);
 }
 assert.equal(c.setHighlightStuck(h,'unknown'),false);assert.equal(h.stuck,'bg');
 assert.equal(c.setHighlightStuck(h,''),true);assert.equal(h.solved,false);
 const kept={...h};delete kept.stuck;delete kept.solved;assert.equal(JSON.stringify(kept),original);
 c.setHighlightStuck(h,'eq');const prompt=c.stuckPrompt({title:'Test paper'},h);
 assert.ok(prompt.includes('수식이 안 읽혀요'));assert.ok(prompt.includes(h.unsure));
 assert.equal(prompt.includes('캡처 이미지를 이 질문과 함께 첨부합니다'),!!h.img);
}
console.log('PASS: text/capture reason selection, change/clear, resolved-state rules, preserved image/context and capture question guidance.');
