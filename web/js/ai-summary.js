'use strict';
/* ---------- AI 누적 정리 (실험 기능, 기본 꺼짐) ----------
   켜면 이 논문의 메모만 Google Gemini로 보내 "확인한 것 · 남은 질문 · 다음 할 일"로 정리한다.
   - 키와 설정은 이 브라우저의 localStorage에만 저장한다(팀 테스트용).
   - 모델이 돌려준 각 줄은 실제 메모 id를 근거로 달아야 화면에 남는다. 근거가 없는 줄은 버린다.
   - 다음 할 일은 자동 저장하지 않는다. 사용자가 "다음 할 일로 저장"을 눌러야 p.todo가 바뀐다. */
var AI_KEY='researchtrail.ai';
var AI_ENDPOINT='https://generativelanguage.googleapis.com/v1beta';
var AI_MODEL='gemini-3.5-flash-lite';
var AI_FALLBACK_MODEL=AI_MODEL;
var AI_TIMEOUT_MS=45000;
var AI_RETRY_DELAY_MS=1000;
var AI_RT={pid:null,st:'idle',err:'',token:0,timer:null,setup:false,requestHash:null,todoEdit:null,recentMemo:null};

function aiCfg(){
  try{var o=JSON.parse(localStorage.getItem(AI_KEY)||'null');if(o&&typeof o==='object')return {on:!!o.on,key:String(o.key||''),model:String(o.model||''),consent:!!o.consent}}catch(e){}
  return {on:false,key:'',model:'',consent:false};
}
function aiSaveCfg(c){try{localStorage.setItem(AI_KEY,JSON.stringify({on:!!c.on,key:c.key||'',model:c.model||'',consent:!!c.consent}));return true}catch(e){return false}}
function aiOn(){var c=aiCfg();return c.on&&!!c.key&&c.consent}

