// Draft regression: user's bundled demo request; SPEC AC6 context must match its source.
// Team acceptance review pending. Does not measure actual AI quality.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'../web'),entries=JSON.parse(fs.readFileSync(path.join(root,'assets/papers/manifest.json'),'utf8'));
assert.equal(entries.length,9);
const files=entries.filter(e=>e.status==='bundled');assert.equal(files.length,7);
for(const e of files){
 const bytes=fs.readFileSync(path.join(root,'assets/papers',e.file));
 assert.equal(bytes.subarray(0,5).toString(),'%PDF-',e.id);
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),e.sha256,e.id);
 assert.ok(['CC BY 4.0','CC BY-NC-SA 4.0'].includes(e.license));
 assert.ok(e.pages>0);assert.equal(e.modified,false);
}
for(const e of entries.filter(e=>e.status==='link_only'))assert.equal(e.file,null);
const c={document:{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]},localStorage:{getItem:()=>null},D:{pos:new Map(),inited:false}};vm.createContext(c);
for(const f of ['core.js','sample-papers.js'])vm.runInContext(fs.readFileSync(path.join(root,'js',f),'utf8'),c);
c.showMain=()=>{};c.loadSample();
assert.equal(c.S.papers.length,9);
for(const p of c.S.papers){
 const e=entries.find(e=>e.id===p.id);assert.equal(p.link,e.source);
 assert.equal(c.samplePdfUrl(p),e.file?'assets/papers/'+e.file:null);
}
const graph=c.S.papers.find(p=>p.id==='s8');assert.equal(graph.total,15);
assert.ok(graph.hl.every(h=>h.page<=graph.total&&h.rects.every(r=>r.length===4&&r.every(v=>v>=0&&v<=1))));
const orig=graph.link;graph.link='https://example.org/user-edited';assert.equal(c.samplePdfUrl(graph),null);graph.link=orig;
graph.pdf=true;assert.equal(c.samplePdfUrl(graph),null);graph.pdf=false;
c.S.example=false;assert.equal(c.samplePdfUrl(graph),null);
console.log('PASS: 7 licensed PDFs match hashes, 2 link-only sources, all 9 links, real page bounds, user link/file precedence and own-timeline isolation.');
