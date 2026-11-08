'use strict';
/* ---------- AI 호출 자리 (지금은 고정 규칙 응답) ----------
   실제 AI를 붙일 때는 aiSuggest 하나만 서버 호출로 바꾸면 된다.
   반환: Promise<{ok:true, action:string|null, source:string}>  /  {ok:false}
   - action이 null이면 "행동이 분명하지 않음" → 화면에서 다시 묻는다
   - 실패 시험: 주소 뒤에 ?aifail=1 을 붙이면 호출 실패로 동작
   주의: 이 응답은 실제 모델 응답이 아니라 규칙으로 만든 예시이므로 화면에 "예시 응답"이라고 표시한다.

   규칙 (AGENTS 절대 규칙 1, SPEC AC2·AC3, parse_query.md 규칙 5)
   1) 메모를 문장으로, 문장을 "~는데 / ~지만 / ~하고 / ~했고 / ," 뒤에서 절로 나눈다.
      연결 표현은 앞 절에 남겨 "확인했고"의 완료 표시가 잘려 나가지 않게 한다.
   2) 행동 표현(확인·읽기·비교·정리 등)이 있는 절만 후보로 본다.
   3) "봤·했·끝냄·완료·확인함"처럼 이미 끝낸 표현이 있는 절은 뺀다.
   4) 남은 후보가 하나면 그것을 고른다.
   5) 후보가 여럿이면 "먼저·우선·부터"로 사용자가 고른 절이 딱 하나일 때만 그것을 고른다.
      그렇지 않으면 첫 항목이나 중요해 보이는 항목을 임의로 고르지 않고 null을 돌려준다.
   6) 후보가 없으면 null. */
var AI_STUB=true;
var NA_ACT=/(확인|읽어|읽기|비교|정리|찾아|살펴|해보|해 보|해야|봐야|물어|테스트|돌려|설명)/;
var NA_DONE=/(봤|했|읽었|끝냈|끝냄|끝났|끝남|완료|마쳤|마침|마무리)/;
var NA_DONE_END=/(확인함|정리함|비교함|읽음|다 ?봄|살펴봄)\s*$/;
var NA_PICK=/(먼저|우선|부터)/;
var NA_SPLIT=/(?<=는데|지만|고서|하고|었고|았고|했고|,)\s+/;
function naIsDone(c){return NA_DONE.test(c)||NA_DONE_END.test(c)}
function pickAction(memo){
  var sents=String(memo||'').split(/[\n.。!?]+/).map(function(s){return s.trim()}).filter(Boolean);
  var cands=[];
  sents.forEach(function(s){
    s.split(NA_SPLIT).forEach(function(c){
      c=c.trim();
      if(c&&NA_ACT.test(c)&&!naIsDone(c))cands.push({clause:c,sentence:s});
    });
  });
  var pick=null;
  if(cands.length===1)pick=cands[0];
  else if(cands.length>1){
    var chosen=cands.filter(function(x){return NA_PICK.test(x.clause)});
    if(chosen.length===1)pick=chosen[0];
  }
  if(!pick)return {action:null,source:''};
  return {action:pick.clause,source:pick.sentence};
}
function aiSuggest(memo){
  return new Promise(function(res){
    setTimeout(function(){
      if(/[?&]aifail=1/.test(location.search))return res({ok:false});
      var r=pickAction(memo);
      res({ok:true,action:r.action,source:r.source});
    },600);
  });
}
