'use strict';
/* ---------- PDF storage (IndexedDB) ---------- */
var _db=null;
function idb(){return new Promise(function(res,rej){
  if(_db)return res(_db);
  try{var r=indexedDB.open('researchtrail-pdf',1);
    r.onupgradeneeded=function(){r.result.createObjectStore('f')};
    r.onsuccess=function(){_db=r.result;res(_db)};r.onerror=function(){rej(r.error)}}catch(e){rej(e)}})}
function idbPut(k,blob){return idb().then(function(db){return new Promise(function(res,rej){var t=db.transaction('f','readwrite');t.objectStore('f').put(blob,k);t.oncomplete=res;t.onerror=t.onabort=function(){rej(t.error||new Error('PDF storage failed'))}})})}
function attachPaperPdf(p,file){return idbPut(p.id,file).then(function(){p.pdf=true;p.fname=file.name})}
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
  if(/[\u0000-\u0020\u007f]/.test(v)||(/^[a-z][a-z0-9+.-]*:/i.test(v)&&! /^(?:https?:\/\/|arxiv:|doi:)/i.test(v)))return {type:'invalid',url:''};
  var m=v.match(/arxiv\.org\/(?:abs|pdf)\/([a-z\-]+\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?/i)||v.match(/^(?:arxiv:)?\s*(\d{4}\.\d{4,5})(?:v\d+)?\s*$/i);
  if(m)return {type:'arxiv',id:m[1],link:'https://arxiv.org/abs/'+m[1]};
  var d=v.match(/10\.\d{4,9}\/[^\s"<>]+/);
  if(d){var doi=d[0].replace(/[.,;)]+$/,'');return {type:'doi',doi:doi,link:'https://doi.org/'+doi}}
  var url=safeExternalUrl(v);return url===null?{type:'invalid',url:''}:{type:'url',url:url};
}
function pdfUrlOf(link){var r=parseRef(link||'');return r.type==='arxiv'?'https://arxiv.org/pdf/'+r.id:''}
function tj(u){return fetch(u).then(function(r){if(!r.ok)throw 0;return r.json()})}
function fetchMeta(ref){
  if(ref.type==='arxiv'){
    return tj('https://api.semanticscholar.org/graph/v1/paper/arXiv:'+ref.id+'?fields=title,abstract,year,authors').then(function(j){
      if(!j.title)throw 0;
      return {title:j.title,abs:j.abstract||'',year:j.year||'',authors:(j.authors||[]).map(function(a){return a.name}).join(', ')};
    }).catch(function(){
      return fetch('https://export.arxiv.org/api/query?id_list='+ref.id).then(function(r){if(!r.ok)throw 0;return r.text()}).then(function(x){
        var d=new DOMParser().parseFromString(x,'text/xml'),e=d.querySelector('entry');if(!e)throw 0;
        var g=function(t){var n=e.querySelector(t);return n?n.textContent.replace(/\s+/g,' ').trim():''};
        var au=[].map.call(e.querySelectorAll('author > name'),function(n){return n.textContent}).join(', ');
        if(!g('title'))throw 0;
        return {title:g('title'),abs:g('summary'),year:(g('published')||'').slice(0,4),authors:au};
      });
    });
  }
  return tj('https://api.crossref.org/works/'+encodeURIComponent(ref.doi)).then(function(j){
    var w=j.message;if(!w||!w.title||!w.title[0])throw 0;
    var y=w.issued&&w.issued['date-parts']&&w.issued['date-parts'][0]&&w.issued['date-parts'][0][0];
    return {title:w.title[0],abs:(w.abstract||'').replace(/<[^>]+>/g,'').trim(),year:y||'',authors:(w.author||[]).map(function(a){return (a.given?a.given+' ':'')+(a.family||'')}).join(', ')};
  });
}
