(function(root,factory){const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.DeckField=model;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  // Field coordinates: inches, bottom-left origin, +X right, +Y up, CCW heading.
  const SIZE=144,FOOTPRINT=18,KEY='deck-simulation-start-v1';
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const round=n=>Math.round(n*10)/10;
  function heading(value){if(!finite(value))throw Error('Enter a finite heading.');return ((value%360)+360)%360;}
  function inset(angle){const radians=heading(angle)*Math.PI/180;return FOOTPRINT/2*(Math.abs(Math.cos(radians))+Math.abs(Math.sin(radians)));}
  function constrain(pose){
    const angle=heading(pose.heading),edge=inset(angle);
    if(!finite(pose.x)||!finite(pose.y))throw Error('Enter finite X and Y coordinates.');
    return {x:Math.max(edge,Math.min(SIZE-edge,pose.x)),y:Math.max(edge,Math.min(SIZE-edge,pose.y)),heading:angle};
  }
  function validate(pose){
    const clamped=constrain(pose);
    if(Math.abs(clamped.x-pose.x)>1e-6||Math.abs(clamped.y-pose.y)>1e-6)throw Error('Keep the 18-inch preview footprint inside the field.');
    return clamped;
  }
  function edgePose(angle=0){return {x:inset(angle),y:SIZE/2,heading:heading(angle)};}
  function fromGraph(x,y,angle=0){return constrain({x:round(x),y:round(SIZE-y),heading:angle});}
  function restore(raw){try{const data=JSON.parse(raw);if(data?.version!==1)return null;return validate(data.start);}catch{return null;}}
  function serialize(pose){return JSON.stringify({version:1,start:validate(pose)});}
  return {SIZE,FOOTPRINT,KEY,round,heading,inset,constrain,validate,edgePose,fromGraph,restore,serialize};
});
