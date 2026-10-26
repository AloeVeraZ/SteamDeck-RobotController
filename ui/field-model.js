(function(root,factory){const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.DeckField=model;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  // Field coordinates: inches, bottom-left origin, +X right, +Y up, CCW heading.
  // Geometry is optional: {footprint:{front,rear,half}, bounds:{x0,y0,x1,y1}}. Without it the
  // model uses an 18-inch square preview on a 144-inch field.
  const SIZE=144,FOOTPRINT=18,KEY='deck-simulation-start-v1';
  const SQUARE={front:FOOTPRINT/2,rear:FOOTPRINT/2,half:FOOTPRINT/2},FIELD={x0:0,y0:0,x1:SIZE,y1:SIZE};
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const round=n=>Math.round(n*10)/10;
  function heading(value){if(!finite(value))throw Error('Enter a finite heading.');return ((value%360)+360)%360;}
  // Robot-frame corner offsets rotated into the field: [minX,maxX,minY,maxY] around the centre.
  function extents(angle,footprint=SQUARE){
    const r=heading(angle)*Math.PI/180,c=Math.cos(r),s=Math.sin(r),f=footprint;
    const xs=[],ys=[];for(const [x,y] of [[f.front,f.half],[f.front,-f.half],[-f.rear,f.half],[-f.rear,-f.half]]){xs.push(x*c-y*s);ys.push(x*s+y*c);}
    return [Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)];
  }
  function inset(angle){const radians=heading(angle)*Math.PI/180;return FOOTPRINT/2*(Math.abs(Math.cos(radians))+Math.abs(Math.sin(radians)));}
  function constrain(pose,geometry={}){
    const angle=heading(pose.heading),b=geometry.bounds||FIELD,[x0,x1,y0,y1]=extents(angle,geometry.footprint);
    if(!finite(pose.x)||!finite(pose.y))throw Error('Enter finite X and Y coordinates.');
    return {x:Math.max(b.x0-x0,Math.min(b.x1-x1,pose.x)),y:Math.max(b.y0-y0,Math.min(b.y1-y1,pose.y)),heading:angle};
  }
  function validate(pose,geometry={}){
    const bounds=geometry.bounds||FIELD,[x0,x1,y0,y1]=extents(pose.heading,geometry.footprint);if(x1-x0>bounds.x1-bounds.x0+1e-7||y1-y0>bounds.y1-bounds.y0+1e-7)throw Error('The robot footprint is larger than this field. Increase the field size or reduce the robot size.');
    const clamped=constrain(pose,geometry);
    if(Math.abs(clamped.x-pose.x)>1e-6||Math.abs(clamped.y-pose.y)>1e-6)throw Error(geometry.footprint?'Keep the robot footprint inside the field.':'Keep the 18-inch preview footprint inside the field.');
    return clamped;
  }
  // Against the left wall, centred vertically.
  function edgePose(angle=0,geometry={}){const b=geometry.bounds||FIELD,a=heading(angle),[x0]=extents(a,geometry.footprint);return {x:round(b.x0-x0+1e-9),y:(b.y0+b.y1)/2,heading:a};}
  // Turn in place, keeping any wall the robot was against (within `reach` inches) flush with it, so a
  // robot parked on the perimeter pivots along the wall instead of crossing it or leaving a gap.
  function turn(pose,angle,geometry={},reach=1.5){
    const b=geometry.bounds||FIELD,a=heading(angle),[p0,p1,q0,q1]=extents(pose.heading,geometry.footprint),[x0,x1,y0,y1]=extents(a,geometry.footprint);
    let {x,y}=pose;
    if(pose.x+p0-b.x0<=reach)x=b.x0-x0;else if(b.x1-pose.x-p1<=reach)x=b.x1-x1;
    if(pose.y+q0-b.y0<=reach)y=b.y0-y0;else if(b.y1-pose.y-q1<=reach)y=b.y1-y1;
    return constrain({x:round(x),y:round(y),heading:a},geometry);
  }
  function fromGraph(x,y,angle=0,geometry={}){return constrain({x:round(x),y:round(SIZE-y),heading:angle},geometry);}
  function restore(raw,geometry){try{const data=JSON.parse(raw);if(data?.version!==1)return null;return validate(data.start,geometry);}catch{return null;}}
  function serialize(pose,geometry){return JSON.stringify({version:1,start:validate(pose,geometry)});}
  return {SIZE,FOOTPRINT,KEY,round,heading,inset,extents,constrain,validate,edgePose,turn,fromGraph,restore,serialize};
});
