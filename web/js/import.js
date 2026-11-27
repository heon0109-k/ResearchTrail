'use strict';
/* ---------- PDF storage (IndexedDB) ---------- */
var _db=null;
function idb(){return new Promise(function(res,rej){
  if(_db)return res(_db);
  try{var r=indexedDB.open('researchtrail-pdf',1);
    r.onupgradeneeded=function(){r.result.createObjectStore('f')};
    r.onsuccess=function(){_db=r.result;res(_db)};r.onerror=function(){rej(r.error)}}catch(e){rej(e)}})}
function idbPut(k,blob){return idb().then(function(db){return new Promise(function(res,rej){var t=db.transaction('f','readwrite');t.objectStore('f').put(blob,k);t.oncomplete=res;t.onerror=t.onabort=function(){rej(t.error||new Error('PDF storage failed'))}})})}
function attachPaperPdf(p,file,artifactId){
  if(S.source==='account')return accountWorkspace.papers.attach(p,file,artifactId);
  return idbPut(p.id,file).then(function(){p.pdf=true;p.fname=file.name});
}
function idbGet(k){return idb().then(function(db){return new Promise(function(res,rej){var q=db.transaction('f').objectStore('f').get(k);q.onsuccess=function(){res(q.result||null)};q.onerror=rej})}).catch(function(){return null})}
function idbDel(k){return idb().then(function(db){db.transaction('f','readwrite').objectStore('f').delete(k)}).catch(function(){})}

