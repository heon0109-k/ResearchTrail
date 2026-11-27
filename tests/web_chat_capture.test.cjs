// 캡처한 표·그림으로 질문하기: 캡처 영역 안 글자와 가까운 캡션을 모으고, 질문 프롬프트에 자료로 붙인다.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c={module:{exports:{}},console};vm.createContext(c);
vm.runInContext(fs.readFileSync('web/js/chat.js','utf8'),c);
const m=c.module.exports;
const items=[
  {s:'Table 2: Accuracy on MedQA',x:0.12,y:0.30},{s:'by model size.',x:0.12,y:0.315},
  {s:'Model',x:0.15,y:0.34,w:0.04},{s:'Acc',x:0.40,y:0.34,w:0.02},{s:'Flan-PaLM',x:0.15,y:0.36,w:0.06},{s:'67.6',x:0.40,y:0.36,w:0.03},
  {s:'Unrelated body text far below',x:0.12,y:0.80},{s:'Figure 9: other',x:0.55,y:0.95}
];
const got=m.chatCaptureItems(items,[0.13,0.33,0.35,0.05]);
assert.match(got.text,/Model Acc Flan-PaLM 67\.6/,'캡처 영역 안 글자를 위→아래, 왼→오른 순서로');
assert.doesNotMatch(got.text,/Unrelated/);
assert.match(got.caption,/^Table 2: Accuracy on MedQA by model size\./,'가장 가까운 Table 캡션');
const block=m.chatCaptureBlock({page:5,kind:'그래프·표',caption:got.caption,text:got.text,mine:'정확도 비교'});
assert.match(block,/<첨부한 캡처 p\.5/);assert.match(block,/학생 메모: 정확도 비교/);
const prompt=m.chatPrompt({title:'T'},{pages:[{n:5,text:'body'}],currentPage:5},[],'이 표 설명해 줘',null,{page:5,kind:'그래프·표',caption:'',text:'',mine:''});
assert.match(prompt,/<첨부한 캡처 p\.5/);assert.match(prompt,/그림이라 글자가 거의 없음/);
assert.doesNotMatch(m.chatPrompt({title:'T'},{pages:[{n:1,text:'b'}]},[],'q',null),/첨부한 캡처 p\./,'첨부가 없으면 블록도 없다');
const two=m.chatCaptureItems([{s:'Left A',x:0.20,y:0.60,w:0.2},{s:'Right A',x:0.55,y:0.60,w:0.2},{s:'Left B',x:0.20,y:0.62,w:0.2},{s:'Right B',x:0.55,y:0.62,w:0.2},{s:'Left C',x:0.20,y:0.64,w:0.2},{s:'Right C',x:0.55,y:0.64,w:0.2},{s:'Header across both',x:0.20,y:0.58,w:0.55}],[0.15,0.55,0.7,0.2]);
assert.equal(two.text,'Header across both | Left A Left B Left C | Right A Right B Right C','좌우 두 칸은 왼쪽 칸을 먼저(가운데를 걸친 제목이 하나 있어도)');
console.log('PASS: 캡처 질문 자료(영역 글자·캡션·메모) 구성');
