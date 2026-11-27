'use strict';
/* ---------- 툴팁: 브라우저 기본 회색 툴팁(title) 대신 앱의 검은 말풍선으로 ----------
   title이 달린 요소에 마우스를 올리면 title을 data-tt로 옮겨 기본 툴팁을 막고, 말풍선 하나를 요소 아래(공간이 없으면 위)에 띄운다.
   휴대폰처럼 마우스가 없는 기기에서는 아무것도 하지 않는다. 이미 data-tip(CSS 말풍선)이 있는 요소는 건드리지 않는다. */
(function(){
  if(typeof window==='undefined'||!window.matchMedia||window.matchMedia('(hover: none)').matches)return;
  var tip=null,cur=null,timer=0;
  function el(){if(!tip){tip=document.createElement('div');tip.className='app-tt';tip.setAttribute('role','tooltip');tip.hidden=true;document.body.appendChild(tip)}return tip}
  function hide(){clearTimeout(timer);timer=0;cur=null;if(tip)tip.hidden=true}
  function show(t){
    var text=t.getAttribute('data-tt');if(!text||!t.isConnected)return;
    var b=el();b.textContent=text;b.hidden=false;b.classList.remove('up');
    var r=t.getBoundingClientRect(),w=b.offsetWidth,h=b.offsetHeight,vw=window.innerWidth,vh=window.innerHeight;
    var left=Math.round(Math.min(Math.max(8,r.left+r.width/2-w/2),vw-w-8)),top=Math.round(r.bottom+6);
    if(top+h>vh-8){top=Math.round(r.top-h-6);b.classList.add('up')}
    b.style.left=left+'px';b.style.top=top+'px';
  }
  /* title을 data-tt로 옮긴다. 화면에 그려지는 즉시 옮겨서 기본 회색 툴팁이 뜰 틈을 없앤다. */
  function adopt(t){
    if(!t||t.nodeType!==1||!t.hasAttribute('title')||t.hasAttribute('data-tip')||t.tagName==='IFRAME'||(t.closest&&t.closest('svg')&&!t.closest('button,a')))return;
    var v=t.getAttribute('title');t.removeAttribute('title');if(!v)return;t.setAttribute('data-tt',v);
    /* 기본 툴팁을 없애도 화면 읽기 프로그램이 이름을 읽을 수 있게 */
    if(!t.hasAttribute('aria-label')&&!String(t.textContent||'').trim())t.setAttribute('aria-label',v);
  }
  function adoptAll(root){if(!root||!root.querySelectorAll)return;if(root.hasAttribute&&root.hasAttribute('title'))adopt(root);Array.prototype.forEach.call(root.querySelectorAll('[title]'),adopt)}
  adoptAll(document.body||document.documentElement);
  if(window.MutationObserver)new MutationObserver(function(list){
    list.forEach(function(m){if(m.type==='attributes')adopt(m.target);else Array.prototype.forEach.call(m.addedNodes,adoptAll)});
  }).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['title']});
  document.addEventListener('mouseover',function(e){
    var t=e.target&&e.target.closest&&e.target.closest('[title],[data-tt]');
    if(!t)return;adopt(t);if(!t.hasAttribute('data-tt'))return;
    if(t===cur)return;
    hide();cur=t;timer=setTimeout(function(){if(cur===t)show(t)},250);
  });
  document.addEventListener('mouseout',function(e){if(cur&&(!e.relatedTarget||!cur.contains(e.relatedTarget)))hide()});
  ['mousedown','scroll','keydown','blur'].forEach(function(ev){window.addEventListener(ev,hide,true)});
})();
