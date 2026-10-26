'use strict';
// Mechanism types (ui/sim-mechanism-types.js): reading a CAD name, a part of each type, and the finder placing named
// assemblies at any depth (a claw on an arm on a lift), with the parts each one moves and which way is positive.
const {test}=require('node:test'),assert=require('node:assert/strict'),T=require('../ui/sim-mechanism-types.js'),K=require('../ui/sim-kinematics.js'),D=require('../ui/sim-discovery.js'),Mech=require('../ui/sim-mechanisms.js');
const S=require('./fixtures/mechanism-shapes.cjs');
const near=(a,b,tol,msg)=>{const x=[].concat(a),y=[].concat(b);x.forEach((v,i)=>assert.ok(Math.abs(v-y[i])<=tol,`${msg||''} ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`));};
const rows=[[1,0,0],[0,1,0],[0,0,1]];

test('a CAD name says what a mechanism is: the last mechanism word wins, hardware and vendor parts say nothing',()=>{
  const cases={
    'Claw':'claw','Claw wrist':'wrist','Wrist claw':'claw','LeftClaw':'claw','Intake claw':'roller-claw','Claw <2>':'claw','End effector':'claw',
    'Intake':'roller-intake','Intake slides':'linear-slide','Intake arm':'deploy-intake','Slapdown intake':'deploy-intake','Extendo':'linear-slide','Viper slide':'linear-slide',
    'Lift':'lift','Outtake slides':'lift','Elevator':'lift','Cascade lift':'lift','Scissor lift':'scissor-lift','Lead screw':'lead-screw','Linear actuator':'lead-screw','Rack and pinion':'rack-pinion',
    'Arm':'arm','A arm':'arm','Shoulder':'arm','Elbow':'elbow','4BAR N':'four-bar','Four bar':'four-bar','Virtual four bar':'v4b','V4B':'v4b','DR4B':'dr4b','Pivoting slides':'pivot-extension',
    'Differential wrist':'diffy-wrist','Wrist roll':'wrist-roll','Claw rotator':'wrist-roll','Bucket':'bucket','Deposit':'bucket','Transfer':'transfer','Spindexer':'spindexer','Gate':'gate','Kicker':'kicker','Kicker wheel':'feeder',
    'Pollen shooter':'flywheel','Flywheel':'flywheel','Shooter hood':'hood','Hood':'hood','Turret':'turret','Mini turret':'mini-turret','Drone launcher':'drone-launcher','Catapult':'catapult','Duck spinner':'spinner',
    'Hang hooks':'hang-hook','Climber':'hang-hook','Winch':'winch','Ratchet':'ratchet','Swerve module':'swerve-steer','Odometry pod':'odometry-pod','Odo lift':'odo-retract','Camera tilt':'camera-mount',
    'Waist':'base-yaw','SCARA link':'scara','Gantry':'gantry','Knee':'knee','Pneumatic piston':'piston','Neck':'neck',
    // Pieces of a mechanism, not mechanisms.
    'Arm motor mount':null,'Claw servo':null,'ClawServo':null,'Servo arm':null,'4BAR HEX P':null,'A Arm Pin':null,'HOOD SPACER':null,'Turret drive':null,'Turntable gear':null,'Lift stage 2':null,
    '48mm Gecko Wheel - 15A (GB)':null,'Intake Roller Wheel (8mm REX®, 16mm Diameter, 16mm Width, 30A Durometer) 3618-40':null,'3614 Series Rhino Wheel (14mm Bore, 72mm Diameter, 30A Durometer) 3614-0014-0072':null,
    'Chassis':null,'Main Body':null,'Belt':null,'Drive base':null,'spacer':null,'Part 1':null,'indexer final <1>':null};
  for(const [name,want] of Object.entries(cases))assert.equal(T.detect(name)?.id??null,want,name);
  assert.equal(T.detect('Slide',{vendor:true})?.word,'Slide','the word it was read from');
});

