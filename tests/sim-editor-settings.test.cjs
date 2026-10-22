'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../ui/sim-config.js'),P=require('../ui/sim-planner.js'),T=require('../ui/sim-timed.js'),{timing}=require('../src/sim-practice.cjs'),{SimEngine}=require('../src/sim-engine.cjs');
test('typed robot values survive outside slider ranges; only FTC continuous current is capped',()=>{
 const raw={length:.125,width:70.123456,heightIn:60.123456,massLb:123.456789,driveRpm:7500.125,driveAmps:123.456};
 const mm=C.robot(raw,'motionmodule');for(const k of Object.keys(raw))assert.equal(mm[k],raw[k],k);
 assert.equal(C.robot(raw,'ftc').driveAmps,10);assert.equal(C.robot({},'ftc').driveAmps,10);assert.equal(C.robot({},'motionmodule').driveAmps,10);
 for(const massLb of [.5,100,.125,123.456789])assert.equal(C.robot({massLb}).massLb,massLb);
 assert.equal(C.robot({massLb:-1}).massLb,9.41);assert.equal(C.robot({driveRpm:Infinity}).driveRpm,312);
});
test('typed times, compensation, noise-free route pauses and spins keep values beyond slider ranges',()=>{
 const raw={forwardSpeed:750.123,strafeSpeed:.5,startup:5.123,stopping:4.567,strafeStopping:8.9,headingP:25.123};
 const result=T.settings(raw);for(const k of Object.keys(raw))assert.equal(result[k],raw[k],k);
 assert.equal(timing({autoSeconds:7200.125}).autoSeconds,7200.125);
 assert.equal(P.pinEffects({wait:90.125}).wait,90.125);assert.equal(P.pathEffects({spins:15}).spins,15);
});
test('crossing and repeated-corner sketches store a single clean perimeter; simple concavities remain',()=>{
 const bow=P.validateZone({type:'polygon',points:[{x:20,y:20},{x:60,y:60},{x:20,y:60},{x:60,y:20}]});
 assert.equal(bow.points.length,4);assert.equal(P.parts(bow).length,1);
 assert.ok(P.contains({x:40,y:40},P.polygon(bow)));assert.deepEqual(P.validateZone(bow),bow);
 const star=P.validateZone({type:'polygon',points:[{x:20,y:20},{x:60,y:60},{x:20,y:60},{x:60,y:20},{x:20,y:20},{x:20,y:20}]});assert.deepEqual(star.points,bow.points);
 const concave=[{x:20,y:20},{x:60,y:20},{x:60,y:30},{x:30,y:30},{x:30,y:60},{x:20,y:60}];assert.deepEqual(P.validateZone({type:'polygon',points:concave}).points,concave);
 assert.throws(()=>P.validateZone({type:'polygon',points:[{x:1,y:1},{x:1,y:1}]}),/distinct/);
 // Overlapping strokes keep only the outside edge, including concave notches.
 const loop=P.validateZone({type:'polygon',points:[{x:0,y:0},{x:30,y:0},{x:30,y:30},{x:0,y:30},{x:0,y:5},{x:25,y:5},{x:25,y:25},{x:5,y:25},{x:5,y:0}]});
 assert.deepEqual(loop.points,[{x:0,y:0},{x:30,y:0},{x:30,y:30},{x:0,y:30}]);
 const notch=P.validateZone({type:'polygon',points:[{x:0,y:0},{x:40,y:0},{x:40,y:40},{x:30,y:40},{x:30,y:10},{x:10,y:10},{x:10,y:40},{x:0,y:40},{x:0,y:-5},{x:5,y:-5},{x:5,y:3}]});
 assert.equal(P.contains({x:20,y:30},P.polygon(notch)),false);assert.ok(P.contains({x:20,y:5},P.polygon(notch)));assert.deepEqual(P.validateZone(notch),notch);
});
test('drag stops before walls and thin obstacles and preserves heading without tunnelling',()=>{
 const fp={front:5,rear:5,half:5},from={x:20,y:72,heading:0},barrier={type:'rect',x:72,y:72,width:1,height:100};
 const stopped=P.dragPose(from,{x:130,y:72},[barrier],fp);assert.ok(stopped.x<66.501&&stopped.x>66.49);assert.equal(stopped.heading,0);assert.ok(P.safePose(stopped,[barrier],fp));
 const wall=P.dragPose(from,{x:-20,y:72},[],fp);assert.ok(Math.abs(wall.x-5)<1e-5);
 assert.deepEqual(P.dragPose(from,{x:40,y:90},[],fp),{x:40,y:90,heading:0});
});
test('native physics receives FTC current limits and exact MotionModule settings',async()=>{
 const e=new SimEngine({now:()=>0});try{
 await e.load({controller:'ftc',field:'empty',start:{x:40,y:40,heading:0},robot:{driveAmps:40,massLb:.5}});assert.equal(e.info.robot.driveAmps,10);assert.equal(e.info.robot.massLb,.5);
 await e.load({controller:'motionmodule',field:'empty',start:{x:40,y:40,heading:0},robot:{driveAmps:45.125,massLb:100,driveRpm:6500.125},sensors:{noise:.75,gyroDrift:12}});assert.equal(e.info.robot.driveAmps,45.125);assert.equal(e.info.robot.driveRpm,6500.125);assert.equal(e.config.sensors.noise,.75);assert.equal(e.config.sensors.gyroDrift,12);
 for(let i=0;i<20;i++)e.tick({forward:1,strafe:0,turn:0});assert.ok(Object.values(e.truth()).every(Number.isFinite));
 }finally{e.dispose();}
});
test('dragging the robot into a barrier slides along it instead of sticking',()=>{
 const fp={front:7.5,rear:7.5,half:7.5},wall=[{id:'w',type:'rect',x:72,y:60,width:40,height:4,angle:0}],from={x:72,y:40,heading:0};
 // Up and to the right into the wall's underside: stops at the wall, keeps the sideways part.
 const p=P.slidePose(from,{x:90,y:70,heading:0},wall,fp);assert.ok(Math.abs(p.x-90)<1e-6,`slid to x ${p.x}`);assert.ok(p.y<58-7.5+1e-6&&p.y>48,`stopped below the wall at y ${p.y}`);
 assert.ok(P.safePose(p,wall,fp));
 // Pulling away from the wall moves at once: no built-up overshoot to win back.
 const back=P.slidePose(p,{x:p.x,y:p.y-5,heading:0},wall,fp);assert.ok(Math.abs(back.y-(p.y-5))<1e-6);
 // A robot that starts overlapping a red area can be dragged out freely.
 const inside={x:72,y:60,heading:0},out=P.slidePose(inside,{x:72,y:30,heading:0},wall,fp);assert.deepEqual([out.x,out.y],[72,30]);
});
