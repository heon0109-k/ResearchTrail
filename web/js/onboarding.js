'use strict';
/* ---------- onboarding ---------- */
function showOnboard(){
  reset();
  app.innerHTML='<div class="ob"><div class="ob-in">'+
  '<div><div class="brand">ResearchTrail<i class="dot">.</i></div>'+
  '<h1>첫 논문을 등록하면<br>타임라인이 시작돼요</h1><p class="sub">읽은 논문을 날짜순으로 쌓고, 왜 다음 논문으로 넘어갔는지 선으로 남겨요.</p>'+
  '<div class="pv"><div class="pvlab">타임라인에 이렇게 찍혀요</div><div class="pvcard" id="pvCard"></div><div class="pvax" id="pvAx"></div></div></div>'+
  '<form id="obForm" novalidate><div class="fgrid">'+
  '<div class="field full"><span>함께할 캐릭터 <em class="opt">(나중에 바꿀 수 있어요)</em></span><div class="chpick" id="obCh">'+chPick(ME.c,3)+'</div></div>'+
  '<label class="field full"><span>내 이름 <em class="opt">(선택)</em></span><input type="text" id="oNick" maxlength="12" placeholder="예: 경마니" autocomplete="off" value="'+esc(ME.nick)+'"></label>'+
  '<label class="field full"><span>타임라인 이름 <b>*</b></span><input type="text" id="oName" placeholder="예: 의료 논문 검색에 RAG를 쓰는 방법" autocomplete="off"></label>'+
  '<label class="field full"><span>첫 논문 제목 <b>*</b></span><input type="text" id="oTitle" placeholder="예: Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks" autocomplete="off"></label>'+
  '<label class="field"><span>읽은 날짜 <b>*</b></span><input type="date" id="oDate"></label>'+
  '<label class="field"><span>읽은 정도</span><select id="oState">'+stateOpts('reading')+'</select></label>'+
  '<label class="field"><span>태그 <em class="opt">(선택)</em></span><input type="text" id="oTag" placeholder="나중에 정해도 돼요" autocomplete="off"></label>'+
  '<label class="field"><span>링크 <em class="opt">(선택)</em></span><input type="text" id="oLink" placeholder="https://" autocomplete="off"></label>'+
  '<label class="field full"><span>저장 이유 <b>*</b></span><textarea id="oMemo" rows="3" placeholder="이 논문을 왜 저장했나요?"></textarea></label>'+
  '</div><div class="actions"><button type="submit" class="btn pri" id="oGo">타임라인 시작</button><button type="button" class="btn" id="oSample">예시로 둘러보기</button></div>'+
  '<p class="empty" id="oErr" style="margin-top:12px;color:var(--c3)" hidden></p></form></div></div>';
  $('#oDate').value=todayStr();
  function pv(){
    var date=$('#oDate').value||todayStr();var c=dnum(date);
    var tag=$('#oTag').value.trim()||'태그';
    $('#pvCard').innerHTML='<div class="m">'+esc($('#oMemo').value||'저장 이유가 여기에 보여요.')+'</div><div class="f"><span class="t">'+esc($('#oTitle').value||'논문 제목')+'</span><span>'+esc(date.slice(5))+'</span></div>';
    var h='';for(var i=-2;i<=8;i++){var d=new Date((c+i)*864e5);h+='<div'+(i===0?' class="on"':'')+'>'+(d.getUTCMonth()+1)+'/'+d.getUTCDate()+'</div>'}
    $('#pvAx').innerHTML=h;
  }
  ['oTitle','oDate','oTag','oMemo'].forEach(function(id){$('#'+id).addEventListener('input',pv)});pv();
  $('#obCh').addEventListener('click',function(e){var b=e.target.closest('.chp');if(!b)return;ME.c=+b.dataset.c;$$('#obCh .chp').forEach(function(x){x.setAttribute('aria-pressed',x===b)})});
  function takeMe(){ME.nick=$('#oNick').value.trim().slice(0,12);saveMe()}
  $('#oSample').addEventListener('click',function(){takeMe();loadSample()});
  $('#obForm').addEventListener('submit',function(e){
    e.preventDefault();
    var name=$('#oName').value.trim(),title=$('#oTitle').value.trim(),date=$('#oDate').value,tag=$('#oTag').value.trim(),memo=$('#oMemo').value.trim();
    var miss=[];if(!name)miss.push('타임라인 이름');if(!title)miss.push('논문 제목');if(!date)miss.push('읽은 날짜');if(!memo)miss.push('저장 이유');
    var er=$('#oErr');
    if(miss.length){er.hidden=false;er.textContent=miss.join(', ')+'을(를) 입력해 주세요.';return}
    er.hidden=true;
    var link=$('#oLink').value.trim();
    takeMe();var stv=$('#oState').value;reset();S.name=name;var t=addTag(tag);
    S.papers.push({id:nid('p'),tag:t.id,date:date,title:title,memo:memo,link:link,state:stv});
    showMain();
  });
}
