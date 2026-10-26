'use strict';
// Pin effects (pause, turn in place, action) and path effects (action paths, turning or spinning
// while driving): planning, the shared leg plan, every export, and real runs through the physics.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const P=require('../ui/sim-planner.js'),X=require('../ui/sim-export.js'),F=require('../ui/sim-ftc.js'),M=require('../ui/sim-motionmodule.js'),Timed=require('../ui/sim-timed.js'),{SimEngine}=require('../src/sim-engine.cjs');
const runtime=path.join(__dirname,'../sim-runtime'),built=fs.existsSync(path.join(runtime,'dsim-host.cjs'))&&fs.existsSync(path.join(runtime,'driver/classes/deck/sim/RunBridge.class'));
const skip=built?false:'run node tools/simulation/build.cjs first';
const engine=emit=>new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-actions-')),now:()=>0,emit});
const norm=h=>((h%360)+540)%360-180,fp={front:8.5,rear:8.5,half:8.5};
const start={x:24,y:24,heading:0},box=[{id:'b',type:'rect',x:72,y:100,width:16,height:16,angle:0}];
const pins=[
  {x:110,y:30,path:{kind:'action',action:'Intake',note:'Run the intake while sweeping the line',rotate:'spin',spins:1}},
  {x:110,y:72,turn:90,wait:1.5,action:'Shoot',note:'Three balls into the goal'},
  {x:40,y:72,path:{kind:'action',action:'Shoot',rotate:'turn',heading:180}}];
const project={start,pins,zones:box,clearance:2,style:'sharp',rotate:true};

