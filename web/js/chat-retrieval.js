'use strict';
/* One open PDF, local keyword retrieval. No network, embeddings or persistent index. */
var ChatRetrieval=(function(){
  var CHUNK_CHARS=1600,OVERLAP=320,MAX_CHUNKS=6,MAX_CONTEXT_CHARS=10000;
  var cache=new WeakMap();
  var stop=new Set(('a an and are as at be by for from has have how in is it of on or that the this to was we what which with '+
    '논문 논문의 본문 실험 조건 각각 어떤 어떻게 무엇 뭐야 사용해 알려줘 설명해 주세요 비교해 줘').split(/\s+/));
  function normalize(text){
    return String(text||'').normalize('NFKC').replace(/\u00ad/g,'').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').trim();
  }
  function wordKey(word){
    if(!/^[a-z]{4,}$/.test(word))return word;
    if(word.length>5&&/ies$/.test(word))word=word.slice(0,-3)+'y';
    else if((word.length>5&&/ing$/.test(word))||(word.length>4&&/ed$/.test(word))){
      word=word.replace(/(?:ing|ed)$/,'').replace(/([b-df-hj-np-tv-z])\1$/,'$1');
    }else if(word.length>4&&/s$/.test(word)&&!/(?:ss|us|is)$/.test(word))word=word.slice(0,-1);
    if(word.length>4&&/e$/.test(word))word=word.slice(0,-1);
    return word;
  }
  function tokens(text){
    var words=normalize(text).toLowerCase().match(/[a-z][a-z0-9]*(?:-[a-z0-9]+)*|[가-힣]{2,}|\d+\.\d+(?:\.\d+)*/g)||[];
    return words.flatMap(function(t){return t.includes('-')?[t].concat(t.split('-')):[t]}).filter(function(t){return t.length>1&&!stop.has(t)}).map(wordKey);
  }
  function chunksForPage(n,text){
    var out=[];
    for(var start=0;start<text.length;){
      var end=Math.min(start+CHUNK_CHARS,text.length);
      // Prefer word boundaries without dropping text on either side of a cut.
      if(end<text.length){var space=text.lastIndexOf(' ',end);if(space>end-120)end=space}
      var value=text.slice(start,end),counts=new Map();
      tokens(value).forEach(function(t){counts.set(t,(counts.get(t)||0)+1)});
      out.push({n:n,start:start,end:end,text:value,counts:counts});
      if(end===text.length)break;
      start=end-OVERLAP;
      var next=text.indexOf(' ',start);if(next>=0&&next<start+120)start=next+1;
    }
    return out;
  }
  function buildIndex(doc){
    if(cache.has(doc))return cache.get(doc);
    var pending=(async function(){
      var pages=[];
      // Sequential extraction avoids rendering/worker spikes on long PDFs.
      for(var n=1;n<=doc.numPages;n++){
        var page=await doc.getPage(n),tc=await page.getTextContent();
        var text=(tc.items||[]).map(function(it){return (it.str||'')+(it.hasEOL?'\n':' ')}).join('');
        pages.push({n:n,text:normalize(text.replace(/([A-Za-z])-\n\s*([a-z])/g,'$1$2'))});
      }
      var chunks=pages.flatMap(function(p){return chunksForPage(p.n,p.text)}),df=new Map();
      chunks.forEach(function(c){c.counts.forEach(function(_,t){df.set(t,(df.get(t)||0)+1)})});
      return {pages:pages,chunks:chunks,df:df,totalPages:doc.numPages};
    })().catch(function(error){cache.delete(doc);throw error});
    cache.set(doc,pending);return pending;
  }
  function questionPages(q,total){
    var out=[],re=/(?:\bp\.?\s*(\d{1,3})\b)|(?:\bpage\s+(\d{1,3})\b)|(?:(\d{1,3})\s*(?:쪽|페이지))/gi,m;
    while((m=re.exec(q))){var n=+(m[1]||m[2]||m[3]);if(n>=1&&n<=total&&out.indexOf(n)<0)out.push(n)}
    return out.slice(0,2);
  }
  function search(index,q,options){
    options=options||{};
    var terms=Array.from(new Set(tokens(q))),original=new Set(terms);
    (options.expandedTerms||[]).slice(0,12).forEach(function(term){if(typeof term==='string')tokens(term.slice(0,48)).forEach(function(t){if(terms.indexOf(t)<0)terms.push(t)})});
    var active=terms.filter(function(t){return index.df.has(t)});
    var ranked=index.chunks.map(function(c){
      var score=0,hits=0;
      // Count distinct query terms: repeated labels in plots/tables must not dominate prose.
      active.forEach(function(t){if(c.counts.has(t)){var weight=original.has(t)?1:0.65;hits+=weight;score+=weight*(1+Math.log(1+index.chunks.length/index.df.get(t)))}});
      return {chunk:c,score:score*(1+hits)};
    }).sort(function(a,b){return b.score-a.score||a.chunk.n-b.chunk.n||a.chunk.start-b.chunk.start});
    var priority=questionPages(q,index.totalPages),cur=options.currentPage||1;
    function prioritize(n){if(n>=1&&n<=index.totalPages&&priority.indexOf(n)<0)priority.push(n)}
    if(options.selectedPage)prioritize(options.selectedPage);
    if(/이\s*쪽|이\s*페이지|여기|이\s*표|이\s*그림|이\s*수식|this\s+page/i.test(q))prioritize(cur);
    if(/핵심|초록|논문.*(뭐|무엇)|기여|(?:논문|전체|내용)(?:을|를)?\s*요약|^요약|^전체/.test(q))prioritize(1);
    var chosen=[];
    function add(entry){if(entry&&chosen.length<MAX_CHUNKS&&chosen.indexOf(entry)<0)chosen.push(entry)}
    function preferred(n){
      var candidates=ranked.filter(function(e){return e.chunk.n===n&&chosen.indexOf(e)<0});
      var selected=normalize(options.selectedText).slice(0,100);
      return (n===options.selectedPage&&selected&&candidates.find(function(e){return e.chunk.text.includes(selected)}))||candidates[0];
    }
    // Reserve context for every requested page before filling with global hits.
    priority.forEach(function(n){add(preferred(n))});
    priority.forEach(function(n){add(preferred(n))});
    ranked.filter(function(e){return e.score>0}).forEach(add);
    if(!chosen.length)add(ranked.find(function(e){return e.chunk.n===cur}));
    // A local fallback is context, never evidence that the answer exists.
    if(chosen.length<MAX_CHUNKS)add(ranked.find(function(e){return e.chunk.n===cur}));
    var pages=[],used=0;
    Array.from(new Set(chosen.map(function(e){return e.chunk.n}))).forEach(function(n){
      var spans=chosen.filter(function(e){return e.chunk.n===n}).map(function(e){return e.chunk}).sort(function(a,b){return a.start-b.start}),ranges=[];
      spans.forEach(function(s){var prev=ranges[ranges.length-1];if(prev&&s.start<=prev.end)prev.end=Math.max(prev.end,s.end);else ranges.push({start:s.start,end:s.end})});
      var source=index.pages.find(function(p){return p.n===n}).text;
      var text=ranges.map(function(r){return source.slice(r.start,r.end)}).join('\n[중략]\n');
      if(used+text.length<=MAX_CONTEXT_CHARS){pages.push({n:n,text:text});used+=text.length}
    });
    return {pages:pages,matched:ranked.some(function(e){return e.score>0}),chunkCount:chosen.length,totalPages:index.totalPages};
  }
  return {CHUNKER:'pages-'+CHUNK_CHARS+'-'+OVERLAP,buildIndex:buildIndex,search:search,MAX_CHUNKS:MAX_CHUNKS,MAX_CONTEXT_CHARS:MAX_CONTEXT_CHARS};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=ChatRetrieval;
