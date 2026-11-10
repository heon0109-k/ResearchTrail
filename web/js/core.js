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

var S={overviewPan:0,listQuery:'',listScroll:0,overviewZoom:1,filterTag:null,name:'',tags:[],papers:[],links:[],view:'card',bands:true,zoom:'month',sel:null,panel:'none',linking:null,hidden:new Set(),q:'',example:false,draft:null,why:false,judge:'',next:'',resumeOpen:true,prevSeen:0,saved:false};
var L={a:0,b:1,px:34,bandInfo:[],pos:{}};

function tagBy(id){return S.tags.filter(function(t){return t.id===id})[0]||NOTAG}
function paperBy(id){return S.papers.filter(function(p){return p.id===id})[0]}
function addTag(name){
  var n=(name||'').trim();if(!n)return NOTAG;
  var f=S.tags.filter(function(t){return t.name.toLowerCase()===n.toLowerCase()})[0];
  if(f)return f;
  var t={id:nid('t'),name:n,color:PAL[S.tags.length%PAL.length]};S.tags.push(t);return t;
}
function reset(){S.timelineRange=null;S.overviewPan=0;S.listQuery='';S.listScroll=0;S.overviewZoom=1;S.filterTag=null;S.name='';S.tags=[];S.papers=[];S.links=[];S.view='card';S.bands=true;S.zoom='month';S.sel=null;S.panel='none';S.linking=null;S.hidden=new Set();S.q='';S.example=false;S.bubble=null;S.draft=null;S.judge='';S.next='';S.why=false;S.resumeOpen=true;D.pos=new Map();D.inited=false}