test('pin and path effects are planned: spin and turn along paths, a turn in place at a pin',()=>{
  const r=P.plan(project,fp);assert.equal(r.effects,true);assert.equal(r.turns,true);
  const first=r.segments.filter(s=>s.to===0),third=r.segments.filter(s=>s.to===2);
  assert.ok(Math.abs(first.at(-1).endHeading-first[0].heading-360)<1e-6,'one full spin along the action path');
  assert.equal(norm(r.segments.find(s=>s.to===1).heading),0,'keeps its heading to pin 2');
  assert.equal(norm(third[0].heading),90,'starts the third path at the pin 2 turn');assert.equal(Math.abs(norm(third.at(-1).endHeading)),180,'turns to 180 while driving');
  assert.deepEqual(r.stops.map(s=>s.turn),[null,90,null]);assert.deepEqual(r.stops.map(s=>s.path.kind),['action','regular','action']);
  // Planned for the whole rotation circle, so every heading along the way clears the box.
  for(const s of r.segments.filter(s=>Number.isFinite(s.endHeading)))for(let t=0;t<=1;t+=.05){const a=s.points[0],b=s.points.at(-1),h=s.heading+(s.endHeading-s.heading)*t;
    assert.ok(P.safePose({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,heading:h},box,fp),'rotating robot clears');}
  // Not enough room to spin next to a wall: a readable error naming the pin.
  assert.throws(()=>P.plan({...project,start:{x:30,y:10,heading:0},pins:[{x:60,y:10,path:{rotate:'spin',spins:1}}]},fp),/pin 1 has no room to spin/);
  // Tank drivetrains turn at pins but never rotate while driving.
  const tank=P.plan({...project,nonholonomic:true},fp);assert.ok(tank.segments.every(s=>!Number.isFinite(s.endHeading)));assert.equal(tank.nonholonomic,true);
});
test('the leg plan splits at action paths, pin turns and actions; exports carry the action slots',()=>{
  const r=P.plan(project,fp),legs=X.legs(r);
  assert.deepEqual(legs.map(l=>[l.path,l.pin,l.moving?.action||'',l.action,l.wait,l.turn]),[[1,1,'Intake','',0,null],[2,2,'','Shoot',1.5,90],[3,3,'Shoot','',0,null]]);
  assert.match(legs[0].rotate,/spins 1 turn counter-clockwise/);
  assert.deepEqual(X.actions(r).map(a=>[a.slot,a.uses.length]),[['intake',1],['shoot',2]]);
  assert.equal(X.slot('2nd shot!'),'action2ndShot');assert.equal(X.slot('class'),'classAction');assert.equal(X.pySlot('Shoot Ball'),'shoot_ball');
  const layout={name:'Effects',field:'empty',start,zones:box};
  const java=X.java(r,layout,{polygon:P.polygon});
  assert.match(java,/MOVING_ACTIONS = \{"Intake", "", "Shoot"\}/);assert.match(java,/TURN_AFTER = \{Double\.NaN, Math\.toRadians\(90\), Double\.NaN\}/);assert.match(java,/\.heading\(turn\(0, 360\)\)/);assert.match(java,/ACTION PATH "Intake"/);
  const pp=JSON.parse(X.pp(r,layout,{polygon:P.polygon}));assert.equal(pp.lines[0].actionPath,true);assert.equal(pp.lines.find(l=>l.turnAfterDegrees===90).waitAfterName,'Shoot');
  const tc=F.files({route:r,layout,tuning:{},robot:{rpm:500,length:17,width:17},localization:'odometry',routeJava:java});
  const dir='org/firstinspires/ftc/teamcode/';assert.deepEqual(tc.keep,[dir+'RobotActions.java']);
  assert.match(tc.files[dir+'RouteActions.java'],/public boolean intake\(Step step\)[\s\S]*public boolean shoot\(Step step\)/);assert.match(tc.files[dir+'RouteActions.java'],/case "Shoot": return shoot\(step\);/);
  assert.match(tc.files[dir+'RobotActions.java'],/@Override\s+public boolean shoot\(Step step\)/);assert.match(tc.files[dir+'PlannedRouteAuto.java'],/actions\.run\(name, step\)/);
  const py=M.autonomous(r,{},{name:'Effects'});assert.match(py,/def shoot\(step\)/);assert.match(py,/\("hold", 1\.5\),\n    \("action", "Shoot", 0\.0\)/,'pause, then shoot until done');assert.match(py,/robot_actions\.py/);
  assert.match(M.actionsFile(r,{name:'Effects'}),/def intake\(step\):/);
  const plan=Timed.compile(r);assert.ok(plan.steps.some(s=>s.moving==='Intake'));assert.ok(plan.steps.some(s=>s.kind==='turn'&&Math.abs(s.heading-Math.PI/2)<1e-9));
});
test('the simulated robot spins along the action path, turns at the pin, pauses, then drives on',{skip},async()=>{
  const e=engine();try{await e.load({field:'empty',start,zones:box,robot:{length:17,width:17,intakeIn:0,rpm:500},sensors:{localization:'odometry'}});
    const route=P.plan(project,e.info.footprint);assert.equal((await e.run({route})).ok,true);const phases=new Set(),headings=[];let pausedAt=null,pinHeading=null;
    for(let i=0;i<6000&&e.mode==='program';i++){await e.programTick();const t=e.telemetry||{};if(t.phase)phases.add(t.phase);const truth=e.truth();
      if(String(t.phase).startsWith('Action path: Intake'))headings.push(truth.heading);
      if(e.waiting&&e.waiting.remaining<1.2&&!pausedAt){pausedAt={...truth};pinHeading=truth.heading*180/Math.PI;}}
    assert.ok(e.result,'finished');assert.deepEqual(e.result.violations,[]);
    assert.ok(phases.has('Action path: Intake')&&phases.has('Action path: Shoot')&&phases.has('Turning at pin'),[...phases].join(', '));
    let swept=0;for(let i=1;i<headings.length;i++)swept+=Math.atan2(Math.sin(headings[i]-headings[i-1]),Math.cos(headings[i]-headings[i-1]));
    assert.ok(swept*180/Math.PI>300,`spun ${(swept*180/Math.PI).toFixed(0)} degrees along the action path`);
    assert.ok(Math.hypot(pausedAt.x-110,pausedAt.y-72)<1.5&&Math.abs(norm(pinHeading-90))<4,`paused at pin 2 facing ${pinHeading.toFixed(1)}`);
    assert.ok(Math.hypot(e.result.truth.x-40,e.result.truth.y-72)<1.5&&Math.abs(norm(e.result.truth.heading-180))<4,JSON.stringify(e.result.truth));
  }finally{e.dispose();}
});
test('the exported Control Hub OpMode runs the same effects on the virtual hub, calling the action slots',{skip},async()=>{
  let error='';const e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-actions-hub-')),now:()=>0,emit:m=>{if(m?.state==='error')error=m.error;}});
  try{const info=await e.load({field:'empty',start,zones:box,robot:{drivetrain:'mecanum',length:17,width:17,heightIn:5,driveRpm:500,intakeIn:0},sensors:{localization:'odometry'}});
    const route=P.plan(project,info.footprint,[],info.bounds),layout={name:'Effects',field:'empty',width:144,height:144,start,zones:box};
    const routeJava=X.java(route,layout,{polygon:P.polygon}),out=F.files({route,layout,tuning:info.tuning,robot:info.robot,localization:'odometry',routeJava});
    assert.equal((await e.run({kind:'opmode',files:out.files,opMode:out.opMode})).ok,true,error);
    const phases=new Set(),actions=new Set();let pin=null;
    for(let i=0;i<4000&&e.mode==='program';i++){await e.programTick();const t=e.telemetry||{};phases.add(t.Phase);if(t.Action)actions.add(t.Action);if(t.Phase==='Pause'&&!pin)pin=e.truth();if(t.Phase==='Done')break;}
    assert.ok(['Action path','Turning','Pause','Done'].every(p=>phases.has(p)),[...phases].join());
    assert.ok([...actions].some(a=>/Intake/.test(a))&&[...actions].some(a=>/Shoot/.test(a)),[...actions].join());
    assert.ok(Math.hypot(pin.x-110,pin.y-72)<1.5&&Math.abs(norm(pin.heading*180/Math.PI-90))<4,JSON.stringify(pin));
    const t=e.truth();assert.ok(Math.hypot(t.x-40,t.y-72)<1.5&&Math.abs(norm(t.heading*180/Math.PI-180))<4,JSON.stringify(t));assert.equal(e.violations.size,0);
  }finally{e.dispose();}
});
const mmRoot=process.env.DECK_MOTIONMODULE_SOURCE||path.join(__dirname,'../../MotionModule'),{spawnSync}=require('node:child_process');
const python=[process.env.DECK_PYTHON,path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'),'python3'].find(p=>p&&spawnSync(p,['-c','import sys;assert sys.version_info>=(3,9)'],{windowsHide:true}).status===0);
const mmSkip=skip||(!python?'Python 3 is not available (set DECK_PYTHON)':!fs.existsSync(path.join(mmRoot,'core/motion_module/autonomous.py'))?'MotionModule source not found (set DECK_MOTIONMODULE_SOURCE)':false);
test('the MotionModule export turns, spins and calls robot_actions.py on the virtual MotionModule',{skip:mmSkip},async()=>{
  let error='';const e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-actions-mm-')),now:()=>0,emit:m=>{if(m?.state==='error')error=m.error;}});
  try{const robot={drivetrain:'mecanum',length:17,width:17,heightIn:5,driveRpm:500,intakeIn:0},load=timing=>e.load({field:'empty',start,robot,zones:box,controller:'motionmodule',sensors:{localization:'gyro'},timing});
    await load();const timing={headingP:1.6,...e.timedCalibration(.45)};await load(timing);
    const route=P.plan(project,e.info.footprint,[],e.info.bounds),source=M.autonomous(route,timing,{name:'Effects'});
    // The team's code: Shoot takes 0.5 s at the pin and runs while driving; Intake runs the whole path.
    const actions=M.actionsFile(route,{name:'Effects'}).replace(/def shoot\(step\):([\s\S]*?)return True/,'def shoot(step):$1return step.moving or step.elapsed >= 0.5').replace(/def intake\(step\):([\s\S]*?)return True/,'def intake(step):$1return step.last');
    assert.equal((await e.run({kind:'motionmodule',source,actions,python,motionModule:mmRoot,deps:path.join(__dirname,'../.cache/motionmodule-test-deps')})).ok,true,error);
    const seen=new Set();for(let i=0;i<5000&&e.mode==='program';i++){await e.programTick();if(e.telemetry?.action)seen.add(e.telemetry.action);}
    assert.ok(e.result,error||'MotionModule routine did not finish');assert.deepEqual([...seen].sort(),['Intake','Shoot']);
    // IMU-only timed spins cannot correct translation lost to acceleration while turning.
    // Bound that error while still checking real heading control and mechanism callbacks.
    const t=e.result.truth;assert.ok(Math.abs(norm(t.heading-180))<5,JSON.stringify(t));assert.ok(Math.hypot(t.x-40,t.y-72)<12,JSON.stringify(t));
  }finally{e.dispose();}
});
