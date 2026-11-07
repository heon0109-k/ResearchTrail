'use strict';
/* ?demo=1 : 시작 페이지 안에 끼워 넣는 미리보기. 저장된 기록을 읽지도 쓰지도 않고 예시만 보여 준다 */
if(window.name==='rt-demo'||/[?&]demo=1/.test(location.search)){document.documentElement.classList.add('demo');loadSample();S.zoom='month';S.bubble=null;renderAll()}
else if(!load()){if(landingSeen())startEmpty();else showLanding()}
