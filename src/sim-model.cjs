'use strict';
// Robot CAD import for the simulator. A STEP assembly is tessellated by OpenCascade
// (occt-import-js, LGPL-2.1) and every part is merged into ONE rigid body: no joints, no
// articulation, one draw call. The model is visual; the collision footprint stays the robot
// settings the team enters.
const fs=require('node:fs'),path=require('node:path');
const STEP_LIMIT=200*1024*1024,TRIANGLE_LIMIT=1500000;
let kernel=null;
function load(runtimeDir){
  if(!kernel){const dir=path.join(runtimeDir,'occt');const factory=require(path.join(dir,'occt-import-js.js'));kernel=factory({wasmBinary:fs.readFileSync(path.join(dir,'occt-import-js.wasm'))});}
  return kernel;
}
// One body: positions/normals in inches (the kernel converts from the file's own unit),
// a colour per vertex from each part's colour, and one index buffer.
function merge(meshes){
  let vertices=0,triangles=0;for(const m of meshes){vertices+=m.attributes.position.array.length/3;triangles+=m.index.array.length/3;}
  const positions=new Float32Array(vertices*3),normals=new Float32Array(vertices*3),colors=new Uint8Array(vertices*3),index=new Uint32Array(triangles*3);
  let v=0,t=0;
  for(const m of meshes){
    const p=m.attributes.position.array,n=m.attributes.normal?.array,c=(m.color||[.62,.65,.7]).map(x=>Math.round(Math.max(0,Math.min(1,x))*255)),count=p.length/3;
    positions.set(p,v*3);if(n&&n.length===p.length)normals.set(n,v*3);
    for(let i=0;i<count;i++){colors[(v+i)*3]=c[0];colors[(v+i)*3+1]=c[1];colors[(v+i)*3+2]=c[2];}
    const idx=m.index.array;for(let i=0;i<idx.length;i++)index[t+i]=idx[i]+v;
    v+=count;t+=idx.length;
  }
  return {positions,normals,colors,index,parts:meshes.length,triangles};
}
async function convertStep(file,runtimeDir){
  if(typeof file!=='string'||!/\.(step|stp)$/i.test(file))throw Error('Choose a .step or .stp file.');
  const size=fs.statSync(file).size;if(size>STEP_LIMIT)throw Error(`${path.basename(file)} is larger than 200 MB.`);
  const occt=await load(runtimeDir),bytes=fs.readFileSync(file);
  // Coarser tessellation for very large assemblies keeps the driver station responsive.
  for(const deflection of [.002,.006,.015]){
    const result=occt.ReadStepFile(bytes,{linearUnit:'inch',linearDeflectionType:'bounding_box_ratio',linearDeflection:deflection,angularDeflection:.5});
    if(!result.success||!result.meshes.length)throw Error('That STEP file could not be read. Export it again as STEP AP214 or AP242.');
    const triangles=result.meshes.reduce((n,m)=>n+m.index.array.length/3,0);
    if(triangles<=TRIANGLE_LIMIT||deflection===.015)return {name:path.basename(file),...merge(result.meshes)};
  }
}
module.exports={convertStep,merge,STEP_LIMIT};
