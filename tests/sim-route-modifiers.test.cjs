'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const P=require('../ui/sim-planner.js'),X=require('../ui/sim-export.js'),T=require('../ui/sim-timed.js'),F=require('../ui/sim-ftc.js'),{SimEngine}=require('../src/sim-engine.cjs');
const fp={front:7,rear:7,half:6},start={x:30,y:30,heading:0},norm=d=>((d%360)+540)%360-180;
const request=pins=>({start,pins,zones:[],clearance:1,style:'spline',rotate:false,defaultPower:.8});
const end=(r,k)=>{const s=r.segments.filter(s=>s.to===k).at(-1);return norm(s.endHeading??s.heading);};
test('relative path turns and pin turns accumulate; later paths inherit the resulting heading',()=>{
 for(const initial of [0,45,-170])for(const angle of [-270,-90,90,270]){
  const q={...request([{x:70,y:30,path:{rotate:'relative',angle}},{x:90,y:70,turn:-angle,turnMode:'relative'},{x:30,y:100}]),start:{...start,heading:initial}},r=P.plan(q,fp);
  assert.equal(end(r,0),norm(initial+angle));assert.equal(end(r,1),norm(initial+angle));assert.equal(r.stops[1].turn,norm(initial));assert.equal(end(r,2),norm(initial));
  assert.equal(q.pins[1].turn,-angle,'planning does not mutate saved relative instructions');
 }
 const legacy=P.plan(request([{x:80,y:40,path:{rotate:'turn',heading:90}},{x:90,y:80,turn:-90},{x:40,y:100}]),fp);
 assert.equal(end(legacy,0),90);assert.equal(legacy.stops[1].turn,-90);assert.equal(end(legacy,2),-90);
});
test('tracking faces the target at every curve point, carries its final heading, and can return to start',()=>{
 const target={x:120,y:125},pins=[{x:85,y:40,path:{rotate:'track',target,power:.4}},{x:95,y:80},{x:50,y:100,path:{rotate:'start'}},{x:30,y:80,path:{rotate:'track',target,power:.7}}],r=P.plan(request(pins),fp);
 assert.ok(r.segments.some(s=>s.to===0&&s.type==='curve'),'tracking retains a spline with neighbouring pin tangents');
 for(const s of r.segments.filter(s=>s.to===0||s.to===3))for(let t=0;t<=1;t+=.025){let ps=s.points;while(ps.length>1)ps=ps.slice(1).map((p,i)=>({x:ps[i].x+(p.x-ps[i].x)*t,y:ps[i].y+(p.y-ps[i].y)*t}));assert.ok(Math.abs(norm(P.headingAt(s,t)-Math.atan2(target.y-ps[0].y,target.x-ps[0].x)*180/Math.PI))<1e-8);}
 assert.equal(end(r,1),end(r,0));assert.equal(end(r,2),0);assert.ok(r.segments.filter(s=>s.to===3).every(s=>s.target.x===120));
 const timed=T.compile(r);assert.ok(timed.steps.some(s=>s.mid!==undefined&&s.power===.4));assert.ok(timed.steps.some(s=>s.mid!==undefined&&s.power===.7));assert.ok(Math.abs(norm(timed.heading*180/Math.PI-end(r,3)))<1e-7);
 const java=X.java(r,{name:'Track',start,zones:[]},{polygon:P.polygon});assert.match(java,/\.heading\(face\(120, 125\)\)/);assert.match(java,/curve.get\(t\)/);
 const pp=JSON.parse(X.pp(r,{start,zones:[]},{polygon:P.polygon}));assert.equal(pp.version,'deck-sim-2');assert.deepEqual(pp.lines[0].targetTracking,target);
});
test('target singularities and every blocked pin are diagnosed, including downstream heading changes',()=>{
 assert.throws(()=>P.plan(request([{x:100,y:30,path:{rotate:'track',target:{x:60,y:30}}}]),fp),/target lies on the driving path/i);
 assert.throws(()=>P.plan(request([{x:80,y:40,path:{rotate:'track'}}]),fp),/choose a target/i);
 const r=P.plan(request([{x:80,y:40,turn:0,turnMode:'track',target:{x:80,y:100}},{x:90,y:90,turn:0,turnMode:'start'},{x:40,y:110}]),fp);assert.equal(r.stops[0].turn,90);assert.equal(end(r,1),90);assert.equal(r.stops[1].turn,0);assert.equal(end(r,2),0);
 const rectangular={front:12,rear:12,half:4},pins=[{x:60,y:50,path:{rotate:'relative',angle:90}},{x:80,y:7},{x:100,y:6}];assert.deepEqual(P.analyze(request(pins),rectangular).filter(i=>i.code==='clearance').map(i=>i.pin),[1,2]);
 assert.throws(()=>P.plan(request(pins),rectangular),/pin 2/i);
});
test('modifier summaries describe combinations and colors have stable independent cues',()=>{
 for(const rotate of ['keep','relative','turn','spin','start','track'])for(const kind of ['regular','action'])for(const power of [null,0,.5,1]){
  const raw={rotate,kind,power,target:{x:120,y:144},angle:-90,spins:-2,note:'Aim & shoot <goal>',action:'Intake'},p=P.pathEffects(JSON.parse(JSON.stringify(raw))),a=P.pathAppearance(p,.8),summary=P.pathDescription(p,.8);
  assert.equal(p.rotate,rotate);assert.equal(p.angle,-90);assert.equal(a.action,kind==='action');assert.equal(a.power,power??.8);assert.match(a.color,/^#[a-f0-9]{6}$/i);assert.ok(summary.includes(raw.note));assert.match(summary[0],new RegExp(`${(power??.8)*100}%`));
 }
 assert.equal(P.pinEffects({turn:-270,turnMode:'relative'}).turn,-270);assert.equal(P.pinEffects({turn:270}).turn,-90);
});
test('native Pedro and exported Control Hub execute target tracking and persistent relative headings',async()=>{
 for(const exported of [false,true]){let error='';const e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-track-')),now:()=>0,emit:m=>{if(m.state==='error')error=m.error;}});
  try{const robot={drivetrain:'mecanum',length:14,width:12,heightIn:5,intakeIn:0,driveRpm:312},info=await e.load({field:'empty',start,robot,sensors:{localization:'odometry'}}),pins=[{x:80,y:35,path:{rotate:'relative',angle:90,power:.5}},{x:100,y:65,turn:-90,turnMode:'relative',wait:.2},{x:80,y:100,path:{rotate:'track',target:{x:120,y:130},power:.4}},{x:40,y:105,path:{rotate:'start',power:.6}}],q=request(pins),r=P.plan(q,info.footprint),layout={name:'Tracking',field:'empty',start,zones:[]};
   const out=exported?F.files({route:r,layout,tuning:info.tuning,robot:info.robot,localization:'odometry',routeJava:X.java(r,layout,{polygon:P.polygon})}):null;
   assert.equal((await e.run(exported?{kind:'opmode',files:out.files,opMode:out.opMode}:{route:r})).ok,true,error);
   let ticks=0;const aiming=[];for(;ticks<6000&&e.mode==='program';ticks++){await e.programTick();const t=e.truth();if(t.y>74&&t.y<94&&t.x>75&&t.x<110)aiming.push(Math.abs(norm(t.heading*180/Math.PI-Math.atan2(130-t.y,120-t.x)*180/Math.PI)));if(exported&&e.telemetry?.Phase==='Done')break;}
   assert.ok(aiming.length>10,'observed the robot driving while tracking');assert.ok(Math.max(...aiming)<12,`tracking error ${Math.max(...aiming).toFixed(2)} degrees`);
   const t=e.truth(),heading=t.heading*180/Math.PI;assert.ok(ticks<6000,error||'routine did not finish');assert.ok(Math.hypot(t.x-40,t.y-105)<2,JSON.stringify(t));assert.ok(Math.abs(norm(heading))<4,`final heading ${heading}`);assert.equal(e.violations.size,0);
  }finally{e.dispose();}
 }
});
