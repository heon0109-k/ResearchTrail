'use strict';
/* ---------- 내용 찾기: 모든 논문의 하이라이트·캡처·메모에서 위치를 다시 찾기 ---------- */
var KINDS=['수식','그래프·표','개념·방법','기타'];
function findItems(q,kind){
  var out=[],ql=q.trim().toLowerCase();
  S.papers.forEach(function(p){
    if(typeof visible==='function'&&!visible(p))return;
    (p.hl||[]).forEach(function(h){
      if(kind==='막힌 곳'){if(!highlightBlocked(h))return}else if(kind&&h.kind!==kind)return;
      var hay=((h.text||'')+' '+(h.mine||'')+' '+(h.unsure||'')+' '+(h.kind||'')+' '+p.title).toLowerCase();
      if(ql&&hay.indexOf(ql)<0)return;
      out.push({p:p,page:h.page,kind:h.kind||'',text:h.text||'',mine:h.mine||'',img:h.img||'',stuck:highlightBlocked(h)?true:(h.blocked===false?'':h.stuck||''),unsure:h.unsure||'',solved:typeof h.blocked==='boolean'?false:!!h.solved});
    });
    if(ql&&!kind&&p.note){
      p.note.split('\n').forEach(function(line){
        if(!line.trim()||line.toLowerCase().indexOf(ql)<0)return;
        var m=line.match(/\(p\.(\d+)\)\s*$/);
        out.push({p:p,page:m?+m[1]:(+p.page||1),kind:'메모',text:line.replace(/^>\s*/,'').trim(),mine:'',img:''});
      });
    }
  });
  return out.sort(function(a,b){return a.p.title<b.p.title?-1:a.p.title>b.p.title?1:a.page-b.page});
}
function findPapers(q){
  var text=String(q||'').trim().toLowerCase();if(!text)return [];
  return S.papers.filter(function(p){return (typeof visible!=='function'||visible(p))&&String(p.title||'').toLowerCase().indexOf(text)>=0}).slice().sort(function(a,b){
    var at=String(a.title||''),bt=String(b.title||'');return at<bt?-1:at>bt?1:String(a.id).localeCompare(String(b.id));
  });
}
function openFind(){
  if($('#findOv'))return;
  var ov=document.createElement('div');ov.className='ov';ov.id='findOv';
  ov.innerHTML='<div class="find" role="dialog" aria-modal="true" aria-label="내용 찾기"><div class="fh"><b>내용 찾기</b><button type="button" class="x" id="fdClose" aria-label="닫기">×</button></div>'+
    '<input type="search" id="fdQ" placeholder="논문 제목이나 읽기 기록 검색" aria-label="검색어" autocomplete="off">'+
    '<div class="fk" id="fdK"></div><div class="fl" id="fdL" aria-live="polite"></div></div>';
  document.body.appendChild(ov);
  var kind='',q=$('#fdQ',ov);
  function draw(){
    $('#fdK',ov).innerHTML=['전체'].concat(KINDS).concat(['막힌 곳']).map(function(k){var on=(k==='전체'&&!kind)||k===kind;return '<button type="button" class="kc" data-k="'+(k==='전체'?'':k)+'" aria-pressed="'+on+'">'+k+'</button>'}).join('');
    var items=findItems(q.value,kind),papers=kind?[]:findPapers(q.value);
    var paperHtml=papers.length?'<h4 class="find-section">논문 <span>'+papers.length+'</span></h4>'+papers.map(function(p,i){return '<button type="button" class="fi find-paper" data-paper-index="'+i+'"><b>'+esc(p.title)+'</b><span>'+esc(readingState(p.state).t)+'</span></button>'}).join(''):'';
    var recordHtml=items.length?'<h4 class="find-section">읽기 기록 <span>'+items.length+'</span></h4>'+items.map(function(it,i){
      return '<button type="button" class="fi" data-i="'+i+'"><div class="ft"><b>'+esc(short(it.p.title,48))+'</b><span>'+(it.page?'p.'+it.page:'쪽 미기록')+'</span>'+(it.kind?'<em>'+esc(it.kind)+'</em>':'')+(it.stuck?'<em class="stkem">'+(it.solved?'이해함':'막힘')+'</em>':'')+'</div>'+
        (it.img?'<img src="'+it.img+'" alt="캡처한 부분">':'')+(it.text?'<div class="fx">'+esc(short(it.text,140))+'</div>':'')+(it.mine?'<div class="fm">내가 이해한 것: '+esc(it.mine)+'</div>':'')+(it.unsure?'<div class="fm">아직 헷갈리는 것: '+esc(it.unsure)+'</div>':'')+'</button>';
    }).join(''):'';
    $('#fdL',ov).innerHTML=paperHtml+recordHtml||'<p class="empty">'+(q.value||kind?'찾은 논문이나 읽기 기록이 없어요.':'논문 제목을 검색하거나, 저장한 하이라이트·메모를 찾아보세요.')+'</p>';
    $$('[data-paper-index]',ov).forEach(function(b){b.addEventListener('click',function(){var p=papers[+b.dataset.paperIndex];close();openReader(p.id)})});
    $$('[data-i]',ov).forEach(function(b){b.addEventListener('click',function(){var it=items[+b.dataset.i];close();if(Number.isSafeInteger(+it.page)&&+it.page>0)it.p.page=String(it.page);openReader(it.p.id)})});
    $$('.kc',ov).forEach(function(b){b.addEventListener('click',function(){kind=b.dataset.k;draw()})});
  }
  function close(){document.removeEventListener('keydown',kd,true);ov.remove()}
  function kd(e){if(e.key==='Escape'){e.stopPropagation();close()}}
  document.addEventListener('keydown',kd,true);
  $('#fdClose',ov).addEventListener('click',close);
  ov.addEventListener('mousedown',function(e){if(e.target===ov)close()});
  q.addEventListener('input',draw);draw();q.focus();
}

/* 선택한 문장으로 종류를 추측한다 (규칙 기반, 틀리면 사용자가 목록에서 바꾼다) */
function guessKind(t){
  t=String(t||'');
  if(/(\bFig(ure)?\.?\s*\d|\bTable\s*\d|그림\s*\d|표\s*\d)/i.test(t))return '그래프·표';
  if(/[=∑∫∏√≈≤≥±∂∇αβγδεθλμπσφωΩΔΣ]|\b(Eq(uation)?s?\.?\s*\(?\d|equation|theorem|lemma)\b|\\frac|수식|방정식/i.test(t))return '수식';
  if(/(\bdefined as\b|\bdenote|we propose|\bour (method|approach)\b|방법|정의|개념)/i.test(t))return '개념·방법';
  return '';
}
