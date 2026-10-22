'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const C=require('../ui/sim-config.js'),P=require('../ui/sim-planner.js'),X=require('../ui/sim-export.js'),{SimEngine}=require('../src/sim-engine.cjs');
const engine=()=>new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-drive-profiles-')),now:()=>0});
const pad=(x,y)=>({mapping:'standard',axes:[x,y,0,0],buttons:[]});
test('FTC defaults to drive encoders; MotionModule permits external odometry but rejects drive encoders and Pinpoint',async()=>{
  const e=engine();try{assert.deepEqual(C.sensorChoices('motionmodule'),['gyro','odometry','odometry3','optical']);await e.load({});assert.equal(e.config.sensors.localization,'encoders');
    for(const mode of ['gyro','odometry','odometry3','optical','encoders','fused']){await e.load({controller:'motionmodule',sensors:{localization:mode}});assert.equal(e.config.sensors.localization,['encoders','fused'].includes(mode)?'gyro':mode);}
    const start={x:30,y:72,heading:0};await e.load({controller:'motionmodule',field:'empty',start,sensors:{localization:'odometry',noise:0,scaleError:0,gyroDrift:0}});
    const route=P.plan({start,pins:[{x:90,y:72}],zones:[]},e.info.footprint);assert.equal((await e.run({route})).ok,true);assert.ok(e.child);for(let i=0;i<1200&&e.mode==='program';i++)await e.programTick();assert.ok(e.result);assert.ok(Math.abs(e.result.truth.x-90)<1.5);
  }finally{e.dispose();}
});
test('field-centric and robot-centric sticks drive different physical directions at heading zero',async()=>{
  for(const style of ['field','robot']){const e=engine();try{await e.load({field:'empty',start:{x:60,y:60,heading:0},robot:{driveStyle:style}});await e.startPractice({mode:'teleop'});e.practiceInput(pad(0,0));e.practiceInput(pad(0,-1));for(let i=0;i<30;i++)await e.practiceTick();const p=e.truth();assert.ok(style==='field'?p.y>65&&Math.abs(p.x-60)<.1:p.x>65&&Math.abs(p.y-60)<.1,JSON.stringify(p));}finally{e.dispose();}}
});
test('legacy current entries no longer act as a torque multiplier; RPM endpoints have finite measured tuning',async()=>{
  const e=engine();try{const speeds=[];for(const amps of [2,10]){await e.load({field:'empty',start:{x:40,y:40,heading:0},robot:{driveAmps:amps}});for(let i=0;i<6;i++)e.tick({forward:1,strafe:0,turn:0});speeds.push(e.truth().vx);}assert.equal(speeds[1],speeds[0]);
    for(const rpm of [50,6000]){await e.load({robot:{driveRpm:rpm}});assert.equal(e.info.robot.driveRpm,rpm);assert.ok(Object.values(e.info.tuning).every(Number.isFinite));}
  }finally{e.dispose();}
});
test('field-centric tank turns toward the requested direction before driving and keeps right-stick turn direction',async()=>{
  const e=engine();try{await e.load({field:'empty',start:{x:60,y:60,heading:0},robot:{drivetrain:'tank',driveStyle:'field'}});await e.startPractice({mode:'teleop'});e.practiceInput(pad(0,0));e.practiceInput(pad(0,-1));await e.practiceTick();assert.equal(e.command.forward,0);assert.ok(e.command.turn>0);for(let i=0;i<90;i++)await e.practiceTick();assert.ok(e.truth().y>65);assert.ok(Math.abs(e.truth().x-60)<2);e.practiceInput({mapping:'standard',axes:[0,0,1,0],buttons:[]});await e.practiceTick();assert.ok(e.command.turn<0);
  }finally{e.dispose();}
});
test('tank route checks swept chassis turns and exports a separate heading for each leg',()=>{
  const fp=C.footprint({length:24,width:10}),start={x:40,y:40,heading:0},layout={start,pins:[{x:80,y:40},{x:80,y:100}],zones:[],nonholonomic:true},route=P.plan(layout,fp);
  assert.deepEqual(route.segments.map(s=>s.heading),[0,90]);assert.equal(route.nonholonomic,true);assert.match(X.java(route,layout,{polygon:P.polygon}),/TANK: stop and turn/);assert.match(X.java(route,layout,{polygon:P.polygon}),/constant\(Math.toRadians\(90\)\)/);assert.equal(JSON.parse(X.pp(route,layout,{polygon:P.polygon})).lines[1].endPoint.degrees,90);
  assert.throws(()=>P.tankRoute({...route,heading:0,segments:[{type:'line',points:[{x:15,y:6},{x:15,y:80}]}]},[],fp,P.FIELD),/clearance/);
  const obstacle={type:'rect',x:72,y:72,width:24,height:35},detour=P.plan({start:{x:25,y:72,heading:0},pins:[{x:120,y:72}],zones:[obstacle],nonholonomic:true},C.footprint({length:18,width:18}));assert.ok(detour.segments.length>1);assert.doesNotThrow(()=>P.tankRoute(detour,[obstacle],detour.footprint,P.FIELD));
});
test('tank turns consume physics time, change with RPM, never strafe, and reach a right-angle destination',async()=>{
  const durations=[];for(const rpm of [100,400,6000]){const e=engine();try{const start={x:40,y:40,heading:0};await e.load({field:'empty',start,robot:{drivetrain:'tank',driveRpm:rpm},sensors:{localization:'ideal'}});const route=P.plan({start,pins:[{x:80,y:40},{x:80,y:100}],zones:[],nonholonomic:true},e.info.footprint);assert.equal((await e.run({route})).ok,true);let turning=0;
    for(let i=0;i<6000&&e.mode==='program';i++){await e.programTick();assert.equal(e.command.strafe,0);if(e.telemetry?.phase==='Turning chassis')turning++;}
    assert.ok(e.result);assert.ok(turning>10);durations.push(turning);assert.ok(Math.hypot(e.result.truth.x-80,e.result.truth.y-100)<1.5,JSON.stringify(e.result));assert.ok(Math.abs(e.result.truth.heading-90)<2);assert.deepEqual(e.result.violations,[]);
  }finally{e.dispose();}}assert.ok(durations[0]>durations[1],'lower RPM takes more physics ticks to rotate');
});
test('noisy two-pod tank settles its turn and Pedro braking never divides by a zero linear term',async()=>{
  const e=engine();try{const start={x:40,y:40,heading:0};await e.load({field:'empty',start,robot:{drivetrain:'tank',length:15,width:18,intakeIn:0,massLb:23.5,driveRpm:500},sensors:{localization:'odometry'}});
    for(const k of ['linearBrakeForward','linearBrakeStrafe','headingBrakeLinear'])assert.ok(e.info.tuning[k]>0,k);
    const route=P.plan({start,pins:[{x:80,y:40},{x:80,y:100}],zones:[],nonholonomic:true},e.info.footprint);assert.equal((await e.run({route})).ok,true);
    for(let i=0;i<1800&&e.mode==='program';i++)await e.programTick();assert.ok(e.result,'finished both legs');assert.ok(Math.hypot(e.result.truth.x-80,e.result.truth.y-100)<1.5,JSON.stringify(e.result));
  }finally{e.dispose();}
});
test('IMU-only tank rotates before timed translation without a positional estimate',async()=>{
  const e=engine();try{const start={x:50,y:40,heading:0};await e.load({field:'empty',start,robot:{drivetrain:'tank'},sensors:{localization:'gyro'},timing:{forwardSpeed:60}});const route=P.plan({start,pins:[{x:50,y:90}],zones:[],nonholonomic:true},e.info.footprint);await e.run({route});let turnTicks=0;for(let i=0;i<2400&&e.mode==='timed';i++){e.timedTick();assert.equal(e.command.strafe,0);if(Math.abs(e.command.turn)>.05&&e.command.forward===0)turnTicks++;}assert.ok(e.result);assert.ok(turnTicks>10);assert.equal(e.estimate,null);assert.ok(Math.abs(e.result.truth.heading-90)<3);assert.ok(e.result.truth.y>50);
  }finally{e.dispose();}
});