/* ---------- link / DOI import ---------- */
function safeExternalUrl(value){
  var v=String(value||'').trim();if(!v)return '';
  if(/[\u0000-\u0020\u007f]/.test(v))return null;
  if(/^[a-z][a-z0-9+.-]*:/i.test(v)&&!/^https?:\/\//i.test(v))return null;
  try{var u=new URL(/^https?:\/\//i.test(v)?v:'https://'+v);
    if(!/^https?:$/.test(u.protocol)||!u.hostname||u.username||u.password)return null;
    if(!u.hostname.includes('.')&&u.hostname!=='localhost')return null;
    return u.href;
  }catch(e){return null}
}
function parseRef(v){
  v=String(v||'').trim();
  if(/[\u0000- \u007f]/.test(v)||(/^[a-z][a-z0-9+.-]*:/i.test(v)&&! /^(?:https?:\/\/|arxiv:|doi:)/i.test(v)))return {type:'invalid',url:''};
  /* arXiv 번호가 들어 있는 주소 (arXiv, Hugging Face Papers, alphaXiv 등) */
  var m=v.match(/(?:arxiv\.org\/(?:abs|pdf|html)|huggingface\.co\/papers|alphaxiv\.org\/(?:abs|overview|pdf))\/([a-z\-]+\/\d{7}|\d{4}\.\d{4,5})(v\d+)?/i)||v.match(/^(?:arxiv:)?\s*(\d{4}\.\d{4,5})(v\d+)?\s*$/i);
  if(m){var edition=m[1]+(m[2]||'');return {type:'arxiv',id:m[1],edition:edition,link:'https://arxiv.org/abs/'+edition};}
  var nat=v.match(/nature\.com\/articles\/(s\d{4,5}-\d{3}-\d{4,5}-[\w]+)/i);
  if(nat)return {type:'doi',doi:'10.1038/'+nat[1],link:'https://doi.org/10.1038/'+nat[1]};
  var d=v.match(/10\.\d{4,9}\/[^\s"<>?#]+/);
  if(d){var doi=d[0].replace(/(?:\.pdf|\/(?:abstract|full|pdf|epdf))$/i,'').replace(/[.,;)]+$/,'');if(/^10\.1101\//.test(doi))doi=doi.replace(/v\d+$/i,'');return {type:'doi',doi:doi,link:'https://doi.org/'+doi}}
  var url=safeExternalUrl(v);if(url===null)return {type:'invalid',url:''};
  /* 그 밖의 논문 사이트: Semantic Scholar 번호로 바꿔 조회한다 */
  var a;
  if((a=url.match(/aclanthology\.org\/([A-Z0-9][\w.\-]*?\d)(?:\.pdf)?\/?(?:[?#]|$)/i)))return {type:'s2',s2:'ACL:'+a[1],doi:'10.18653/v1/'+a[1],link:url,url:url};
  if((a=url.match(/semanticscholar\.org\/paper\/(?:[^\/?#]*\/)?([0-9a-f]{40})/i)))return {type:'s2',s2:a[1],link:url,url:url};
  if((a=url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i)))return {type:'s2',s2:'PMID:'+a[1],ncbi:{db:'pubmed',id:a[1]},link:url,url:url};
  if((a=url.match(/\/(?:pmc\/articles\/)?PMC(\d+)/i)))return {type:'s2',s2:'PMCID:'+a[1],ncbi:{db:'pmc',id:a[1]},link:url,url:url};
  if((a=url.match(/openreview\.net\/(?:forum|pdf|attachment)\?(?:.*&)?id=([\w\-]+)/i)))return {type:'openreview',id:a[1],link:'https://openreview.net/forum?id='+a[1],url:url};
  return {type:'url',url:url};
}
function pdfUrlOf(link){var r=parseRef(link||'');return r.type==='arxiv'?'https://arxiv.org/pdf/'+r.edition:''}
/* 응답이 10초 넘게 없으면 실패로 보고 다음 방법으로 넘어간다 */
function tj(u){
  var ctl=typeof AbortController==='function'?new AbortController():null,timer=ctl?setTimeout(function(){ctl.abort()},10000):0;
  return fetch(u,ctl?{signal:ctl.signal}:undefined).then(function(r){clearTimeout(timer);if(!r.ok)throw 0;return r.json()},function(e){clearTimeout(timer);throw e});
}
/* 여러 곳에 동시에 물어보고 가장 먼저 성공한 답을 쓴다 */
function firstOk(list){return new Promise(function(res,rej){var left=list.length;list.forEach(function(p){p.then(res,function(){if(--left===0)rej(0)})})})}
var S2_FIELDS='title,abstract,year,authors';
function s2Meta(j){if(!j||!j.title)throw 0;return {title:j.title,abs:j.abstract||'',year:j.year||'',authors:(j.authors||[]).map(function(a){return a.name}).join(', ')}}
function s2Get(id){return tj('https://api.semanticscholar.org/graph/v1/paper/'+encodeURIComponent(id).replace(/%3A/g,':')+'?fields='+S2_FIELDS).then(s2Meta)}
function s2Match(title){return tj('https://api.semanticscholar.org/graph/v1/paper/search/match?query='+encodeURIComponent(title)+'&fields='+S2_FIELDS).then(function(j){return s2Meta(j&&j.data&&j.data[0])})}
/* 주소에 제목이 들어 있는 학회 페이지 (CVF: …/Kim_Some_Title_CVPR_2023_paper.html) */
function titleFromUrl(url){
  var m=String(url||'').match(/thecvf\.com\/.*\/[^_\/]+_(.+?)_(?:CVPR|ICCV|ECCV|WACV)_\d{4}_paper/i);
  return m?decodeURIComponent(m[1]).replace(/_/g,' '):'';
}
function crossrefMeta(doi){
  return tj('https://api.crossref.org/works/'+encodeURIComponent(doi)).then(function(j){
    var w=j.message;if(!w||!w.title||!w.title[0])throw 0;
    var y=w.issued&&w.issued['date-parts']&&w.issued['date-parts'][0]&&w.issued['date-parts'][0][0];
    return {title:w.title[0],abs:(w.abstract||'').replace(/<[^>]+>/g,'').trim(),year:y||'',authors:(w.author||[]).map(function(a){return (a.given?a.given+' ':'')+(a.family||'')}).join(', ')};
  });
}
/* DataCite: arXiv 등 DataCite에 등록된 DOI (요청 제한이 느슨하다) */
function dataciteMeta(doi){
  return tj('https://api.datacite.org/dois/'+encodeURIComponent(doi)).then(function(j){
    var a=j&&j.data&&j.data.attributes;if(!a||!a.titles||!a.titles[0])throw 0;
    var ab=(a.descriptions||[]).filter(function(x){return x.descriptionType==='Abstract'})[0];
    var name=function(c){var n=c.givenName&&c.familyName?c.givenName+' '+c.familyName:String(c.name||'');return /^[^,]+, [^,]+$/.test(n)?n.split(', ').reverse().join(' '):n};
    return {title:a.titles[0].title,abs:ab?String(ab.description).replace(/\s+/g,' ').trim():'',year:a.publicationYear||'',authors:(a.creators||[]).map(name).join(', ')};
  });
}
/* PubMed·PMC: NCBI 요약 정보 */
function ncbiMeta(q){
  return tj('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db='+q.db+'&id='+encodeURIComponent(q.id)+'&retmode=json').then(function(j){
    var r=j&&j.result&&j.result[q.id];if(!r||!r.title)throw 0;
    return {title:String(r.title).replace(/\.$/,''),abs:'',year:(String(r.pubdate||'').match(/\d{4}/)||[''])[0],authors:(r.authors||[]).map(function(a){return a.name}).join(', ')};
  });
}
function fetchMeta(ref){
  if(ref.type==='arxiv'){
    return firstOk([dataciteMeta('10.48550/arXiv.'+ref.id),s2Get('arXiv:'+ref.id)]).catch(function(){
      return fetch('https://export.arxiv.org/api/query?id_list='+ref.id).then(function(r){if(!r.ok)throw 0;return r.text()}).then(function(x){
        var d=new DOMParser().parseFromString(x,'text/xml'),e=d.querySelector('entry');if(!e)throw 0;
        var g=function(t){var n=e.querySelector(t);return n?n.textContent.replace(/\s+/g,' ').trim():''};
        var au=[].map.call(e.querySelectorAll('author > name'),function(n){return n.textContent}).join(', ');
        if(!g('title'))throw 0;
        return {title:g('title'),abs:g('summary'),year:(g('published')||'').slice(0,4),authors:au};
      });
    });
  }
  if(ref.type==='doi')return crossrefMeta(ref.doi).catch(function(){return dataciteMeta(ref.doi)}).catch(function(){return s2Get('DOI:'+ref.doi)});
  if(ref.type==='s2'){
    if(ref.ncbi)return ncbiMeta(ref.ncbi).catch(function(){return s2Get(ref.s2)});
    if(ref.doi)return crossrefMeta(ref.doi).catch(function(){return s2Get(ref.s2)});
    return s2Get(ref.s2);
  }
  /* OpenReview는 브라우저에서 직접 읽는 걸 막아 둬서 제목을 못 가져온다(링크만 정리해 저장). */
  if(ref.type==='url'){
    var t=titleFromUrl(ref.url);
    return s2Get('URL:'+ref.url).catch(function(){if(t)return s2Match(t).catch(function(){return {title:t,abs:'',year:'',authors:''}});throw 0});
  }
  return Promise.reject(0);
}

/* ---------- PDF 첫 쪽 살펴보기 ----------
   PDF를 넣으면 브라우저 안에서(서버로 보내지 않음) 첫 1~2쪽 글자를 읽어
   ① 논문다운 흔적(Abstract, References, DOI…)이 있는지 ② 이 논문의 arXiv 번호나 DOI가 있는지 찾는다. */
function pdfPeek(file){
  if(typeof loadPdfJs!=='function'||!file||!file.arrayBuffer)return Promise.reject(0);
  return loadPdfJs().then(function(){return file.arrayBuffer()}).then(function(buf){
    return pdfjsLib.getDocument({data:buf,isEvalSupported:false}).promise;
  }).then(function(doc){
    var n=Math.min(2,doc.numPages),pages=[];
    var page=function(i){return doc.getPage(i).then(function(pg){return pg.getTextContent()}).then(function(tc){return tc.items.map(function(it){return it.str}).join(' ')})};
    var chain=Promise.resolve();
    for(var i=1;i<=n;i++)(function(i){chain=chain.then(function(){return page(i)}).then(function(t){pages.push(t)})})(i);
    return chain.then(function(){return doc.getMetadata().catch(function(){return {}})}).then(function(md){
      var info=md&&md.info||{};doc.destroy&&doc.destroy();
      return pdfInspect(pages,String(info.Title||''));
    });
  });
}
function pdfInspect(pages,infoTitle){
  var first=String(pages[0]||''),all=pages.join(' ');
  var signs=[/\babstract\b/i,/\bintroduction\b/i,/\breferences\b/i,/\bkeywords?\b/i,/\barxiv\b/i,/\bdoi\b/i,/\b(?:proceedings|conference|journal|preprint|workshop)\b/i,/\bet al\./i,/초록|요약|서론|참고\s*문헌|키워드/];
  var score=signs.filter(function(re){return re.test(all)}).length;
  var ref=null,m;
  if((m=first.match(/arXiv:\s*(\d{4}\.\d{4,5})(?:v\d+)?/i)))ref=parseRef(m[1]);
  else if((m=first.match(/\b10\.\d{4,9}\/[^\s"<>,;]+/)))ref=parseRef(m[0]);
  var t=infoTitle.trim();
  if(!t||t.length<8||t.split(/\s+/).length<3||/^(?:microsoft\s+word|untitled|\S+\.(?:docx?|tex|pdf))/i.test(t))t='';
  return {isPaper:score>=2||!!ref,ref:ref&&ref.type!=='invalid'?ref:null,title:t};
}
