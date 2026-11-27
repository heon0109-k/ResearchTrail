'use strict';
/* ---------- 프로젝트: 연구·과제별로 논문과 읽기 기록을 나눠 본다 ----------
   프로젝트마다 기록을 다른 localStorage 키에 저장한다.
   첫 프로젝트는 기존 키(researchtrail.v5)를 그대로 써서 기존 기록을 옮기거나 바꾸지 않는다.
   목록(이름·키·지금 프로젝트)은 researchtrail.projects 에 둔다. */
var PROJ_KEY='researchtrail.projects',PROJ_BASE='researchtrail.v5';
function projRead(){try{var r=JSON.parse(localStorage.getItem(PROJ_KEY)||'null');if(r&&Array.isArray(r.list)&&r.list.length)return r}catch(e){}return null}
function projWrite(r){try{localStorage.setItem(PROJ_KEY,JSON.stringify(r));return true}catch(e){return false}}
function projData(x){try{return JSON.parse(localStorage.getItem(x.key)||'null')}catch(e){return null}}
function projEnsure(){
  var r=projRead();
  if(!r){var o=projData({key:PROJ_BASE}),name=o&&!o.example&&o.name?String(o.name):'';r={active:'p0',list:[{id:'p0',key:PROJ_BASE,name:name||'내 타임라인'}]};projWrite(r)}
  if(!r.list.some(function(x){return x.id===r.active})){r.active=r.list[0].id;projWrite(r)}
  return r;
}
function projById(id){return projEnsure().list.filter(function(x){return x.id===id})[0]||null}
function projActive(){var r=projEnsure();return projById(r.active)}
function projCount(x){if(x.id===projEnsure().active&&!S.example)return S.papers.length;var o=projData(x);return o&&Array.isArray(o.papers)?o.papers.length:0}
function projCleanName(name){return String(name||'').replace(/\s+/g,' ').trim().slice(0,60)}
/* 앱이 켜질 때: 지금 프로젝트의 키를 쓰고, 논문 번호(uid)는 모든 프로젝트 중 가장 큰 값부터 이어 쓴다(PDF 저장 키가 겹치지 않게). */
function projBoot(){
  var r=projEnsure(),a=projActive();KEY=a.key;
  r.list.forEach(function(x){var o=projData(x);if(o)uid=Math.max(uid,+o.uid||0)});
}
function projCreate(name){
  var r=projEnsure(),n=projCleanName(name)||'새 프로젝트',id='p'+Date.now().toString(36)+Math.floor(Math.random()*1296).toString(36);
  r.list.push({id:id,key:PROJ_BASE+'.'+id,name:n});return projWrite(r)?id:null;
}
function projRename(id,name){
  var r=projEnsure(),x=r.list.filter(function(p){return p.id===id})[0],n=projCleanName(name);if(!x||!n)return false;
  x.name=n;projWrite(r);
  if(id===r.active&&!S.example){S.name=n;save()}
  else{var o=projData(x);if(o){o.name=n;o.storageRevision=(+o.storageRevision||0)+1;try{localStorage.setItem(x.key,JSON.stringify(o))}catch(e){}}}
  return true;
}
function projSwitch(id){
  var r=projEnsure(),t=projById(id),fromExample=!!S.example;if(!t||(id===r.active&&!fromExample))return false;
  /* 예시를 보다가 고르면 예시에서 빠져나와 그 프로젝트로 들어간다(예시는 저장하지 않는다). */
  if(fromExample){S.example=false;if(typeof RET!=='undefined')RET=false}else save();
  r.active=id;projWrite(r);KEY=t.key;STORE_REVISION=null;
  try{sessionStorage.removeItem('researchtrail.view')}catch(e){}
  if(typeof D!=='undefined'){D.pos=new Map();D.inited=false}
  if(typeof LIST_STATE!=='undefined')LIST_STATE='all';
  if(!load({timeline:true})){reset();S.example=false;S.name=t.name;showMain();save()}
  if(typeof renderAll==='function')renderAll();
  return true;
}
function projDelete(id){
  var r=projEnsure(),x=projById(id);if(!x)return false;
  /* 마지막 하나를 지우면: 기록과 PDF를 지우고 빈 '내 타임라인'으로 다시 시작한다. */
  if(r.list.length<2){
    var o0=projData(x);if(o0&&Array.isArray(o0.papers)&&typeof idbDel==='function')o0.papers.forEach(function(p){if(p.pdf)idbDel(p.id)});
    try{localStorage.removeItem(x.key)}catch(e){}
    r.list[0].name='내 타임라인';projWrite(r);STORE_REVISION=null;
    if(!S.example){reset();S.name='내 타임라인';showMain();save()}
    return true;
  }
  if(id===r.active){var other=r.list.filter(function(p){return p.id!==id})[0];projSwitch(other.id);r=projEnsure()}
  var o=projData(x);
  if(o&&Array.isArray(o.papers)&&typeof idbDel==='function')o.papers.forEach(function(p){if(p.pdf)idbDel(p.id)});
  try{localStorage.removeItem(x.key)}catch(e){}
  r.list=r.list.filter(function(p){return p.id!==id});projWrite(r);return true;
}
/* 저장할 때마다 목록의 이름을 지금 타임라인 이름과 맞춘다. */
function projSyncName(){if(S.example||S.source==='account')return;var r=projEnsure(),a=r.list.filter(function(x){return x.id===r.active})[0],n=projCleanName(S.name);if(a&&n&&a.name!==n){a.name=n;projWrite(r)}}
if(typeof save==='function'){var _projSave=save;save=function(){var ok=_projSave.apply(this,arguments);if(ok)try{projSyncName()}catch(e){}return ok}}
/* 빈 프로젝트를 처음 열 때: 이름은 '내 타임라인' 대신 그 프로젝트 이름으로. */
function startEmpty(){clearStore();reset();var a=projActive();S.name=a&&a.name||'내 타임라인';showMain()}