function loadSample(){
  reset();S.example=true;S.name='의료 논문 검색에 RAG를 쓰는 방법';
  var rag=addTag('RAG'),med=addTag('의료 LLM'),fm=addTag('기반 모델');
  function P(id,tag,date,state,page,reason,notes,todo,resources){
    var source=SAMPLE_PAPERS[id];
    S.papers.push({
      id:id,tag:tag.id,date:date,title:source.title,memo:reason,link:source.source,
      state:state,page:page,total:source.pages||null,todo:todo,todoSrc:'manual',
      hl:notes.map(function(note,i){return {id:id+'-note-'+(i+1),type:'note',page:note[0],text:'',mine:note[1],rects:[]}}),
      resources:resources
    });
  }
  function capture(p,id,page,file,title,memo,rect){
    p.hl.unshift({id:id,page:page,text:title,img:'assets/papers/captures/'+file+'.png',kind:'그래프·표',mine:memo,rects:[rect]});
  }
  function code(url){return {kind:'code',url:url}}
  function data(url,page){return {kind:'data',url:url,page:page||null}}
  P('s1',fm,'2026-09-14','done',null,'랩미팅에서 검색 모델과 생성 모델을 설명할 때, Transformer 구조 그림부터 보고 용어를 정리하려고 저장.',[
    [null,'그림 1에서 왼쪽이 인코더, 오른쪽이 디코더. 디코더의 encoder–decoder attention은 인코더 출력을 참조함.'],
    [null,'그림에 있는 self-attention과 encoder–decoder attention이 아직 헷갈림. 발표 전에 그림 1에 둘을 다른 색으로 표시해 두기.']
  ],'그림 1에서 두 attention이 참조하는 입력을 색으로 구분하기',[
    code('https://github.com/tensorflow/tensor2tensor'),data('https://www.statmt.org/wmt14/translation-task.html')
  ]);
  P('s2',fm,'2026-09-17','done',7,'BioBERT 비교 실험에서 일반 도메인 기준선을 잡으려고 BERT의 사전학습과 QA 평가 방식을 먼저 읽음.',[
    [4,'MLM은 가린 단어를 앞뒤 문맥으로 맞히는 학습. 논문 검색 자체를 학습했다는 뜻은 아님.'],
    [7,'표 2·3은 SQuAD 1.1과 2.0. 두 점수를 같은 조건처럼 비교하지 말고 버전부터 표시해 두자.']
  ],'표 2·3에서 SQuAD 버전별 EM·F1을 기준선 표에 구분해 적기',[
    code('https://github.com/google-research/bert'),data('https://rajpurkar.github.io/SQuAD-explorer/')
  ]);
  P('s3',med,'2026-09-21','done',6,'일반 BERT 대신 생의학 텍스트로 사전학습한 모델을 쓰면 문헌 질의응답에 어떤 차이가 있는지 보려고 저장.',[
    [2,'모델 구조를 새로 만든 게 아니라 BERT에서 출발해 PubMed 초록이나 PMC 전문으로 추가 사전학습하는 방식.'],
    [4,'표 5에서 BioASQ 4b·5b·6b에 쓰인 질문 수를 확인함. 결과를 비교할 땐 어느 버전인지 먼저 적어 두기.']
  ],'6쪽 표 8에서 BioASQ 6b의 BERT·BioBERT 점수를 같은 지표끼리 비교하기',[
    code('https://github.com/dmis-lab/biobert'),data('https://github.com/dmis-lab/biobert#datasets')
  ]);
  P('s4',rag,'2026-09-28','done',null,'의료 논문 QA 실험에서 기본 RAG를 비교군으로 두려면 검색기와 생성기가 어떻게 연결되는지 알아야 해서 저장.',[
    [null,'RAG-Sequence는 출력 전체에 같은 검색 문서를 가정하고, RAG-Token은 토큰마다 다른 문서를 고려할 수 있음.'],
    [null,'논문은 Wikipedia를 쓰지만 우리 실험은 의료 문헌이라 인덱스를 그대로 쓰기 어려움. 코드에서 검색 코퍼스만 교체할 수 있는지 확인 필요.']
  ],'RAG 예제에서 의료 문헌으로 검색 코퍼스를 바꾸는 입력 형식 확인하기',[
    code('https://github.com/huggingface/transformers-research-projects/tree/main/rag'),data('https://huggingface.co/datasets/facebook/wiki_dpr')
  ]);
  P('s5',med,'2026-10-05','reading',5,'의료 QA 비교표를 만들기 전에 MultiMedQA가 어떤 문제들로 구성되는지 확인하려고 저장.',[
    [2,'MultiMedQA는 여러 데이터셋을 묶은 벤치마크. 논문 하나의 정확도로 합쳐 쓰면 비교 조건을 놓칠 수 있음.'],
    [5,'MedQA·MedMCQA의 객관식 문제와 PubMedQA의 예·아니오·판단 유보 문제는 출력 형식이 다름. 우리 실험은 객관식 하나부터 시작하는 게 좋을 듯.']
  ],'5쪽에서 객관식 데이터셋의 문제 형식과 평가 지표를 비교표에 적기',[
    data('https://github.com/jind11/MedQA'),data('https://github.com/medmcqa/medmcqa'),data('https://github.com/pubmedqa/pubmedqa')
  ]);
  P('s6',fm,'2026-10-12','reading',3,'검색 문헌을 붙이는 효과와 풀이 예시를 보여 주는 효과를 구분하려고 CoT의 비교 조건을 찾아둠.',[
    [2,'그림 2는 GSM8K에서 모델 크기에 따라 풀이 예시 효과가 다를 수 있음을 보여 줌.'],
    [3,'3.1절에서 수학 문제 벤치마크를 확인함. 의료 QA에도 같은 효과가 있는지는 별도 비교가 필요함.']
  ],'1쪽 그림 1을 참고해 풀이 예시 유무만 바꾼 프롬프트 두 개 만들기',[
    data('https://github.com/openai/grade-school-math')
  ]);
  P('s7',rag,'2026-10-19','done',8,'질문마다 문헌을 검색하는 방식과 필요할 때만 검색하는 방식을 비교하고 싶어서 저장.',[
    [4,'표 1에서 검색할지 결정하는 토큰과, 검색 뒤 문서가 관련 있는지 평가하는 토큰이 따로 나옴.'],
    [8,'논문 결과 표는 태스크가 여러 개라 우선 의료와 가까운 PubHealth만 따로 볼 것. 검색 안 함·항상 검색·필요할 때 검색 설정은 코드에서 확인 필요.']
  ],'Self-RAG 코드에서 세 가지 검색 모드의 실행 옵션 비교하기',[
    code('https://github.com/AkariAsai/self-rag'),data('https://huggingface.co/datasets/selfrag/selfrag_train_data')
  ]);
  P('s8',rag,'2026-10-27','reading',7,'개별 질문 검색은 기본 RAG로 두고, 의료 논문 여러 편의 공통 주제를 묻는 질문에 GraphRAG가 맞는지 보려고 저장.',[
    [6,'3.1절의 평가 자료는 팟캐스트와 뉴스. 우리 의료 논문에도 잘 된다고 아직 판단할 수 없음.'],
    [7,'3.3절에서 C0~C3는 커뮤니티 요약 수준만 다르고 TS는 원문에 맵-리듀스, SS는 검색한 텍스트 조각을 넣는 조건까지 확인함.'],
    [7,'조건별로 모델에 실제로 어떤 문맥을 넣는지 한눈에 안 보임. 다음에 7쪽 3.3절을 보면서 TS·SS의 문맥 구성 차이를 랩미팅 비교표에 적기.']
  ],'7쪽 3.3절에서 TS와 SS의 문맥 구성 차이를 비교표에 적기',[
    code('https://github.com/microsoft/graphrag'),data('https://github.com/yixuantt/MultiHop-RAG',6)
  ]);
  P('s9',med,'2026-11-01','done',10,'의료 QA 답변이 맞는지뿐 아니라 인용이 실제로 답을 뒷받침하는지도 평가하고 싶어서 저장.',[
    [5,'객관식 시험 대신 개방형 ClinicalQA를 사용. 우리 비교표에서도 문제 유형과 평가 항목을 먼저 분리해 두기.'],
    [10,'데이터 공개 범위를 확인함. 전체 ClinicalQA는 요청이 필요하고, 우선 부록 A에 실린 질문 예시부터 볼 수 있음.']
  ],'부록 A에서 출처 확인이 필요한 질문 예시 3개를 골라 평가표에 옮기기',[
    data('https://arxiv.org/pdf/2303.01229v2#page=11',11)
  ]);
  function K(a,b,r){S.links.push({id:nid('l'),from:a,to:b,reason:r})}
  K('s1','s2','Transformer 그림을 보고 인코더만 쓰는 BERT의 입력·출력과 비교하려고.');
  K('s2','s3','BERT 기준선을 잡고 나서 생의학 문헌을 추가로 학습했을 때 QA 결과가 어떻게 달라지는지 보려고.');
  K('s3','s5','BioASQ 결과를 정리하다가 생성형 의료 모델은 어떤 QA 데이터와 평가 방식을 쓰는지 궁금해짐.');
  K('s1','s4','인코더와 디코더 역할을 정리했으니, 기본 RAG에서 검색 결과가 생성기에 어디로 들어가는지 보려고.');
  K('s4','s7','기본 RAG를 비교군으로 두고, 검색이 필요할 때만 검색하는 조건도 추가할 수 있는지 보려고.');
  K('s6','s7','프롬프트의 풀이 예시와 모델의 검색 여부 판단을 비교표에서 분리해 두려고.');
  K('s7','s8','Self-RAG를 개별 질문용으로 읽다가, 여러 문헌의 공통 주제를 묻는 질문도 평가해 보고 싶어짐.');
  K('s5','s9','MultiMedQA의 객관식 평가를 보고, 개방형 의료 질문의 사실성과 출처는 어떻게 평가하는지도 보려고.');
  K('s4','s9','Wikipedia를 쓰는 기본 RAG와 달리 의료 자료를 어디서 가져오고 어떤 답을 평가하는지 비교하려고.');
  var graph=paperBy('s8');
  graph.todoSrc='ai';
  graph.actionHistory=[{
    id:'s8-demo-ai-action',kind:'ai',created_at:Date.parse('2026-11-11T00:38:00+09:00'),
    original_candidate:graph.todo,final_action:graph.todo,
    source_record_ids:['s8-note-2','s8-note-3'],model:'gemini-3.5-flash-lite'
  }];
  graph.hl.unshift(
    {id:'h_ex1',page:1,text:'global sensemaking questions over datasets',kind:'개념·방법',mine:'여기서 말하는 큰 질문은 한 문단에서 답을 찾는 게 아니라 자료 전체를 훑어 공통 주제를 정리하는 질문.',rects:[[0.289347,0.714532,0.284406,0.011246]]},
    {id:'h_ex2',page:4,text:'In our pipeline, we use Leiden',kind:'개념·방법',mine:'Leiden으로 관련 개체들을 먼저 묶음. 묶음 단위가 달라지면 요약에 어떤 차이가 생기는지는 결과에서 확인해야 함.',rects:[[0.394134,0.689431,0.202296,0.011246]]}
  );
  capture(graph,'s8-capture-pipeline',2,'graphrag-pipeline','그림 1 · GraphRAG 처리 흐름',
    '보라색 단계에서 문서와 커뮤니티를 미리 정리하고, 초록색 단계에서 질문에 답함. 실험 비용을 적을 때 두 단계를 나눠야겠다.',[137/816,88/1056,542/816,396/1056]);
  capture(graph,'s8-capture-results',9,'graphrag-results','그림 4 · 조건별 평가 결과',
    '뉴스 결과에서 포괄성하고 직접성의 승률이 다르게 보임. 표에 옮기기 전에 행이 이긴 비율이라는 점부터 표시해 두기.',[137/816,88/1056,542/816,451/1056]);
  capture(paperBy('s3'),'s3-capture-qa',6,'biobert-qa-results','표 8 · BioASQ 질의응답 결과',
    'S, L, M이 각각 엄격 정확도, 완화 정확도, 평균 역순위임. 랩미팅에선 우선 6b의 S만 같은 열끼리 비교하자.',[76/817,72/1055,662/817,235/1055]);
  capture(paperBy('s6'),'s6-capture-prompt',1,'cot-prompt-example','그림 1 · 일반 프롬프트와 풀이 예시 비교',
    '같은 문제라도 앞에 보여 주는 예시에 풀이가 있느냐가 다름. 우리 비교에서는 문헌 검색 조건은 그대로 두고 예시만 바꿔 보자.',[137/816,600/1056,542/816,301/1056]);
  if(typeof aiMemoHash==='function')graph.actionHistory[0].source_memo_hash=aiMemoHash(aiSources(graph));
  showMain();
}
