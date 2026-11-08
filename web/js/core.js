'use strict';
var LABELW=120,AXISH=52,CW=184,CH=98,CMW=104,CMH=50,GAP=10;
var PAL=['#7c6bf0','#2fa598','#ee7a58','#4a9be8','#d9638c','#d9a032'];
var PX={B:'#2f9bee',D:'#1a6fb5',L:'#cfe9ff',K:'#0d2a40'};
var CHARS=[
 {id:'page',name:'페이지',rows:["............","..BBBBBB....","..BBBBBBDD..","..BBBBBBBLD.","..BKBBBBKBB.","..BKBBBBKBB.","..BBBBBBBBB.","..BLLLLLLBB.","..BBBBBBBBB.","..BLLLLBBBB.","..BBBBBBBBB.","...BB..BB...","...BB..BB..."]},
 {id:'blob',name:'말랑이',rows:["....BBBB....","...BBBBBB...","..BBBBBBBB..",".BBBBBBBBBB.",".BBKBBBBKBB.",".BBKBBBBKBB.",".BBBBBBBBBB.",".BBBBLLBBBB.","..BBBBBBBB..","...BBBBBB...","..DD....DD..","............"]},
 {id:'mark',name:'책갈피',rows:["............","...BBBBBB...","...BBBBBB...","...BKBBKB...","...BKBBKB...","...BBBBBB...","...BBLLBB...","...BBBBBB...","...BBBBBB...","...BBBBBB...","...BB..BB...","...B....B..."]}];
var ME=(function(){try{var o=JSON.parse(localStorage.getItem('researchtrail.me')||'null');if(o&&o.c>=0&&o.c<CHARS.length)return {c:o.c,nick:String(o.nick||'').slice(0,12)}}catch(e){}return {c:0,nick:''}})();
function saveMe(){try{localStorage.setItem('researchtrail.me',JSON.stringify(ME))}catch(e){}}
function curChar(){return CHARS[ME.c]||CHARS[0]}
function chPick(sel,sc){return CHARS.map(function(c,i){return '<button type="button" class="chp" data-c="'+i+'" aria-pressed="'+(i===sel)+'" aria-label="'+c.name+'">'+spr(c.rows,sc,'')+'<span>'+c.name+'</span></button>'}).join('')}