/* 정리에 쓸 메모 모음. id는 화면의 기록 id와 같다. */
function aiSources(p){
  var out=[];
  if(p.memo&&String(p.memo).trim())out.push({id:'reason',label:'저장 이유',page:null,memo:String(p.memo).trim(),quote:''});
  if(p.note&&String(p.note).trim())out.push({id:'legacy-note',label:'논문 메모',page:null,memo:String(p.note).trim(),quote:''});
  (p.hl||[]).forEach(function(h){
    var memo=String(h.mine||'').trim();if(!memo)return;
    var page=Number.isSafeInteger(+h.page)&&+h.page>0?+h.page:null;
    out.push({id:String(h.id),label:(page?'p.'+page+' ':'')+'메모',page:page,memo:memo,quote:h.type==='note'||h.img?'':String(h.text||'').slice(0,240)});
  });
  var notes=new Map(out.filter(function(x){return x.id!=='reason'}).map(function(x){return [x.id,x]}));
  var latest=null,latestAt=-Infinity;
  (p.noteHistory||[]).forEach(function(entry){
    var note=notes.get(entry.source_highlight_id||'legacy-note');
    if(note&&Number.isFinite(entry.created_at)&&entry.created_at>=latestAt){
      latest=note;latestAt=entry.created_at;
    }
  });
  var pending=AI_RT.recentMemo;
  if(pending&&pending.pid===p.id&&pending.at>=latestAt)latest=notes.get(pending.id)||latest;
  if(latest)latest.recent=true;
  return out;
}
function aiHash(sources,todo){
  var s=JSON.stringify([sources.map(function(x){return [x.id,x.memo,x.quote]}),todo||'']),h=5381;
  for(var i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;
  return 'h4_'+(h>>>0).toString(36)+'_'+s.length;
}
function aiMemoHash(sources){return aiHash(sources.filter(function(s){return s.id!=='reason'}),'')}
function aiLastSavedAction(p){
  return (p.actionHistory||[]).slice().reverse().find(function(entry){return 'final_action' in entry});
}
function aiSameTodo(a,b){
  function comparable(value){
    return String(value||'').normalize('NFKC').toLowerCase()
      .replace(/\p{P}/gu,function(mark,index,text){
        return /\d/.test(text[index-1]||'')&&/\d/.test(text[index+1]||'')?mark:' ';
      })
      .replace(/([을를])\s+보면서(?=\s|$)/g,'$1')
      .split(/\s+/)
      .map(function(word){return word.replace(/([가-힣a-z0-9]{2,})(?:에서|에게|으로|을|를|은|는|에|의|와|과|로)$/u,'$1')})
      .join('');
  }
  var left=comparable(a),right=comparable(b);
  return !!left&&left===right;
}

function aiPrompt(p,sources){
  var lines=sources.map(function(x){
    return '- id: '+x.id+' | '+x.label+(x.recent?' | 가장 최근 메모':'')+(x.quote?' | 원문: "'+x.quote.replace(/\s+/g,' ')+'"':'')+' | 메모: '+x.memo.replace(/\s+/g,' ');
  }).join('\n');
  return [
    '너는 학생이 논문 읽기를 멈췄다 돌아왔을 때 바로 이어 갈 수 있게 메모를 정리하는 도우미다.',
    '아래 메모만 근거로 쓴다. 메모에 없는 사실, 논문 내용, 추측은 절대 추가하지 않는다.',
    '',
    '논문 제목: '+(p.title||'(제목 없음)'),
    '현재 저장된 다음 할 일 (참고용): '+(p.todo?p.todo:'(없음)'),
    '메모 목록:',
    lines,
    '',
    '출력 규칙:',
    '1. done: 읽기 메모에서 학생이 이미 확인했거나 이해했다고 명시한 것. 저장 이유와 선택한 원문은 확인한 기록으로 세지 않는다. 최대 3개.',
    '2. open: 모든 읽기 메모를 함께 읽고, 같은 개념이나 목표를 다루는 질문은 쉬운 말 한 문장으로 묶는다. 이미 해결한 내용은 빼고, 연결 근거가 약한 질문은 따로 남긴다. 최대 3개.',
    '3. next: 메모를 종합했을 때 다시 읽으며 바로 확인할 수 있는 행동 한 가지를 쓴다. 관련 질문이 여럿이면 서로 어떤 관계인지 확인할 수 있는 작업을 제안하고 관련 메모 id를 모두 단다. 사용자가 다음에 할 일을 명시했다면 그 의도를 우선한다.',
    '   메모에 "먼저", "부터", "다음엔", "우선"처럼 순서를 직접 적었으면, 현재 저장된 다음 할 일보다 그 메모의 할 일을 next에 우선한다. 우선순위가 충돌하면 가장 최근 메모를 따른다. 명시된 우선 작업을 open에만 넣지 않는다.',
    '   현재 저장된 다음 할 일은 참고용이다. 메모가 바뀌지 않았을 때만 그대로 유지하고, 저장된 할 일을 말만 바꿔 새로 제안하지 않는다.',
    '   새 메모에 궁금한 점이나 이해하기 어려운 부분이 적혀 있으면, 순서를 따로 쓰지 않아도 그 부분을 다시 확인하는 행동 한 가지를 next에 제안한다. 메모가 짧으면 그 메모의 쪽 번호와 선택한 원문을 단서로 쓴다.',
    '4. 예를 들어 한 메모에 논문이 답하려는 큰 질문의 뜻이 궁금하다고 쓰고 다른 메모에 Leiden을 왜 쓰는지 적었다면, 두 곳을 함께 읽고 논문의 목표와 Leiden 단계가 어떻게 연결되는지 확인하는 작업을 제안한다. 두 내용의 실제 관계를 단정하거나 메모에 없는 쪽을 추가하지 않는다.',
    '5. 사용자가 우선순위를 직접 정하지 않았고 open에 남은 질문이 있으면 그 종합 결과를 바탕으로 next를 쓴다. 관련된 메모 한 건만 있다면 그 기록을 근거로 쓰고, 남은 작업이나 질문이 없으면 next.text를 비운다. 논문 저장 이유만으로는 작업을 제안하지 않는다.',
    '6. 모든 항목의 sources에는 근거가 된 메모 id를 위 목록에서 그대로 적는다. 근거 없는 항목은 만들지 않는다.',
    '7. 한국어, 각 항목은 60자 이내의 짧은 문장. 메모에 적힌 기한(예: 금요일까지)은 그대로 유지한다. done의 설명은 해요체로 쓰고, next.text와 open은 할 일 목록처럼 "~하기"로 끝낸다(예: "4쪽에서 Leiden 설명 확인하기"). "~한다", "~이다"로 끝내지 않는다.'
  ].join('\n');
}
var AI_SCHEMA={type:'OBJECT',properties:{
  done:{type:'ARRAY',items:{type:'OBJECT',properties:{text:{type:'STRING'},sources:{type:'ARRAY',items:{type:'STRING'}}},required:['text','sources']}},
  open:{type:'ARRAY',items:{type:'OBJECT',properties:{text:{type:'STRING'},sources:{type:'ARRAY',items:{type:'STRING'}}},required:['text','sources']}},
  next:{type:'OBJECT',properties:{text:{type:'STRING'},sources:{type:'ARRAY',items:{type:'STRING'}}},required:['text','sources']}
},required:['done','open','next']};

/* 모델 응답 검증: 근거 id가 실제 메모에 없으면 그 줄을 버린다. */
function aiNormalize(raw,validIds){
  var ok={};(validIds||[]).forEach(function(id){ok[String(id)]=true});
  function item(x){
    if(!x||typeof x!=='object')return null;
    var text=typeof x.text==='string'?x.text.replace(/\s+/g,' ').trim():'';
    if(!text)return null;if(text.length>120)text=text.slice(0,119)+'…';
    var src=(Array.isArray(x.sources)?x.sources:[]).map(String).filter(function(id,i,a){return ok[id]&&a.indexOf(id)===i});
    if(!src.length)return null;
    return {text:text,sources:src};
  }
  function list(a){return (Array.isArray(a)?a:[]).map(item).filter(Boolean).slice(0,3)}
  var o=raw&&typeof raw==='object'?raw:{};
  var next=item(o.next);
  if(next&&!next.sources.some(function(id){return id!=='reason'}))next=null;
  return {done:list(o.done),open:list(o.open),next:next};
}
function aiParseText(text){
  var t=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'');
  return JSON.parse(t);
}

