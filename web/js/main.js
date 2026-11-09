'use strict';
/* ?demo=1 : 시작 페이지 안에 끼워 넣는 미리보기. 저장된 기록을 읽지도 쓰지도 않고 예시만 보여 준다 */
if(window.name==='rt-demo'||/[?&]demo=1/.test(location.search)){document.documentElement.classList.add('demo');loadSample();S.zoom='month';S.bubble=null;renderAll()}
else if(!(isPageReload()&&restoreSessionScreen())&&!load({timeline:!isPageReload(),restoreView:isPageReload()})){
  var seenLanding=landingSeen();
  landingMark();
  if(seenLanding)startEmpty();else showLanding();
}

function isPageReload(){try{return performance.getEntriesByType('navigation')[0].type==='reload'}catch(e){return false}}

function restoreSessionScreen(){
  try{
    var screen=sessionStorage.getItem('researchtrail.screen');
    if(screen==='landing'){showLanding();return true}
    if(screen!=='example')return false;
    var state=JSON.parse(sessionStorage.getItem('researchtrail.example')||'null');
    if(!state||!Array.isArray(state.papers)||!Array.isArray(state.tags))return false;
    RET=hasMine();reset();
    ['name','tags','papers','links','view','listQuery','listScroll','reader','sel','panel','bands','zoom','overviewZoom','overviewPan','filterTag','scroll','bubble','bubbleGap','judge','next','why'].forEach(function(k){if(Object.prototype.hasOwnProperty.call(state,k))S[k]=state[k]});
    if(['week','month','all'].indexOf(S.zoom)<0)S.zoom='month';
    S.example=true;S.restoreViewOnce=true;uid=Math.max(uid,+state.uid||0);showMain();return true;
  }catch(e){return false}
}
