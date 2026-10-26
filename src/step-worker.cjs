'use strict';
// One OpenCascade reader thread for the CAD import: reads STEP pieces into meshes. The compiled WebAssembly
// module comes from the importer, so each thread only instantiates it.
const {parentPort,workerData}=require('node:worker_threads'),path=require('node:path');
const ready=require(path.join(workerData.runtimeDir,'occt','occt-import-js.js'))({
  instantiateWasm(imports,done){WebAssembly.instantiate(workerData.module,imports).then(instance=>done(instance,workerData.module));return {};}});
// Each mesh with the names of the assemblies above it (root first), for grouping the parts afterwards.
function paths(root){const out=[];const walk=(node,trail)=>{const here=node.name?[...trail,String(node.name)]:trail;for(const i of node.meshes||[])out[i]=here;for(const c of node.children||[])walk(c,here);};if(root)walk(root,[]);return out;}
parentPort.on('message',async({id,bytes,params})=>{
  try{
    const occt=await ready,result=occt.ReadStepFile(new Uint8Array(bytes),params);
    if(!result.success)throw Error('That STEP file could not be read. Export it again as STEP AP214 or AP242.');
    const trails=paths(result.root),transfer=[];
    const meshes=result.meshes.map((m,i)=>{const position=Float32Array.from(m.attributes.position.array),normal=m.attributes.normal?Float32Array.from(m.attributes.normal.array):null,index=Uint32Array.from(m.index.array);
      transfer.push(position.buffer,index.buffer);if(normal)transfer.push(normal.buffer);
      return {name:m.name||'',color:m.color||null,position,normal,index,path:trails[i]||[]};});
    parentPort.postMessage({id,ok:true,meshes},transfer);
  }catch(e){parentPort.postMessage({id,ok:false,error:e?.message||String(e)});}
});