function aiFetch(url,opts){
  var ctl=typeof AbortController==='function'?new AbortController():null,timer;
  if(ctl){opts.signal=ctl.signal;timer=setTimeout(function(){ctl.abort()},AI_TIMEOUT_MS)}
  return fetch(url,opts).then(function(r){
    if(timer)clearTimeout(timer);
    return r.text().then(function(body){
      if(!r.ok){var msg='';try{msg=JSON.parse(body).error.message}catch(e){}var err=new Error(msg||('HTTP '+r.status));err.status=r.status;throw err}
      return body?JSON.parse(body):{};
    });
  },function(e){if(timer)clearTimeout(timer);if(e&&e.name==='AbortError'){var t=new Error('TIMEOUT');t.timeout=true;throw t}throw e});
}
function aiCheckModel(key){
  return aiFetch(AI_ENDPOINT+'/models/'+AI_MODEL,{headers:{'x-goog-api-key':key}});
}
function aiPickModel(key){
  return aiCheckModel(key).then(function(){return AI_MODEL});
}
/* 메모 정리는 깊은 추론이 필요 없어서 생각(thinking)을 최소로 줄여 응답 시간을 줄인다.
   Gemini 3 이상은 thinkingLevel, 2.5는 thinkingBudget을 쓴다. 모델이 거부하면 설정 없이 한 번 더 보낸다. */
function aiThinking(model){
  var m=String(model||'').match(/gemini-(\d+)(?:\.(\d+))?/);if(!m)return null;
  var major=+m[1],minor=+(m[2]||0);
  if(major>=3)return {thinkingLevel:'low'};
  if(major===2&&minor>=5)return {thinkingBudget:0};
  return null;
}
function aiCall(cfg,prompt,stillCurrent){
  var model=AI_MODEL;
  function send(thinking){
    var gen={temperature:0.2,responseMimeType:'application/json',responseSchema:AI_SCHEMA};
    if(thinking)gen.thinkingConfig=thinking;
    return aiFetch(AI_ENDPOINT+'/models/'+encodeURIComponent(model)+':generateContent',{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':cfg.key},
      body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:gen})
    });
  }
  var thinking=aiThinking(model);
  return send(thinking).catch(function(e){
    if(!stillCurrent())throw e;
    if(e&&e.status===503){
      return new Promise(function(resolve){setTimeout(resolve,AI_RETRY_DELAY_MS)}).then(function(){
        if(!stillCurrent())throw e;
        return send(thinking);
      });
    }
    if(thinking&&e&&e.status===400&&/think/i.test(e.message||''))return send(null);
    throw e;
  }).then(function(j){
    var parts=(((j.candidates||[])[0]||{}).content||{}).parts||[];
    var text=parts.map(function(x){return x.text||''}).join('');
    if(!text)throw new Error('EMPTY');
    return aiParseText(text);
  });
}

