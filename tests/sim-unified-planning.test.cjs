'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../ui/sim-planner.js'),X=require('../ui/sim-export.js'),T=require('../ui/sim-timed.js'),F=require('../ui/sim-ftc.js'),M=require('../ui/sim-motionmodule.js'),{SimEngine}=require('../src/sim-engine.cjs');
const fp={front:7.5,rear:7.5,half:7.5},start={x:24,y:24,heading:0};
const zone={id:'box',type:'rect',x:72,y:72,width:24,height:24};
test('analysis reports all obstructed pins and refreshes after obstacles, pins or starting pose change',()=>{
 const project={start,zones:[zone],pins:[{x:72,y:72},{x:75,y:75},{x:120,y:120}],rotate:false};
 assert.deepEqual(P.analyze(project,fp).map(i=>i.pin),[0,1]);
 assert.deepEqual(P.analyze({...project,zones:[]},fp),[]);
 assert.deepEqual(P.analyze({...project,pins:project.pins.map((p,i)=>i<2?{x:24,y:60+i*30}:p)},fp),[]);
 assert.ok(P.analyze({...project,start:{x:1,y:1,heading:0}},fp).some(i=>i.code==='start'));
 const all=Array.from({length:32},()=>({x:72,y:72}));assert.equal(P.analyze({...project,pins:all},fp).length,32);
});
test('gradual rotation can leave a wall safely; actual swept collisions still fail',()=>{
 const project={start:{x:9,y:7.9,heading:0},zones:[],pins:[{x:40,y:70,path:{rotate:'turn',heading:90}}],clearance:1};
 const r=P.plan(project,fp);assert.equal(r.effects,true);
 for(const s of r.segments)for(let j=0;j<=100;j++){const t=j/100,p=s.points[0],q=s.points.at(-1);assert.ok(P.safePose({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t,heading:s.heading+(s.endHeading-s.heading)*t},[],fp));}
 assert.throws(()=>P.plan({...project,pins:[{x:60,y:7.9,path:{rotate:'spin',spins:1}}]},fp),/pin 1.*spin/);
});
test('per-path power round trips and splits regular as well as action paths',()=>{
 const pins=[{x:55,y:24,path:{power:.25}},{x:90,y:24,path:{kind:'action',action:'Intake',power:.8}},{x:90,y:90,path:{power:0}}];
 const r=P.plan({start,zones:[],pins,defaultPower:.6},fp),parts=X.legs(r);
 assert.deepEqual(parts.map(l=>l.power),[.25,.8,0]);assert.equal(r.defaultPower,.6);
 assert.equal(P.pathEffects({power:-2}).power,0);assert.equal(P.pathEffects({power:2}).power,1);assert.equal(P.pathEffects({power:NaN}).power,null);
 assert.match(X.java(r,{start,zones:[]},{polygon:P.polygon}),/MOTOR_POWER = \{0.25, 0.8, 0\}/);
 assert.deepEqual(JSON.parse(X.pp(r,{start,zones:[]},{polygon:P.polygon})).lines.map(l=>l.motorPower),[.25,.8,0]);
 const timed=T.compile(r,{forwardSpeed:60,startup:0});assert.deepEqual(timed.steps.filter(s=>s.power!==undefined).map(s=>s.power),[.25,.8,0]);assert.equal(timed.duration,null);
 const mm=M.autonomous(r,{power:.6});assert.match(mm,/\("power", 0\.25\)/);assert.match(mm,/\("disabled",\)/);
});
test('zero motor power prevents timed translation and all requested chassis turns',()=>{
 const r=P.plan({start,zones:[],pins:[{x:80,y:24,turn:90}],defaultPower:0},fp),runner=new T.Runner(r);
 for(let i=0;i<120;i++)assert.deepEqual(runner.advance(1/60,0).drive,{forward:0,strafe:0,turn:0});
 const diagonal=P.plan({start,zones:[],pins:[{x:80,y:80}],defaultPower:.5},fp),cmd=new T.Runner(diagonal).advance(1/60,.2).drive;
 assert.ok(Math.abs(cmd.forward)+Math.abs(cmd.strafe)+Math.abs(cmd.turn)<=.5+1e-9);
});
test('native and exported FTC enforce each path motor ceiling, then stay stopped on a zero-power path',async()=>{
 for(const kind of ['route','opmode']){const e=new SimEngine({now:()=>0});try{
  const info=await e.load({field:'empty',start,robot:{length:15,width:15},sensors:{localization:'odometry',noise:0,gyroDrift:0,scaleError:0},tuning:{maxPathSpeed:.8}});
  const pins=[{x:50,y:24,path:{power:.25}},{x:80,y:24,path:{power:.8}},{x:100,y:24,path:{power:0}}],layout={start,zones:[],pins},r=P.plan({...layout,defaultPower:.8},info.footprint);
  let program={kind:'route',route:r};if(kind==='opmode'){const out=F.files({route:r,layout,tuning:info.tuning,robot:info.robot,localization:'odometry',routeJava:X.java(r,layout,{polygon:P.polygon})});program={kind,files:out.files,opMode:out.opMode};}
  assert.equal((await e.run(program)).ok,true);let sawSlow=false,sawFast=false;
  for(let i=0;i<900;i++){await e.programTick();const sum=Math.abs(e.command.forward)+Math.abs(e.command.strafe)+Math.abs(e.command.turn),leg=Number((e.telemetry?.leg||'').split(' ')[0]);
   if(kind==='route'&&leg===1){assert.ok(sum<=.25+1e-6);sawSlow||=sum>.1;}if(sum>.3)sawFast=true;assert.ok(sum<=.8+1e-6,JSON.stringify({kind,sum,telemetry:e.telemetry,command:e.command}));}
  if(kind==='route'){assert.ok(sawSlow);assert.equal(e.telemetry.leg,'3 of 3');}assert.ok(sawFast);assert.ok(e.truth().x>75&&e.truth().x<85,JSON.stringify({kind,truth:e.truth(),telemetry:e.telemetry,command:e.command}));assert.equal(e.command.forward,0);assert.equal(e.command.strafe,0);assert.equal(e.command.turn,0);
 }finally{e.dispose();}}
});
test('mass, gearing, wheel size and inertia produce finite traction-limited physics across 96 configurations',async()=>{
 const e=new SimEngine({now:()=>0});try{await e.load({field:'empty',start});const base=e.world.robots[0].spec;
 for(const massLb of [.5,5,25,100])for(const driveRpm of [50,312,1000,6000])for(const deckWheelMm of [24,104,200])for(const deckDriveMotors of [2,4]){const d=e.dsim.driveParams({...base,massLb,driveRpm,deckWheelMm,deckDriveMotors});assert.ok(Object.values(d).filter(v=>typeof v==='number').every(Number.isFinite));assert.ok(d.accel>0&&d.accel<=310);}
 const light=e.dsim.driveParams({...base,massLb:5}),heavy=e.dsim.driveParams({...base,massLb:100}),fast=e.dsim.driveParams({...base,massLb:100,driveRpm:1000});
 assert.ok(heavy.accel<light.accel);assert.ok(fast.accel<heavy.accel);assert.ok(fast.maxSpeed>heavy.maxSpeed);
 const small=e.dsim.driveParams({...base,length:12,width:12}),large=e.dsim.driveParams({...base,length:24,width:24});assert.ok(large.turnAccel<small.turnAccel);
 await e.load({field:'empty',start,tuning:{translationalP:999,headingP:999,correctionScale:999,maxPathSpeed:0},sensors:{noise:2,gyroDrift:100}});assert.ok(e.info.tuning.translationalP<2);assert.equal(e.info.tuning.maxPathSpeed,0);assert.ok(e.info.tuning.headingBrakeLinear<1);
 }finally{e.dispose();}
});
test('path correction is always on: sensor error and the retired 0–2 strength never change the exported gains',async()=>{
 const e=new SimEngine({now:()=>0});try{const gains=async(sensors,tuning={})=>(await e.load({field:'empty',start,sensors,tuning})).tuning.translationalP;
  const clean=await gains({localization:'odometry',noise:0,gyroDrift:0}),noisy=await gains({localization:'odometry',noise:2,gyroDrift:100});
  assert.ok(clean>0);assert.equal(noisy,clean);assert.equal(await gains({localization:'odometry'},{correctionScale:2}),clean);assert.equal(await gains({localization:'odometry'},{correctionScale:0}),clean);
  const out=F.files({route:P.plan({start,zones:[],pins:[{x:60,y:24}],defaultPower:.8},fp),layout:{start,zones:[],pins:[{x:60,y:24}]},tuning:(await e.load({field:'empty',start,sensors:{localization:'odometry'},tuning:{correctionScale:0}})).tuning,robot:e.info.robot,localization:'odometry',routeJava:''});
  const java=Object.entries(out.files).find(([k])=>k.endsWith('Constants.java'))[1],positionP=Number(/config.positionP=([^;]+);/.exec(java)[1]);assert.ok(Math.abs(positionP-clean*.35)<1e-5,java);
  // The exported controller is the simulated one: square-root position feedback with correction priority.
  const follower=Object.values(out.files).join('\n');assert.match(follower,/Math\.sqrt\(2\*a\*\(error-knee\/2\)\)/);assert.match(follower,/bisect for the largest share that fits/);
 }finally{e.dispose();}
});
