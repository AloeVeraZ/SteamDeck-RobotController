'use strict';
// Robot logs compared with the planned route (Run & review → Data → Compare with a robot log).
const {test}=require('node:test'),assert=require('node:assert/strict');
const Log=require('../ui/sim-robot-log.js'),W=require('../ui/sim-wpilog.js'),P=require('../ui/sim-planner.js');
const near=(a,b,eps=1e-6)=>Math.abs(a-b)<eps;

test('a Deck run log (WPILOG, FTC centre frame) reads back as the poses that were written',()=>{
  const truth=[{x:24,y:24,heading:0},{x:40,y:30,heading:15},{x:70,y:60,heading:-120},{x:120,y:130,heading:179}];
  const frames=truth.map((t,i)=>({time:i*.5,truth:{...t,vx:1,vy:0,omega:0},mode:'program'}));
  const log=Log.parse({name:'run.wpilog',bytes:W.fromFrames(frames)});
  assert.equal(log.format,'wpilog');assert.equal(log.key,'/RealOutputs/Odometry/Robot');assert.equal(log.poses.length,truth.length);
  log.poses.forEach((p,i)=>{assert.ok(near(p.x,truth[i].x,1e-4)&&near(p.y,truth[i].y,1e-4),JSON.stringify([p,truth[i]]));assert.ok(near(((p.heading-truth[i].heading)%360+540)%360-180,0,1e-6));assert.ok(near(p.t,i*.5,1e-6));});
  assert.throws(()=>Log.parse({name:'x.wpilog',bytes:new Uint8Array([1,2,3,4,5,6,7,8,9,10,11,12])}),/Not a WPILOG/);
  const empty=new W.Writer();empty.double('/RealOutputs/Other',0,1);assert.throws(()=>Log.parse({name:'e.wpilog',bytes:empty.encode()}),/no Pose2d/);
});

test('CSV logs: units from the header or by detection, Pedro/Deck corner frame or FTC centre',()=>{
  const a=Log.parse({name:'a.csv',text:'time,x,y,heading\n0,24,24,0\n0.5,30,26,0.5\n1,40,30,1.2\n'});
  assert.equal(a.poses.length,3);assert.equal(a.poses[2].x,40);assert.ok(near(a.poses[1].heading,.5*180/Math.PI),'small headings are radians');
  const b=Log.parse({name:'b.csv',text:'x_m;y_m;heading_deg\n0.6096;0.6096;90\n'});assert.ok(near(b.poses[0].x,24)&&near(b.poses[0].y,24));assert.equal(b.poses[0].heading,90);assert.match(b.key,/metres/);
  const c=Log.parse({name:'c.csv',text:'x,y\n0,0\n12,-12\n'},{origin:'center'});assert.deepEqual([c.poses[0].x,c.poses[0].y,c.poses[1].x,c.poses[1].y],[72,72,84,60]);assert.equal(c.poses[0].heading,null);
  assert.throws(()=>Log.parse({name:'d.csv',text:'a,b\n1,2\n'}),/x and y columns/);assert.throws(()=>Log.parse({name:'e.csv',text:'t,x,y\n1,0,0\n0,1,1\n'}),/backwards/);
  assert.throws(()=>Log.parse({name:'f.csv',text:'x,y\n'}),/header row and at least one pose/);
});

test('comparison: distance from the planned route along the way and at the stop',()=>{
  const fp={front:8,rear:8,half:8},start={x:24,y:24,heading:0},route=P.plan({start,zones:[],pins:[{x:120,y:24}],style:'sharp',clearance:1},fp);
  const log={poses:[{t:0,x:24,y:24},{t:1,x:60,y:27},{t:2,x:100,y:23},{t:3,x:118,y:24.5}]},r=Log.compare(log,route);
  assert.equal(r.samples,4);assert.equal(r.duration,3);assert.ok(near(r.maxError,3));assert.deepEqual([r.worst.x,r.worst.y],[60,27]);assert.ok(near(r.meanError,(0+3+1+.5)/4));
  assert.ok(near(r.endError,Math.hypot(2,.5)));assert.throws(()=>Log.compare({poses:[]},route),/no poses/);
});