/* ---------- 제목을 눌러 여는 프로젝트 메뉴 (노트북: 제목 아래, 휴대폰: 아래 시트) ---------- */
var PJM={more:null,rename:null,newing:false};
// Set only by the signed-in project screen; browser projects retain their synchronous storage.
var projAccountMenu=null;
function createAccountProjectMenu({catalog,select,request,refresh}){
  const retries=new Map();
  async function change(path,method,fields,choose){
    const previous=catalog().active;
    const operation=JSON.stringify([method,path,fields]);
    if(!retries.has(operation))retries.set(operation,crypto.randomUUID());
    const saved=await request(path,{...fields,request_id:retries.get(operation)},{method});
    const active=catalog().active;
    await refresh(active===previous?choose(saved):active);
    retries.delete(operation);
  }
  return {
    catalog,select,
    create:name=>change('/tasks','POST',{goal_text:name},row=>row.task_id),
    rename:(id,name)=>change('/tasks/'+encodeURIComponent(id),'PATCH',{goal_text:name},()=>catalog().active),
    remove:id=>change('/tasks/'+encodeURIComponent(id),'DELETE',{},()=>catalog().active===id?null:catalog().active),
    sample:()=>window.open(new URL('browser.html?sample=1',location.href),'_blank','noopener')
  };
}
function projNewFromWorkspace(){
  if(!projMenuOpen())projMenuToggle();
  PJM.newing=!projAccountMenu || !projAccountMenu.catalog().list.length;
  projMenuRender();
}
function projMenuOpen(){return !!document.getElementById('pjm')}
function projMenuClose(){var m=document.getElementById('pjm'),o=document.getElementById('pjmOv');if(m)m.remove();if(o)o.remove();PJM={more:null,rename:null,newing:false};var t=$('#tName');if(t)t.setAttribute('aria-expanded','false')}
function projMenuHtml(){
  var r=projAccountMenu?projAccountMenu.catalog():projEnsure();
  var CHECK='<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8"/></svg>';
  var MORE='<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="4.5" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="15.5" cy="10" r="1.6"/></svg>';
  var h='<div class="project-menu-grip" aria-hidden="true"></div><div class="project-menu-heading">'+'프로젝트'+'</div><div class="project-menu-list">';
  /* 예시 타임라인: 목록 맨 위. 둘러보기용이라 이름 바꾸기·삭제(⋯)는 없다. */
  if((!projAccountMenu||projAccountMenu.sample)&&typeof loadSample==='function'){var ex=!!S.example,sn=ex?S.papers.length:(typeof SAMPLE_PAPERS!=='undefined'?Object.keys(SAMPLE_PAPERS).length:0);
    h+='<div class="project-menu-row project-menu-sample'+(ex?' on':'')+'"><button type="button" class="project-menu-select" data-pj-sample="1"'+(ex?' aria-current="true"':'')+'><span class="project-menu-name">의료 논문 검색에 RAG를 쓰는 방법</span><span class="project-menu-tag">예시</span><em>'+sn+'편</em>'+'<i class="project-menu-checkmark">'+(ex?CHECK:'')+'</i>'+'</button></div>'}
  r.list.forEach(function(x){
    var on=x.id===r.active&&!S.example;
    if(PJM.rename===x.id){h+='<div class="project-menu-row editing"><input class="project-menu-input" id="pjmRename" maxlength="60" value="'+esc(x.name)+'" aria-label="프로젝트 이름"></div>';return}
    var open=PJM.more===x.id;
    var n=projAccountMenu?x.count:projCount(x);
    var count=Number.isSafeInteger(n)?'<em>'+n+'편</em>':'';
    h+='<div class="project-menu-row'+(on?' on':'')+(open?' acting':'')+'"><button type="button" class="project-menu-select" data-pj-go="'+esc(x.id)+'"'+(on?' aria-current="true"':'')+'><span class="project-menu-name">'+esc(x.name)+'</span>'+(open?'':count+'<i class="project-menu-checkmark">'+(on?CHECK:'')+'</i>')+'</button>'+
      (open?'<div class="project-menu-actions" role="group" aria-label="'+esc(x.name)+' 관리"><button type="button" data-pj-rename="'+esc(x.id)+'">이름 바꾸기</button><button type="button" class="dng" data-pj-del="'+esc(x.id)+'">삭제</button></div>':'')+
      (projAccountMenu&&!projAccountMenu.rename?'':'<button type="button" class="project-menu-more" data-pj-more="'+esc(x.id)+'" aria-label="'+esc(x.name)+' 더보기" aria-expanded="'+open+'">'+MORE+'</button>')+
    '</div>';
  });
  h+='</div>';
  h+=PJM.newing?'<div class="project-menu-row editing"><input class="project-menu-input" id="pjmNew" maxlength="60" placeholder="새 프로젝트 이름" aria-label="새 프로젝트 이름"></div>':'<button type="button" class="project-menu-new" data-pj-new="1">+ 새 프로젝트</button>';
  if(projAccountMenu?.rename&&r.active)h+='<button type="button" class="project-menu-new" data-pj-records="1">프로젝트 기록</button>';
  return h;
}
function projMenuRender(){
  var m=document.getElementById('pjm');if(!m)return;
  m.innerHTML=projMenuHtml();
  var t=$('#tName');
  if(t&&!(window.matchMedia&&window.matchMedia('(max-width:600px)').matches)){var b=t.getBoundingClientRect();m.style.left=Math.max(8,b.left-6)+'px';m.style.top=(b.bottom+8)+'px'}
  else{m.style.left='';m.style.top=''}
  var ren=document.getElementById('pjmRename'),nw=document.getElementById('pjmNew'),inp=ren||nw;
  if(inp){inp.focus();if(ren)inp.select();
    var done=false;
    function commit(){if(done)return;done=true;var v=projCleanName(inp.value);
      if(projAccountMenu&&v){
        if(!inp.isConnected)return;
        inp.disabled=true;
        const pending=ren?projAccountMenu.rename(PJM.rename,v):projAccountMenu.create(v);
        pending.then(function(){if(inp.isConnected)projMenuClose()},function(){
          if(!inp.isConnected)return;
          done=false;inp.disabled=false;inp.focus();inp.setCustomValidity('프로젝트를 저장하지 못했어요. 다시 시도해 주세요.');inp.reportValidity();
        });return;
      }
      if(ren){var rid=PJM.rename;PJM.rename=null;if(v)projRename(rid,v);if(typeof renderAll==='function')renderAll();projMenuRender()}
      else{PJM.newing=false;if(v){var id=projCreate(v);projMenuClose();if(id)projSwitch(id);return}projMenuRender()}}
    inp.addEventListener('input',function(){inp.setCustomValidity('')});
    inp.addEventListener('keydown',function(e){if(e.isComposing||e.keyCode===229)return;if(e.key==='Enter'){e.preventDefault();commit()}else if(e.key==='Escape'){e.stopPropagation();done=true;PJM.rename=null;PJM.newing=false;projMenuRender()}});
    inp.addEventListener('blur',function(){setTimeout(commit,0)});
  }
}
function projMenuToggle(){
  if(typeof returnFromStandaloneExample==='function'&&returnFromStandaloneExample())return;
  if(projMenuOpen()){projMenuClose();return}
  var ov=document.createElement('div');ov.className='project-menu-backdrop';ov.id='pjmOv';ov.addEventListener('click',projMenuClose);
  var m=document.createElement('div');m.className='project-menu';m.id='pjm';m.setAttribute('role','dialog');m.setAttribute('aria-label','프로젝트');
  document.body.appendChild(ov);document.body.appendChild(m);
  var t=$('#tName');if(t)t.setAttribute('aria-expanded','true');
  m.addEventListener('click',function(e){
    var sm=e.target.closest('[data-pj-sample]');
    if(sm){projMenuClose();if(projAccountMenu){projAccountMenu.sample();return}if(!S.example){save();if(typeof RET!=='undefined')RET=typeof hasMine==='function'?hasMine():true;loadSample();if(typeof renderAll==='function')renderAll()}return}
    var g=e.target.closest('[data-pj-go]'),mo=e.target.closest('[data-pj-more]'),rn=e.target.closest('[data-pj-rename]'),dl=e.target.closest('[data-pj-del]'),nw=e.target.closest('[data-pj-new]');
    if(mo){PJM.more=PJM.more===mo.dataset.pjMore?null:mo.dataset.pjMore;projMenuRender();return}
    if(rn){PJM.more=null;PJM.rename=rn.dataset.pjRename;projMenuRender();return}
    if(nw){PJM.more=null;PJM.newing=true;projMenuRender();return}
    if(e.target.closest('[data-pj-records]')){projMenuClose();accountWorkspace.openRecords();return}
    if(dl&&projAccountMenu){
      const target=projAccountMenu.catalog().list.find(row=>row.id===dl.dataset.pjDel);
      if(!target)return;
      projMenuClose();
      ask('프로젝트 삭제','“'+target.name+'” 프로젝트를 계정 작업공간의 목록에서 삭제할까요?','삭제',function(){
        projAccountMenu.remove(target.id).catch(()=>toast('프로젝트 삭제를 확인하지 못했어요. 다시 시도해 주세요.'));
      },true);
      return;
    }
    if(dl){var x=projById(dl.dataset.pjDel);if(!x)return;var n=projCount(x);projMenuClose();
      ask('프로젝트 삭제','"'+x.name+'"의 논문 '+n+'편과 읽기 기록이 모두 지워져요.'+(projEnsure().list.length<2?' 빈 타임라인으로 다시 시작해요.':'')+' 되돌릴 수 없어요.','삭제',function(){projDelete(x.id);if(typeof renderAll==='function')renderAll()},true);return}
    if(g){var id=g.dataset.pjGo;projMenuClose();if(projAccountMenu)Promise.resolve(projAccountMenu.select(id)).catch(()=>toast('프로젝트를 불러오지 못했어요. 다시 열어 주세요.'));else projSwitch(id);return}
    if(PJM.more&&!e.target.closest('.project-menu-actions')){PJM.more=null;projMenuRender()}
  });
  m.addEventListener('keydown',function(e){if(e.key==='Escape'&&!PJM.rename&&!PJM.newing){projMenuClose();var tt=$('#tName');if(tt)tt.focus()}});
  projMenuRender();
}
if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('resize',function(){if(projMenuOpen())projMenuRender()});
if(S.source!=='account'&&!(typeof explicitExample!=='undefined'&&explicitExample)&&typeof localStorage!=='undefined'&&typeof document!=='undefined'&&document.getElementById&&!document.getElementById('accountProjects'))try{projBoot()}catch(e){}