test('names from every FTC season read as what they are (docs/MECHANISM_RESEARCH.md)',()=>{
  const cases={'Collector':'roller-intake','Harvester':'roller-intake','Particle Elevator':'conveyor','Cap Ball Lift':'forklift','Buddy Lift':'forklift','Beacon Pusher':'button-pusher',
    'Zip Line Trigger':'flip-out-arm','Climber Dumper':'dropper','Tape Measure':'tape-measure','Flag Raiser':'spinner','Goal Grabber':'goal-grabber','Jewel Arm':'knocker-arm',
    'Glyph Flipper':'bucket','Relic Arm':'linear-slide','Team Marker Dropper':'dropper','Lander Latch':'hang-hook','Mineral Sorter':'diverter','Foundation Hooks':'goal-grabber',
    'Capstone':'capper','Ring Hopper':'hopper','Shooter Pivot':'shooter-pivot','Duck Wheel':'spinner','Pixel Box':'bucket','Purple Pixel Dropper':'dropper','Specimen Claw':'claw',
    'Outtake Claw':'claw','Horizontal Slides':'linear-slide','Sample Sweeper':'sweeper-arm','Pole Guide':'pole-guide','Cone Righter':'cone-righter','PTO':'pto-shifter','Butterfly module':'drop-wheels',
    'Suction cup':'suction-gripper','Stilts':'self-lift','Geneva wheel':'geneva-indexer','Delta arm':'delta-arm','Electronics box':null,'Front Plane':null};
  for(const [name,want] of Object.entries(cases))assert.equal(T.detect(name)?.id??null,want,name);
});

test('every type gives a part that saves, and its named positions move it by route action',()=>{
  assert.ok(T.LIST.length>=50,'a broad catalogue');assert.equal(new Set(T.LIST.map(t=>t.id)).size,T.LIST.length,'ids are unique');
  for(const g of T.grouped())assert.ok(g.types.length,`group ${g.name} has types`);
  for(const t of T.LIST){
    const j=T.joint(t.id,{id:'part',name:'Thing',rows}),model=K.sanitize({joints:[j]}),s=model.joints[0];
    assert.equal(s.kind,t.id,t.id);assert.equal(s.type,t.joint,t.id);assert.ok(T.TYPES[t.id].blurb,t.id+' says what it is');
    if(t.signal==='wheel'){assert.equal(s.drive.signal,'wheel');continue;}
    const states=Object.entries(s.states||{});assert.ok(states.length>=2,t.id+' has positions to move between');
    for(const [k,v] of states){if(finite(s.lower))assert.ok(v>=s.lower,`${t.id} ${k} within its range`);if(finite(s.upper))assert.ok(v<=s.upper,`${t.id} ${k} within its range`);}
    const [k,v]=states[1],d=new K.Driver(model);assert.equal(d.start(`Thing ${k}`),true,t.id);for(let i=0;i<4000&&Math.abs((d.values().part??0)-v)>1e-6;i++)d.tick(.01,{});near(d.values().part,v,1e-6,t.id);
    const m=T.motorFor(t.id);assert.ok(Object.hasOwn(K.ACTUATORS,m.kind),t.id+' motor');}
  // Spinning parts follow the game's signal while its mechanisms are on.
  assert.deepEqual(T.settings('roller-intake',{bind:{signal:'roller',of:'intake:0'}}).drive,{signal:'roller',of:'intake:0'});
});
const finite=Number.isFinite;

test('another type keeps the part’s geometry and takes the type’s motion',()=>{
  const j={id:'x',name:'Thing',type:'revolute',parts:['Robot/Thing'],origin:[1,2,3],axis:[0,1,0],states:{up:0,down:45},speed:90,drive:{signal:'action'},kind:'arm',source:'user'};
  const lift=T.retype(j,'lift',{rows});assert.equal(lift.type,'prismatic');assert.deepEqual(lift.parts,j.parts);assert.deepEqual(lift.origin,j.origin);assert.deepEqual(lift.axis,j.axis,'its direction stays once it has parts');
  assert.deepEqual(Object.keys(lift.states),['down','up']);assert.equal(lift.kind,'lift');assert.equal(T.retype(j,'arm'),j,'the same type changes nothing');
  const spin=T.retype(j,'roller-intake',{bind:{signal:'roller',of:'intake:0'}});assert.equal(spin.states,undefined);assert.equal(spin.drive.signal,'roller');assert.equal(spin.rpm,400);
});

