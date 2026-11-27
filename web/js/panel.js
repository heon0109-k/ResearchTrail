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
  '<div data-found-resources hidden><h5>PDF에서 찾은 링크 <span data-resource-count></span></h5><p class="empty">인용한 자료의 링크도 포함될 수 있어요.</p><ul id="'+id+'Results" data-resource-results></ul><button type="button" class="btn sm ghost" data-more-resources aria-expanded="false" aria-controls="'+id+'Results" hidden></button></div>'+
  '<p class="empty" role="status" data-resource-status></p></section>';
}
/* 기본 select 대신 질문하기의 '답변 깊이' 메뉴와 같은 모양의 작은 선택 메뉴를 띄운다.
   값은 원래 select에 그대로 넣어서 저장 로직은 바뀌지 않는다. */
function prettySelect(sel,title){
  if(!sel||sel._pretty)return;sel._pretty=true;
  var wrap=document.createElement('div');wrap.className='pick';
  wrap.innerHTML='<button type="button" class="pick-btn" aria-haspopup="listbox" aria-expanded="false"><span></span><i aria-hidden="true"></i></button>'+
    '<div class="pick-menu" role="listbox" hidden>'+(title?'<small>'+esc(title)+'</small>':'')+
    Array.prototype.map.call(sel.options,function(o){return '<button type="button" role="option" data-v="'+esc(o.value)+'">'+esc(o.textContent)+'</button>'}).join('')+'</div>';
  sel.parentNode.insertBefore(wrap,sel);sel.classList.add('pick-native');sel.tabIndex=-1;
  var btn=wrap.querySelector('.pick-btn'),menu=wrap.querySelector('.pick-menu'),opts=menu.querySelectorAll('[role="option"]');
  function sync(){
    var cur=sel.options[sel.selectedIndex];btn.firstChild.textContent=cur?cur.textContent:'';
    Array.prototype.forEach.call(opts,function(b){b.setAttribute('aria-selected',String(b.dataset.v===sel.value))});
  }
  function open(on){
    menu.hidden=!on;btn.setAttribute('aria-expanded',String(on));
    if(on){sync();var cur=menu.querySelector('[aria-selected="true"]')||opts[0];cur.focus();
      document.addEventListener('pointerdown',outside,true)}
    else document.removeEventListener('pointerdown',outside,true);
  }
  function outside(e){if(!wrap.contains(e.target))open(false)}
  btn.addEventListener('click',function(){open(menu.hidden)});
  menu.addEventListener('click',function(e){
    var b=e.target.closest('[role="option"]');if(!b)return;e.stopPropagation();
    sel.value=b.dataset.v;sel.dispatchEvent(new Event('change',{bubbles:true}));sync();open(false);btn.focus();
  });
  wrap.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&!menu.hidden){e.preventDefault();e.stopPropagation();open(false);btn.focus();return}
    if(menu.hidden||(e.key!=='ArrowDown'&&e.key!=='ArrowUp'))return;
    e.preventDefault();var list=Array.prototype.slice.call(opts),i=list.indexOf(document.activeElement);
    i=e.key==='ArrowDown'?Math.min(list.length-1,i+1):Math.max(0,i-1);list[i].focus();
  });
  sel.addEventListener('change',sync);
  sync();
  return {sync:sync};
}
function wirePaperResources(box,p){
  if(!box)return;
  var saved=$('[data-saved-resources]',box),results=$('[data-resource-results]',box),status=$('[data-resource-status]',box);
  var form=$('form',box),input=$('input',form),kind=$('select',form),scan=$('[data-scan-resources]',box);
  var kindPick=prettySelect(kind,'링크 종류');
  var manual=$('[data-manual-resources]',box),found=$('[data-found-resources]',box);
  var count=$('[data-resource-count]',box),more=$('[data-more-resources]',box),expanded=false;
  function resources(){return (Array.isArray(p.resources)?p.resources:[]).filter(function(item){
    return item&&(item.kind==='code'||item.kind==='data')&&safeExternalUrl(item.url);
  })}
  function label(item){return (item.kind==='code'?'코드':'데이터셋')+(Number.isSafeInteger(item.page)&&item.page>0?' · '+item.page+'쪽':'')}
  /* 상세 패널 수정 화면에서는 칩으로: 저장한 링크는 [아이콘 이름 ×], PDF에서 찾은 링크는 점선 [+ 아이콘 이름] */
  var chips=box.classList&&box.classList.contains('res-chips');
  var RES_IC={code:'<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 6l-4 4 4 4M13 6l4 4-4 4"/></svg>',data:'<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="10" cy="5" rx="6" ry="2.5"/><path d="M4 5v10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5"/></svg>'};
  function chip(item,action,index){
    var href=safeExternalUrl(item.url),nm=esc(paperResName(href)),tip=esc(label(item)+' · '+href);
    if(action==='add')return '<li><button type="button" class="res-chip is-suggest" data-resource-add="'+index+'" title="'+tip+' (눌러서 저장)">+ '+RES_IC[item.kind]+nm+'</button></li>';
    return '<li class="res-chip"><a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer" title="'+tip+'">'+RES_IC[item.kind]+nm+'</a><button type="button" class="res-x" data-resource-remove="'+index+'" aria-label="'+label(item)+' 링크 삭제" title="삭제">×</button></li>';
  }
  function row(item,action,index){
    if(chips)return chip(item,action,index);
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
    if(kindPick)kindPick.sync();
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
function paperTagOptions(selectedTag){
  var untagged='<option value="">'+esc(NOTAG.name)+'</option>';
  var options=S.tags.map(function(tag){
    var selected=tag.id===selectedTag?' selected':'';
    return '<option value="'+esc(tag.id)+'"'+selected+'>'+esc(tag.name)+'</option>';
  });
  return untagged+options.join('');
}
/* 상세 패널 머리: 제목 칸 높이 맞추기, Enter로 제목 확정, 링크는 "주소 ↗ ✎"로 보여 주고 ✎를 눌러 고친다 */
function paperLinkHost(url){try{return new URL(url).hostname.replace(/^www\./,'')}catch(e){return ''}}
function wirePaperHead(p){
  var title=$('#pTitle'),view=$('#pLinkView'),input=$('#pLink');
  if(title&&title.style){
    var fit=function(){title.style.height='auto';title.style.height=title.scrollHeight+'px'};fit();
    title.addEventListener('input',fit);
    title.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();title.blur()}});
  }
  var dl=$('.p-date'),di=$('#pDate');
  if(dl&&di&&dl.addEventListener)dl.addEventListener('click',function(e){e.preventDefault();if(typeof dpOpen==='function')dpOpen(di,dl);else try{di.showPicker()}catch(_){di.focus()}});
  if(!view||!input||typeof view.innerHTML!=='string')return;
  function draw(){
    var href=typeof safeExternalUrl==='function'?safeExternalUrl(p.link):'',host=href&&paperLinkHost(href);
    view.innerHTML=host?'<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer" title="'+esc(href)+'">'+esc(host)+' ↗</a><button type="button" class="p-link-edit" aria-label="링크 수정" title="링크 수정">✎</button>'
      :'<button type="button" class="p-link-edit p-link-add">+ 링크</button>';
  }
  function edit(on){input.hidden=!on;view.hidden=on;if(on){input.focus();input.select&&input.select()}else draw()}
  draw();
  view.addEventListener('click',function(e){if(e.target.closest('.p-link-edit'))edit(true)});
  input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.isComposing){e.preventDefault();input.blur()}else if(e.key==='Escape'){e.preventDefault();input.value=p.link||'';edit(false)}});
  input.addEventListener('blur',function(){if(input.validity&&!input.validity.valid)return;edit(false)});
}
/* 코드·데이터셋 칩에 보일 짧은 이름: GitHub은 저장소 이름, Hugging Face는 데이터셋 이름, arXiv는 번호(쪽), 그 밖에는 주소 끝부분 */
/* PDF에서 찾은 링크 묶기: 같은 저장소의 blob/tree 하위 주소는 저장소 하나로 본다 (github·gitlab·huggingface) */
function paperResRoot(u){
  var m=String(u||'').match(/^(https?:\/\/)(?:www\.)?(github\.com|gitlab\.com)\/([^\/#?]+)\/([^\/#?]+)/i);
  if(m)return 'https://'+m[2].toLowerCase()+'/'+m[3]+'/'+m[4].replace(/\.git$/i,'');
  m=String(u||'').match(/^https?:\/\/(?:www\.)?huggingface\.co\/(datasets\/|spaces\/)?([^\/#?]+)\/([^\/#?]+)/i);
  if(m)return 'https://huggingface.co/'+(m[1]||'')+m[2]+'/'+m[3];
  return String(u||'').replace(/\/+$/,'');
}
function paperResLabel(u){
  var r=paperResRoot(u),m=r.match(/^https:\/\/(github\.com|gitlab\.com|huggingface\.co)\/(?:datasets\/|spaces\/)?(.+)$/);
  if(m)return {name:m[2],host:m[1]};
  try{var x=new URL(u);return {name:paperResName(u),host:x.hostname.replace(/^www\./,'')}}catch(e){return {name:u,host:''}}
}
var PSUGOPEN=null;
/* 코드·데이터셋 보기(칩 + '+' + PDF에서 찾은 링크 제안): 상세 패널과 읽기 화면이 같이 쓴다 */
function paperResViewHtml(p){
  var res=(Array.isArray(p.resources)?p.resources:[]).filter(function(it){return it&&(it.kind==='code'||it.kind==='data')&&safeExternalUrl(it.url)});
  return '<section class="pv-sec pv-line"><h4>코드·데이터셋</h4>'+'<div class="pv-chips">'+(res.length?res.map(function(it){var u=safeExternalUrl(it.url),name=paperResName(u);return '<a class="pv-chip" href="'+esc(u)+'" target="_blank" rel="noopener noreferrer" title="'+(it.kind==='code'?'코드':'데이터셋')+' · '+esc(u)+'"><span class="pv-ic">'+(it.kind==='code'?'<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 6l-4 4 4 4M13 6l4 4-4 4"/></svg>':'<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="10" cy="5" rx="6" ry="2.5"/><path d="M4 5v10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5"/></svg>')+'</span>'+esc(name)+'<span class="pv-arrow" aria-hidden="true">↗</span></a>'}).join(''):'')+(function(){
        /* PDF에서 찾았지만 아직 저장 안 한 링크는 점선 칩으로 바로 보여 주고, 누르면 그 자리에서 저장. 직접 추가도 여기서. */
        var saved=res.map(function(it){return safeExternalUrl(it.url)}),cands=(paperResourceScan(p).candidates||[]).map(function(c,i){return [c,i]}).filter(function(x){return saved.indexOf(x[0].url)<0});
        var IC={code:'<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 6l-4 4 4 4M13 6l4 4-4 4"/></svg>',data:'<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="10" cy="5" rx="6" ry="2.5"/><path d="M4 5v10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5"/></svg>'};
        var h='';
        /* 저장한 칩 줄 끝에 '+ 추가', 그 아래 한 줄로 'PDF에서 찾음: 이름 +' */
        h+='<button type="button" class="pv-add pv-plus" data-res-manual title="코드·데이터셋 링크 추가" aria-label="코드·데이터셋 추가">+</button></div>';
        /* PDF에서 찾은 링크는 '제안' 상자로: 💡 문구 + 링크 미리보기 + [추가] [✕] */
        var st=paperResourceScan(p),hidden=st.dismissed||[];
        cands=cands.filter(function(x){return hidden.indexOf(x[0].url)<0});
        /* 같은 저장소는 한 줄로, 이미 저장한 저장소는 빼고 */
        var savedRoots=saved.map(paperResRoot),seen={},groups=[];
        cands.forEach(function(x){var r=paperResRoot(safeExternalUrl(x[0].url));if(savedRoots.indexOf(r)>-1)return;if(seen[r]){seen[r].urls.push(x[0].url);return}seen[r]={root:r,i:x[1],kind:x[0].kind,urls:[x[0].url]};groups.push(seen[r])});
        var SHOW=3,open=PSUGOPEN===p.id;
        if(groups.length)h+='<div class="pv-suggest'+(open?' open':'')+'" role="group" aria-label="PDF에서 찾은 링크 제안"><p class="pv-suggest-head"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 15h5M8 17.5h4M10 2.5a5 5 0 0 0-3 9c.6.5 1 1.2 1 2V14h4v-.5c0-.8.4-1.5 1-2a5 5 0 0 0-3-9Z"/></svg>PDF에서 찾은 링크'+(groups.length>1?' <em>'+groups.length+'</em>':'')+'</p>'+
          '<div class="pv-suggest-list">'+groups.map(function(g,k){var lb=paperResLabel(g.root);return '<div class="pv-suggest-row'+(k>=SHOW?' pv-more-row':'')+'"><span class="pv-suggest-ic">'+IC[g.kind==='code'?'code':'data']+'</span><a href="'+esc(g.root)+'" target="_blank" rel="noopener noreferrer" title="'+esc(g.root)+'"><b>'+esc(lb.name)+'</b>'+(lb.host?'<small>'+esc(lb.host)+'</small>':'')+'</a><button type="button" class="pv-suggest-add" data-res-add="'+g.i+'" data-res-url="'+esc(g.root)+'">추가</button></div>'}).join('')+'</div>'+
          (groups.length>SHOW?'<button type="button" class="pv-suggest-more" data-res-more>'+(open?'접기':(groups.length-SHOW)+'개 더 보기')+'</button>':'')+
          '<button type="button" class="pv-suggest-x" data-res-skip="'+esc(cands.map(function(x){return x[0].url}).join(' '))+'" aria-label="제안 모두 숨기기" title="모두 숨기기">×</button></div>';
        h+='<form class="pv-addform" data-res-form hidden><span class="pv-kind" role="radiogroup" aria-label="링크 종류"><button type="button" role="radio" data-kind="code" aria-checked="true">코드</button><button type="button" role="radio" data-kind="data" aria-checked="false">데이터셋</button></span>'+
          '<input type="text" inputmode="url" placeholder="링크 붙여넣고 Enter" aria-label="코드·데이터셋 주소"></form><p class="pv-res-msg" data-res-msg hidden></p>';
        return h;
      })()+'</section>';
}
function wirePaperResView(p,root,rerender,visibleNow){
  visibleNow=visibleNow||function(){return root&&root.isConnected};
    var scanSt=paperResourceScan(p);
    scanSt.notify=function(){if(visibleNow())rerender()};
    if(scanSt.status==='idle'&&(p.pdf||(typeof paperResourcePdfUrl==='function'&&paperResourcePdfUrl(p))))setTimeout(function(){scanPaperResources(p)},0);
    var resMsg=$('[data-res-msg]',root),resAdd=function(item){
      var list=(Array.isArray(p.resources)?p.resources:[]).slice();
      if(list.some(function(e){return safeExternalUrl(e.url)===item.url})){if(resMsg){resMsg.hidden=false;resMsg.textContent='이미 저장한 링크예요.'}return}
      list.push(item);p.resources=list;save();if(root.id==='pin')renderAll();else rerender();
    };
    $$('[data-res-add]',root).forEach(function(b){b.addEventListener('click',function(){var c=paperResourceScan(p).candidates[+b.dataset.resAdd];if(c)resAdd(Object.assign({},c,{url:b.dataset.resUrl||c.url}))})});
    var more=$('[data-res-more]',root);if(more)more.addEventListener('click',function(){PSUGOPEN=PSUGOPEN===p.id?null:p.id;rerender()});
    $$('[data-res-skip]',root).forEach(function(b){b.addEventListener('click',function(){var st=paperResourceScan(p);st.dismissed=(st.dismissed||[]).concat(b.dataset.resSkip.split(' '));rerender()})});
    var rm=$('[data-res-manual]',root),rf=$('[data-res-form]',root);
    if(rm&&rf){
      var kind='code',ri=rf.querySelector('input');
      rm.addEventListener('click',function(){rf.hidden=false;rm.hidden=true;ri.focus()});
      $$('[data-kind]',rf).forEach(function(k){k.addEventListener('click',function(){kind=k.dataset.kind;$$('[data-kind]',rf).forEach(function(x){x.setAttribute('aria-checked',String(x===k))});ri.focus()})});
      rf.addEventListener('submit',function(e){e.preventDefault();var u=safeExternalUrl(ri.value);if(!u){if(resMsg){resMsg.hidden=false;resMsg.textContent='올바른 http 또는 https 링크를 붙여넣어 주세요.'}return}resAdd({url:u,kind:kind})});
      ri.addEventListener('keydown',function(e){if(e.key==='Escape'){rf.hidden=true;rm.hidden=false;if(resMsg)resMsg.hidden=true}});
    }
}
function paperResName(u){
  try{
    var x=new URL(u),host=x.hostname.replace(/^www\./,''),seg=x.pathname.split('/').filter(Boolean).map(function(v){try{return decodeURIComponent(v)}catch(e){return v}});
    var page=(x.hash.match(/page=(\d+)/)||[])[1];
    if(/(^|\.)arxiv\.org$/.test(host)&&seg.length>1)return 'arXiv '+seg[1].replace(/v\d+$/,'').replace(/\.pdf$/,'')+(page?' p.'+page:'');
    if(host==='github.com'&&seg.length>=2){var i=seg.indexOf('tree')>-1?seg.indexOf('tree'):seg.indexOf('blob');return i>-1&&seg.length>i+2?seg[seg.length-1]:seg[1]}
    if(host==='huggingface.co'&&seg.length>=2)return seg[seg.length-1];
    var last=seg.length?seg[seg.length-1].replace(/\.(html?|php|aspx?|pdf)$/i,''):'';
    return (last&&!/^(index|download|abs|pdf|data|datasets)$/i.test(last)?last:host)+(page?' p.'+page:'');
  }catch(e){return String(u||'')}
}
/* 상세 패널: 기본은 보기, ✎를 누르면 그 논문만 수정 모드 */
var PEDIT=null,PSNAP=null;
function renderPanel(){
  var panel=$('#panel'),pin=$('#pin');
  var open=S.panel!=='none';panel.classList.toggle('open',open);
  if(!open){pin.innerHTML='';PEDIT=null;PSNAP=null;return}
  if(S.panel==='add'){PEDIT=null;PSNAP=null;renderAddPanel(pin);return}
  var p=paperBy(S.sel);if(!p){S.panel='none';panel.classList.remove('open');return}
  if(PEDIT&&PEDIT!==p.id){PEDIT=null;PSNAP=null}
  var t=tagBy(p.tag);
  var tagOpts=paperTagOptions(p.tag);
  var outs=S.links.filter(function(l){return l.from===p.id}),ins=S.links.filter(function(l){return l.to===p.id});
  function li(l,dir){var o=paperBy(dir==='out'?l.to:l.from);if(!o)return '';return '<li><span class="arr">'+(dir==='out'?'→':'←')+'</span><button type="button" class="go" data-go="'+o.id+'">'+esc(o.title.length>48?o.title.slice(0,48)+'…':o.title)+'</button><button type="button" class="x" data-del="'+l.id+'" aria-label="연결 삭제">삭제</button><span class="why">'+esc(l.reason||'미기록/확인 필요')+'</span></li>'}
  var linkArea='';
  if(S.linking&&S.linking.from===p.id){
    var to=S.linking.to?paperBy(S.linking.to):null;
    if(!to){linkArea='<div class="linkbox"><div class="pair"><span>FROM</span> '+esc(p.title.slice(0,40))+'</div><div>이 논문에서 이동한 논문을 '+(S.view==='card'?'타임라인':'그래프')+'에서 클릭하세요. 태그가 달라도 돼요.</div>'+(S.linking.err?'<div class="lkerr" role="alert">⚠ '+esc(S.linking.err)+'</div>':'')+'<div><button type="button" class="btn sm" id="lkCancel">취소</button></div></div>'}
    else{linkArea='<div class="linkbox"><div class="pair">'+esc(p.title.slice(0,34))+(p.title.length>34?'…':'')+' <span>→</span> '+esc(to.title.slice(0,34))+(to.title.length>34?'…':'')+'</div><label class="field"><span>왜 이 논문으로 넘어갔나요?</span><input type="text" id="lkWhy" placeholder="예: 의료 도메인 적용 사례를 찾으려고" autocomplete="off"></label><div class="paper-form-actions"><button type="button" class="btn pri sm" id="lkOk">연결 저장</button><button type="button" class="btn sm" id="lkCancel">취소</button></div></div>'}
  }else{
    linkArea='<button type="button" class="pv-more pv-plus" id="lkStart" title="이 논문 다음에 읽은 논문 연결" aria-label="이동 경로 추가">+</button>';
  }
  var editing=PEDIT===p.id,dateTxt=esc(String(p.date||'').replace(/-/g,'.'));
  var routes=(outs.length||ins.length)?outs.map(function(l){return [l,'out']}).concat(ins.map(function(l){return [l,'in']})):[];
  if(!editing){
    /* ---- 보기: 수정칸 없이 정보만. 읽은 정도만 바로 바꿀 수 있다. ---- */
    var res=(Array.isArray(p.resources)?p.resources:[]).filter(function(it){return it&&(it.kind==='code'||it.kind==='data')&&safeExternalUrl(it.url)});
    var linkHref=safeExternalUrl(p.link),linkHost=linkHref&&paperLinkHost(linkHref);
    pin.innerHTML='<div class="ph"><span class="pv-tag"><i style="--c:'+t.color+'"></i>'+esc(t.name||'태그 없음')+'</span><div class="ph-acts">'+
      '<button type="button" class="ph-icon" id="pEdit" title="수정" aria-label="논문 수정"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 3.5l4 4M3 17l4.5-1 10-10a2.8 2.8 0 0 0-4-4l-10 10L3 17Z"/></svg></button>'+
      '<button type="button" class="ph-icon" id="pClose" title="닫기" aria-label="닫기"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg></button></div></div><div class="pb pv">'+
      '<div class="p-head"><h3 class="pv-title">'+esc(p.title)+'</h3>'+
      '<div class="p-meta"><select id="pState" class="p-chip" aria-label="읽은 정도">'+stateOpts(p.state)+'</select>'+
      (dateTxt?'<span class="p-dot" aria-hidden="true">·</span><span>'+dateTxt+'</span>':'')+
      (linkHost?'<span class="p-dot" aria-hidden="true">·</span><a class="pv-link" href="'+esc(linkHref)+'" target="_blank" rel="noopener noreferrer" title="'+esc(linkHref)+'">'+esc(linkHost)+' ↗</a>':'')+'</div></div>'+
      '<button type="button" class="btn pri" id="pRead">'+(p.state==='reading'?'이어 읽기':'읽기 화면 열기')+'</button>'+
      '<section class="pv-sec"><h4>저장 이유</h4>'+(p.memo?'<p class="pv-text">'+esc(p.memo)+'</p>':'<p class="empty">아직 적지 않았어요.</p>')+'</section>'+
      paperResViewHtml(p)+
      '<section class="pv-sec pv-line"><h4>이동 경로</h4>'+(routes.length?'<ul class="pv-cards">'+routes.map(function(x){var l=x[0],o=paperBy(x[1]==='out'?l.to:l.from);if(!o)return '';return '<li><button type="button" class="pv-card go" data-go="'+o.id+'" title="'+(x[1]==='out'?'이 논문 다음에 읽은 논문':'이 논문 전에 읽은 논문')+'"><span class="pv-ic">'+(x[1]==='out'?'<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10h12M11 5l5 5-5 5"/></svg>':'<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 10H4M9 5l-5 5 5 5"/></svg>')+'</span><span class="pv-cb"><b>'+esc(o.title)+'</b>'+(l.reason?'<small>'+esc(l.reason)+'</small>':'')+'</span></button></li>'}).join('')+'</ul>':'')+linkArea+'</section>'+
      '</div>';
    $('#pEdit').addEventListener('click',function(){
      PEDIT=p.id;PSNAP={title:p.title,memo:p.memo,tag:p.tag,state:p.state,date:p.date,link:p.link,resources:JSON.parse(JSON.stringify(p.resources||[]))};
      renderAll();var f=$('#pTitle');if(f)f.focus();
    });
    /* 보기 화면에서 바로: PDF에서 찾은 링크 저장, 직접 추가 */
    wirePaperResView(p,pin,function(){renderPanel()},function(){return S.sel===p.id&&S.panel==='detail'&&PEDIT!==p.id&&!S.linking});
  }else{
    /* ---- 수정: 논문 추가 패널과 같은 입력 양식. 바뀐 값은 바로 저장되고, [취소]를 누르면 연 때 값으로 되돌린다. ---- */
    pin.innerHTML='<div class="ph"><span>논문 수정</span><div class="ph-acts"><button type="button" class="ph-icon" id="pClose" title="수정 취소" aria-label="수정 취소"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg></button></div></div><div class="pb p-edit">'+
      '<div class="field"><span>논문 제목</span><textarea id="pTitle" class="a-title" rows="1" aria-label="논문 제목">'+esc(p.title)+'</textarea>'+
      '<div class="p-meta"><span class="tagrow p-tag"><i id="pTagDot" style="--c:'+t.color+'"></i><select id="pTag" class="p-chip" aria-label="태그">'+tagOpts+'</select></span><span class="p-dot" aria-hidden="true">·</span>'+
      '<select id="pState" class="p-chip" aria-label="읽은 정도">'+stateOpts(p.state)+'</select><span class="p-dot" aria-hidden="true">·</span>'+
      '<label class="p-date" title="읽은 날짜 (눌러서 바꾸기)"><span class="p-date-text">'+dateTxt+'</span><input type="date" id="pDate" aria-label="읽은 날짜" value="'+esc(p.date)+'"></label></div></div>'+
      '<label class="field"><span>링크</span><input type="text" id="pLink" value="'+esc(p.link)+'" placeholder="https:// 논문 링크"></label>'+
      '<label class="field"><span>저장 이유</span><textarea id="pMemo" class="a-memo" rows="4">'+esc(p.memo)+'</textarea></label>'+
      paperResourcesHtml('pResources')+
      '<div><h4>이동 경로</h4>'+(routes.length?'<ul class="lklist">'+routes.map(function(x){return li(x[0],x[1])}).join('')+'</ul>':'<p class="empty">아직 연결이 없어요.</p>')+'</div>'+
      '<div class="p-edit-actions"><button type="button" class="btn pri" id="pSave">저장</button><button type="button" class="btn" id="pCancel">취소</button>'+
      '<button type="button" class="p-del" id="pDel"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5.5 5.5l.7 10a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4l.7-10"/></svg> 논문 삭제</button></div>'+
      '</div>';
    var cancelEdit=function(){
      var sn=PSNAP;if(sn&&PEDIT===p.id){p.title=sn.title;p.memo=sn.memo;p.tag=sn.tag;p.state=sn.state;p.date=sn.date;p.link=sn.link;p.resources=sn.resources;save()}
      PEDIT=null;PSNAP=null;renderAll();
    };
    $('#pSave').addEventListener('click',function(){PEDIT=null;PSNAP=null;renderAll()});
    $('#pCancel').addEventListener('click',cancelEdit);
    var tf=$('#pTitle');
    if(tf&&tf.style){var fit=function(){tf.style.height='auto';tf.style.height=tf.scrollHeight+'px'};fit();tf.addEventListener('input',fit);
      tf.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();tf.blur()}})}
    var dl=$('.p-date'),di=$('#pDate');
    if(dl&&di&&dl.addEventListener)dl.addEventListener('click',function(e){e.preventDefault();if(typeof dpOpen==='function')dpOpen(di,dl)});
    $('#pTag').addEventListener('change',function(e){p.tag=e.target.value;renderAll()});
    $('#pMemo').addEventListener('change',function(e){p.memo=e.target.value;renderAll()});
    $('#pTitle').addEventListener('change',function(e){p.title=e.target.value.trim()||p.title;renderAll()});
    var linkInput=$('#pLink');
    ['input','change'].forEach(function(type){linkInput.addEventListener(type,function(e){persistPaperLink(p,e.target.value,type==='change')})});
    var resBox=$('#pResources');if(resBox&&resBox.classList){resBox.classList.add('res-chips');var fh=$('[data-found-resources] h5',resBox),fp=$('[data-found-resources] .empty',resBox),mb=$('[data-manual-resources]',resBox);if(fh)fh.title='인용한 자료의 링크도 포함될 수 있어요.';if(fp)fp.remove();if(mb)mb.textContent='+ 링크'}
    wirePaperResources(resBox,p);
    $('#pDate').addEventListener('change',function(e){if(e.target.value){p.date=e.target.value;renderAll();ensureVisible(p.id)}});
    $$('[data-del]',pin).forEach(function(b){b.addEventListener('click',function(){ask('이 연결을 삭제할까요?','연결 이유도 함께 사라져요.','삭제',function(){S.links=S.links.filter(function(l){return l.id!==b.dataset.del});renderAll()},true)})});
  }
  $('#pClose').addEventListener('click',function(){if(editing){$('#pCancel').click();return}closeDetailPanel()});
  $('#pState').addEventListener('change',function(e){p.state=e.target.value||null;renderAll()});
  var rd=$('#pRead');if(rd)rd.addEventListener('click',function(){openReader(p.id)});
  $$('[data-go]',pin).forEach(function(b){b.addEventListener('click',function(){select(b.dataset.go)})});
  var ls=$('#lkStart');if(ls)ls.addEventListener('click',function(){S.linking={from:p.id,to:null};renderAll()});
  var lc=$('#lkCancel');if(lc)lc.addEventListener('click',function(){S.linking=null;renderAll()});
  var lo=$('#lkOk');if(lo){
    var saveLink=function(){
      var why=$('#lkWhy').value.trim();
      var dup=S.links.filter(function(l){return l.from===S.linking.from&&l.to===S.linking.to})[0];
      if(dup)dup.reason=why;else S.links.push({id:nid('l'),from:S.linking.from,to:S.linking.to,reason:why});
      S.linking=null;renderAll();
    };
    lo.addEventListener('click',saveLink);$('#lkWhy').addEventListener('keydown',function(e){if(e.key==='Enter')saveLink()});$('#lkWhy').focus();
  }
  if(!editing)return;
  $('#pDel').addEventListener('click',function(){
    var nl=S.links.filter(function(l){return l.from===p.id||l.to===p.id}).length;
    ask('이 논문을 삭제할까요?','"'+short(p.title,40)+'"'+(nl?'와 연결 '+nl+'개가':'가')+' 사라져요.','삭제',function(){
      S.links=S.links.filter(function(l){return l.from!==p.id&&l.to!==p.id});
      S.papers=S.papers.filter(function(x){return x.id!==p.id});D.pos.delete(p.id);idbDel(p.id);
      S.sel=null;S.panel='none';S.linking=null;PEDIT=null;PSNAP=null;
      if(!S.papers.length){S.example=false;renderAll();return}
      renderAll();
    },true);
  });
}
function renderAddPanel(pin,account){
  /* 이미 열려 있는 추가 폼은 다시 그리지 않는다. (다른 화면 갱신 때문에 쓰던 제목·링크·PDF가 지워지지 않게) */
  if(!account&&pin.querySelector&&pin.querySelector('#addForm'))return;
  var d=S.draft||{};var date=account?'':(d.date&&/^20\d\d-\d\d-\d\d$/.test(d.date))?d.date:todayStr();
  var tagOpts=paperTagOptions(d.tag);
  pin.innerHTML='<div class="ph"><span>새 논문</span><div class="ph-acts"><button type="button" class="ph-icon" id="pClose" title="닫기" aria-label="닫기"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg></button></div></div><form class="pb" id="addForm" novalidate>'+
  /* 제목 → 태그·읽은 정도·날짜 → 링크·PDF → 저장 이유 순서. 칸마다 작은 이름표와 옅은 바탕으로 구분한다. */
  '<div class="field"><span>논문 제목 <b>*</b></span><div class="a-title-wrap"><textarea id="aTitle" class="a-title" rows="1" autocomplete="off" aria-label="논문 제목" placeholder="논문 제목을 입력하세요"></textarea><div class="a-title-sub" id="aTitleSub" hidden></div><div class="a-bubble" id="aTitleTip" role="status" hidden><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v4.5M10 6.5v.01"/></svg><span>제목을 못 불러왔어요. 직접 입력해 주세요.</span></div></div>'+
  '<div class="p-meta">'+(account?'':'<span class="tagrow p-tag"><i id="aTagDot" style="--c:'+tagBy(d.tag).color+'"></i><select id="aTag" class="p-chip" aria-label="태그">'+tagOpts+'</select></span><span class="p-dot" aria-hidden="true">·</span>')+
  '<select id="aState" class="p-chip" aria-label="읽은 정도">'+stateOpts(account?'':'reading')+'</select><span class="p-dot" aria-hidden="true">·</span>'+
  '<label class="p-date" title="읽은 날짜 (눌러서 바꾸기)"><span class="p-date-text" id="aDateText">'+(date?esc(date.replace(/-/g,'.')):'읽은 날짜')+'</span><input type="date" id="aDate" aria-label="읽은 날짜" value="'+esc(date)+'"></label></div></div>'+
  /* 로그인 모드: 이미 등록한 논문을 고를 수 있다 */
  (account&&account.documents.length?'<label class="field"><span>등록한 논문 사용</span><select id="aDocument"><option value="">새 논문</option>'+account.documents.map(function(x){return '<option value="'+esc(x.document_id)+'">'+esc(x.title||'제목 미기록')+'</option>'}).join('')+'</select></label>':'')+
  '<div class="field a-src"><span>링크·PDF</span>'+
  '<div class="a-tabs" role="tablist" aria-label="논문 가져오기"><button type="button" role="tab" data-src-tab="pdf" aria-selected="true">PDF</button><button type="button" role="tab" data-src-tab="link" aria-selected="false">링크</button></div>'+
  '<label class="a-drop" id="aDrop" data-src-pane="pdf"><input type="file" id="aFile" accept="application/pdf,.pdf" hidden><svg class="a-drop-icon" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5"/><path d="M12 12v8M9 15l3-3 3 3"/></svg><b class="a-drop-title">PDF를 여기로 끌어오세요</b>'+(account?'<span class="a-drop-text">또는 <u>파일 선택</u> · '+(account.uploadPdf?'계정에 비공개로 저장 · 10MiB 이하':'파일명만 계정에 기록')+'</span>':'<span class="a-drop-text">또는 <u title="PDF는 이 브라우저에만 저장돼요. 다른 기기에서는 다시 올려야 해요.">파일 선택</u> · 60MB 이하</span>')+'<em id="aFname"></em></label>'+
  '<div class="a-drop a-linkpane" data-src-pane="link" hidden><svg class="a-drop-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/></svg><b class="a-drop-title">논문 링크를 붙여넣으세요</b>'+
  '<div class="srcrow"><span class="a-src-input"><input type="text" id="aSrc" placeholder="https://arxiv.org/abs/…" autocomplete="off"><i class="a-src-state" id="aSrcState" aria-hidden="true"></i></span></div></div>'+
  '<p class="empty" id="aSrcMsg" hidden></p></div>'+
  '<label class="field a-memo-field"><span>저장 이유 '+(account?'<em class="opt">(선택)</em>':'<b>*</b>')+'</span><textarea id="aMemo" rows="4" class="a-memo" placeholder="이 논문을 왜 저장했나요?"></textarea></label>'+
  '<p class="empty" id="aErr" hidden></p>'+
  '<div class="paper-form-actions"><button type="submit" class="btn pri">'+(account?'프로젝트에 추가':'타임라인에 추가')+'</button><button type="button" class="btn" id="aCancel">취소</button></div></form>';
  /* 로그인 모드: 저장(제출)·닫기는 계정 쪽(account-projects.js)이 먼저 맡고, 아래 화면 동작(탭·끌어오기·제목 불러오기)만 같이 쓴다. */
  if(account)wireAccountPaperForm(account);
  if(!account){
    $('#pClose').addEventListener('click',function(){S.panel='none';renderAll()});
    $('#aCancel').addEventListener('click',function(){S.panel='none';renderAll()});
  }
  (function(){
    var memo=$('#aMemo');
    if(memo&&memo.style){var grow=function(){memo.style.height='auto';memo.style.height=Math.min(240,Math.max(104,memo.scrollHeight+2))+'px'};memo.addEventListener('input',grow)}
    var t=$('#aTitle'),di=$('#aDate'),dl=di&&di.closest?di.closest('.p-date'):null,tg=$('#aTag'),dot=$('#aTagDot');
    if(t&&t.style){var fit=function(){t.style.height='auto';t.style.height=t.scrollHeight+'px'};fit();t.addEventListener('input',fit);
      t.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();var m=$('#aMemo');if(m)m.focus()}})}
    if(dl&&dl.addEventListener)dl.addEventListener('click',function(e){e.preventDefault();if(typeof dpOpen==='function')dpOpen(di,dl)});
    if(di&&di.addEventListener)di.addEventListener('change',function(){var tx=$('#aDateText');if(tx)tx.textContent=String(di.value||'').replace(/-/g,'.')});
    if(tg&&dot&&tg.addEventListener)tg.addEventListener('change',function(){dot.style.setProperty('--c',tagBy(tg.value).color)});
  })();
  S.draftMeta=null;S.draftFile=null;
  /* 제목을 못 불러오거나 논문 같지 않으면 제목 칸 아래에 말풍선으로 알려 준다. */
  var autoTitle='';
  var titleTip=function(on,text){var t=$('#aTitleTip');if(!t)return;if(on){var sp=t.querySelector('span');if(sp)sp.textContent=text||'제목을 못 불러왔어요. 직접 입력해 주세요.'}t.hidden=!on;if(t.parentNode&&t.parentNode.classList)t.parentNode.classList.toggle('is-tip',on);document.removeEventListener('pointerdown',tipOff,true);if(on)setTimeout(function(){document.addEventListener('pointerdown',tipOff,true)},0)};
  /* 말풍선은 다른 곳을 누르거나(제목 칸 포함) 제목을 입력하기 시작하면 사라진다. */
  var tipOff=function(){titleTip(false)};
  $('#aTitle').addEventListener('input',function(){titleTip(false)});
  /* 자동으로 채운 제목은 파랗게 두었다가, 다른 곳을 누르면 원래 회색으로 돌아간다. */
  var markFilled=function(t){
    t.classList.add('is-filled');
    setTimeout(function(){
      var off=function(e){if(t.contains(e.target))return;t.classList.remove('is-filled');document.removeEventListener('pointerdown',off,true)};
      document.addEventListener('pointerdown',off,true);
    },0);
  };
  /* 링크나 PDF가 들어오면 큰 안내(아이콘·제목)를 접고 입력칸·파일 이름만 남겨 패널이 넘치지 않게 한다. */
  var compactSrc=function(){
    var link=$('.a-linkpane'),pdf=$('#aDrop'),src=$('#aSrc');
    if(link)link.classList.toggle('is-compact',!!(src&&src.value.trim()));
    if(pdf)pdf.classList.toggle('is-compact',!!S.draftFile);
  };
  /* 링크 칸 오른쪽 끝: 불러오는 중이면 도는 원, 불러왔으면 ✓. 제목 칸은 불러오는 동안 '제목 불러오는 중…' */
  var fetchState=function(st){
    var box=$('#aSrcState'),t=$('#aTitle');
    if(box)box.className='a-src-state'+(st?' is-'+st:'');
    if(t){t.classList.toggle('is-loading',st==='loading');t.placeholder=st==='loading'?'제목 불러오는 중…':'논문 제목을 입력하세요'}
    if(st!=='done'){var sub=$('#aTitleSub');if(sub)sub.hidden=true}
  };
  var msg=function(t,bad){var m=$('#aSrcMsg');m.hidden=!t;m.textContent=t||'';m.style.color=bad?'var(--c3)':'var(--mute)'};
  var lastFetched='';
  var doFetch=function(){
    var v=$('#aSrc').value.trim();if(!v){msg('링크를 붙여넣어 주세요.',true);return}
    if(v===lastFetched)return;lastFetched=v;
    var ref=parseRef(v);
    if(ref.type==='invalid'){msg('올바른 http 또는 https 링크를 입력해 주세요.',true);return}
    if(ref.link){$('#aSrc').value=ref.link;lastFetched=ref.link}
    msg('');titleTip(false);fetchState('loading');
    var mine=lastFetched;
    fetchMeta(ref).then(function(m){
      if(mine!==lastFetched)return;
      S.draftMeta=m;fetchState('done');
      var t=$('#aTitle');
      if(m.title&&!t.value.trim()){t.value=m.title;t.dispatchEvent(new Event('input'));markFilled(t)}
      var sub=$('#aTitleSub'),who=m.authors?m.authors.split(', ')[0]+(m.authors.indexOf(',')>-1?' 외':''):'';
      if(sub){sub.textContent=[m.year,who].filter(Boolean).join(' · ');sub.hidden=!sub.textContent}
      $('#aMemo').focus();
    }).catch(function(){if(mine!==lastFetched)return;fetchState('');titleTip(true);$('#aTitle').focus()});
  };
  /* [불러오기] 버튼 없이: 붙여넣으면 바로, 직접 치면 잠깐 멈췄을 때(논문 주소로 보일 때만), Enter·칸을 벗어날 때 불러온다. */
  var src=$('#aSrc'),typeTimer=0;
  src.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();doFetch()}});
  src.addEventListener('paste',function(){setTimeout(function(){compactSrc();if(parseRef(src.value).type!=='invalid')doFetch()},0)});
  src.addEventListener('input',function(){
    compactSrc();clearTimeout(typeTimer);if(src.value.trim()!==lastFetched)fetchState('');
    typeTimer=setTimeout(function(){var t=parseRef(src.value).type;if(t==='arxiv'||t==='doi'||t==='s2'||t==='openreview')doFetch()},700);
  });
  src.addEventListener('change',function(){clearTimeout(typeTimer);if(src.value.trim()&&parseRef(src.value).type!=='invalid')doFetch()});
  var tabs=$$('[data-src-tab]',pin);
  tabs.forEach(function(t){t.addEventListener('click',function(){
    tabs.forEach(function(x){x.setAttribute('aria-selected',String(x===t))});
    $$('[data-src-pane]',pin).forEach(function(p){p.hidden=p.dataset.srcPane!==t.dataset.srcTab});
    if(t.dataset.srcTab==='link')$('#aSrc').focus();
  })});
  var drop=$('#aDrop');
  if(drop&&drop.addEventListener){
    ['dragenter','dragover'].forEach(function(t){drop.addEventListener(t,function(e){e.preventDefault();drop.classList.add('is-over')})});
    ['dragleave','dragend'].forEach(function(t){drop.addEventListener(t,function(){drop.classList.remove('is-over')})});
    drop.addEventListener('drop',function(e){
      e.preventDefault();drop.classList.remove('is-over');
      var f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0];if(!f)return;
      if(!/\.pdf$/i.test(f.name)&&f.type!=='application/pdf'){msg('PDF 파일만 올릴 수 있어요.',true);return}
      try{var fi=$('#aFile');if(fi&&e.dataTransfer.files){fi.files=e.dataTransfer.files;if(account){fi.dispatchEvent(new Event('change',{bubbles:true}));return}}}catch(_){}
      takeFile(f);
    });
  }
  $('#aFile').addEventListener('change',function(e){takeFile(e.target.files[0])});
  function takeFile(f){
    if(!f)return;
    if(f.size>60*1024*1024){msg('PDF가 너무 커요(60MB 이하만).',true);return}
    S.draftFile=f;$('#aFname').textContent=f.name;
    if(drop)drop.classList.add('has-file');compactSrc();
    msg('');titleTip(false);
    /* 첫 쪽을 읽어 제목을 채우고, 논문 같지 않으면 말풍선으로 알려 준다(추가는 막지 않음). */
    var t=$('#aTitle'),fallback=f.name.replace(/\.pdf$/i,'').replace(/[_]+/g,' '),canFill=function(){return !t.value.trim()||t.value===autoTitle};
    var warn=false,fill=function(v){if(v&&canFill()){t.value=v;autoTitle=v;t.dispatchEvent(new Event('input'));markFilled(t)}if(warn)titleTip(true,'논문이 아닌 것 같아요. 그래도 추가할 수 있어요.')};
    if(canFill())fetchState('loading');
    if(typeof pdfPeek!=='function'){fill(fallback);fetchState('');return}
    pdfPeek(f).then(function(r){
      if(S.draftFile!==f)return;
      warn=!r.isPaper;
      if(!r.ref){fetchState('');fill(r.title||fallback);return}
      var src=$('#aSrc');if(src&&!src.value.trim()){src.value=r.ref.link||'';lastFetched=src.value;compactSrc()}
      return fetchMeta(r.ref).then(function(m){
        if(S.draftFile!==f)return;
        S.draftMeta=m;fetchState('done');fill(m.title||r.title||fallback);
        var sub=$('#aTitleSub'),who=m.authors?m.authors.split(', ')[0]+(m.authors.indexOf(',')>-1?' 외':''):'';
        if(sub){sub.textContent=[m.year,who].filter(Boolean).join(' · ');sub.hidden=!sub.textContent}
      }).catch(function(){fetchState('');fill(r.title||fallback)});
    }).catch(function(){if(S.draftFile!==f)return;fetchState('');fill(fallback)});
  }
  if(account)return;
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

/* 화면이 좁아(1000px 이하) 패널이 타임라인 위에 겹쳐 열릴 때: 패널 바깥의 빈 곳을 누르면 닫는다.
   버튼·카드·입력칸처럼 제 역할이 있는 곳, 연결 고르는 중, 확인창·달력·메뉴 위에서는 닫지 않는다. */
if(typeof document!=='undefined'&&document.addEventListener){
  document.addEventListener('click',function(e){
    if(typeof S==='undefined'||S.panel==='none'||S.linking)return;
    if(!(window.matchMedia&&window.matchMedia('(max-width:1000px)').matches))return;
    var t=e.target,panel=document.getElementById('panel');
    if(!t||!t.closest||!t.isConnected||!panel||panel.contains(t))return;
    if(t.closest('button,a,input,select,textarea,label,[role="button"],[role="tab"],.card,.dn,.mtl-card,.ov,.dp,.pick-menu,.tt,#rbub'))return;
    if(typeof closeDetailPanel==='function')closeDetailPanel();
  });
}
