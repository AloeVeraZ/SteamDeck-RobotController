'use strict';
// The CAD body split into moving links and posed by joint values, with real Three.js objects.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const R=require('../ui/sim-robot-model.js'),K=require('../ui/sim-kinematics.js'),D=require('../ui/sim-discovery.js'),Mech=require('../ui/sim-mechanisms.js'),S=require('./fixtures/mechanism-shapes.cjs');
const threePath=path.join(__dirname,'../.cache/simulation-deps/node_modules/three');
const skip=fs.existsSync(threePath)?false:'build the simulation dependencies for Three.js';
const near=(a,b,tol,msg)=>{const x=[].concat(a),y=[].concat(b);x.forEach((v,i)=>assert.ok(Math.abs(v-y[i])<=tol,`${msg||''} ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`));};
function setup(){
  const T=require(threePath);
  // Stand-in shapes are merged from a few primitives; plain concatenation is enough here.
  const mergeGeometries=list=>{const g=new T.BufferGeometry(),p=[];for(const x of list)p.push(...x.attributes.position.array);g.setAttribute('position',new T.Float32BufferAttribute(p,3));return g;};
  globalThis.DeckThree={THREE:T,mergeGeometries};globalThis.DeckKinematics=K;globalThis.DeckMechanisms=Mech;
  const r=S.ftcRobot(),a=r.arrays,g=new T.BufferGeometry();
  g.setAttribute('position',new T.BufferAttribute(a.positions,3));g.setAttribute('color',new T.BufferAttribute(new Float32Array(a.positions.length).fill(.6),3));g.setAttribute('_part',new T.BufferAttribute(a.part,1));g.setIndex(new T.BufferAttribute(a.index,1));g.computeVertexNormals();g.userData.parts=a.tree;
  const ctx=D.prepare(a),mechanisms=Mech.sanitize(r.mechanisms),found=D.discover(ctx,{rows:R.rows(r.meta),unit:1,meta:r.meta,mechanisms});
  const footprint={front:8,rear:8,half:8},holder=R.place(g,r.meta,footprint),kinematics=K.sanitize({model:r.meta.id,unit:1,joints:found.joints});
  return {T,r,g,ctx,mechanisms,holder,kinematics,footprint};
}
// Where a CAD point is drawn now (robot frame), through every transform above its mesh.
function drawn(T,root,leaf,p){let at=null;root.updateMatrixWorld(true);root.traverse(o=>{if(at||!o.isMesh||!o.geometry.index||!o.geometry.attributes._part)return;const idx=o.geometry.index.array,ids=o.geometry.attributes._part;
  for(let i=0;i<idx.length;i+=3)if(Math.round(ids.getX(idx[i]))===leaf){at=new T.Vector3(...p).applyMatrix4(o.matrixWorld);return;}});return at&&[at.x,at.y,at.z];}
