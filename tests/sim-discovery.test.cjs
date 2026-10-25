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
test('a CAD with nothing to find: the turret and ramp are listed with no parts, for the team to choose (nothing is drawn)',()=>{
  const b=S.builder(),root=b.node('Blob');b.add(root,S.box([-8,-8,0],[8,8,6]));const ctx=D.prepare(b.arrays());
  const {joints,report}=D.discover(ctx,{rows:[[1,0,0],[0,1,0],[0,0,1]],unit:1,meta:{parts:[]},mechanisms:Mech.sanitize({enabled:true,intakes:[{kind:'ramp',sides:['front']}],shooters:[{type:'turret'}]})});
  assert.deepEqual(joints.map(j=>[j.id,j.source,j.parts.length,j.drive.signal]),[['turret1','standin',0,'turret'],['deploy1','standin',0,'deploy']],'only placeholders, moving no part');
  const turret=joints[0],ramp=joints[1];near(turret.axis,[0,0,1],1e-9,'a turret turns about up');near(turret.origin[2],6,1e-9,'on top of the robot');
  near(ramp.axis,[0,1,0],1e-9,'a front ramp hinges along the front edge, folding out and down');assert.ok(ramp.origin[0]>6,'at the front');
  assert.ok(report.some(r=>/listed under Moving parts with no parts yet/.test(r)),'it says where to set them up');
  assert.deepEqual(K.sanitize({joints}).joints.map(j=>j.source),['standin','standin'],'kept as they are when stored');
});
// The FTC robot's mechanisms with no CAD parts named in the setup (as a setup made before linking, or by hand).
const unnamed=r=>Mech.sanitize({...r.mechanisms,intakes:r.mechanisms.intakes.map(({parts,...i})=>i),shooters:r.mechanisms.shooters.map(({parts,...s})=>s)});
test('a setup that names no CAD parts is linked to the CAD’s own named assemblies, and finds the same joints',()=>{
  const r=S.ftcRobot(),ctx=D.prepare(r.arrays),rows=[[1,0,0],[0,1,0],[0,0,1]];
  const named=D.discover(ctx,{rows,unit:1,meta:r.meta,mechanisms:Mech.sanitize(r.mechanisms)}),linked=D.discover(ctx,{rows,unit:1,meta:r.meta,mechanisms:unnamed(r)});
  const shape=out=>out.joints.map(j=>[j.id,j.source,[...ctx.parts.expand(j.parts)].sort((a,b)=>a-b).join(),j.origin.map(v=>v.toFixed(3)).join()]);
  assert.deepEqual(shape(linked),shape(named),'the same parts move about the same pivots');
  assert.ok(linked.report.some(x=>/Shooter 1: .*linked to “Pollen shooter” on “Turret”/.test(x)),linked.report.join(' | '));assert.ok(linked.report.some(x=>/Intake 1: .*linked to “Front intake”/.test(x)));
});
test('a CAD with no assembly names: the flywheel, its turntable and the ramp’s hinge are found from shapes alone',()=>{
  const r=S.ftcRobot(),ctx=D.prepare(r.arrays),L=r.leaves,{joints,report}=D.discover(ctx,{rows:[[1,0,0],[0,1,0],[0,0,1]],unit:1,meta:{...r.meta,parts:[]},mechanisms:unnamed(r)}),j=id=>joints.find(x=>x.id===id),leaves=x=>ctx.parts.expand(x.parts);
  assert.ok(report.some(x=>/looked for in the whole CAD/.test(x)),report.join(' | '));
  const turret=j('turret1');assert.equal(turret.source,'inferred');near(turret.origin.slice(0,2),[-3,0],1e-3,'on the turntable gear');assert.ok(leaves(turret).has(L.flywheel)&&leaves(turret).has(L.gear)&&!leaves(turret).has(L.base),'carries the shooter, not the base');
  assert.ok(j('flywheel1')&&j('hood1'),'the flywheel and hood too');
  const ramp=j('deploy1');assert.equal(ramp.source,'inferred');near(lineDistance([8.5,0,5],ramp.origin,ramp.axis),0,.02,'on the servo hub line');assert.ok(leaves(ramp).has(L.ramp)&&!L.wheels.some(k=>leaves(ramp).has(k)),'the ramp plate swings, the wheels do not');
  assert.ok(ramp.confidence<.7,'guessed from its side, so marked for checking');assert.ok(!joints.some(x=>x.drive?.signal==='roller'),'rollers are not guessed (the drive wheels are on that side too)');
});
test('a hood knows the angle its CAD launches at and tilts to the game’s launch angle, positive raising the shot',()=>{
  const r=S.ftcRobot(),ctx=D.prepare(r.arrays),{joints}=D.discover(ctx,{rows:[[1,0,0],[0,1,0],[0,0,1]],unit:1,meta:r.meta,mechanisms:Mech.sanitize(r.mechanisms)}),hood=joints.find(x=>x.id==='hood1');
  // The hood arc runs from 30° above level round to 60° below on the flywheel's front; the spin carries the piece up
  // it, so the shot leaves its top end, along the arc: 60° above level.
  near(hood.launch,60,1.5,'launch angle in the CAD');
  const exit=[-4.5+3.8*Math.cos(Math.PI/6),0,9+3.8*Math.sin(Math.PI/6)],W=K.worlds(K.sanitize({joints:[{...hood,parent:null}]}),{hood1:[10]}).get('hood1'),moved=K.math.apply(W,exit);
  assert.ok(moved[2]<exit[2],'a positive tilt turns the exit end down round the axle, so the shot leaves steeper');
  // Nothing stops it within 45° either way here; on a robot with a block 0.2 in past its lower end, it stops about 3.5°
  // steeper (it never tilts through another part), and flattening stays free.
  assert.deepEqual([hood.lower,hood.upper],[-45,45],'free both ways');
  const stopped=D.discover(D.prepare(S.ftcRobot({hoodStop:true}).arrays),{rows:[[1,0,0],[0,1,0],[0,0,1]],unit:1,meta:r.meta,mechanisms:Mech.sanitize(r.mechanisms)}).joints.find(x=>x.id==='hood1');
  assert.ok(stopped.upper>=1.5&&stopped.upper<=4.5,`stops before the block (${stopped.upper}°)`);assert.equal(stopped.lower,-45,'free to flatten');
  const drive=(joint,s)=>{const d=new K.Driver(K.sanitize({joints:[{...joint,parent:null}]}));for(let i=0;i<100;i++)d.tick(.02,{spin:true,...s});return d;};
  near(drive(stopped,{hood:75}).values().hood1,stopped.upper,1e-6,'75° is past its limit: it tilts as far as it can');
  const d=drive(hood,{hood:75});near(d.values().hood1,15,1e-6,'15° to shoot at 75°');
  for(let i=0;i<100;i++)d.tick(.02,{hood:75});near(d.values().hood1,0,1e-6,'back to rest after');
});
// A turret driven through gears: a servo turns a 100-tooth gear, which turns a 24-tooth pinion on the shaft of a
// 20-tooth gear meshing with the turntable gear (as on the team's own robot).
function geared(){
  const b=S.builder(),root=b.node('Robot'),base=b.node('Base',root),turret=b.node('Turret',root),drive=b.node('Turret drive',root),L={};
  L.frame=b.add(b.node('Frame',base),S.box([-8,-8,1],[8,8,4]));
  L.gear=b.add(b.node('Turntable gear',turret),S.cylinder({center:[0,0,6],axis:[0,0,1],r:3,length:.25,seg:180}));
  L.top=b.add(b.node('Turret plate',turret),S.box([-2,-2,6.2],[2,2,6.6]));
  const d1=3+.75*.94-.04;L.spur=b.add(b.node('Spur gear (20 teeth)',drive),S.cylinder({center:[d1,0,6],axis:[0,0,1],r:.75,length:.4,seg:60}));
  L.pinion=b.add(b.node('24 Pinion Gear',drive),S.cylinder({center:[d1,0,4.8],axis:[0,0,1],r:.42,length:.4,seg:60}));
  L.shaft=b.add(b.node('Shaft',drive),S.cylinder({center:[d1,0,5.4],axis:[0,0,1],r:.12,length:1.6,seg:12}));
  L.big=b.add(b.node('100t Hub Mount Gear',drive),S.cylinder({center:[d1,2.0,4.8],axis:[0,0,1],r:1.62,length:.25,seg:180}));
  L.hub=b.add(b.node('Servo Hub',drive),S.cylinder({center:[d1,2.0,4.4],axis:[0,0,1],r:.5,length:.3,seg:24}));
  L.servo=b.add(b.node('Mini Servo',drive),S.box([d1-.8,1.2,3.4],[d1+.8,2.8,4.2]));
  const meta={id:'abcdefabcdefabcdefabcdefabcdefab.glb',units:'in',front:'+x',top:'+z',parts:[{name:'Base',role:'chassis',key:'Robot/Base',box:[-8,-8,1,8,8,4]},{name:'Turret',role:'shooter',type:'turret',key:'Robot/Turret',box:[-3,-3,5.875,3,3,6.6]}]};
  return {arrays:b.arrays(),leaves:L,meta,d1};
}
test('gears meshing with a turret turn with it, by their tooth ratios, back to the servo (its body stays)',()=>{
  const r=geared(),ctx=D.prepare(r.arrays),L=r.leaves,mechanisms=Mech.sanitize({enabled:true,shooters:[{type:'turret',pieces:'pollen',mount:'center',parts:['Turret']}],intakes:[]});
  const {joints,couplings}=D.discover(ctx,{rows:[[1,0,0],[0,1,0],[0,0,1]],unit:1,meta:r.meta,mechanisms}),j=id=>joints.find(x=>x.id===id),leaves=x=>ctx.parts.expand(x.parts);
  assert.equal(D.teethOfName('Spur gear (20 teeth)'),20);assert.equal(D.teethOfName('100t Hub Mount Gear - 14mm Round Bore (GB)'),100);assert.equal(D.teethOfName('24 Pinion Gear - 8mm REX Bore (GB)'),24);
  assert.equal(D.teethOfName('8mm REX  MOD 1 (24T) (GB)'),24);assert.equal(D.teethOfName('2302 Series Aluminum, MOD 0.8, Hub Mount Gear (14mm Bore, 108 Tooth)'),108);assert.equal(D.teethOfName('Shaft'),null);
  const g1=j('turret1gear1'),g2=j('turret1gear2');assert.ok(g1&&g2,JSON.stringify(joints.map(x=>x.id)));
  assert.ok(leaves(g1).has(L.spur)&&leaves(g1).has(L.pinion),'the 20-tooth gear and the 24-tooth pinion on its shaft turn together');
  assert.ok(leaves(g2).has(L.big)&&leaves(g2).has(L.hub)&&!leaves(g2).has(L.servo),'the 100-tooth gear and servo hub turn; the servo body stays');
  near(g1.origin.slice(0,2),[r.d1,0],1e-3);assert.equal(g1.drive,undefined,'they follow, nothing drives them');
  const c1=couplings.find(c=>c.to==='turret1gear1'),c2=couplings.find(c=>c.to==='turret1gear2'),pitch=.75*20/22;
  assert.equal(c1.from,'turret1');near(c1.ratio,-(r.d1-pitch)/pitch,.05,'the other way, by the pitch radii');assert.equal(c2.from,'turret1gear1');near(c2.ratio,-24/100,1e-9,'by the tooth counts');
  const model=K.sanitize({joints,couplings}),q=K.resolve(model,{turret1:[10]});near(q.turret1gear2[0],10*c1.ratio*c2.ratio,1e-6,'a turn of the turret turns the servo hub');
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
