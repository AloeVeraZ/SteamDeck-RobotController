'use strict';
// Plain-array CAD bodies for the mechanism tests: cylinders, boxes, arc bands and plates with holes, each its own part
// (leaf) under named assemblies, merged the way an imported STEP robot is (positions, index, part of each vertex, tree).
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const l=Math.hypot(...a);return a.map(v=>v/l);};
const basis=axis=>{const a=unit(axis),w0=Math.abs(a[0])<.6?[1,0,0]:Math.abs(a[1])<.6?[0,1,0]:[0,0,1],u=unit(cross(a,w0)),w=cross(a,u);return {a,u,w};};
const at=(c,{a,u,w},x,y,z)=>[0,1,2].map(i=>c[i]+u[i]*x+w[i]*y+a[i]*z);
function builder(){
  const pos=[],idx=[],part=[],nodes=[],leaf=[];
  return {
    // Same-named parts under one assembly share a node, as the STEP importer files them.
    node(name,parent=-1){const at=nodes.findIndex(x=>x.name===name&&x.parent===parent);if(at>=0)return at;nodes.push({name,parent});return nodes.length-1;},
    // Adds one part (leaf) under a node; returns its leaf id.
    add(node,{positions,index}){const base=pos.length/3,k=leaf.length;leaf.push(node);pos.push(...positions);for(let i=0;i<positions.length/3;i++)part.push(k);for(const i of index)idx.push(i+base);return k;},
    arrays(){return {positions:new Float32Array(pos),index:new Uint32Array(idx),part:new Float32Array(part),tree:{nodes,leaf}};}};
}
// A closed cylinder (or tube when inner > 0) about `axis` through `center`, `length` long.
function cylinder({center,axis,r,length,seg=40,inner=0}){
  const B=basis(axis),P=[],I=[],ring=(rr,z)=>{const s=P.length/3;for(let i=0;i<seg;i++){const t=i/seg*2*Math.PI;P.push(...at(center,B,rr*Math.cos(t),rr*Math.sin(t),z));}return s;};
  const h=length/2,ob=ring(r,-h),ot=ring(r,h);for(let i=0;i<seg;i++){const j=(i+1)%seg;I.push(ob+i,ob+j,ot+j,ob+i,ot+j,ot+i);}
  if(inner>0){const ib=ring(inner,-h),it=ring(inner,h);for(let i=0;i<seg;i++){const j=(i+1)%seg;I.push(ib+i,it+j,ib+j,ib+i,it+i,it+j,ot+i,ot+j,it+j,ot+i,it+j,it+i,ob+i,ib+j,ob+j,ob+i,ib+i,ib+j);}}
  else{const cb=P.length/3;P.push(...at(center,B,0,0,-h));const ct=P.length/3;P.push(...at(center,B,0,0,h));for(let i=0;i<seg;i++){const j=(i+1)%seg;I.push(cb,ob+j,ob+i,ct,ot+i,ot+j);}}
  return {positions:P,index:I};
}
function box(lo,hi){
  const P=[],I=[];for(const z of [lo[2],hi[2]])for(const y of [lo[1],hi[1]])for(const x of [lo[0],hi[0]])P.push(x,y,z);
  for(const f of [[0,2,3,1],[4,5,7,6],[0,1,5,4],[2,6,7,3],[0,4,6,2],[1,3,7,5]])I.push(f[0],f[1],f[2],f[0],f[2],f[3]);return {positions:P,index:I};
}
// A curved plate: radii r..r+t about `axis` through `center`, `width` along the axis, from..to degrees.
function arcBand({center,axis,r,t,width,from,to,seg=24,start=[1,0,0]}){
  const B=basis(axis),u=unit(sub(start,B.a.map(v=>v*(start[0]*B.a[0]+start[1]*B.a[1]+start[2]*B.a[2])))),w=cross(B.a,u),b={a:B.a,u,w},P=[],I=[];
  for(let i=0;i<=seg;i++){const th=(from+(to-from)*i/seg)*Math.PI/180;for(const rr of [r,r+t])for(const z of [-width/2,width/2])P.push(...at(center,b,rr*Math.cos(th),rr*Math.sin(th),z));}
  for(let i=0;i<seg;i++){const q=k=>4*i+k,n=k=>4*(i+1)+k;// corners: 0 in-, 1 in+, 2 out-, 3 out+
    for(const [a0,a1] of [[0,1],[2,3],[0,2],[1,3]])I.push(q(a0),n(a0),n(a1),q(a0),n(a1),q(a1));}
  I.push(0,1,3,0,3,2);const e=4*seg;I.push(e,e+3,e+1,e,e+2,e+3);return {positions:P,index:I};
}
// A square plate (side `size`, thickness t) in the plane at `center` with normal `axis`, with a round hole.
function plateWithHole({center,axis,size,t,hole,seg=48}){
  const B=basis(axis),P=[],I=[];
  for(const z of [t/2,-t/2])for(let i=0;i<seg;i++){const th=i/seg*2*Math.PI,c=Math.cos(th),s=Math.sin(th),k=size/2/Math.max(Math.abs(c),Math.abs(s));P.push(...at(center,B,hole*c,hole*s,z),...at(center,B,k*c,k*s,z));}
  const v=(face,i,outer)=>face*2*seg+2*(i%seg)+(outer?1:0);
  for(let i=0;i<seg;i++){const j=i+1;I.push(v(0,i,0),v(0,i,1),v(0,j,1),v(0,i,0),v(0,j,1),v(0,j,0));I.push(v(1,i,0),v(1,j,1),v(1,i,1),v(1,i,0),v(1,j,0),v(1,j,1));
    I.push(v(0,i,1),v(1,i,1),v(1,j,1),v(0,i,1),v(1,j,1),v(0,j,1));I.push(v(0,i,0),v(0,j,0),v(1,j,0),v(0,i,0),v(1,j,0),v(1,i,0));}
  return {positions:P,index:I};
}
// An FTC robot (robot frame = CAD frame: x forward, y left, z up, inches; the floor at z = 0): a drivetrain with four
// wheels, a turret on a turntable gear with a flywheel and a concentric hood, and a front intake whose arm and ramp
// plate hinge on a servo hub shaft above a fixed roller. hoodStop: a block 0.2 in past the hood's lower end, which it
// meets when it tilts about 3.5° steeper.
function ftcRobot({hoodStop=false}={}){
  const b=builder(),root=b.node('Robot'),drive=b.node('Drivetrain',root),turret=b.node('Turret',root),shooter=b.node('Pollen shooter',root),intake=b.node('Front intake',root);
  const n=(name,parent)=>b.node(name,parent),L={};
  L.chassis=b.add(n('Frame',drive),box([-8,-8,1],[8,8,4]));
  L.wheels=[[5,7.5],[5,-7.5],[-5,7.5],[-5,-7.5]].map(([x,y])=>b.add(n('104mm Mecanum Wheel',drive),cylinder({center:[x,y,2],axis:[0,1,0],r:2,length:1.5})));
  L.gear=b.add(n('Turntable gear',turret),cylinder({center:[-3,0,6],axis:[0,0,1],r:3,length:.25,seg:60}));
  L.base=b.add(n('Turret base plate',turret),box([-9,-6,5.2],[3,6,5.6]));
  L.flywheel=b.add(n('Flywheel',shooter),cylinder({center:[-4.5,0,9],axis:[0,1,0],r:1.4,length:1}));
  L.axle=b.add(n('Axle',shooter),cylinder({center:[-4.5,0,9],axis:[0,1,0],r:.15,length:3,seg:12}));
  L.hood=b.add(n('Hood',shooter),arcBand({center:[-4.5,0,9],axis:[0,1,0],r:3.8,t:.2,width:2,from:-30,to:60,start:[1,0,0]}));
  L.plate=b.add(n('Side plate',shooter),box([-7,-1.6,6.3],[-1,-1.4,11]));
  L.hub=b.add(n('Servo Hub Shaft',intake),cylinder({center:[8.5,6.5,5],axis:[0,1,0],r:.6,length:.5}));
  L.bearing=b.add(n('Bearing',intake),cylinder({center:[8.5,-6.5,5],axis:[0,1,0],r:.3,length:.2,seg:16}));
  L.arms=[[6.8,7],[-7,-6.8]].map(([y0,y1])=>b.add(n('Arm',intake),box([8.2,y0,4.7],[14,y1,5.6])));
  L.ramp=b.add(n('Ramp plate',intake),box([13.5,-7,2.5],[14,7,5.6]));
  L.roller=b.add(n('Roller',intake),cylinder({center:[9.5,0,1.6],axis:[0,1,0],r:1,length:12}));
  L.rollerAxle=b.add(n('Roller axle',intake),cylinder({center:[9.5,0,1.6],axis:[0,1,0],r:.15,length:13,seg:12}));
  L.sides=[[6.2,6.4],[-6.4,-6.2]].map(([y0,y1])=>b.add(n('Side plate',intake),box([5,y0,.5],[10,y1,5.5])));
  if(hoodStop)L.stop=b.add(n('Stop block',drive),box([-3.29,-1.5,5.134],[-2.79,1.5,5.634]));
  const meta={id:'0123456789abcdef0123456789abcdef.glb',units:'in',front:'+x',top:'+z',parts:[{name:'Drivetrain',role:'chassis',key:'Robot/Drivetrain'},{name:'Turret',role:'shooter',type:'turret',key:'Robot/Turret'},
    {name:'Pollen shooter',role:'shooter',type:'fixed',pieces:'pollen',key:'Robot/Pollen shooter'},{name:'Front intake',role:'intake',kind:'ramp',key:'Robot/Front intake'}]};
  const mechanisms={enabled:true,intakes:[{kind:'ramp',sides:['front'],parts:['Front intake']}],shooters:[{type:'turret',pieces:'pollen',mount:'back',parts:['Pollen shooter','Turret']}]};
  // Each named assembly's box, as the importer records it (the chassis box centres the placed model).
  const arrays=b.arrays();for(const p of meta.parts){const node=arrays.tree.nodes.findIndex(x=>x.name===p.name),under=new Set();
    const leaves=arrays.tree.leaf.map((at,k)=>{let n=at;while(n>=0){if(n===node)return k;n=arrays.tree.nodes[n].parent;}return -1;}).filter(k=>k>=0);for(const k of leaves)under.add(k);
    const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let v=0;v<arrays.part.length;v++)if(under.has(arrays.part[v]))for(let i=0;i<3;i++){lo[i]=Math.min(lo[i],arrays.positions[3*v+i]);hi[i]=Math.max(hi[i],arrays.positions[3*v+i]);}
    p.box=[...lo,...hi];}
  // The chassis box is the frame alone, so the placed robot sits on the frame's centre.
  meta.parts[0].box=[-8,-8,1,8,8,4];
  return {arrays,leaves:L,meta,mechanisms};
}
module.exports={builder,cylinder,box,arcBand,plateWithHole,ftcRobot};
// A robot with no game mechanisms: an arm on a servo hinge at the front of the frame, and a two-stage vertical slide at
// the back whose first stage is bolted to the frame and whose second stage and carriage ride up.
function armAndSlide(){
  const b=builder(),root=b.node('Robot'),frame=b.node('Chassis',root),arm=b.node('Arm',root),lift=b.node('Linear slide',root),L={};
  L.frame=b.add(b.node('Frame plate',frame),box([-8,-8,1],[8,8,3]));
  L.servo=b.add(b.node('Shoulder servo',frame),box([5,5.4,3],[7,6.6,5]));
  L.hub=b.add(b.node('Servo Hub',arm),cylinder({center:[6,7,4],axis:[0,1,0],r:.5,length:.4}));
  L.bar=b.add(b.node('Arm bar',arm),box([5.5,7.2,3.5],[16,7.6,4.5]));
  L.claw=b.add(b.node('Claw plate',arm),box([15,6,2],[16.5,8.5,6]));
  L.stage1=[-6.5,6.5].map(y=>b.add(b.node('Stage 1 rail',lift),box([-7,y-.4,3],[-6.2,y+.4,18])));
  L.stage2=[-6.5,6.5].map(y=>b.add(b.node('Stage 2 rail',lift),box([-6.1,y-.35,3.5],[-5.4,y+.35,18.5])));
  L.carriage=b.add(b.node('Carriage',lift),box([-5.3,-7,4],[-4.8,7,7]));
  const meta={id:'fedcba9876543210fedcba9876543210.glb',units:'in',front:'+x',top:'+z',parts:[{name:'Chassis',role:'chassis',key:'Robot/Chassis',box:[-8,-8,1,8,8,3]},{name:'Arm',role:'other',key:'Robot/Arm'},{name:'Linear slide',role:'other',key:'Robot/Linear slide'}]};
  return {arrays:b.arrays(),leaves:L,meta};
}
module.exports.armAndSlide=armAndSlide;
