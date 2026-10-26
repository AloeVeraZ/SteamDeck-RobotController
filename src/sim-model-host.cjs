'use strict';
// CAD import utility process. Reading a large STEP assembly is heavy OpenCascade work, spread over worker threads
// (sim-model.cjs); doing it here, in its own process, keeps the simulator and the window responsive.
// One file per process: the main process forks this, posts the file, takes progress and the result, and exits it.
const {convertStep}=require('./sim-model.cjs'),path=require('node:path');
const port=process.parentPort;
port.on('message',async({data})=>{
  try{port.postMessage({type:'step',ok:true,value:await convertStep(data?.file,path.join(__dirname,'../sim-runtime'),{cacheDir:data?.cacheDir||null,progress:p=>port.postMessage({type:'progress',...p})})});}
  catch(e){port.postMessage({type:'step',ok:false,error:e.message});}
});
