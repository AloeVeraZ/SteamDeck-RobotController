'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {SimEngine}=require('../src/sim-engine.cjs'),P=require('../ui/sim-planner.js');
const engine=()=>new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-field-')),now:()=>0});
test('A301 BIOBUZZ route uses the Deck controller with odometry and completes all seven pins',async()=>{
  const e=engine();try{const start={x:15,y:72,heading:0},info=await e.load({field:'biobuzz',start,robot:{drivetrain:'swerve',length:20,width:20,heightIn:10,intakeIn:0},sensors:{localization:'odometry'}}),pins=[{x:30.4,y:74.1},{x:33.8,y:99.2},{x:73.2,y:111.8},{x:105.8,y:116.9},{x:116.1,y:92.5},{x:118.4,y:63.4},{x:108.1,y:31.6}],route=P.plan({start,pins,zones:[],clearance:2,style:'spline'},info.footprint,info.fieldZones,info.bounds);
    assert.equal((await e.run({kind:'route',route})).ok,true);assert.equal(e.frame().execution,'deck');
    for(let i=0;i<2400&&e.mode==='program';i++)await e.programTick();assert.ok(e.result,'the complete route finishes');assert.ok(Math.hypot(e.result.truth.x-pins.at(-1).x,e.result.truth.y-pins.at(-1).y)<1.5,JSON.stringify(e.result));assert.equal(e.config.sensors.localization,'odometry');
  }finally{e.dispose();}
});
test('loose DECODE artifacts and BIOBUZZ elements move through the game physics and reset reproducibly',async()=>{
  for(const field of ['decode','biobuzz']){const e=engine();try{await e.load({field,start:{x:30,y:30,heading:0},robot:{length:20,width:20,heightIn:10,intakeIn:0}});const initial=e.world.balls.map(b=>({id:b.id,pos:{...b.pos},z:b.z,state:{...b.state}}));assert.ok(initial.length>=24);
    const ball=e.world.balls.find(b=>b.state.kind==='ground');assert.ok(ball);ball.pos={x:0,y:0};ball.vel={x:30,y:0};ball.z=8;ball.vz=0;const before={...ball.pos};for(let i=0;i<60;i++)e.tick({forward:0,strafe:0,turn:0});assert.ok(Math.hypot(ball.pos.x-before.x,ball.pos.y-before.y)>1,field+' ball moves');assert.ok(e.frame().fieldState.balls.some(b=>b.id===ball.id));
    e.reset();assert.deepEqual(e.world.balls.map(b=>({id:b.id,pos:{...b.pos},z:b.z,state:{...b.state}})),initial);
    await e.load({field,elements:false});assert.equal(e.world.balls.length,0,'explicit clear-field practice stays available');
  }finally{e.dispose();}}
});
test('rectangular BIOBUZZ pushbot stops at the hive supports and flower base instead of passing through',async()=>{
  const e=engine();try{const info=await e.load({field:'biobuzz',elements:false,start:{x:25,y:72,heading:0},robot:{length:20,width:20,heightIn:12,intakeIn:0}});assert.deepEqual(info.footprint,{front:10,rear:10,half:10});
    const leg=info.fieldZones.find(z=>z.x>40&&z.x<100&&z.y>40&&z.y<100);assert.ok(leg);const p={x:Math.max(15,leg.x-25),y:leg.y,heading:0};e.setStart(p);for(let i=0;i<240;i++)e.tick({forward:1,strafe:0,turn:0});assert.ok(e.truth().x<leg.x-5,JSON.stringify({leg,truth:e.truth()}));
  }finally{e.dispose();}
});
test('custom obstacle polygons are physical barriers in both games and editing removes their colliders',async()=>{
  for(const field of ['decode','biobuzz']){const e=engine();try{await e.load({field,elements:false,start:{x:30,y:20,heading:0},robot:{length:20,width:20,heightIn:12,intakeIn:0},zones:[{id:'wall',type:'rect',x:72,y:20,width:10,height:30,angle:0}]});for(let i=0;i<180;i++)e.tick({forward:1,strafe:0,turn:0});assert.ok(e.truth().x<62,field+' '+JSON.stringify(e.truth()));e.setZones([]);assert.deepEqual(e.lastLoad.zones,[]);for(let i=0;i<180;i++)e.tick({forward:1,strafe:0,turn:0});assert.ok(e.truth().x>80,field+' removed barrier '+JSON.stringify(e.truth()));}finally{e.dispose();}}
});
test('pushbot chassis transfers motion to loose game elements instead of driving through them',async()=>{
  for(const field of ['decode','biobuzz']){const e=engine();try{await e.load({field,start:{x:40,y:30,heading:0},robot:{length:20,width:20,heightIn:10,intakeIn:0}});const ball=e.world.balls.find(b=>b.state.kind==='ground');ball.pos={x:60-72,y:30-72};ball.vel={x:0,y:0};ball.z=0;ball.vz=0;for(let i=0;i<90;i++)e.tick({forward:1,strafe:0,turn:0});assert.ok(ball.pos.x>60-72+5,field+' '+JSON.stringify(ball.pos));}finally{e.dispose();}}
});
