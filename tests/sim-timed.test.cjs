'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),T=require('../ui/sim-timed.js'),{SimEngine}=require('../src/sim-engine.cjs');
const route={heading:0,segments:[{type:'line',points:[{x:30,y:72},{x:100,y:72}]}],stops:[{segment:0,wait:1,action:'Pause'}]};
test('timed route uses calibrated power and time; only IMU heading enters its runtime controller',()=>{
  const a=T.compile(route,{power:.5,forwardSpeed:50,startup:0});assert.equal(a.steps[0].seconds,2.8);assert.equal(a.steps[0].forward,.5);assert.equal(a.steps[1].action,'Pause');assert.equal(a.steps[1].seconds,1);
  const runner=new T.Runner(route,{power:.5,forwardSpeed:50,startup:0});const command=runner.advance(1/60,.1);assert.ok(command.drive.forward>0&&Math.abs(command.drive.forward)+Math.abs(command.drive.turn)<=.5+1e-9);assert.ok(command.drive.turn<0);assert.equal('x' in command.drive,false);for(let i=0;i<300;i++)runner.advance(1/60,0);assert.equal(runner.advance(1/60,0).done,true);
});
test('MotionModule enforces IMU-only timed drive and cannot correct X/Y using simulation truth',async()=>{
  const e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-timed-')),now:()=>0});try{await e.load({controller:'motionmodule',field:'empty',start:{x:30,y:72,heading:0},sensors:{localization:'ideal'},timing:{power:.45,forwardSpeed:120,startup:0}});assert.equal(e.config.sensors.localization,'gyro');assert.equal((await e.run({kind:'route',route})).ok,true);assert.equal(e.child,null,'there is no Pedro process');assert.equal(e.frame().execution,'timed');
    for(let i=0;i<600&&e.mode==='timed';i++)e.timedTick();assert.ok(e.result);assert.equal(e.result.kind,'timed');assert.equal(e.estimate,null);assert.ok(Math.abs(e.result.truth.x-100)>10,'intentionally wrong speed calibration is not corrected with hidden X/Y feedback');assert.equal(e.sensors.read(e.truth(),1/60).odo,null);
    e.stop();assert.equal(e.timed,null);assert.deepEqual(e.command,{forward:0,strafe:0,turn:0});
  }finally{e.dispose();}
});
test('FTC IMU-only autonomous starts a timed route rather than refusing to run',async()=>{
  const e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-ftc-imu-')),now:()=>0});try{await e.load({field:'empty',start:{x:30,y:72,heading:0},sensors:{localization:'gyro'}});assert.equal(e.config.sensors.localization,'gyro');assert.equal((await e.startPractice({mode:'autonomous',timing:{autoSeconds:10},program:{kind:'route',route}})).ok,true);assert.equal(e.frame().execution,'timed');for(let i=0;i<600&&e.playing;i++)await e.practiceTick();assert.ok(e.result);assert.equal(e.practice.phase,'finished');assert.equal(e.playing,false);}finally{e.dispose();}
});
test('timed autonomous transition advances simulation time for the whole configured hold',async()=>{
  const e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-timed-match-')),now:()=>0});try{await e.load({controller:'motionmodule',field:'empty',start:{x:30,y:72,heading:0}});await e.startPractice({mode:'match',timing:{autoSeconds:1,transitionSeconds:1,teleopSeconds:1},program:{kind:'route',route}});for(let i=0;i<60;i++)await e.practiceTick();assert.equal(e.practice.phase,'transition');const start=e.world.time;for(let i=0;i<60;i++)await e.practiceTick();assert.equal(e.practice.phase,'teleop');assert.ok(Math.abs(e.world.time-start-1)<1e-7);for(let i=0;i<60;i++)await e.practiceTick();assert.equal(e.practice.phase,'finished');assert.ok(Math.abs(e.world.time-3)<1e-7);}finally{e.dispose();}
});
