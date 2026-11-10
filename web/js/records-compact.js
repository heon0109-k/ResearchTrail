'use strict';
/* ---------- 읽기 기록 접힌 목록 ----------
   메모가 많아져도 패널이 길어지지 않게, 평소엔 "p.4 · 메모 한두 줄"만 보여 주고
   누른 메모만 펼쳐서 종류·편집칸을 보여 준다.
   - 새로 만든 빈 메모(형광펜·캡처·+ 메모 추가)는 바로 쓸 수 있게 펼친 채로 둔다.
   - AI 정리의 쪽 번호를 눌러 메모로 이동하면 그 메모를 펼친다.
   - 펼친 상태는 같은 논문 안에서 목록을 다시 그려도 유지한다. */
var RC={pid:null,open:new Set(),seen:new Set()};

function rcMemoOf(card){
  var ta=card.querySelector('textarea');
  return ta?String(ta.value||'').trim():'';
}
function rcSetOpen(card,on){
  var id=card.dataset.rid;if(!id)return;
  if(on)RC.open.add(id);else RC.open.delete(id);
  card.classList.toggle('rc-open',on);
  card.setAttribute('aria-expanded',on?'true':'false');
  var title=card.querySelector('.hgo');
  if(title){title.disabled=false;title.setAttribute('aria-expanded',on?'true':'false')}
  if(on){var ta=card.querySelector('textarea');if(ta&&ta.style){ta.style.height='auto';ta.style.height=Math.max(58,ta.scrollHeight+2)+'px'}}
}
function compactRecords(){
  var list=typeof document!=='undefined'?document.getElementById('rRecords'):null;
  if(!list||!list.querySelectorAll)return;
  var pid=typeof S!=='undefined'?S.reader:null;
  if(RC.pid!==pid){RC.pid=pid;RC.open=new Set();RC.seen=new Set()}
  Array.prototype.forEach.call(list.querySelectorAll('.reading-card'),function(card){
    var id=card.dataset.rid;if(!id)return;
    var memo=rcMemoOf(card),prev=card.querySelector('.rc-preview');
    if(!prev){
      prev=document.createElement('p');prev.className='rc-preview';
      var top=card.querySelector('.hl-top');
      if(top&&top.parentNode)top.parentNode.insertBefore(prev,top.nextSibling);else card.appendChild(prev);
    }
    prev.textContent=memo||'메모 없음 · 눌러서 적기';
    prev.classList.toggle('is-empty',!memo);
    /* 처음 보는 빈 메모는 방금 만든 메모라 펼쳐 둔다. */
    if(!RC.seen.has(id)){RC.seen.add(id);if(!memo&&id!=='legacy-note')RC.open.add(id)}
    rcSetOpen(card,RC.open.has(id));
    if(card._rcWired)return;
    card._rcWired=true;
    card.addEventListener('click',function(e){
      var t=e.target;
      if(t.closest&&t.closest('textarea,input,select,summary,.kind-menu,[data-hq],[data-hd],.hl-copy,.x,.record-candidate,a'))return;
      var opening=!card.classList.contains('rc-open');
      rcSetOpen(card,opening);
      if(opening&&!t.closest('.hgo')){var field=card.querySelector('textarea');if(field)field.focus()}
    });
    card.addEventListener('keydown',function(e){
      if(e.target!==card||(e.key!=='Enter'&&e.key!==' '))return;
      e.preventDefault();
      rcSetOpen(card,!card.classList.contains('rc-open'));
    });
    var ta=card.querySelector('textarea');
    if(ta)ta.addEventListener('input',function(){var v=String(ta.value||'').trim();prev.textContent=v||'메모 없음 · 눌러서 적기';prev.classList.toggle('is-empty',!v)});
  });
}
if(typeof module!=='undefined'&&module.exports)module.exports={compactRecords:compactRecords,RC:RC};