function aiErrorText(e){
  if(e&&e.timeout)return 'Gemini 응답이 45초 안에 오지 않았어요. 잠시 뒤 "다시 정리"를 눌러 주세요.';
  if(e&&e.status===503)return 'Gemini가 일시적으로 응답할 수 없어요. 잠시 뒤 "다시 정리"를 눌러 주세요.';
  if(e&&(e.status===400||e.status===401||e.status===403))return 'API 키를 확인해 주세요. ('+(e.message||e.status)+')';
  if(e&&e.status===429)return '요청 한도를 넘었어요. 1분쯤 뒤 다시 정리해 주세요.';
  if(e&&e.status===404)return 'Gemini Flash-Lite 모델을 사용할 수 없어요. 이 키의 프로젝트에서 모델 접근 권한을 확인해 주세요.';
  if(e instanceof SyntaxError||(e&&e.message==='EMPTY'))return '정리 결과를 읽지 못했어요. 다시 정리해 주세요.';
  return '정리하지 못했어요. 인터넷 연결을 확인하고 다시 정리해 주세요.';
}

function aiRun(p,force){
  if(!p||!aiOn())return;
  var cfg=aiCfg(),sources=aiSources(p),hash=aiHash(sources,p.todo);
  if(!sources.length){AI_RT.st='idle';AI_RT.err='';aiRender(p);return}
  if(AI_RT.st==='busy'&&AI_RT.pid===p.id&&AI_RT.requestHash===hash)return;
  var memoHash=aiMemoHash(sources),last=aiLastSavedAction(p);
  if(last&&last.kind==='ai'&&!last.source_memo_hash&&last.final_action===p.todo&&
    p.aiSum&&p.aiSum.hash===hash&&p.aiSum.next&&p.aiSum.next.text===last.original_candidate){
    last.source_memo_hash=memoHash;save();
  }
  if(!force&&p.aiSum&&p.aiSum.hash===hash){aiRender(p);return}
  var token=++AI_RT.token;AI_RT.pid=p.id;AI_RT.requestHash=hash;AI_RT.st='busy';AI_RT.err='';aiRender(p);
  function stillCurrent(){
    return token===AI_RT.token&&aiOn()&&S.reader===p.id&&hash===aiHash(aiSources(p),p.todo);
  }
  var ids=sources.map(function(x){return x.id}),recent=sources.find(function(x){return x.recent});
  var unchanged=last&&last.kind==='ai'&&last.final_action===p.todo&&last.source_memo_hash===memoHash;
  var priority=recent&&/먼저|부터|우선|다음[엔에은]|다음 할 일/.test(recent.memo);
  function improveNext(sum){
    if(!recent||unchanged)return sum;
    var pending=priority||/모르|몰라|궁금|헷갈|이해.*(?:안|못)|확인|다시 보|찾아/.test(recent.memo)||
      sum.open.some(function(item){return item.sources.indexOf(recent.id)!==-1});
    var duplicate=sum.next&&(aiSameTodo(sum.next.text,p.todo)||(last&&last.final_action===p.todo&&aiSameTodo(sum.next.text,last.original_candidate)));
    var missedLatest=sum.next&&sum.next.sources.indexOf(recent.id)===-1;
    if(!pending||(sum.next&&!duplicate&&!missedLatest))return sum;
    if(priority&&missedLatest)sum.next=null;
    var prompt=aiPrompt({title:p.title},sources)+'\n이번에는 가장 최근 메모(id: '+recent.id+
      ')를 중심으로 next만 다시 제안한다. 그 메모의 확인할 점을 바로 실행할 수 있는 행동 한 가지로 바꾸고, sources에 이 메모 id를 넣는다. 다른 메모는 뜻을 이해하는 데 참고하고, 확인할 점이 정말 없으면 비운다. done과 open은 빈 배열로 둔다.';
    return aiCall(cfg,prompt,stillCurrent).then(function(raw){
      if(!stillCurrent())return sum;
      var next=aiNormalize(raw,ids).next;
      if(next&&next.sources.indexOf(recent.id)!==-1&&!aiSameTodo(next.text,p.todo)&&
        !(last&&last.final_action===p.todo&&aiSameTodo(next.text,last.original_candidate)))sum.next=next;
      return sum;
    }).catch(function(){return sum});
  }
  aiCall(cfg,aiPrompt(p,sources),stillCurrent).then(function(raw){
    if(!stillCurrent())return;
    return improveNext(aiNormalize(raw,ids));
  }).then(function(sum){
    if(!sum||!stillCurrent())return;
    p.aiSum={hash:hash,at:Date.now(),model:AI_MODEL,done:sum.done,open:sum.open,next:sum.next};
    save();AI_RT.st='idle';aiRender(p);
  }).catch(function(e){
    if(!stillCurrent())return;
    AI_RT.st='error';AI_RT.err=aiErrorText(e);aiRender(p);
  }).finally(function(){
    if(token===AI_RT.token&&AI_RT.st==='busy')AI_RT.st='idle';
  });
}
function aiSchedule(p,delay){
  if(!p||!aiOn())return;
  clearTimeout(AI_RT.timer);
  AI_RT.timer=setTimeout(function(){if(S.reader===p.id)aiRun(p,false)},delay==null?1500:delay);
}

