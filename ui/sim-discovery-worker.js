// Looks through a CAD body for its moving parts (DeckDiscovery) off the page's thread, so a big robot does not
// stall the page. Gets the body's arrays and the robot's settings; sends back the proposed joints and what it found.
importScripts('sim-kinematics.js','sim-discovery.js');
onmessage=e=>{
  const {id,arrays,options}=e.data;
  try{const t=performance.now(),ctx=DeckDiscovery.prepare(arrays),out=DeckDiscovery.discover(ctx,options);postMessage({id,ok:true,joints:out.joints,report:out.report,ms:performance.now()-t});}
  catch(err){postMessage({id,ok:false,error:err.message});}
};
