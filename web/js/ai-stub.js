'use strict';
/* ---------- AI 호출 자리 (지금은 고정 규칙 응답) ----------
   실제 AI를 붙일 때는 이 함수 하나만 서버 호출로 바꾸면 된다.
   반환: Promise<{ok:true, action:string|null, source:string}>  /  {ok:false}
   - action이 null이면 "행동이 분명하지 않음"
   - 실패 시험: 주소 뒤에 ?aifail=1 을 붙이면 호출 실패로 동작
   주의: 이 응답은 실제 모델 응답이 아니라 규칙으로 만든 예시이므로 화면에 "예시 응답"이라고 표시한다. */
var AI_STUB=true;
function aiSuggest(memo){
  return new Promise(function(res){
    setTimeout(function(){
      if(/[?&]aifail=1/.test(location.search))return res({ok:false});
      var sents=String(memo||'').split(/[\n.。!?]+/).map(function(s){return s.trim()}).filter(Boolean);
      var hit=null;
      for(var i=0;i<sents.length;i++){if(/(확인|읽어|읽기|비교|정리|찾아|살펴|해보|해야|봐야|물어|테스트|돌려)/.test(sents[i])){hit=sents[i];break}}
      if(!hit)return res({ok:true,action:null,source:''});
      res({ok:true,action:hit.length>70?hit.slice(0,70):hit,source:hit});
    },600);
  });
}