function aiSourceLabel(p,id){
  var x=aiSources(p).filter(function(s){return s.id===id})[0];
  return x?x.label:'삭제된 메모';
}
function aiChips(p,ids){
  /* 근거는 쪽 번호만, 같은 쪽은 한 번만. 3개가 넘으면 "외 N쪽"을 눌러 펼친다. */
  var seen={},chips=[];
  (ids||[]).forEach(function(id){
    var l=aiSourceLabel(p,id),m=l.match(/^p\.(\d+)/),key=m?'p'+m[1]:'id:'+id;
    if(seen[key])return;seen[key]=true;
    chips.push({id:id,label:m?m[1]+'쪽':l.replace(/ 메모$/,'')||'메모',title:l,n:m?+m[1]:1e9});
  });
  chips.sort(function(a,b){return a.n-b.n});
  function b(c){return '<button type="button" class="ai-chip" data-ai-src="'+esc(c.id)+'" title="'+esc(c.title)+' 보기">'+esc(c.label)+'</button>'}
  var head=chips.slice(0,3).map(b).join(''),rest=chips.slice(3);
  return '<span class="ai-src">'+head+(rest.length?'<button type="button" class="ai-more" aria-expanded="false">외 '+rest.length+'쪽</button><span class="ai-rest" hidden>'+rest.map(b).join('')+'</span>':'')+'</span>';
}
function aiConfirmedNotes(sources){
  return sources.filter(function(source){
    if(source.id==='reason')return false;
    var memo=source.memo.replace(/[\s.!?。…]+/g,'');
    return /(?:확인했음|확인했다|확인했어요|확인함|이해했음|이해했다|이해했어요|이해함)$/.test(memo)&&
      !/(?:못(?:확인|이해)|(?:아직|안|못)(?:확인|이해)|이해(?:가|는)?안|모르겠)/.test(memo);
  }).slice(-3).map(function(source){return {text:source.memo,sources:[source.id]}});
}
function aiEditTodo(p,field){
  if(!aiOn())return false;
  AI_RT.todoEdit={pid:p.id,value:field.value,suggestion:field.aiSuggestion};
  aiRender(p);
  return true;
}