// A robot with no game mechanisms, named the way teams name theirs: an outtake whose lift (stage 1 bolted to the frame)
// carries an arm on a servo hub, with a claw whose two fingers turn on hinge pins; a horizontal extendo; a spindexer
// turning on its plate; a hang hook on a pivot; and an indexer's four-bar side plates that share one name.
function teamRobot(){
  const b=S.builder(),root=b.node('Robot'),chassis=b.node('Chassis',root),outtake=b.node('Outtake',root),lift=b.node('Lift',outtake),arm=b.node('Arm',lift),claw=b.node('Claw',arm);
  const ext=b.node('Extendo',root),dex=b.node('Spindexer',root),idx=b.node('Indexer',root),n=(name,parent)=>b.node(name,parent),L={};
  L.frame=b.add(n('Frame plate',chassis),S.box([-8,-8,1],[8,8,3]));L.hookPivot=b.add(n('Hook pivot',chassis),S.cylinder({center:[7.2,-7,3.5],axis:[0,1,0],r:.2,length:1.2,seg:16}));
  L.stage1=[-6,6].map(y=>b.add(n('Stage 1 rail',lift),S.box([-7,y-.4,3],[-6.2,y+.4,18])));
  L.stage2=[-6,6].map(y=>b.add(n('Stage 2 rail',lift),S.box([-6.1,y-.35,3.5],[-5.4,y+.35,18.5])));
  L.carriage=b.add(n('Carriage',lift),S.box([-5.3,-7,4],[-4.8,7,7]));L.servo=b.add(n('Shoulder servo',lift),S.box([-4.8,5.4,5],[-3.2,6.6,7]));
  L.hub=b.add(n('Servo Hub',arm),S.cylinder({center:[-4,7,6],axis:[0,1,0],r:.5,length:.4}));L.bar=b.add(n('Arm bar',arm),S.box([-4.5,7.2,5.5],[6,7.6,6.5]));
  L.base=b.add(n('Claw base',claw),S.box([5.5,5,5],[6.5,9,7]));L.pins=[5.5,8.5].map(y=>b.add(n('Hinge pin',claw),S.cylinder({center:[6.8,y,6],axis:[0,0,1],r:.12,length:2.2,seg:24})));
  L.fingers=[5.5,8.5].map(y=>b.add(n('Finger',claw),S.box([6.6,y-.2,5.2],[9,y+.2,6.8])));
  L.outer=[-3,3].map(y=>b.add(n('Outer rail',ext),S.box([3,y-.3,3],[15,y+.3,3.6])));L.inner=[-3,3].map(y=>b.add(n('Inner rail',ext),S.box([4,y-.25,3.65],[16,y+.25,4.1])));
  L.plate=b.add(n('Spindexer plate',dex),S.cylinder({center:[1,3,5],axis:[0,0,1],r:2,length:.3,seg:48}));L.wall=b.add(n('Spindexer wall',dex),S.box([-.9,2.9,5.15],[2.9,3.1,6.5]));
  L.hook=b.add(n('Hang hook',root),S.box([1.4,-7.4,3.3],[7.6,-6.6,3.7]));
  L.links=[[-5,0],[-3.7,0],[-3.7,6.7]].map(([x,y])=>b.add(n('4BAR N',idx),S.box([x,y,10.3],[x+.13,y+1,11.7])));
  const meta={id:'00112233445566778899aabbccddeeff.glb',units:'in',front:'+x',top:'+z',parts:[{name:'Chassis',role:'chassis',key:'Robot/Chassis',box:[-8,-8,1,8,8,3]},{name:'Outtake',role:'shooter',key:'Robot/Outtake'},
    {name:'Extendo',role:'other',key:'Robot/Extendo'},{name:'Spindexer',role:'indexer',key:'Robot/Spindexer'},{name:'Indexer',role:'indexer',key:'Robot/Indexer'},{name:'Hang hook',role:'other',key:'Robot/Hang hook'}]};
  return {arrays:b.arrays(),leaves:L,meta};
}

