'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const P=require('../ui/sim-planner.js'),X=require('../ui/sim-export.js'),Timed=require('../ui/sim-timed.js'),{SimEngine}=require('../src/sim-engine.cjs');
const engine=emit=>new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-turning-')),now:()=>0,emit});
const norm=h=>((h%360)+540)%360-180;
// A wall across the whole field at y=72 with an 18-inch gap: a 24 x 12 robot only fits through sideways.
const long={front:12,rear:12,half:6},gap=[{id:'l',type:'rect',x:31.5,y:72,width:63,height:4},{id:'r',type:'rect',x:112.5,y:72,width:63,height:4}];
const through={start:{x:72,y:30,heading:0},pins:[{x:72,y:115}],zones:gap,clearance:1};
function assertClear(route,zones,footprint){let heading=route.heading;
  for(const s of route.segments){const h=Number.isFinite(s.heading)?s.heading:route.heading;
    assert.ok(P.safeSweep({...s.points[0],heading},{...s.points[0],heading:heading+norm(h-heading)},zones,footprint),'turn clears');
    assert.ok(P.sweepClear(s.points[0],s.points.at(-1),h,zones,footprint),'leg clears');heading=h;}}

test('holonomic: turning in place fits a gap the fixed heading cannot, and costs the turn',()=>{
  assert.throws(()=>P.plan({...through,rotate:false},long),/No safe route/);
  const r=P.plan(through,long);assert.equal(r.turns,true);assert.equal(r.turnDegrees,90);assert.equal(Math.abs(r.segments[0].heading),90);assertClear(r,gap,long);
  assert.ok(Math.abs(r.cost-(r.length+Math.PI/2*Math.hypot(12,6)))<1e-6);
});
test('holonomic: open fields and short detours keep the starting heading and the chosen shape',()=>{
  const r=P.plan({start:{x:20,y:20,heading:0},pins:[{x:120,y:120}],zones:[],clearance:1,style:'spline'},long);assert.equal(r.turns,undefined);assert.equal(r.style,'spline');
  const box=[{id:'b',type:'rect',x:72,y:72,width:20,height:20}],around=P.plan({start:{x:20,y:72,heading:0},pins:[{x:124,y:72}],zones:box,clearance:1},long);assert.equal(around.turns,undefined);
});
test('holonomic: a turning route is pulled taut and keeps every pin',()=>{
  const r=P.plan({...through,pins:[{x:72,y:110},{x:30,y:120}]},long);assert.equal(r.turns,true);assertClear(r,gap,long);
  assert.deepEqual(r.stops.map(s=>[s.x,s.y]),[[72,110],[30,120]]);for(const s of r.stops)assert.ok(P.dist(r.segments[s.segment].points.at(-1),s)<1e-6);
  for(const s of r.segments)assert.ok(P.dist(s.points[0],s.points.at(-1))>.5,'no slivers');
});
test('tank: backs straight out of a corridor too narrow to turn in, then turns and drives',()=>{
  const fp={front:9,rear:9,half:7},walls=[{id:'t',type:'rect',x:25,y:83,width:50,height:4},{id:'b',type:'rect',x:25,y:61,width:50,height:4}],start={x:20,y:72,heading:180};
  assert.ok(!P.safeSweep(start,{...start,heading:270},walls,fp),'no room to turn at the start');
  const r=P.plan({start,pins:[{x:100,y:120}],zones:walls,clearance:1,nonholonomic:true},fp);assert.equal(r.nonholonomic,true);assertClear(r,walls,fp);
  const first=r.segments[0];assert.ok(first.points[1].x>50,'reverses out of the corridor first');assert.ok(Math.abs(norm(first.heading-180))<5,'without turning inside it');
  assert.doesNotThrow(()=>P.tankRoute(r,walls,fp,P.FIELD));
});
test('turning routes run on the Deck controller: the robot turns, settles, then drives through the gap',async()=>{
  const e=engine();try{const start={x:72,y:30,heading:0};await e.load({field:'empty',start,zones:gap,robot:{length:24,width:12,intakeIn:0},sensors:{localization:'odometry'}});
    const route=P.plan({...through,start},e.info.footprint);assert.equal(route.turns,true);assert.equal((await e.run({route})).ok,true);const phases=new Set();
    for(let i=0;i<3000&&e.mode==='program';i++){await e.programTick();if(e.telemetry?.phase)phases.add(e.telemetry.phase);}
    assert.ok(e.result,'finished');assert.ok(phases.has('Turning chassis'));assert.ok(Math.hypot(e.result.truth.x-72,e.result.truth.y-115)<1.5,JSON.stringify(e.result.truth));assert.deepEqual(e.result.violations,[]);
  }finally{e.dispose();}
});
test('turning routes in timed driving and exports: turn only where the heading changes',()=>{
  const r=P.plan({...through,pins:[{x:72,y:110},{x:30,y:120}]},long),plan=Timed.compile(r);
  const turns=plan.steps.filter(s=>s.kind==='turn');assert.equal(turns.length,new Set(r.segments.map(s=>s.heading)).size-(r.segments[0].heading===r.heading?1:0));assert.equal(plan.duration,null);
  const legs=X.legs(r);for(let i=1;i<legs.length;i++)assert.ok(legs[i].wait>0||legs[i].heading!==legs[i-1].heading,'legs split at turns or pauses');
  const java=X.java(r,{...through,name:'Gap'},{polygon:P.polygon});assert.match(java,/TURNS:/);assert.match(java,/Math\.toRadians\(90\)|Math\.toRadians\(-90\)/);assert.equal(JSON.parse(X.pp(r,{...through,name:'Gap'},{polygon:P.polygon})).stopAndTurn,true);
});
test('a robot stalled against an unplanned barrier backs out, retries, then stops with a readable error',async()=>{
  let error='';const e=engine(m=>{if(m?.state==='error')error=m.error;});try{const start={x:30,y:72,heading:0};
    await e.load({field:'empty',start,zones:[{id:'z',type:'rect',x:75,y:72,width:6,height:60}],sensors:{localization:'odometry'}});
    const route=P.plan({start,pins:[{x:120,y:72}],zones:[]},e.info.footprint);await e.run({route});const phases=new Set();
    for(let i=0;i<3000&&e.mode==='program';i++){await e.programTick();if(e.telemetry?.phase)phases.add(e.telemetry.phase);}
    assert.ok(phases.has('Backing out'));assert.match(error,/stuck near/);assert.equal(e.result,null);
  }finally{e.dispose();}
});
