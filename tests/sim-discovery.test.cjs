'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),D=require('../ui/sim-discovery.js'),K=require('../ui/sim-kinematics.js'),Mech=require('../ui/sim-mechanisms.js');
const S=require('./fixtures/mechanism-shapes.cjs');
const near=(a,b,tol,msg)=>{const x=[].concat(a),y=[].concat(b);x.forEach((v,i)=>assert.ok(Math.abs(v-y[i])<=tol,`${msg||''} ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`));};
const parallel=(a,b)=>Math.abs(K.math.dot(K.math.unit(a),K.math.unit(b)))>.999;
const lineDistance=(p,o,a)=>{const d=K.math.sub(p,o),u=K.math.unit(a);return K.math.len(K.math.sub(d,K.math.scale(u,K.math.dot(d,u))));};
test('round parts are found with their axis, centre and size; flat and square ones are not',()=>{
  const b=S.builder(),n=b.node('Parts');
  const disk=b.add(n,S.cylinder({center:[1,2,3],axis:[0,0,1],r:3,length:.3,seg:60})),shaft=b.add(n,S.cylinder({center:[0,0,0],axis:[1,1,0],r:.2,length:6,seg:6})),bearing=b.add(n,S.cylinder({center:[4,0,0],axis:[0,1,0],r:.55,inner:.3,length:.2,seg:24}));
  const cube=b.add(n,S.box([-1,-1,-1],[1,1,1])),slab=b.add(n,S.box([0,0,0],[4,1,.2]));
  const ctx=D.prepare(b.arrays()),f=k=>D.feature(ctx,k).revolve;
  near(f(disk).center,[1,2,3],1e-3,'disk centre');assert.ok(parallel(f(disk).axis,[0,0,1]));near(f(disk).radius,3,.02);
  assert.ok(parallel(f(shaft).axis,[1,1,0]),'a hex shaft turns about its length');near(f(shaft).radius,.2,.02);
  assert.ok(parallel(f(bearing).axis,[0,1,0]));near(f(bearing).radius,.55,.01,'a ring: its outer radius');
  assert.equal(f(cube),null,'a cube is not round about any axis');assert.equal(f(slab),null,'a bar is not round');
});
test('circle fits: exact through clean points, and robust to outliers',()=>{
  const pts=Array.from({length:50},(_,i)=>{const t=i/50*Math.PI;return {x:3+2*Math.cos(t),y:-1+2*Math.sin(t)};});
  const f=D.fitCircle(pts);near([f.x,f.y,f.r],[3,-1,2],1e-9,'half a circle is enough');
  const noisy=[...pts,...Array.from({length:30},(_,i)=>({x:i*.3,y:5-i*.1}))],r=D.ransacCircle(noisy,.01);near([r.x,r.y,r.r],[3,-1,2],1e-6,'outliers ignored');assert.equal(r.inliers,50);
});
test('picking a circle: a round part gives its axis, a hole its own circle, a curved patch its cylinder',()=>{
  const b=S.builder(),n=b.node('Parts');
  const gear=b.add(n,S.cylinder({center:[0,0,5],axis:[0,0,1],r:2.5,length:.25,seg:64})),plate=b.add(n,S.plateWithHole({center:[10,0,0],axis:[0,0,1],size:6,t:.25,hole:.4}));
  const arc=b.add(n,S.arcBand({center:[0,8,0],axis:[1,0,0],r:3,t:.1,width:2,from:10,to:80,start:[0,1,0]}));
  const ctx=D.prepare(b.arrays());
  const g=D.fitAt(ctx,{leaf:gear,point:[1,1,5.125]});near(g.origin.slice(0,2),[0,0],1e-3,'gear centre');assert.ok(parallel(g.axis,[0,0,1]));near(g.radius,2.5,.01);
  const h=D.fitAt(ctx,{leaf:plate,point:[10.45,0,.125]});assert.ok(['hole','cylinder'].includes(h.kind),h.kind);near(h.origin,[10,0,.125],1e-3,'the hole’s centre on the face clicked');near(h.radius,.4,1e-3);
  const rim=D.fitAt(ctx,{leaf:plate,point:[12.9,0,.125]});assert.notEqual(rim.kind,'hole','near the outside edge it is the face’s rim, not the hole');
  const c=D.fitAt(ctx,{leaf:arc,point:[0,8+3*Math.cos(.7),3*Math.sin(.7)]});assert.ok(parallel(c.axis,[1,0,0]),'the arc’s axis');near(lineDistance([0,8,0],c.origin,c.axis),0,.02,'centred on the arc');near(c.radius,3,.05);
});
test('swinging to the floor: the first angle at which the lowest point touches it',()=>{
  const b=S.builder(),n=b.node('Arm'),arm=b.add(n,S.box([0,-.1,9.9],[10,.1,10.1]));const ctx=D.prepare(b.arrays());
  // A 10 in arm level at 10 in, hinged at its back end: it touches the floor only when pointing straight down.
  const a=D.swingToFloor(ctx,[arm],[0,0,10],[0,1,0],{up:[0,0,1],floor:0});near(a,90,1.5,'about the +y axis, positive turns the far end down');
  assert.equal(D.swingToFloor(ctx,[arm],[0,0,10],[0,-1,0],{up:[0,0,1],floor:0,limit:60}),null,'the other way it lifts, never reaching the floor in 60°');
});
test('an FTC robot: turret on its gear, flywheel, concentric hood, hinged ramp over a fixed roller, four drive wheels',()=>{
  const r=S.ftcRobot(),ctx=D.prepare(r.arrays),{joints,report}=D.discover(ctx,{rows:[[1,0,0],[0,1,0],[0,0,1]],unit:1,meta:r.meta,mechanisms:Mech.sanitize(r.mechanisms)});
  const j=id=>joints.find(x=>x.id===id),leaves=x=>ctx.parts.expand(x.parts),L=r.leaves;
  const turret=j('turret1');assert.ok(turret,'turret found: '+report.join(' | '));near(turret.origin.slice(0,2),[-3,0],1e-3,'on the gear’s axis');near(turret.axis,[0,0,1],1e-6,'pointing up');
  assert.ok(leaves(turret).has(L.flywheel)&&leaves(turret).has(L.gear)&&leaves(turret).has(L.plate),'carries the shooter and its gear');assert.ok(!leaves(turret).has(L.base),'the base plate under the gear stays');
  near(turret.zero,180,1,'fires over the flywheel, away from the hood: towards the back');assert.ok(turret.confidence>=.7);
  const fly=j('flywheel1');assert.equal(fly.parent,'turret1');near(lineDistance(fly.origin,[-4.5,0,9],[0,1,0]),0,1e-3);assert.ok(parallel(fly.axis,[0,1,0]));assert.ok(leaves(fly).has(L.axle),'its axle turns with it');
  // The side facing the hood (+x) moves up for positive spin.
  const up=K.math.dot(K.math.cross(fly.axis,[1,0,0]),[0,0,1]);assert.ok(up>0,'spins to carry the piece up the hood');
  const hood=j('hood1');assert.equal(hood.parent,'turret1');near(lineDistance(hood.origin,[-4.5,0,9],[0,1,0]),0,.05,'pivots on the flywheel axle');assert.ok(leaves(hood).has(L.hood)&&!leaves(hood).has(L.flywheel));
  assert.equal(hood.states.shoot,0,'its shooting tilt is left to the team');
  const ramp=j('deploy1');assert.ok(ramp,'ramp hinge found: '+report.join(' | '));near(lineDistance([8.5,0,5],ramp.origin,ramp.axis),0,.02,'hinged on the servo hub line');assert.ok(parallel(ramp.axis,[0,1,0]));
  const moving=leaves(ramp);assert.ok(L.arms.every(k=>moving.has(k))&&moving.has(L.ramp),'the arms and ramp plate swing');assert.ok(!moving.has(L.roller)&&!L.sides.some(k=>moving.has(k)),'the roller and the plates holding it stay');
  // First touch: the plate's bottom front corner (14, 2.5) swings about (8.5, 5) down to the floor.
  const corner=Math.hypot(5.5,2.5),want=(Math.asin((5-.02)/corner)-Math.atan2(2.5,5.5))*180/Math.PI;near(ramp.states.lowered,want,.6,'down where it touches the floor');
  const W=K.worlds(K.sanitize({joints:[ramp]}),{deploy1:[ramp.states.lowered]}).get('deploy1'),p=K.math.apply(W,[14,0,2.5]);assert.ok(p[2]<.1&&p[2]>-.1,`the corner is on the floor (${p[2]})`);
  const roller=j('roller1');assert.ok(roller);near(lineDistance(roller.origin,[9.5,0,1.6],[0,1,0]),0,1e-3);assert.equal(roller.parent??null,null);
  // Rolling in: the underside moves back toward the robot.
  assert.ok(K.math.dot(K.math.cross(roller.axis,[0,0,-1]),[-1,0,0])>0,'the roller sweeps pieces in');
  const wheels=joints.filter(x=>x.drive?.signal==='wheel');assert.equal(wheels.length,4);assert.ok(wheels.every(w=>Math.abs(w.radius-2)<.02));
  assert.ok(joints.every(x=>x.source==='inferred'&&x.note),'each says it was found, and why');
  assert.deepEqual(K.sanitize({joints}).joints.map(x=>x.id),joints.map(x=>x.id),'proposals are valid joints');
});
test('a CAD with no named mechanism parts proposes nothing it cannot back up',()=>{
  const b=S.builder(),root=b.node('Blob');b.add(root,S.box([-8,-8,0],[8,8,6]));const ctx=D.prepare(b.arrays());
  const {joints,report}=D.discover(ctx,{rows:[[1,0,0],[0,1,0],[0,0,1]],unit:1,meta:{parts:[]},mechanisms:Mech.sanitize({enabled:true,intakes:[{kind:'ramp',sides:['front']}],shooters:[{type:'turret'}]})});
  assert.equal(joints.length,0);assert.ok(report.some(r=>/stand-in/.test(r)),'it says what is drawn instead');
});
test('any robot: an arm turns on the hinge that joins it to the frame, a slide moves along its rails, both by route actions',()=>{
  const r=S.armAndSlide(),ctx=D.prepare(r.arrays),{joints}=D.discover(ctx,{rows:[[1,0,0],[0,1,0],[0,0,1]],unit:1,meta:r.meta,mechanisms:Mech.sanitize({})}),L=r.leaves,leaves=j=>ctx.parts.expand(j.parts);
  const arm=joints.find(j=>j.name==='Arm');assert.ok(arm,'arm found: '+JSON.stringify(joints.map(j=>j.name)));assert.equal(arm.type,'revolute');assert.ok(parallel(arm.axis,[0,1,0]));near(lineDistance([6,0,4],arm.origin,arm.axis),0,.02,'on the servo hub line');
  assert.ok(leaves(arm).has(L.bar)&&leaves(arm).has(L.claw)&&!leaves(arm).has(L.servo),'the arm turns; the servo on the frame stays');assert.equal(arm.drive.signal,'action');assert.ok(arm.confidence<.7,'flagged for checking');
  const slide=joints.find(j=>j.name==='Linear slide');assert.ok(slide,'slide found');assert.equal(slide.type,'prismatic');near(slide.axis,[0,0,1],1e-3,'straight up');
  assert.ok(L.stage2.every(k=>leaves(slide).has(k))&&leaves(slide).has(L.carriage),'the second stage and carriage ride');assert.ok(L.stage1.every(k=>!leaves(slide).has(k)),'the first stage, bolted to the frame, stays');
  near(slide.states.up,15*.8,.05,'up is most of the rail length');
  // Route actions move them: "Linear slide up".
  const d=new K.Driver(K.sanitize({joints}));assert.equal(d.start('Linear slide up'),true);for(let i=0;i<200;i++)d.tick(.05,{});near(d.values()[slide.id],slide.states.up,1e-6);
});
test('without the game, an FTC robot’s ramp and hood are moved by route actions instead',()=>{
  const r=S.ftcRobot(),ctx=D.prepare(r.arrays),{joints}=D.discover(ctx,{rows:[[1,0,0],[0,1,0],[0,0,1]],unit:1,meta:r.meta,mechanisms:Mech.sanitize({})});
  const ramp=joints.find(j=>j.id==='deploy1');assert.ok(ramp,'found from the part names');assert.equal(ramp.drive.signal,'action');assert.deepEqual(Object.keys(ramp.states),['up','down']);assert.equal(ramp.name,'Ramp');
  const d=new K.Driver(K.sanitize({joints}));assert.equal(d.start('Ramp down'),true);for(let i=0;i<100;i++)d.tick(.01,{});near(d.values().deploy1,ramp.states.down,1e-6,'down in its 0.3 s');
  assert.ok(joints.some(j=>j.id==='turret1'&&j.drive.signal==='action'),'the turret too');
});