function spr(rows,sc,cls){var out='';rows.forEach(function(r,y){for(var x=0;x<r.length;x++){var c=r[x];if(c!=='.'&&PX[c])out+='<rect x="'+x+'" y="'+y+'" width="1.02" height="1.02" fill="'+PX[c]+'"/>'}});return '<svg class="spr '+(cls||'')+'" width="'+rows[0].length*sc+'" height="'+rows.length*sc+'" viewBox="0 0 '+rows[0].length+' '+rows.length+'" shape-rendering="crispEdges" aria-hidden="true">'+out+'</svg>'}
var NOTAG={id:'',name:'태그 없음',color:'#8b8b96'};
var STATES={skim:{g:'○',t:'읽을 것'},reading:{g:'◐',t:'읽는 중'},done:{g:'●',t:'다 읽음'}};
var UNKNOWN_READING_STATE={g:'?',t:'미기록/확인 필요'};
function readingStateKey(value){return typeof value==='string'&&Object.prototype.hasOwnProperty.call(STATES,value)?value:'unknown'}
function readingState(value){var key=readingStateKey(value);return key==='unknown'?UNKNOWN_READING_STATE:STATES[key]}
function stateOpts(sel){return '<option value=""'+(readingStateKey(sel)==='unknown'?' selected':'')+'>미기록/확인 필요</option>'+['skim','reading','done'].map(function(k){return '<option value="'+k+'"'+(k===sel?' selected':'')+'>'+STATES[k].t+'</option>'}).join('')}
function sg(k){return '<i class="sg sg-'+readingStateKey(k)+'" aria-hidden="true"></i>'}
function short(s,n){s=String(s||'');return s.length>n?s.slice(0,n)+'…':s}
var app=document.getElementById('app');
function $(s,r){return (r||document).querySelector(s)}
function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function dnum(s){var p=s.split('-').map(Number);return Date.UTC(p[0],p[1]-1,p[2])/864e5}
function dstr(n){var d=new Date(n*864e5);return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0')}
function todayStr(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
var uid=100;function nid(p){return p+(uid++)}
var WD=['일','월','화','수','목','금','토'];

var S={name:'',tags:[],papers:[],links:[],view:'card',bands:true,zoom:'month',sel:null,panel:'none',linking:null,hidden:new Set(),q:'',example:false,draft:null,why:false,judge:'',next:'',resumeOpen:true,prevSeen:0,saved:false};
var L={a:0,b:1,px:34,bandInfo:[],pos:{}};

function tagBy(id){return S.tags.filter(function(t){return t.id===id})[0]||NOTAG}
function paperBy(id){return S.papers.filter(function(p){return p.id===id})[0]}
function addTag(name){
  var n=(name||'').trim();if(!n)return NOTAG;
  var f=S.tags.filter(function(t){return t.name.toLowerCase()===n.toLowerCase()})[0];
  if(f)return f;
  var t={id:nid('t'),name:n,color:PAL[S.tags.length%PAL.length]};S.tags.push(t);return t;
}
function reset(){S.name='';S.tags=[];S.papers=[];S.links=[];S.view='card';S.bands=true;S.zoom='month';S.sel=null;S.panel='none';S.linking=null;S.hidden=new Set();S.q='';S.example=false;S.bubble=null;S.draft=null;S.judge='';S.next='';S.why=false;S.resumeOpen=true;D.pos=new Map();D.inited=false}

function loadSample(){
  reset();S.example=true;S.name='의료 논문 검색에 RAG를 쓰는 방법';
  var rag=addTag('RAG'),med=addTag('의료 LLM'),fm=addTag('기반 모델');
  var AX=[['Attention Is All','1706.03762'],['BERT: Pre','1810.04805'],['Retrieval-Augmented Generation for','2005.11401'],['Chain-of-Thought','2201.11903'],['Self-RAG','2310.11511']];
  function P(id,tag,date,title,memo){var lk='';AX.forEach(function(a){if(title.indexOf(a[0])===0)lk='https://arxiv.org/abs/'+a[1]});S.papers.push({id:id,tag:tag.id,date:date,title:title,memo:memo,link:lk})}
  P('s1',fm,'2026-09-14','Attention Is All You Need','트랜스포머 구조부터 다시 정리. 이후 모든 논문의 기준점.');
  P('s2',fm,'2026-09-17','BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding','인코더 사전학습 방식 확인. 의료 도메인 모델의 출발점.');
  P('s3',med,'2026-09-21','BioBERT: a pre-trained biomedical language representation model for biomedical text mining','BERT를 의학 논문 텍스트로 다시 학습하면 얼마나 오르는지 확인.');
  P('s4',rag,'2026-09-28','Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks','검색 결과를 근거로 답하게 하는 구조. 논문 요약 기능의 기본 틀로 삼기.');
  P('s5',med,'2026-10-05','Large language models encode clinical knowledge','임상 질문에 모델 단독으로 어디까지 답하는지. 근거 없는 답의 위험이 보임.');
  P('s6',fm,'2026-10-12','Chain-of-Thought Prompting Elicits Reasoning in Large Language Models','추론 단계를 풀어 쓰게 하는 방식. 탐색 이유 요약 프롬프트에 참고.');
  P('s7',rag,'2026-10-19','Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection','필요할 때만 검색하고 스스로 평가하는 구조. 신뢰도 표시 기능 아이디어.');
  P('s8',rag,'2026-10-27','From Local to Global: A Graph RAG Approach to Query-Focused Summarization','논문 간 관계를 그래프로 묶어 요약하는 방법. 탐색 그래프와 연결됨.');
  P('s9',med,'2026-11-01','Almanac: Retrieval-Augmented Language Models for Clinical Medicine','임상 질문에 RAG를 적용한 사례. 두 갈래가 여기서 만남.');
  function K(a,b,r){S.links.push({id:nid('l'),from:a,to:b,reason:r})}
  K('s1','s2','인코더만 쓰는 대표 모델이 궁금해서');
  K('s2','s3','의료 텍스트로 도메인 적응한 사례를 찾으려고');
  K('s3','s5','인코더 이후 생성형 의료 모델은 어떤지');
  K('s1','s4','RAG가 어떤 구조 위에 만들어졌는지');
  K('s4','s7','검색을 항상 하지 않는 방법을 찾으려고');
  K('s6','s7','추론 단계에 검색을 넣는 방법이 궁금해서');
  K('s7','s8','문서 하나가 아니라 전체를 묶는 방식은?');
  K('s5','s9','근거 없는 답을 검색으로 줄인 사례를 찾으려고');
  K('s4','s9','RAG를 의료에 적용한 사례');
  var stt={s1:'done',s2:'done',s3:'done',s4:'done',s5:'skim',s6:'reading',s7:'done',s8:'reading',s9:'done'};
  S.papers.forEach(function(p){p.state=stt[p.id]||'skim'});
  S.judge='검색을 항상 하지 않는 Self-RAG 방식이 우리 요약 기능에 더 맞아 보임. Almanac의 평가 방법은 아직 확인 못 함.';
  S.papers.forEach(function(p){if(p.id==='s9')p.todo='Almanac 논문에서 임상 질문 평가 방법만 먼저 읽고 메모하기'});
  S.papers.forEach(function(p){if(p.id==='s8'){p.page=7;p.total=26;p.todo='Table 2에서 비용·성능 비교 확인하기'}});
  S.papers.forEach(function(p){if(p.id==='s8'){p.hl=[{id:'h_ex1',page:4,text:'global sensemaking questions over entire text corpora',kind:'개념·방법',mine:'코퍼스 전체를 보고 답해야 하는 큰 질문',rects:[[.12,.22,.55,.03]]},{id:'h_ex2',page:4,text:'community detection with the Leiden algorithm',kind:'개념·방법',mine:'',stuck:'term',unsure:'왜 하필 커뮤니티로 나누는지',solved:false,rects:[[.12,.34,.5,.03]]}]}});
  showMain();
}
