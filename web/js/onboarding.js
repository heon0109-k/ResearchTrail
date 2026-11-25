'use strict';
/* ---------- onboarding ---------- */
function showOnboard(){
  reset();
  app.innerHTML = screens.onboarding;
  $('#oState').innerHTML=stateOpts('reading');
  $('#oDate').value=todayStr();
  function pv(){
    var date=$('#oDate').value||todayStr();var c=dnum(date);
    var tag=$('#oTag').value.trim()||'태그';
    $('#pvCard').innerHTML='<div class="m">'+esc($('#oMemo').value||'저장 이유가 여기에 보여요.')+'</div><div class="f"><span class="t">'+esc($('#oTitle').value||'논문 제목')+'</span><span>'+esc(date.slice(5))+'</span></div>';
    var h='';for(var i=-2;i<=8;i++){var d=new Date((c+i)*864e5);h+='<div'+(i===0?' class="on"':'')+'>'+(d.getUTCMonth()+1)+'/'+d.getUTCDate()+'</div>'}
    $('#pvAx').innerHTML=h;
  }
  ['oTitle','oDate','oTag','oMemo'].forEach(function(id){$('#'+id).addEventListener('input',pv)});pv();
  function takeMe(){saveMe()}
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
