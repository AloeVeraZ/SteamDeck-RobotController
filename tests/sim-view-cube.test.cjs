'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const model=require('../ui/sim-robot-model.js');
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
test('view cube is a closed beveled solid with all 26 independent view directions',()=>{
 const parts=model.cubeGeometry(),counts={face:0,edge:0,corner:0},edges=new Map(),vertices=new Set();assert.equal(parts.length,26);
 for(const p of parts){counts[p.kind]++;assert.ok(Math.abs(Math.hypot(...p.normal)-1)<1e-12);assert.ok(dot(cross(sub(p.vertices[1],p.vertices[0]),sub(p.vertices[2],p.vertices[0])),p.normal)>0,'outward winding');
  for(let i=0;i<p.vertices.length;i++){const a=p.vertices[i].join(','),b=p.vertices[(i+1)%p.vertices.length].join(',');vertices.add(a);const key=[a,b].sort().join('|');edges.set(key,(edges.get(key)||0)+1);}
 }
 assert.deepEqual(counts,{face:6,edge:12,corner:8});assert.equal(new Set(parts.map(p=>p.direction.join(','))).size,26);
 assert.ok([...edges.values()].every(n=>n===2),'all faces share their edges, with no gaps or overlapping planes');assert.equal(vertices.size-edges.size+parts.length,2);
 for(const [side,direction]of Object.entries(model.SIDES))assert.deepEqual(parts.find(p=>p.side===side).direction,direction);
});
const threePath=path.join(__dirname,'../.cache/simulation-deps/node_modules/three');
const skip=fs.existsSync(threePath)?false:'build the simulation dependencies for Three.js';
test('cube orbit moves the camera around the existing target, preserving zoom for both world up axes',{skip},()=>{
 const T=require(threePath);globalThis.DeckThree={THREE:T};
 for(const up of [[0,0,1],[0,1,0]]){const camera=new T.PerspectiveCamera();camera.up.set(...up);camera.position.set(65,-100,120);const target=new T.Vector3(23,45,7),original=target.clone(),distance=camera.position.distanceTo(target);let updates=0;
  const controls={target,minPolarAngle:0,maxPolarAngle:Math.PI,update(){updates++;camera.lookAt(target);}};
  const start=camera.position.clone();model.orbitCamera(camera,controls,60,-25);assert.ok(camera.position.distanceTo(start)>10);assert.ok(Math.abs(camera.position.distanceTo(target)-distance)<1e-9);assert.ok(target.equals(original));assert.equal(updates,1);
  model.orbitCamera(camera,controls,-60,25);assert.ok(camera.position.distanceTo(start)<1e-8,'opposite drag restores the prior orientation');
  for(const dy of [-1e6,1e6]){model.orbitCamera(camera,controls,20,dy);assert.ok([camera.position.x,camera.position.y,camera.position.z].every(Number.isFinite));assert.ok(Math.abs(camera.position.distanceTo(target)-distance)<1e-8);const direction=camera.position.clone().sub(target).normalize();assert.ok(Math.abs(direction.dot(camera.up))<1,'never becomes singular at a pole');}
 }
});
test('cube orbit ignores invalid movement and honors the camera orbit limits',{skip},()=>{
 const T=require(threePath);globalThis.DeckThree={THREE:T};const camera=new T.PerspectiveCamera();camera.up.set(0,1,0);camera.position.set(0,0,100);const controls={target:new T.Vector3(),minPolarAngle:.2,maxPolarAngle:2.8,minAzimuthAngle:-.3,maxAzimuthAngle:.3,update(){camera.lookAt(this.target);}};
 const before=camera.position.clone();model.orbitCamera(camera,controls,NaN,1);assert.ok(before.equals(camera.position));
 model.orbitCamera(camera,controls,1e6,1e6);const s=new T.Spherical().setFromVector3(camera.position);assert.ok(Math.abs(s.theta+.3)<1e-9);assert.ok(Math.abs(s.phi-.2)<1e-9);assert.ok(Math.abs(s.radius-100)<1e-9);
});
