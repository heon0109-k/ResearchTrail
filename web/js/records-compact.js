'use strict';
/* ---------- 읽기 기록 접힌 목록 ----------
   메모가 많아져도 패널이 길어지지 않게, 평소엔 "p.4 · 메모 한두 줄"만 보여 주고
   카드를 누르면 그 하이라이트·캡처 자리로 PDF가 이동하고(편집칸은 열지 않음),
   ✏️ 버튼을 눌러야 펼쳐서 종류·편집칸을 보여 준다. 쪽 위치가 없는 메모는 눌러서 바로 편집한다.
   - 새로 만든 빈 메모(형광펜·캡처·+ 메모 추가)는 바로 쓸 수 있게 펼친 채로 둔다.
   - AI 정리의 쪽 번호를 눌러 메모로 이동하면 그 메모를 펼친다.
   - 펼친 상태는 같은 논문 안에서 목록을 다시 그려도 유지한다. */
var RC={pid:null,open:new Set(),seen:new Set(),armed:null};

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
/* 쪽 위치가 있는 기록이면 PDF의 그 자리로 이동한다. 이동했으면 true. */
function rcReveal(id){
  if(typeof S==='undefined'||typeof paperBy!=='function'||typeof pvReveal!=='function')return false;
  var p=paperBy(S.reader),h=p&&(p.hl||[]).filter(function(x){return x.id===id})[0];
  if(!h||!h.page)return false;
  if(h.rects&&h.rects.length)return pvReveal(h);
  if(typeof pvGo==='function'&&typeof PV!=='undefined'&&PV){pvGo(h.page,true);return true}
  return false;
}
/* ---------- 기록 카드 보기: 날짜·쪽 한 줄 + 형광펜 색 인용문(캡처는 이미지) + 메모 + [메모 수정][질문하기][삭제] ----------
   기존 편집 부분(종류·메모칸·다음 할 일 찾기)은 그대로 두고, 위에 보기용 머리를 다시 그린다. */
