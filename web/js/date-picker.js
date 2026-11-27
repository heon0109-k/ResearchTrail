'use strict';
/* ---------- 날짜 고르기 달력 ----------
   브라우저 기본 달력(영어, 모양을 못 바꿈) 대신 앱 디자인에 맞춘 작은 한국어 달력을 띄운다.
   - 페이지의 모든 <input type="date">를 누르면 이 달력이 열린다(직접 타이핑은 그대로 된다).
   - 다른 곳에서 열 때는 dpOpen(input, 기준 요소)을 부른다.
   - 날짜를 고르면 input 값을 바꾸고 input·change 이벤트를 보내므로, 저장 로직은 그대로다. */
var DP={el:null,input:null,anchor:null,y:0,m:0};

function dpPad(n){return (n<10?'0':'')+n}
function dpYmd(y,m,d){return y+'-'+dpPad(m+1)+'-'+dpPad(d)}
function dpParse(v){var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v||''));return m?{y:+m[1],m:+m[2]-1,d:+m[3]}:null}

function dpClose(){
  if(!DP.el)return;
  DP.el.remove();DP.el=null;
  document.removeEventListener('pointerdown',dpOutside,true);
  window.removeEventListener('resize',dpClose);
  if(DP.anchor&&DP.anchor.setAttribute)DP.anchor.setAttribute('aria-expanded','false');
  DP.input=null;DP.anchor=null;
}
function dpOutside(e){if(DP.el&&!DP.el.contains(e.target)&&!(DP.anchor&&DP.anchor.contains(e.target)))dpClose()}

function dpRender(){
  var el=DP.el;if(!el)return;
  var cur=dpParse(DP.input.value),now=new Date(),today=dpYmd(now.getFullYear(),now.getMonth(),now.getDate());
  var first=new Date(DP.y,DP.m,1).getDay(),days=new Date(DP.y,DP.m+1,0).getDate(),cells='';
  for(var i=0;i<first;i++)cells+='<span></span>';
  for(var d=1;d<=days;d++){
    var v=dpYmd(DP.y,DP.m,d),cls='dp-day'+(cur&&v===dpYmd(cur.y,cur.m,cur.d)?' is-sel':'')+(v===today?' is-today':'');
    cells+='<button type="button" class="'+cls+'" data-dp="'+v+'" aria-label="'+(DP.m+1)+'월 '+d+'일">'+d+'</button>';
  }
  el.innerHTML='<div class="dp-head"><b>'+DP.y+'년 '+(DP.m+1)+'월</b><span><button type="button" class="dp-nav" data-dp-nav="-1" aria-label="이전 달">‹</button><button type="button" class="dp-nav" data-dp-nav="1" aria-label="다음 달">›</button></span></div>'+
    '<div class="dp-week" aria-hidden="true"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>'+
    '<div class="dp-grid">'+cells+'</div>'+
    '<div class="dp-foot"><button type="button" data-dp="'+today+'">오늘</button></div>';
}
function dpPlace(){
  var el=DP.el,r=DP.anchor.getBoundingClientRect(),w=el.offsetWidth,h=el.offsetHeight;
  var left=Math.max(8,Math.min(r.left,window.innerWidth-w-8));
  var top=r.bottom+4;if(top+h>window.innerHeight-8&&r.top-h-4>8)top=r.top-h-4;
  el.style.left=left+'px';el.style.top=top+'px';
}
function dpPick(v){
  var input=DP.input;if(!input)return;
  input.value=v;
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
  var back=DP.anchor;dpClose();if(back&&back.isConnected&&back.focus)back.focus();
}
function dpOpen(input,anchor){
  if(!input)return;
  if(DP.el&&DP.input===input){dpClose();return}
  dpClose();
  var cur=dpParse(input.value),now=new Date();
  DP.input=input;DP.anchor=anchor||input;DP.y=cur?cur.y:now.getFullYear();DP.m=cur?cur.m:now.getMonth();
  var el=document.createElement('div');el.className='dp';el.setAttribute('role','dialog');el.setAttribute('aria-label','날짜 고르기');
  DP.el=el;(input.closest?.('dialog[open]') || document.body).appendChild(el);dpRender();dpPlace();
  if(DP.anchor.setAttribute)DP.anchor.setAttribute('aria-expanded','true');
  el.addEventListener('click',function(e){
    var nav=e.target.closest('[data-dp-nav]');
    if(nav){DP.m+=+nav.dataset.dpNav;if(DP.m<0){DP.m=11;DP.y--}if(DP.m>11){DP.m=0;DP.y++}dpRender();return}
    var day=e.target.closest('[data-dp]');if(day)dpPick(day.dataset.dp);
  });
  el.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();var back=DP.anchor;dpClose();if(back&&back.focus)back.focus()}});
  setTimeout(function(){document.addEventListener('pointerdown',dpOutside,true)},0);
  window.addEventListener('resize',dpClose);
}

if(typeof document!=='undefined'&&document.addEventListener){
  /* 날짜 칸을 마우스로 누르면 기본 달력 대신 이 달력을 연다.
     mousedown을 막아야 브라우저 기본 달력이 몰래 열렸다가 닫히면서 값을 되돌리지 않는다. */
  document.addEventListener('mousedown',function(e){
    var input=e.target&&e.target.closest&&e.target.closest('input[type="date"]');
    if(input&&!input.disabled&&!input.readOnly)e.preventDefault();
  },true);
  document.addEventListener('click',function(e){
    var input=e.target&&e.target.closest&&e.target.closest('input[type="date"]');
    if(!input||input.disabled||input.readOnly)return;
    e.preventDefault();dpOpen(input,input);
  },true);
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&DP.el&&!DP.el.contains(e.target))dpClose();
  });
}
if(typeof module!=='undefined'&&module.exports)module.exports={dpOpen:dpOpen,dpClose:dpClose,DP:DP};
