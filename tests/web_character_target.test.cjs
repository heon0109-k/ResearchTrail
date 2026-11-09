// Resume-card/character alignment regression. Acceptance approval pending.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const canvas={style:{},innerHTML:'',querySelector:()=>null},scroller={clientHeight:600};
const c={document:{getElementById:()=>null,querySelector:s=>s==='#canvas'?canvas:s==='#scroller'?scroller:null},localStorage:{getItem:()=>null}};
vm.createContext(c);
for(const file of ['core.js','helpers.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/js',file),'utf8'),c);
c.visible=()=>true;c.matches=()=>true;c.bandList=()=>[{id:'*',name:'전체',color:'#888'}];
c.rng=()=>[c.dnum('2026-08-01'),c.dnum('2026-12-01')];c.ppd=()=>34;
const source=fs.readFileSync(path.join(__dirname,'../web/js/timeline.js'),'utf8');
vm.runInContext(source.slice(source.indexOf('function renderCards(){'),source.indexOf('/* 말풍선 밖')),c);
function verify(expected){
 c.renderCards();
 const who=canvas.innerHTML.match(/<div class="who"[^>]*>/g)||[];
 assert.equal(who.length,c.S.papers.length?1:0);
 if(!expected)return;
 assert.match(who[0],new RegExp('data-paper-id="'+expected+'"'));
 const pos=c.L.pos[expected];assert.ok(who[0].includes('left:'+(pos.x+pos.w-34)+'px'));
 const card=canvas.innerHTML.match(new RegExp('<div class="card[^>]*data-id="'+expected+'"[^>]*>'))[0];
 assert.ok(card.includes(c.paperBy(expected).state==='reading'?' go':' last'));
}
c.S.papers=[{id:'old',title:'이전에 등록한 논문',date:'2026-09-01',state:'reading',lastReadOrder:2},{id:'new',title:'최근 등록한 논문',date:'2026-11-08',state:'reading',lastReadOrder:1}];
verify('old');c.S.papers[1].lastReadOrder=3;verify('new');
c.S.papers[0].lastReadOrder=4;c.S.papers[0].state='done';verify('new'); // Done papers are no longer resume targets (user-requested policy).
c.S.papers=c.S.papers.filter(p=>p.id!=='old');verify('new');
c.S.papers[0].lastReadOrder=0;verify('new');
c.S.papers=[];verify(null);
console.log('PASS: character/card target agreement, older-paper revisit, target change, done state, deletion and legacy fallback.');
