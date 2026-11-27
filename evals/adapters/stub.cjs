// Execute the shipped async stub, never an answer keyed by evaluation case id.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const queries=JSON.parse(fs.readFileSync(0,'utf8'));
const context={setTimeout,location:{search:''}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../../web/js/ai-stub.js'),'utf8'),context);
(async()=>{
 const outputs=[];
 for(const query of queries){
  const start=performance.now();
  try{const r=await context.aiSuggest(query);outputs.push({raw:JSON.stringify({action_text:r.action}),status:r.ok?'stop':'error',source:r.source,elapsed_ms:performance.now()-start})}
  catch(e){outputs.push({raw:'',status:'error',error:e.name,elapsed_ms:performance.now()-start})}
 }
 process.stdout.write(JSON.stringify(outputs));
})().catch(()=>{process.exitCode=1});