function rcPad(n){return (n<10?'0':'')+n}
function rcFmtDate(t){
  if(!t)return '';var d=new Date(t),now=new Date(),day0=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime(),hm=rcPad(d.getHours())+':'+rcPad(d.getMinutes());
  if(t>=day0)return '오늘 '+hm;if(t>=day0-864e5)return '어제 '+hm;
  return (d.getFullYear()!==now.getFullYear()?d.getFullYear()+'년 ':'')+(d.getMonth()+1)+'월 '+d.getDate()+'일';
}
/* 만든 시각: 새 기록은 h.at, 예전 기록은 그 기록에 처음 메모를 쓴 시각 */
function rcRecordTime(p,h){
  if(h&&h.at)return h.at;
  var id=h?h.id:'legacy-note',hist=((p&&p.noteHistory)||[]).filter(function(e){return e.created_at&&(id==='legacy-note'?!e.source_highlight_id:e.source_highlight_id===id)});
  return hist.length?Math.min.apply(null,hist.map(function(e){return e.created_at})):0;
}
function rcKindLabel(h){if(!h)return '논문 메모';if(h.img)return h.kind||'표·그림';if(h.type==='note')return '메모';if(typeof highlightBlocked==='function'&&highlightBlocked(h))return '막힌 곳';return h.kind||'형광펜'}
function rcEsc(v){return typeof esc==='function'?esc(v):String(v==null?'':v).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function rcRenderView(card,p,h,memo){
  var view=card.querySelector('.rcv');
  if(!view){view=document.createElement('div');view.className='rcv';card.insertBefore(view,card.firstChild)}
  var meta=[rcFmtDate(rcRecordTime(p,h)),h&&h.page?'p.'+h.page:'',rcKindLabel(h)].filter(Boolean).join(' · ');
  var quote='';
  if(h&&h.img)quote='<img class="rv-img" src="'+rcEsc(h.img)+'" alt="'+rcEsc(h.text||'캡처한 부분')+'">';
  else if(h&&h.text)quote='<p class="rv-quote"><mark'+(typeof highlightBlocked==='function'&&highlightBlocked(h)?' class="stk"':'')+'>'+rcEsc(h.text)+'</mark></p>';
  view.innerHTML='<div class="rv-meta">'+rcEsc(meta)+'</div>'+quote;
  var acts=card.querySelector('.rv-actions');
  if(!acts){acts=document.createElement('div');acts.className='rv-actions';card.appendChild(acts)}
  var canAsk=!!(h&&(h.img||h.text));
  acts.innerHTML=(canAsk?'<button type="button" data-rv="ask">질문하기</button>':'')+(h?'<button type="button" class="dng" data-rv="del">삭제</button>':'');
}
/* 질문하기: 캡처는 첨부로, 형광펜 문장은 '선택한 문장'으로 붙여 질문하기 탭을 연다. */
function rcAsk(p,h){
  if(!h)return;
  if(h.img){if(typeof chatAskAboutCapture==='function')chatAskAboutCapture(h.id);return}
  if(typeof CHAT==='undefined'||typeof chatSetTab!=='function')return;
  CHAT.sel={text:String(h.text||'').slice(0,typeof CHAT_SEL_CHARS!=='undefined'?CHAT_SEL_CHARS:1800),page:h.page||null};CHAT.att=null;CHAT.err='';
  if(typeof MTAB!=='undefined'&&typeof applyMobileTab==='function'&&window.matchMedia&&window.matchMedia('(max-width:600px)').matches){MTAB='chat';applyMobileTab(p,false)}
  chatSetTab('chat');
}
function compactRecords(){
  var list=typeof document!=='undefined'?document.getElementById('rRecords'):null;
  if(!list||!list.querySelectorAll)return;
  var pid=typeof S!=='undefined'?S.reader:null;
  if(RC.pid!==pid){RC.pid=pid;RC.open=new Set();RC.seen=new Set();RC.armed=null}
  if(typeof document.createElement==='function')rcCompose();
  Array.prototype.forEach.call(list.querySelectorAll('.reading-card'),function(card){
    var id=card.dataset.rid;if(!id)return;
    var memo=rcMemoOf(card),prev=card.querySelector('.rc-preview');
    if(!prev){
      prev=document.createElement('p');prev.className='rc-preview';
      var top=card.querySelector('.hl-top');
      if(top&&top.parentNode)top.parentNode.insertBefore(prev,top.nextSibling);else card.appendChild(prev);
    }
    prev.textContent=memo||'눌러서 메모 남기기';
    prev.classList.toggle('is-empty',!memo);
    var rp=typeof paperBy==='function'&&typeof S!=='undefined'?paperBy(S.reader):null,rh=rp&&id!=='legacy-note'?(rp.hl||[]).filter(function(x){return x.id===id})[0]:null;
    rcRenderView(card,rp,rh,memo);
    /* 처음 보는 빈 메모는 방금 만든 메모라 펼쳐 둔다. */
    if(!RC.seen.has(id)){RC.seen.add(id);if(!memo&&id!=='legacy-note')RC.open.add(id)}
    rcSetOpen(card,RC.open.has(id));
    if(!card.querySelector('.rc-edit')){
      var eb=document.createElement('button');eb.type='button';eb.className='rc-edit';eb.setAttribute('aria-label','메모 수정');eb.title='메모 수정';
      eb.innerHTML='<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 3.5l4 4M3 17l4.5-1 10-10a2.8 2.8 0 0 0-4-4l-10 10L3 17Z"/></svg>';
      var top2=card.querySelector('.hl-top');if(top2)top2.insertBefore(eb,top2.querySelector('.hl-tools'));
    }
    if(card._rcWired)return;
    card._rcWired=true;
    card.addEventListener('click',function(e){
      var t=e.target;
      var act=t.closest&&t.closest('[data-rv]');
      if(act){
        var pp=paperBy(S.reader),hh=pp&&(pp.hl||[]).filter(function(x){return x.id===id})[0];
        if(act.dataset.rv==='edit'){var op=!card.classList.contains('rc-open');rcSetOpen(card,op);if(op){var f0=card.querySelector('textarea');if(f0)f0.focus()}}
        else if(act.dataset.rv==='ask')rcAsk(pp,hh);
        else if(act.dataset.rv==='del'){var d=card.querySelector('[data-hd]');if(d)d.click()}
        return;
      }
      if(t.closest&&t.closest('.rc-edit')){var opening=!card.classList.contains('rc-open');rcSetOpen(card,opening);if(opening){var f=card.querySelector('textarea');if(f)f.focus()}return}
      if(t.closest&&t.closest('textarea,input,select,summary,.kind-menu,[data-hq],[data-hd],.hl-copy,.x,.record-candidate,.hl-ask,.hl-img,a'))return;
      if(t.closest&&t.closest('.hgo'))return;
      /* 이미 선택된 카드의 메모 글씨를 다시 누르면 수정, 그 밖에는 하이라이트 자리로 이동 */
      if(t.closest&&t.closest('.rc-preview')&&RC.armed===id&&!card.classList.contains('rc-open')){rcSetOpen(card,true);var f1=card.querySelector('textarea');if(f1)f1.focus();return}
      /* 다른 카드를 눌렀다 돌아오면 처음부터: 먼저 이동하고, 그다음 메모 글씨를 눌러야 수정 */
      RC.armed=id;
      if(rcReveal(id))return;
      var opening2=!card.classList.contains('rc-open');rcSetOpen(card,opening2);
      if(opening2){var field=card.querySelector('textarea');if(field)field.focus()}
    });
    card.addEventListener('keydown',function(e){
      if(e.target!==card||(e.key!=='Enter'&&e.key!==' '))return;
      e.preventDefault();
      rcSetOpen(card,!card.classList.contains('rc-open'));
    });
    var ta=card.querySelector('textarea');
    if(ta)ta.addEventListener('input',function(){var v=String(ta.value||'').trim();prev.textContent=v||'눌러서 메모 남기기';prev.classList.toggle('is-empty',!v);var eb2=card.querySelector('[data-rv="edit"]');if(eb2)eb2.textContent=v?'메모 수정':'메모 추가'});
  });
}
/* ---------- 바로 메모: 하이라이트·캡처 없이 기록 탭 위에서 바로 쓰는 입력칸 ----------
   [저장]이나 Enter를 누르면(Shift+Enter는 줄바꿈) 지금 보던 쪽(p.N)에 메모 기록이 생긴다. */
function rcComposePage(p){
  if(typeof PV!=='undefined'&&PV&&PV.pid===p.id&&+PV.cur>0)return +PV.cur;
  return +p.page>0?+p.page:null;
}
function rcComposeSync(box,p){
  var ta=box.querySelector('textarea'),btn=box.querySelector('.rq-save'),pg=box.querySelector('.rq-page');
  var v=String(ta.value||'').trim();btn.disabled=!v;
  var n=rcComposePage(p);pg.textContent=n?'p.'+n:'쪽 없음';
  ta.style.height='auto';ta.style.height=Math.max(44,ta.scrollHeight)+'px';
}
/* PDF 쪽을 넘기면 입력칸의 쪽 번호도 바로 바꾼다 */
function rcComposePageSync(){
  var box=typeof document!=='undefined'&&document.getElementById('rCompose');if(!box||typeof paperBy!=='function')return;
  var p=paperBy(S.reader),pg=box.querySelector('.rq-page');if(!p||!pg)return;
  var n=rcComposePage(p);pg.textContent=n?'p.'+n:'쪽 없음';
}
function rcComposeSave(box,p){
  var ta=box.querySelector('textarea'),v=String(ta.value||'').trim();if(!v)return;
  var h={id:typeof nid==='function'?nid('h'):'h'+Date.now(),at:Date.now(),type:'note',page:rcComposePage(p),text:'',mine:v,rects:[]};
  p.hl=p.hl||[];p.hl.push(h);RC.seen.add(h.id);
  if(typeof save==='function')save();
  ta.value='';rcComposeSync(box,p);
  if(typeof drawHlList==='function')drawHlList();
  var card=document.querySelector('#rRecords .reading-card[data-rid="'+h.id+'"]');
  if(card){if(card.scrollIntoView)card.scrollIntoView({block:'nearest'});card.classList.add('rq-new');setTimeout(function(){card.classList.remove('rq-new')},1200)}
}
function rcCompose(){
  var list=document.getElementById('rRecords');if(!list||typeof paperBy!=='function'||typeof S==='undefined')return;
  var p=paperBy(S.reader);if(!p)return;
  var box=document.getElementById('rCompose');
  if(box&&box._pid===p.id)return;
  if(box)box.remove();
  box=document.createElement('div');box.id='rCompose';box.className='rq';box._pid=p.id;
  box.innerHTML='<textarea rows="1" aria-label="바로 메모" placeholder="읽으면서 떠오른 생각을 적어 보세요"></textarea>'+
    '<div class="rq-foot"><span class="rq-page" title="지금 보고 있는 쪽에 남겨요"></span><button type="button" class="rq-save" disabled>저장</button></div>';
  list.parentNode.insertBefore(box,list);
  var ta=box.querySelector('textarea');
  ta.addEventListener('input',function(){rcComposeSync(box,p)});
  ta.addEventListener('focus',function(){rcComposeSync(box,p)});
  /* Enter = 저장, Shift+Enter = 줄바꿈. 한글 조합 중 Enter는 무시 */
  ta.addEventListener('keydown',function(e){if(e.key!=='Enter'||e.shiftKey||e.isComposing||e.keyCode===229)return;e.preventDefault();rcComposeSave(box,p)});
  box.querySelector('.rq-save').addEventListener('click',function(){rcComposeSave(box,p)});
  rcComposeSync(box,p);
}
/* 메모는 글자를 칠 때마다 저장된다. 편집 중인 카드 바깥 아무 데나 누르거나 Esc를 누르면 편집을 닫는다(쓴 메모가 카드에 바로 보인다). */
function rcCloseOpenCards(except){
  if(typeof document==='undefined')return;
  Array.prototype.forEach.call(document.querySelectorAll('#rRecords .reading-card.rc-open'),function(card){if(card!==except)rcSetOpen(card,false)});
}
if(typeof document!=='undefined'&&document.addEventListener){
  document.addEventListener('pointerdown',function(e){
    var t=e.target;if(!t||!t.closest)return;
    if(t.closest('.ov'))return; /* 삭제 확인 창 등 */
    rcCloseOpenCards(t.closest('#rRecords .reading-card'));
  },true);
  document.addEventListener('keydown',function(e){
    if(e.key!=='Escape')return;var card=e.target&&e.target.closest&&e.target.closest('#rRecords .reading-card.rc-open');if(!card)return;
    if(e.target.closest('.kind-picker[open]'))return;
    rcSetOpen(card,false);card.focus&&card.focus();
  });
}
if(typeof module!=='undefined'&&module.exports)module.exports={compactRecords:compactRecords,RC:RC};
