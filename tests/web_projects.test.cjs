// 프로젝트별 논문 관리: 기존 기록은 첫 프로젝트로 그대로 보이고, 프로젝트끼리 기록·논문 번호가 섞이지 않는다.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function boot(store){
  const ls={getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};
  const c={localStorage:ls,sessionStorage:{removeItem(){},getItem:()=>null,setItem(){}},document:{getElementById:()=>null},window:{},KEY:'researchtrail.v5',STORE_REVISION:null,uid:100,
    S:{example:false,papers:[],name:''},D:{pos:new Map()},deleted:[],idbDel:id=>c.deleted.push(id),
    reset(){c.S.papers=[];c.S.name='';c.S.tags=[]},showMain(){},renderAll(){},
    save(){c.store[c.KEY]=JSON.stringify({name:c.S.name,papers:c.S.papers,uid:c.uid,storageRevision:1});return true},
    load(){const raw=c.store[c.KEY];if(!raw)return false;const o=JSON.parse(raw);c.S.name=o.name;c.S.papers=o.papers;c.uid=Math.max(c.uid,o.uid||0);return true},
    clearStore(){delete c.store[c.KEY]},store};
  vm.createContext(c);vm.runInContext(fs.readFileSync('web/js/projects.js','utf8'),c);return c;
}
// 1) 기존 사용자: 기록이 그대로 첫 프로젝트가 된다(키를 옮기지 않음).
const store={'researchtrail.v5':JSON.stringify({name:'캡스톤 연구',papers:[{id:'p120',pdf:true}],uid:130})};
const before=store['researchtrail.v5'];
let c=boot(store);
assert.equal(c.KEY,'researchtrail.v5');
assert.equal(store['researchtrail.v5'],before,'기존 기록은 바뀌지 않는다');
assert.equal(JSON.parse(store['researchtrail.projects']).list[0].name,'캡스톤 연구');
c.load();assert.equal(c.S.papers.length,1);
// 2) 새 프로젝트를 만들고 바꾸면 빈 타임라인이 그 이름으로 열리고, 저장 키가 따로다.
const id=c.projCreate('  수업   발표 ');assert.ok(id);
assert.equal(c.projSwitch(id),true);
assert.equal(c.S.name,'수업 발표');assert.equal(c.S.papers.length,0);
assert.notEqual(c.KEY,'researchtrail.v5');
assert.equal(JSON.parse(store['researchtrail.v5']).papers.length,1,'다른 프로젝트 기록은 그대로');
// 3) 다시 켜도 지금 프로젝트가 유지되고, 논문 번호는 모든 프로젝트의 최댓값부터 이어진다.
c=boot(store);
assert.equal(c.KEY,JSON.parse(store['researchtrail.projects']).list[1].key);
assert.equal(c.uid,130,'PDF 저장 키가 겹치지 않게 가장 큰 번호부터');
// 3-1) 타임라인 이름을 바꿔 저장하면 프로젝트 목록 이름도 따라간다.
c.S.name='발표 준비';c.save();assert.equal(JSON.parse(store['researchtrail.projects']).list[1].name,'발표 준비');
// 4) 이름 바꾸기: 지금이 아닌 프로젝트도 저장된 이름이 바뀐다. 빈 이름은 거절.
assert.equal(c.projRename('p0','캡스톤 최종'),true);
assert.equal(JSON.parse(store['researchtrail.v5']).name,'캡스톤 최종');
assert.equal(c.projRename('p0','   '),false);
// 5) 삭제: 지금 프로젝트를 지우면 다른 프로젝트로 옮겨 가고, 그 프로젝트의 PDF도 지운다. 마지막 하나는 못 지운다.
c.projSwitch('p0');
assert.equal(c.projDelete('p0'),true);
assert.equal(store['researchtrail.v5'],undefined);
assert.deepEqual(c.deleted,['p120']);
assert.equal(JSON.parse(store['researchtrail.projects']).list.length,1);
const lastId=JSON.parse(store['researchtrail.projects']).list[0].id,lastKey=JSON.parse(store['researchtrail.projects']).list[0].key;
c.S.papers=[{id:'p131',pdf:true}];c.save();
assert.equal(c.projDelete(lastId),true,'마지막 프로젝트를 지우면 빈 타임라인으로 다시 시작');
assert.deepEqual(JSON.parse(store['researchtrail.projects']).list.map(x=>x.name),['내 타임라인']);
assert.equal(c.S.papers.length,0);assert.ok(c.deleted.includes('p131'));assert.equal(JSON.parse(store[lastKey]).papers.length,0);
// 6) 처음 쓰는 사람: 기록이 없어도 '내 타임라인' 프로젝트 하나로 시작한다.
const fresh={};c=boot(fresh);
assert.deepEqual(JSON.parse(fresh['researchtrail.projects']).list.map(x=>x.name),['내 타임라인']);
console.log('PASS: 프로젝트 생성·전환·이름 바꾸기·삭제, 기존 기록 보존, 논문 번호 충돌 방지');