function aiSetupHtml(c){
  return '<div class="ai-setup">'+
    '<label class="field"><span>Gemini API 키</span><input type="password" id="aiKey" autocomplete="off" spellcheck="false" placeholder="AIza…" value="'+esc(c.key)+'"></label>'+
    '<p class="reader-hint">키는 Google AI Studio(aistudio.google.com)에서 만들 수 있어요. 이 브라우저에만 저장되고, 다른 사람과 같은 컴퓨터를 쓰면 보일 수 있어요.</p>'+
    '<label class="ai-consent"><input type="checkbox" id="aiConsent"'+(c.consent?' checked':'')+'> 정리할 때마다 이 논문의 메모와 제목이 Google Gemini로 전송되는 것에 동의해요.</label>'+
    '<div class="ai-row"><button type="button" class="btn pri sm" id="aiSave">저장하고 켜기</button><button type="button" class="btn sm" id="aiCancel">취소</button></div>'+
    '<p class="ai-msg" id="aiMsg" role="status"></p></div>';
}
function aiRender(p){
  var box=$('#rAi'),reader=$('#reader');if(!box||!p)return;
  var details=$('#aiSummaryDetails'),expanded=details&&details.open;
  var c=aiCfg(),on=aiOn(),field=$('#rTodo');
  if(reader)reader.classList.toggle('ai-on',on);
  if(!on&&field&&field.aiDraft){
    field.value=p.todo||'';field.aiDraft=false;field.aiSuggestion=null;
    resizeReaderTodo();
  }
  if(!on||AI_RT.setup){
    box.innerHTML='<div class="ai-head"><h3>AI 정리 <em class="ai-badge">실험</em></h3>'+(AI_RT.setup?'':'<button type="button" class="record-add" id="aiOpen">켜기</button>')+'</div>'+
      (AI_RT.setup?aiSetupHtml(c):'');
    aiWireSetup(p);return;
  }
  var s=p.aiSum,sources=aiSources(p),stale=!s||s.hash!==aiHash(sources,p.todo);
  var n=stale?null:s.next;
  var saved=p.todo||'',edit=AI_RT.todoEdit&&AI_RT.todoEdit.pid===p.id?AI_RT.todoEdit:null;
  var last=aiLastSavedAction(p),memoHash=aiMemoHash(sources);
  if(n&&(aiSameTodo(n.text,saved)||(last&&last.final_action===saved&&
    (aiSameTodo(last.original_candidate,n.text)||(last.kind==='ai'&&last.source_memo_hash===memoHash)))))n=null;
  if(n)n=Object.assign({},n,{memoHash:memoHash});
  var suggestion=edit?edit.suggestion:n;
  var value=edit?edit.value:n?n.text:saved;
  var changed=value.trim()!==saved;
  if(field){
    if(field.value!==value)field.value=value;
    field.aiDraft=true;field.aiSuggestion=suggestion;
    resizeReaderTodo();
    /* AI가 채운 칸에는 글자 대신 반짝이 아이콘을 칸 오른쪽 위에 붙인다. */
    var wrap=field.parentNode,mark=wrap&&wrap.querySelector('.ai-mark');
    if(wrap&&!mark){mark=document.createElement('span');mark.className='ai-mark';mark.setAttribute('role','img');mark.setAttribute('aria-label','AI가 메모를 보고 제안했어요. 눌러서 고칠 수 있어요');mark.setAttribute('data-tip','AI가 메모를 보고 제안했어요 · 눌러서 고칠 수 있어요');mark.tabIndex=0;
      mark.innerHTML='<svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 1.5c.4 3.9 2.6 6.1 6.5 6.5-3.9.4-6.1 2.6-6.5 6.5-.4-3.9-2.6-6.1-6.5-6.5 3.9-.4 6.1-2.6 6.5-6.5Z"/><path d="M16 12.5c.2 1.7 1.1 2.6 2.8 2.8-1.7.2-2.6 1.1-2.8 2.8-.2-1.7-1.1-2.6-2.8-2.8 1.7-.2 2.6-1.1 2.8-2.8Z" opacity=".7"/></svg>';
      wrap.appendChild(mark)}
    var isAi=changed&&!edit;
    if(mark)mark.hidden=!isAi;
    if(wrap)wrap.classList.toggle('ai-draft',isAi);
  }
  var busy=AI_RT.st==='busy'&&AI_RT.pid===p.id;
  var body='';
  if(changed){
    body='<div class="ai-row">'+(edit?'<span class="ai-status">저장 전</span>':'')+'<button type="button" class="btn pri sm" id="aiUse">'+(edit?'저장':'이걸로 저장')+'</button></div>';
  }
  var summary=suggestion?'<p class="ai-basis">참고한 메모 '+aiChips(p,suggestion.sources)+'</p>':'';
  function section(title,items){
    if(!items.length)return '';
    return '<div class="ai-sec"><h4>'+title+'</h4><ul>'+items.map(function(x){
      return '<li>'+esc(x.text)+' '+aiChips(p,x.sources)+'</li>';
    }).join('')+'</ul></div>';
  }
  summary+=section('확인했다고 적은 메모',aiConfirmedNotes(sources));
  if(s&&!stale)summary+=section('아직 궁금한 점',s.open||[]);
  box.innerHTML=body+(busy?'<p class="ai-status" role="status">정리 중…</p>':'')+
    (AI_RT.st==='error'&&AI_RT.pid===p.id?'<p class="ai-err" role="alert">'+esc(AI_RT.err)+'</p>':'')+
    '<details id="aiSummaryDetails" class="reader-extra"'+(expanded?' open':'')+'><summary>AI 정리 보기</summary><div class="ai-setup">'+summary+
    '<div class="ai-tools"><button type="button" class="record-add" id="aiRedo"'+(busy?' disabled':'')+'>다시 정리</button><button type="button" class="record-add ai-off" id="aiSettings">설정</button></div></div></details>';
  /* 저장 버튼을 할 일 칸 안 오른쪽 아래로 옮겨, 칸과 한 덩어리로 보이게 한다. */
  var fw=field&&field.parentNode;
  if(fw){$$('.ai-use-in,.ai-edit-hint',fw).forEach(function(x){x.remove()});fw.classList.remove('has-save')}
  var useBtn=$('#aiUse');
  if(useBtn&&fw){var row=useBtn.parentNode;useBtn.className='ai-use-in';useBtn.textContent='저장';fw.appendChild(useBtn);fw.classList.add('has-save');if(row&&row.classList.contains('ai-row'))row.remove()}
  if(typeof resizeReaderTodo==='function')resizeReaderTodo();
  aiWireView(p,suggestion);
}
function aiWireSetup(p){
  var open=$('#aiOpen');if(open)open.addEventListener('click',function(){AI_RT.setup=true;aiRender(p);var k=$('#aiKey');if(k)k.focus()});
  var cancel=$('#aiCancel');if(cancel)cancel.addEventListener('click',function(){AI_RT.setup=false;aiRender(p)});
  var sv=$('#aiSave');if(!sv)return;
  sv.addEventListener('click',function(){
    var key=($('#aiKey').value||'').trim(),consent=$('#aiConsent').checked,msg=$('#aiMsg');
    if(!key){msg.textContent='API 키를 넣어 주세요.';return}
    if(!consent){msg.textContent='메모 전송에 동의해야 켤 수 있어요.';return}
    sv.disabled=true;msg.textContent='Gemini Flash-Lite 연결을 확인하는 중…';
    aiCheckModel(key).then(function(){
      if(!aiSaveCfg({on:true,key:key,model:AI_MODEL,consent:true})){msg.textContent='설정을 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.';sv.disabled=false;return}
      AI_RT.setup=false;aiRender(p);aiRun(p,true);
    }).catch(function(e){sv.disabled=false;msg.textContent=aiErrorText(e)});
  });
}
function aiWireView(p,n){
  var redo=$('#aiRedo');if(redo)redo.addEventListener('click',function(){aiRun(p,true)});
  var st=$('#aiSettings');if(st)st.addEventListener('click',function(){
    ask('AI 정리를 끌까요?','끄면 메모가 더 이상 전송되지 않고, 메모마다 "다음 할 일 찾기" 버튼이 다시 보여요. 저장한 키도 이 브라우저에서 지워요.','끄기',function(){
      aiSaveCfg({on:false,key:'',model:'',consent:false});++AI_RT.token;AI_RT.st='idle';AI_RT.err='';AI_RT.todoEdit=null;aiRender(p);
    },true);
  });
  var use=$('#aiUse');if(use)use.addEventListener('click',function(){
    var field=$('#rTodo'),value=field.value.trim();
    var oldTodo=p.todo,oldSrc=p.todoSrc;
    p.todo=value;p.todoSrc=n?'ai':'manual';
    var oldLen=Array.isArray(p.actionHistory)?p.actionHistory.length:0;
    var entry={kind:p.todoSrc,final_action:value};
    if(n)Object.assign(entry,{original_candidate:n.text,source_record_ids:n.sources.slice(),source_memo_hash:n.memoHash,model:p.aiSum.model});
    rememberAction(p,entry);
    if(!save()&&!S.example){p.todo=oldTodo;p.todoSrc=oldSrc;if(Array.isArray(p.actionHistory))p.actionHistory.length=oldLen;AI_RT.st='error';AI_RT.pid=p.id;AI_RT.err='다음 할 일을 저장하지 못했어요. 다시 눌러 주세요.';aiRender(p);return}
    if(p.aiSum&&p.aiSum.hash===aiHash(aiSources(p),oldTodo))p.aiSum.hash=aiHash(aiSources(p),p.todo);
    AI_RT.todoEdit=null;
    save();
    if(typeof renderHistory==='function')renderHistory(p);
    if(typeof renderRbar==='function')renderRbar();
    aiRender(p);
  });
  $$('.ai-more').forEach(function(m){m.addEventListener('click',function(e){e.preventDefault();var r=m.nextElementSibling;if(r){r.hidden=false;m.remove()}})});
  $$('[data-ai-src]',$('#rAi')).forEach(function(b){b.addEventListener('click',function(){
    var id=b.dataset.aiSrc;
    if(id==='reason'){var d=$('.reader-extra');if(d){d.open=true;d.scrollIntoView({block:'nearest'})}return}
    if(typeof chooseReadingRecord==='function')chooseReadingRecord(p,id);
    var card=$('.reading-card[data-rid="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]');
    if(card){
      if(typeof rcSetOpen==='function')rcSetOpen(card,true);
      card.scrollIntoView({block:'nearest',behavior:'smooth'});
    }
    var x=aiSources(p).filter(function(s){return s.id===id})[0];
    if(x&&x.page){if(typeof PV!=='undefined'&&PV&&typeof pvGo==='function')pvGo(x.page,true);else if(typeof readerSrc==='function')readerSrc(p,x.page)}
  })});
}
/* 입력이 잠시 멈추면 메모 칸에 포커스가 남아 있어도 정리한다. */
function aiWirePanel(p){
  var el=$('#rdnotes');if(!el||el._aiWired===p.id)return;
  el._aiWired=p.id;
  function scheduleMemo(e){
    if(e.isComposing||!e.target.matches('#rNote,#rMemo,textarea[data-hm]')||!aiOn())return;
    var current=paperBy(S.reader);
    if(!current)return;
    if(e.target.id!=='rMemo')AI_RT.recentMemo={pid:current.id,id:e.target.dataset.hm||'legacy-note',at:Date.now()};
    var field=$('#rTodo');
    if(field&&field.aiSuggestion)aiRender(current);
    aiSchedule(current,1200);
  }
  el.addEventListener('input',scheduleMemo);
  el.addEventListener('compositionend',scheduleMemo);
  el.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('[data-hd]'))aiSchedule(paperBy(S.reader),1200)});
}
function aiInit(p){
  var box=$('#rAi'),saved=$('#rTodoSaved');
  if(box&&saved){
    var panel=saved.parentElement;
    if(box.parentElement!==panel){
      box.before(panel);
      saved.after(box);
      box.classList.remove('reader-section','reader-ai');
      box.classList.add('ai-setup');
    }
  }
  if(AI_RT.pid!==p.id){AI_RT.pid=p.id;AI_RT.st='idle';AI_RT.err='';AI_RT.setup=false}
  aiRender(p);aiWirePanel(p);
  if(aiOn())aiSchedule(p,300);
}
if(typeof module!=='undefined'&&module.exports)module.exports={aiThinking:aiThinking,aiNormalize:aiNormalize,aiSources:aiSources,aiHash:aiHash,aiPrompt:aiPrompt,aiParseText:aiParseText,aiSameTodo:aiSameTodo};