test('the body splits into one mesh per joint, sharing its vertices, with every triangle kept once',{skip},()=>{
  const {g,holder,r,mechanisms,kinematics,footprint}=setup(),rigged=R.rig(holder.clone(),{meta:r.meta,mechanisms,kinematics,footprint});
  const meshes=[];rigged.traverse(o=>{if(o.isMesh)meshes.push(o);});const groups=R.linksOf(rigged);
  assert.equal(groups.size,kinematics.joints.length,'a link group per joint');
  assert.equal(meshes.reduce((s,m)=>s+m.geometry.index.count,0),g.index.count,'every triangle once');
  assert.ok(meshes.every(m=>m.geometry.attributes.position===g.attributes.position),'vertex buffers shared, not copied');
  // Each link's mesh holds only its own parts' triangles.
  const P=K.partIndex(g.userData.parts);for(const j of kinematics.joints){const mine=new Set(),g2=groups.get(j.id);
    for(const k of P.expand(j.parts))mine.add(k);for(const c of kinematics.joints)if(c.parent===j.id||K.order(kinematics).indexOf(c)>K.order(kinematics).indexOf(j))for(const k of P.expand(c.parts))mine.delete(k);
    const m=g2.children[0];if(!m)continue;const idx=m.geometry.index.array,ids=m.geometry.attributes._part;for(let i=0;i<idx.length;i+=3)assert.ok(P.expand(j.parts).has(Math.round(ids.getX(idx[i]))),`${j.id} holds only its parts`);}
  assert.ok(rigged.userData.kin.P&&!rigged.userData.kin.model.joints.some(j=>j.parts),'what posing needs, without part lists');
});
test('posing turns links about their pivots in the robot frame, children riding on parents',{skip},()=>{
  const {T,holder,r,mechanisms,kinematics,footprint}=setup(),rigged=R.rig(holder.clone(),{meta:r.meta,mechanisms,kinematics,footprint}),L=r.leaves;
  const P=new T.Matrix4().fromArray(rigged.userData.kin.P),toRobot=p=>new T.Vector3(...p).applyMatrix4(P).toArray();
  const fc=[-4.5,0,9],rest=drawn(T,rigged,L.flywheel,fc);near(rest,toRobot(fc),1e-6,'at rest every link is where the CAD has it');
  R.pose(rigged,{turret1:90});const turned=drawn(T,rigged,L.flywheel,fc),axis=toRobot([-3,0,0]);
  // 90° counterclockwise about the turret's upright axis through the gear: the flywheel (1.5 in behind it) moves to its right.
  near([turned[0]-axis[0],turned[1]-axis[1]],[0,-1.5],1e-6,'flywheel carried round the gear');near(turned[2],rest[2],1e-6);
  near(drawn(T,rigged,L.chassis,[0,0,2]),toRobot([0,0,2]),1e-9,'the frame stays');
  // The hood rides on the turret: tilting it then turning the turret.
  R.pose(rigged,{turret1:90,hood1:30});const hp=[-4.5+3.9,0,9],h=drawn(T,rigged,L.hood,hp);
  // The hood point 3.9 in out from the flywheel axle tilts 30° about it (right-handed about the axis as found, ±y):
  // about +y it goes forward 3.9 cos 30° and down 3.9 sin 30°. Then the turret turns it 90° counterclockwise about the
  // gear (1.5 in in front of the axle), so its forward offset from the gear becomes an offset to the left.
  const s=kinematics.joints.find(j=>j.id==='hood1').axis[1]>0?1:-1,forward=-1.5+3.9*Math.cos(Math.PI/6),z=9-s*3.9*Math.sin(Math.PI/6);
  near([h[0]-axis[0],h[1]-axis[1],h[2]],[0,forward,z],1e-6,'hood tilted, then carried round');
});
test('clones keep their own pose; animate uses the engine’s values, else the frame’s mechanism state',{skip},()=>{
  const {T,holder,r,mechanisms,kinematics,footprint}=setup(),rigged=R.rig(holder.clone(),{meta:r.meta,mechanisms,kinematics,footprint}),a=rigged.clone(),b=rigged.clone();
  R.pose(a,{deploy1:40});const plate=[14,0,2.5];assert.notDeepEqual(drawn(T,a,r.leaves.ramp,plate),drawn(T,b,r.leaves.ramp,plate),'b stays up');
  const lowered=kinematics.joints.find(j=>j.id==='deploy1').states.lowered,group=new T.Group();group.add(rigged.clone());
  R.animate(group,{time:1,truth:{x:0,y:0,heading:0,vx:0,vy:0,omega:0},mechanisms:{turrets:[0],deploy:[1]}});
  near(drawn(T,group,r.leaves.ramp,plate)[2],0,.08,`no engine values: the ramp all the way down (${lowered}°) touches the floor`);
  R.animate(group,{time:1.1,truth:{x:0,y:0,heading:0,vx:0,vy:0,omega:0},mechanisms:{turrets:[0],deploy:[1]},joints:{deploy1:0}});
  near(drawn(T,group,r.leaves.ramp,plate),drawn(T,b,r.leaves.ramp,plate),1e-9,'the engine’s value wins');
});
test('drive wheels roll forward as the robot drives forward',{skip},()=>{
  const {T,holder,r,mechanisms,kinematics,footprint}=setup(),group=new T.Group();group.add(R.rig(holder.clone(),{meta:r.meta,mechanisms,kinematics,footprint}));
  const frame=t=>({time:t,truth:{x:0,y:0,heading:0,vx:10,vy:0,omega:0}});R.animate(group,frame(0));R.animate(group,frame(.1));
  // The top of a wheel moves forward (+x) when it rolls forward: 0.1 s at 10 in/s on a 2 in wheel is 0.5 rad.
  const w=r.leaves.wheels[0],top=[5,7.5,4],p=drawn(T,group,w,top);near([p[0]-5,p[2]-2],[2*Math.sin(.5),2*Math.cos(.5)],1e-3,'turned 0.5 rad, top forward');
});
test('a robot without CAD parts for its mechanisms gets stand-ins that the frame’s state turns',{skip},()=>{
  const {T}=setup(),body=new T.Group();body.add(new T.Mesh(new T.BoxGeometry(18,18,4)));
  const mechanisms=Mech.sanitize({enabled:true,intakes:[{kind:'ramp',sides:['front']}],shooters:[{type:'turret',pieces:'pollen',mount:'center'}]});
  const rigged=R.rig(body,{mechanisms,kinematics:K.EMPTY(),footprint:{front:9,rear:9,half:9},height:12}),groups=R.linksOf(rigged);
  assert.deepEqual([...groups.keys()].sort(),['standin-deploy1','standin-turret1']);
  const group=new T.Group();group.add(rigged);R.animate(group,{time:0,truth:{x:0,y:0,heading:0,vx:0,vy:0,omega:0},mechanisms:{turrets:[90],deploy:[0]}});
  const e=new T.Euler().setFromRotationMatrix(groups.get('standin-turret1').matrix);near(e.z,Math.PI/2,1e-9,'turret stand-in faces left at 90°');
  assert.ok(groups.get('standin-turret1').children.some(o=>o.isMesh),'a bundled chassis draws the stand-in');assert.equal(rigged.userData.kin.turrets.length,1,'and the cameras know its shape');
});
test('an imported CAD never gets a stand-in shape: the joint is there for the software, nothing is drawn',{skip},()=>{
  const {holder,r,footprint}=setup(),mechanisms=Mech.sanitize({enabled:true,intakes:[{kind:'ramp',sides:['front']}],shooters:[{type:'turret',pieces:'pollen',mount:'center'}]});
  const rigged=R.rig(holder.clone(),{meta:r.meta,mechanisms,kinematics:K.EMPTY(),footprint}),groups=R.linksOf(rigged),kin=rigged.userData.kin;
  assert.deepEqual([...groups.keys()].sort(),['standin-deploy1','standin-turret1'],'joints the game can turn');
  assert.ok([...groups.values()].every(g=>!g.children.length),'with nothing in them');assert.equal(kin.turrets.length,0,'and no turret shape for the cameras to ride on');
  const meshes=[];rigged.traverse(o=>{if(o.isMesh)meshes.push(o);});assert.equal(meshes.length,1,'only the CAD body is drawn');
});
test('each moving CAD part has a hitbox round its parts that moves with it, hidden until shown; turrets give the cameras their shape',{skip},()=>{
  const {T,holder,r,mechanisms,kinematics,footprint}=setup(),rigged=R.rig(holder.clone(),{meta:r.meta,mechanisms,kinematics,footprint}),kin=rigged.userData.kin,L=r.leaves;
  const boxes=[];rigged.traverse(o=>{if(o.userData.deckHitbox)boxes.push(o);});
  assert.deepEqual(boxes.map(b=>b.userData.deckHitbox).sort(),['deploy1','flywheel1','hood1','roller1','turret1'],'turret, flywheel, hood, ramp and roller; not the drive wheels');
  assert.ok(boxes.every(b=>b.material.visible===false),'hidden at first');
  // The ramp's box: its arms, plate and hinge (CAD frame).
  near(kin.boxes.deploy1.lo,[7.9,-7,2.5],.15,'ramp box low corner');near(kin.boxes.deploy1.hi,[14,7,5.6],.15,'ramp box high corner');
  const copy=rigged.clone();R.hitboxes(rigged,true);const shown=[];copy.traverse(o=>{if(o.userData.deckHitbox)shown.push(o.material.visible);});assert.ok(shown.length&&shown.every(Boolean),'a clone (the 3D view’s copy) shows them too');
  R.pose(rigged,{deploy1:90});rigged.updateMatrixWorld(true);const ramp=boxes.find(b=>b.userData.deckHitbox==='deploy1'),c=new T.Vector3().setFromMatrixPosition(ramp.matrixWorld),P=new T.Matrix4().fromArray(kin.P);
  const hinge=new T.Vector3(8.5,0,5).applyMatrix4(P),before=new T.Vector3(11,0,4.05).applyMatrix4(P);assert.ok(c.z<before.z-1,`the box swings down with the ramp (${c.z.toFixed(2)})`);near(c.distanceTo(hinge),before.distanceTo(hinge),.05,'about the hinge');
  // The turret fires toward the back in the CAD (zero 180): at a turret angle of 0 it faces forward, so its shooter is
  // ahead of the pivot.
  const t=kin.turrets[0];assert.equal(kin.turrets.length,1);assert.equal(t.n,0);near(t.pivot,new T.Vector3(-3,0,6).applyMatrix4(P).toArray().slice(0,2),1e-3,'pivot on the turntable');
  near([t.x0,t.x1],[-3,4],.05,'from the back of the gear to the end of the side plate (4 in behind the pivot in the CAD), now facing forward');assert.ok(t.z1>t.z0&&t.tip===t.x1&&t.y>=2.9,JSON.stringify(t));
});
test('mecanum wheels roll with sideways motion too: one diagonal pair forward, the other back',{skip},()=>{
  const {T,holder,r,mechanisms,footprint}=setup(),ctx=D.prepare(r.arrays),found=D.discover(ctx,{rows:R.rows(r.meta),unit:1,meta:r.meta,mechanisms});
  const kinematics=K.sanitize({model:r.meta.id,unit:1,joints:found.joints}),group=new T.Group();group.add(R.rig(holder.clone(),{meta:r.meta,mechanisms,kinematics,footprint}));
  assert.ok(kinematics.joints.filter(j=>j.drive?.signal==='wheel').every(j=>j.roll==='mecanum'),'named mecanum');
  // Strafing left at 10 in/s for 0.1 s: front-left (+x,+y) and back-right roll back, front-right and back-left forward.
  const frame=t=>({time:t,truth:{x:0,y:0,heading:0,vx:0,vy:10,omega:0}});R.animate(group,frame(0));R.animate(group,frame(.1));
  const spin=k=>{const w=r.leaves.wheels[k],c=[[5,7.5],[5,-7.5],[-5,7.5],[-5,-7.5]][k],p=drawn(T,group,w,[c[0],c[1],4]);return Math.sign(p[0]-c[0]);};
  assert.deepEqual([0,1,2,3].map(spin),[-1,1,1,-1],'front-left back, front-right forward, back-left forward, back-right back');
});
test('retuning a rig takes new pivots and positions without splitting the body again',{skip},()=>{
  const {T,holder,r,mechanisms,kinematics,footprint}=setup(),rigged=R.rig(holder.clone(),{meta:r.meta,mechanisms,kinematics,footprint}),meshes=[];rigged.traverse(o=>{if(o.isMesh)meshes.push(o.geometry);});
  const moved=structuredClone(kinematics);moved.joints.find(j=>j.id==='turret1').origin=[0,0,0];R.retune(rigged,moved);
  const after=[];rigged.traverse(o=>{if(o.isMesh)after.push(o.geometry);});assert.ok(after.every((g,i)=>g===meshes[i]),'same meshes');
  R.pose(rigged,{turret1:90});const p=drawn(T,rigged,r.leaves.flywheel,[-4.5,0,9]);near(p.slice(0,2),[0,-4.5],1e-6,'now turning about the new pivot (the origin)');
});
