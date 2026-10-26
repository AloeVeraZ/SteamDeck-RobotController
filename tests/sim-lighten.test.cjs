'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const model=require('../ui/sim-robot-model.js');
const threePath=path.join(__dirname,'../.cache/simulation-deps/node_modules/three');
const skip=fs.existsSync(threePath)?false:'build the simulation dependencies for Three.js';
const tris=g=>(g.index?g.index.count:g.attributes.position.count)/3;
// Two dense spheres that touch, merged into one body the way an imported CAD is: each its own part, with colours.
function body(T){
  const parts=[new T.SphereGeometry(5,220,160).translate(-4.9,0,5),new T.SphereGeometry(5,220,160).translate(4.9,0,5)];
  const position=[],normal=[],color=[],part=[],index=[];let base=0;
  parts.forEach((g,p)=>{const a=g.attributes;position.push(...a.position.array);normal.push(...a.normal.array);for(let i=0;i<a.position.count;i++){color.push(p,.5,1-p);part.push(p);}for(const i of g.index.array)index.push(i+base);base+=a.position.count;});
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(position,3));g.setAttribute('normal',new T.Float32BufferAttribute(normal,3));g.setAttribute('color',new T.Float32BufferAttribute(color,3));
  g.setAttribute('_part',new T.Float32BufferAttribute(part,1));g.setIndex(index);g.userData.parts={nodes:[{name:'Left',parent:-1},{name:'Right',parent:-1}],leaf:[0,1]};return g;
}
test('a heavy CAD body is lightened for the field views: fewer triangles, same size, parts kept apart',{skip},async()=>{
  const T=require(threePath);globalThis.DeckThree={THREE:T};
  const full=body(T),lite=await model.lighten(full,{target:12000});
  assert.ok(tris(full)>130000);assert.ok(tris(lite)<=12000*1.4,`${tris(lite)} triangles`);assert.ok(tris(lite)>1500,'still a recognisable body');
  full.computeBoundingBox();lite.computeBoundingBox();
  for(const k of ['min','max'])for(const a of ['x','y','z'])assert.ok(Math.abs(full.boundingBox[k][a]-lite.boundingBox[k][a])<.6,`${k}.${a} moves by less than a cell`);
  const p=lite.attributes._part,n=lite.attributes.normal,ix=lite.index.array;
  for(let t=0;t<ix.length;t+=3){const a=p.getX(ix[t]);assert.ok(a===p.getX(ix[t+1])&&a===p.getX(ix[t+2]),'a triangle never joins two parts');assert.ok(ix[t]!==ix[t+1]&&ix[t+1]!==ix[t+2]&&ix[t]!==ix[t+2],'no collapsed triangles');}
  assert.deepEqual([...new Set(p.array)].sort(),[0,1]);assert.equal(lite.userData.parts,full.userData.parts,'the assembly tree comes along');
  for(let i=0;i<n.count;i++)assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-4);
  for(let i=0;i<lite.attributes.color.count;i++)assert.ok(Math.abs(lite.attributes.color.getX(i)-p.getX(i))<1e-6,'colours stay with their part');
});
test('a body that is already light, or a built-in model, is used as it is',{skip},async()=>{
  const T=require(threePath);globalThis.DeckThree={THREE:T};
  const small=new T.BoxGeometry(10,10,10);assert.equal(await model.lighten(small),small);
  const scene=new T.Group();assert.equal(await model.lighten(scene),scene);
});