test('named assemblies at any depth: a claw’s fingers on an arm on a lift, an extendo, a spindexer, a hang hook',()=>{
  const r=teamRobot(),ctx=D.prepare(r.arrays),L=r.leaves,{joints,couplings,report}=D.discover(ctx,{rows,unit:1,meta:r.meta,mechanisms:Mech.sanitize({})});
  const by=kind=>joints.filter(j=>j.kind===kind),leaves=j=>ctx.parts.expand(j.parts),one=kind=>{const x=by(kind);assert.equal(x.length,1,`${kind}: ${JSON.stringify(joints.map(j=>[j.id,j.kind]))}`);return x[0];};
  assert.ok(report.some(x=>/From the names in your CAD/.test(x)),report.join(' | '));
  const lift=one('lift');assert.equal(lift.type,'prismatic');near(lift.axis,[0,0,1],1e-3,'straight up');assert.deepEqual(Object.keys(lift.states),['down','up']);near(lift.states.up,12,.05,'80% of its rails');
  assert.ok(L.stage1.every(k=>!leaves(lift).has(k)),'the first stage, bolted to the frame, stays');assert.ok([...L.stage2,L.carriage,L.servo].every(k=>leaves(lift).has(k)),'the second stage and carriage ride');
  const arm=one('arm');assert.equal(arm.parent,lift.id,'the arm rides on the lift');near(K.math.len(K.math.cross(arm.axis,[0,1,0])),0,1e-3,'on the servo hub’s axle');
  const fingers=by('claw');assert.equal(fingers.length,2,'both fingers');assert.ok(fingers.every(f=>f.parent===arm.id),'on the arm');assert.equal(fingers[0].name,'Claw');
  assert.ok(fingers.every((f,i)=>leaves(f).size===1&&L.fingers.some(k=>leaves(f).has(k))),'each finger moves alone; the claw base rides on the arm');
  const c=couplings.find(x=>x.to===fingers[1].id);assert.equal(c?.from,fingers[0].id,'the second follows the first');assert.equal(fingers[1].drive,undefined);
  // "Claw closed" closes both fingers toward each other; "Arm up" raises the claw.
  const model=K.sanitize({joints,couplings}),d=new K.Driver(model);assert.equal(d.start('Claw closed'),true);for(let i=0;i<300;i++)d.tick(.01,{});
  const center=k=>{const f=D.feature(ctx,k);return K.math.scale(K.math.add(f.lo,f.hi),.5);},gap=q=>{const p=K.pose(model,q),a=K.math.apply(p.W.get(fingers[0].id),center(L.fingers[0])),b=K.math.apply(p.W.get(fingers[1].id),center(L.fingers[1]));return K.math.len(K.math.sub(a,b));};
  assert.ok(gap(d.values())<gap({})-.5,`closed is narrower: ${gap(d.values())} vs ${gap({})}`);
  const tip=q=>K.math.apply(K.pose(model,q).W.get(fingers[0].id),center(L.fingers[0]))[2];assert.ok(tip({[arm.id]:30})>tip({})+2,'positive turns raise the arm');
  assert.ok(tip({[lift.id]:10})>tip({})+9.9,'the lift carries the arm and claw up');
  const ext=one('linear-slide');near(ext.axis,[1,0,0],1e-3,'reaches forward');assert.deepEqual(Object.keys(ext.states),['in','out']);near(ext.states.out,9.6,.05);assert.ok(L.inner.every(k=>leaves(ext).has(k))&&L.outer.every(k=>!leaves(ext).has(k)));
  const dex=one('spindexer');near(dex.origin,[1,3,5],1e-3,'on its plate');near(dex.axis,[0,0,1],1e-6,'counterclockwise seen from above');assert.deepEqual(Object.keys(dex.states),['slot1','slot2','slot3']);
  const hook=one('hang-hook');near(K.math.len(K.math.cross(hook.axis,[0,1,0])),0,1e-3,'on its pivot');
  const top=q=>K.math.apply(K.pose(model,q).W.get(hook.id),[1.6,-7,3.5])[2];assert.ok(top({[hook.id]:20})>top({})+1,'raising it lifts its tip');
  assert.ok(!joints.some(j=>j.kind==='four-bar'),'four side plates sharing a name are copies, not one moving part');
  assert.ok(joints.every(j=>j.source==='inferred'&&j.confidence<.7),'found from names: every one is for the team to check');
});

test('with the game’s mechanisms on, its own turrets, hoods and intakes are not found again by name',()=>{
  const r=S.ftcRobot(),ctx=D.prepare(r.arrays),unnamed=Mech.sanitize({...r.mechanisms,intakes:r.mechanisms.intakes.map(({parts,...i})=>i),shooters:r.mechanisms.shooters.map(({parts,...s})=>s)});
  for(const [meta,mechanisms] of [[r.meta,Mech.sanitize(r.mechanisms)],[{...r.meta,parts:[]},unnamed]]){const {joints}=D.discover(ctx,{rows,unit:1,meta,mechanisms});
    assert.ok(!joints.some(j=>/^Named “/.test(j.note||'')),JSON.stringify(joints.map(j=>j.name)));
    assert.ok(['deploy-intake','drive-wheel','flywheel','hood','turret'].every(k=>joints.some(j=>j.kind===k)),'the game’s finds say what they are: '+JSON.stringify(joints.map(j=>j.kind)));}
});
