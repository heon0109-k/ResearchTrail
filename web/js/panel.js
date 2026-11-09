'use strict';
/* ---------- panel ---------- */
function persistPaperLink(p,value,report){
  var ref=parseRef(value),input=$('#pLink');
  if(ref.type==='invalid'){
    if(input){input.setCustomValidity('http 또는 https 링크를 입력해 주세요.');if(report)input.reportValidity()}
    return false;
  }
  if(input)input.setCustomValidity('');
  p.link=ref.type==='url'?ref.url:ref.link;return save();
}
var paperResourceScans=new WeakMap();
function paperResourceScan(p){
  var state=paperResourceScans.get(p),source=p.pdf?null:p.link;
  if(!state||state.source!==source){
    state={source:source,status:'idle',candidates:[],notify:null};
    paperResourceScans.set(p,state);
  }
  return state;
}
async function scanPaperResources(p,file){
  var state=paperResourceScan(p);
  if(file){
    state=Object.assign({},state,{candidates:[]});
    paperResourceScans.set(p,state);
  }else if(state.status==='loading')return;
  function current(){return paperResourceScans.get(p)===state&&paperBy(p.id)===p&&state.source===(p.pdf?null:p.link)}
  function update(status,candidates){
    if(!current())return;
    state.status=status;state.candidates=candidates;
    if(state.notify)state.notify();
  }
  update('loading',[]);
  try{
    var found=await findPaperResources(p,current,file);
    update(found===null?'missing':'done',found||[]);
  }catch(e){update('failed',[])}
}
function paperResourcesHtml(id){
  return '<section class="paper-resources" id="'+id+'" aria-labelledby="'+id+'Title"><h4 id="'+id+'Title">코드·데이터셋</h4><ul data-saved-resources></ul>'+
  '<div class="paper-resource-actions"><button type="button" class="btn sm" data-scan-resources hidden>PDF에서 링크 찾기</button><button type="button" class="btn sm ghost" data-manual-resources aria-expanded="false" aria-controls="'+id+'Form">+ 직접 추가</button></div>'+
  '<form id="'+id+'Form" hidden><select aria-label="링크 종류"><option value="code">코드</option><option value="data">데이터셋</option></select><input type="text" aria-label="코드·데이터셋 주소" placeholder="링크 붙여넣기" inputmode="url"><button class="btn sm" type="submit">저장</button></form>'+
  '<div data-found-resources hidden><h5>PDF에서 찾은 링크 <span data-resource-count></span></h5><ul id="'+id+'Results" data-resource-results></ul><button type="button" class="btn sm ghost" data-more-resources aria-expanded="false" aria-controls="'+id+'Results" hidden></button></div>'+
  '<p class="empty" role="status" data-resource-status></p></section>';
}
function wirePaperResources(box,p){
  if(!box)return;
  var saved=$('[data-saved-resources]',box),results=$('[data-resource-results]',box),status=$('[data-resource-status]',box);
  var form=$('form',box),input=$('input',form),kind=$('select',form),scan=$('[data-scan-resources]',box);
  var manual=$('[data-manual-resources]',box),found=$('[data-found-resources]',box);
  var count=$('[data-resource-count]',box),more=$('[data-more-resources]',box),expanded=false;
  function resources(){return (Array.isArray(p.resources)?p.resources:[]).filter(function(item){
    return item&&(item.kind==='code'||item.kind==='data')&&safeExternalUrl(item.url);
  })}
  function label(item){return (item.kind==='code'?'코드':'데이터셋')+(Number.isSafeInteger(item.page)&&item.page>0?' · '+item.page+'쪽':'')}
  function row(item,action,index){
    var href=safeExternalUrl(item.url);
    var url=new URL(href),caption=url.host+url.pathname.replace(/\/$/,'');
    return '<li><small>'+label(item)+'</small><a href="'+esc(href)+'" title="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+esc(caption)+'</a><button type="button" class="btn sm'+(action==='remove'?' ghost':'')+'" data-resource-'+action+'="'+index+'" aria-label="'+label(item)+' 링크 '+(action==='add'?'저장':'삭제')+'">'+(action==='add'?'저장':'삭제')+'</button></li>';
  }
  function render(){
    var entries=resources();
    saved.innerHTML=entries.map(function(item,i){return row(item,'remove',i)}).join('');
    var rows=paperResourceScan(p).candidates.flatMap(function(item,i){
      return entries.some(function(entry){return entry.url===item.url})?[]:[row(item,'add',i)];
    });
    results.innerHTML=(expanded?rows:rows.slice(0,3)).join('');
    found.hidden=!rows.length;
    count.textContent=rows.length+'개';
    more.hidden=rows.length<=3;
    more.textContent=expanded?'접기':'나머지 '+(rows.length-3)+'개 보기';
    more.setAttribute('aria-expanded',String(expanded));
  }
  function renderScan(){
    if(!box.isConnected)return;
    var state=paperResourceScan(p);
    render();
    scan.hidden=!(state.status==='failed'||(state.status==='idle'&&(p.pdf||paperResourcePdfUrl(p))));
    scan.textContent=state.status==='failed'?'다시 찾기':'PDF에서 링크 찾기';
    status.textContent=state.status==='loading'?'PDF에서 링크를 찾는 중…':
      state.status==='failed'?'PDF에서 링크를 읽지 못했어요.':
      state.status==='missing'?'읽기 화면에서 PDF를 올리면 링크를 찾을 수 있어요.':
      state.status==='done'&&!state.candidates.length?'PDF에서 코드·데이터셋 링크를 찾지 못했어요.':'';
  }
  function persist(entries){
    var old=p.resources;p.resources=entries;
    if(save()||S.example){render();return true}
    p.resources=old;status.textContent='링크를 저장하지 못했어요. 다시 시도해 주세요.';return false;
  }
  function add(item){
    var entries=resources();
    if(entries.some(function(entry){return safeExternalUrl(entry.url)===item.url})){status.textContent='이미 저장한 링크예요.';return false}
    if(!persist(entries.concat(item)))return false;
    status.textContent=S.example?'예시 탭에 링크를 저장했어요.':'링크를 저장했어요.';return true;
  }
  function showManual(open){
    form.hidden=!open;manual.setAttribute('aria-expanded',String(open));
    if(open)input.focus();else manual.focus();
  }
  manual.addEventListener('click',function(){showManual(form.hidden)});
  more.addEventListener('click',function(){expanded=!expanded;render()});
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var href=safeExternalUrl(input.value);
    if(!href){status.textContent='올바른 http 또는 https 링크를 입력해 주세요.';input.focus();return}
    if(add({url:href,kind:kind.value})){input.value='';showManual(false)}
  });
  box.addEventListener('click',function(e){
    var b=e.target.closest('button');if(!b)return;
    var candidate=paperResourceScan(p).candidates[Number(b.dataset.resourceAdd)];
    if(candidate)add(candidate);
    if(b.hasAttribute('data-resource-remove')){
      var entries=resources();entries.splice(Number(b.dataset.resourceRemove),1);
      if(persist(entries))status.textContent='링크를 삭제했어요.';
    }
  });
  scan.addEventListener('click',function(){scanPaperResources(p)});
  paperResourceScan(p).notify=renderScan;
  renderScan();
}
function renderPanel(){
  var panel=$('#panel'),pin=$('#pin');
  var open=S.panel!=='none';panel.classList.toggle('open',open);
  if(!open){pin.innerHTML='';return}
  if(S.panel==='add'){renderAddPanel(pin);return}
  var p=paperBy(S.sel);if(!p){S.panel='none';panel.classList.remove('open');return}
  var t=tagBy(p.tag);
  var tagOpts='<option value=""'+(!p.tag?' selected':'')+'>태그 없음</option>'+S.tags.map(function(x){return '<option value="'+x.id+'"'+(x.id===p.tag?' selected':'')+'>'+esc(x.name)+'</option>'}).join('');
  var outs=S.links.filter(function(l){return l.from===p.id}),ins=S.links.filter(function(l){return l.to===p.id});
  function li(l,dir){var o=paperBy(dir==='out'?l.to:l.from);if(!o)return '';return '<li><span class="arr">'+(dir==='out'?'→':'←')+'</span><button type="button" class="go" data-go="'+o.id+'">'+esc(o.title.length>48?o.title.slice(0,48)+'…':o.title)+'</button><button type="button" class="x" data-del="'+l.id+'" aria-label="연결 삭제">삭제</button><span class="why">'+esc(l.reason||'미기록/확인 필요')+'</span></li>'}
  var linkArea='';
  if(S.linking&&S.linking.from===p.id){
    var to=S.linking.to?paperBy(S.linking.to):null;
    if(!to){linkArea='<div class="linkbox"><div class="pair"><span>FROM</span> '+esc(p.title.slice(0,40))+'</div><div>이 논문에서 이동한 논문을 '+(S.view==='card'?'타임라인':'그래프')+'에서 클릭하세요. 태그가 달라도 돼요.</div>'+(S.linking.err?'<div class="lkerr" role="alert">⚠ '+esc(S.linking.err)+'</div>':'')+'<div><button type="button" class="btn sm" id="lkCancel">취소</button></div></div>'}
    else{linkArea='<div class="linkbox"><div class="pair">'+esc(p.title.slice(0,34))+(p.title.length>34?'…':'')+' <span>→</span> '+esc(to.title.slice(0,34))+(to.title.length>34?'…':'')+'</div><label class="field"><span>왜 이 논문으로 넘어갔나요?</span><input type="text" id="lkWhy" placeholder="예: 의료 도메인 적용 사례를 찾으려고" autocomplete="off"></label><div style="display:flex;gap:8px"><button type="button" class="btn pri sm" id="lkOk">연결 저장</button><button type="button" class="btn sm" id="lkCancel">취소</button></div></div>'}
  }else{linkArea='<button type="button" class="btn" id="lkStart">연결 추가: 이 논문에서 이동</button>'}
  pin.innerHTML='<div class="ph"><span>논문</span><button type="button" class="btn sm ghost" id="pClose">닫기</button></div><div class="pb">'+
  '<button type="button" class="btn pri" id="pRead">'+(p.state==='reading'?'이어 읽기':'읽기 화면 열기')+'</button>'+
  '<div class="tagrow"><i style="background:'+t.color+'"></i><select id="pTag" aria-label="태그">'+tagOpts+'</select></div>'+
  '<label class="field"><span>읽은 정도</span><select id="pState">'+stateOpts(p.state)+'</select></label>'+
  '<label class="field"><span>저장 이유</span><textarea id="pMemo" class="big" rows="4">'+esc(p.memo)+'</textarea></label>'+
  '<label class="field"><span>논문 제목</span><textarea id="pTitle" rows="2" class="mono" style="font-size:12px">'+esc(p.title)+'</textarea></label>'+
  '<div class="two"><label class="field"><span>읽은 날짜</span><input type="date" id="pDate" value="'+esc(p.date)+'"></label><label class="field"><span>링크</span><input type="text" id="pLink" value="'+esc(p.link)+'" placeholder="https://"></label></div>'+
  paperResourcesHtml('pResources')+
  '<div><h4>이동 경로</h4>'+((outs.length||ins.length)?'<ul class="lklist">'+outs.map(function(l){return li(l,'out')}).join('')+ins.map(function(l){return li(l,'in')}).join('')+'</ul>':'<p class="empty">아직 연결이 없어요.</p>')+'</div>'+
  linkArea+
  '<div class="paper-delete-row"><button type="button" class="btn ghost" id="pDel" aria-label="삭제: 이 논문">삭제</button></div></div>';
  $('#pClose').addEventListener('click',function(){closeDetailPanel()});
  $('#pRead').addEventListener('click',function(){openReader(p.id)});
  $('#pTag').addEventListener('change',function(e){p.tag=e.target.value;renderAll()});
  $('#pState').addEventListener('change',function(e){p.state=e.target.value||null;renderAll()});
  $('#pMemo').addEventListener('change',function(e){p.memo=e.target.value;renderAll()});
  $('#pTitle').addEventListener('change',function(e){p.title=e.target.value.trim()||p.title;renderAll()});
  var linkInput=$('#pLink');
  ['input','change'].forEach(function(type){linkInput.addEventListener(type,function(e){persistPaperLink(p,e.target.value,type==='change')})});
  wirePaperResources($('#pResources'),p);
  $('#pDate').addEventListener('change',function(e){if(e.target.value){p.date=e.target.value;renderAll();ensureVisible(p.id)}});
  $$('[data-go]',pin).forEach(function(b){b.addEventListener('click',function(){select(b.dataset.go)})});
  $$('[data-del]',pin).forEach(function(b){b.addEventListener('click',function(){ask('이 연결을 삭제할까요?','연결 이유도 함께 사라져요.','삭제',function(){S.links=S.links.filter(function(l){return l.id!==b.dataset.del});renderAll()},true)})});
  var ls=$('#lkStart');if(ls)ls.addEventListener('click',function(){S.linking={from:p.id,to:null};renderAll()});
  var lc=$('#lkCancel');if(lc)lc.addEventListener('click',function(){S.linking=null;renderAll()});
  var lo=$('#lkOk');if(lo){
    var save=function(){
      var why=$('#lkWhy').value.trim();
      var dup=S.links.filter(function(l){return l.from===S.linking.from&&l.to===S.linking.to})[0];
      if(dup)dup.reason=why;else S.links.push({id:nid('l'),from:S.linking.from,to:S.linking.to,reason:why});
      S.linking=null;renderAll();
    };
    lo.addEventListener('click',save);$('#lkWhy').addEventListener('keydown',function(e){if(e.key==='Enter')save()});$('#lkWhy').focus();
  }
  $('#pDel').addEventListener('click',function(){
    var nl=S.links.filter(function(l){return l.from===p.id||l.to===p.id}).length;
    ask('이 논문을 삭제할까요?','"'+short(p.title,40)+'"'+(nl?'와 연결 '+nl+'개가':'가')+' 사라져요.','삭제',function(){
      S.links=S.links.filter(function(l){return l.from!==p.id&&l.to!==p.id});
      S.papers=S.papers.filter(function(x){return x.id!==p.id});D.pos.delete(p.id);idbDel(p.id);
      S.sel=null;S.panel='none';S.linking=null;
      if(!S.papers.length){S.example=false;renderAll();return}
      renderAll();
    },true);
  });
}
function renderAddPanel(pin){
  var d=S.draft||{};var date=(d.date&&/^20\d\d-\d\d-\d\d$/.test(d.date))?d.date:todayStr();
  var tagOpts='<option value="">태그 없음</option>'+S.tags.map(function(x){return '<option value="'+x.id+'"'+(x.id===d.tag?' selected':'')+'>'+esc(x.name)+'</option>'}).join('');
  pin.innerHTML='<div class="ph"><span>새 논문</span><button type="button" class="btn sm ghost" id="pClose">닫기</button></div><form class="pb" id="addForm" novalidate>'+
  '<div class="srcbox"><div class="sl2">링크 또는 PDF <em class="opt">(선택)</em></div>'+
  '<div class="srcrow"><input type="text" id="aSrc" placeholder="논문 링크를 붙여넣기 (arXiv·DOI면 제목 자동 입력)" autocomplete="off"><button type="button" class="btn" id="aFetch">불러오기</button></div>'+
  '<label class="filebtn"><input type="file" id="aFile" accept="application/pdf,.pdf" hidden><span class="btn">PDF 파일 선택</span><em id="aFname"></em></label>'+
  '<p class="empty" id="aSrcMsg" hidden></p></div>'+
  '<label class="field"><span>논문 제목 <b>*</b></span><input type="text" id="aTitle" autocomplete="off" placeholder="논문 제목"></label>'+
  '<div class="two"><label class="field"><span>읽은 날짜 <b>*</b></span><input type="date" id="aDate" value="'+esc(date)+'"></label>'+
  '<label class="field"><span>태그 <em class="opt">(선택)</em></span><select id="aTag">'+tagOpts+'</select></label></div>'+
  '<label class="field"><span>읽은 정도</span><select id="aState">'+stateOpts('reading')+'</select></label>'+
  '<label class="field"><span>저장 이유 <b>*</b></span><textarea id="aMemo" rows="4" class="big" placeholder="이 논문을 왜 저장했나요?"></textarea></label>'+
  '<p class="empty" id="aErr" style="color:var(--c3)" hidden></p>'+
  '<div style="display:flex;gap:8px"><button type="submit" class="btn pri">타임라인에 추가</button><button type="button" class="btn" id="aCancel">취소</button></div></form>';
  $('#pClose').addEventListener('click',function(){S.panel='none';renderAll()});
  $('#aCancel').addEventListener('click',function(){S.panel='none';renderAll()});
  S.draftMeta=null;S.draftFile=null;
  var msg=function(t,bad){var m=$('#aSrcMsg');m.hidden=!t;m.textContent=t||'';m.style.color=bad?'var(--c3)':'var(--mute)'};
  var doFetch=function(){
    var v=$('#aSrc').value.trim();if(!v){msg('링크를 붙여넣어 주세요.',true);return}
    var ref=parseRef(v);
    if(ref.type==='invalid'){msg('올바른 http 또는 https 링크를 입력해 주세요.',true);return}
    if(ref.type==='url'){msg('arXiv·DOI가 아니라서 제목은 직접 적어 주세요. 링크는 저장돼요.');return}
    $('#aSrc').value=ref.link;msg('불러오는 중…');
    fetchMeta(ref).then(function(m){
      S.draftMeta=m;if(m.title&&!$('#aTitle').value.trim())$('#aTitle').value=m.title;
      msg('불러왔어요'+(m.year?' · '+m.year:'')+(m.authors?' · '+m.authors.split(', ')[0]+(m.authors.indexOf(',')>-1?' 외':''):'')+'. 저장 이유만 적으면 돼요.');$('#aMemo').focus();
    }).catch(function(){msg('제목을 자동으로 못 가져왔어요. 링크는 저장되니 제목만 직접 적어 주세요.',true);$('#aTitle').focus()});
  };
  $('#aFetch').addEventListener('click',doFetch);
  $('#aSrc').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();doFetch()}});
  $('#aSrc').addEventListener('paste',function(){setTimeout(function(){if(/arxiv|doi|10\.\d{4}/i.test($('#aSrc').value))doFetch()},0)});
  $('#aFile').addEventListener('change',function(e){
    var f=e.target.files[0];if(!f)return;
    if(f.size>60*1024*1024){msg('PDF가 너무 커요(60MB 이하만).',true);return}
    S.draftFile=f;$('#aFname').textContent=f.name;
    if(!$('#aTitle').value.trim())$('#aTitle').value=f.name.replace(/\.pdf$/i,'').replace(/[_]+/g,' ');
    msg('PDF를 읽기 화면에서 열 수 있게 이 브라우저에 저장해요.');
  });
  var adding=false;
  $('#addForm').addEventListener('submit',async function(e){
    e.preventDefault();
    if(adding)return;
    var title=$('#aTitle').value.trim(),dt=$('#aDate').value,memo=$('#aMemo').value.trim(),tv=$('#aTag').value;
    var miss=[];if(!title)miss.push('논문 제목');if(!dt)miss.push('읽은 날짜');if(!memo)miss.push('저장 이유');
    var er=$('#aErr');if(miss.length){er.hidden=false;er.textContent=miss.join(', ')+'을(를) 입력해 주세요.';return}
    var ref=parseRef($('#aSrc').value);
    if(ref.type==='invalid'){er.hidden=false;er.textContent='올바른 http 또는 https 링크를 입력해 주세요.';return}
    var tag=tagBy(tv);
    var id=nid('p');var m=S.draftMeta||{};var np={id:id,tag:tag.id,date:dt,title:title,memo:memo,link:(function(){var v=$('#aSrc').value.trim();if(!v)return '';var r=parseRef(v);return r.type==='url'?r.url:r.link})(),state:$('#aState').value||null,abs:m.abs||'',authors:m.authors||'',year:m.year||''};
    var file=S.draftFile;
    if(file){
      adding=true;
      try{await attachPaperPdf(np,file)}
      catch(error){er.hidden=false;er.textContent='PDF를 저장하지 못했어요. 입력 내용은 유지했으니 다시 추가해 주세요.';adding=false;return}
      adding=false;
      if(S.panel!=='add'||$('#aErr')!==er){idbDel(id);return}
    }
    S.papers=S.papers.filter(function(x){return !x.tut});
    S.papers.push(np);S.draftMeta=null;S.draftFile=null;
    if(file)scanPaperResources(np,file);
    S.hidden.delete(tag.id);if(S.filterTag!=null&&S.filterTag!==tag.id)S.filterTag=null;S.draft=null;S.sel=id;S.panel='detail';renderAll();ensureVisible(id);
  });
}
