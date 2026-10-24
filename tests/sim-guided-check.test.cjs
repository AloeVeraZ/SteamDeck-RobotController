'use strict';
// The guided check TeleOp on the virtual Control Hub. The virtual robot is wired as the "true" settings say, while the
// code is exported from settings that get some directions, servo positions and the turret encoder wrong, as a team's
// first export would. A scripted person at the robot answers each question from what the device really did (the hub's
// device readout), as someone watching it would. The check's results, applied to the wrong settings, give the true ones,
// and the autonomous exported from them then shoots and picks up what the simulator planned.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Mech=require('../ui/sim-mechanisms.js'),P=require('../ui/sim-planner.js'),X=require('../ui/sim-export.js'),F=require('../ui/sim-ftc.js'),C=require('../ui/sim-config.js'),{SimEngine}=require('../src/sim-engine.cjs');
const root=path.join(__dirname,'..'),built=fs.existsSync(path.join(root,'sim-runtime/dsim-host.cjs'))&&fs.existsSync(path.join(root,'sim-runtime/driver/classes/deck/sim/hub/VirtualHub.class'));
const skip=!built&&'run node tools/simulation/build.cjs first';
const base={drivetrain:'mecanum',length:17,width:17,heightIn:12,driveRpm:312,intakeIn:0},start={x:9.83,y:27,heading:0},target={x:59.25,y:58.56};
const pins=[{x:24,y:30,action:'Shoot',path:{kind:'action',action:'Spin up'}},{x:22,y:20,path:{rotate:'turn',heading:-90,style:'spline'}},
  {x:16,y:12.5,wait:.6,action:'Intake',path:{kind:'action',action:'Intake',style:'sharp'}},{x:24,y:24,path:{style:'sharp'}},{x:36,y:28,action:'Shoot',path:{kind:'action',action:'Spin up',style:'spline'}}];
const layout={name:'Guided',start,zones:[]};
const engine=()=>new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-check-')),now:()=>0,emit:msg=>{if(msg?.state==='error')engine.error=msg.error;}});
const exportFor=(info,robot,mechanisms)=>{const route=P.plan({start,zones:[],pins,clearance:2,style:'spline',defaultPower:1},info.footprint,info.fieldZones,info.bounds);route.defaultPower=1;
  return {route,out:F.files({route,layout,tuning:info.tuning,robot,localization:'fused',mechanisms,target:info.target||target,setupName:'Guided',routeJava:X.java(route,layout,{polygon:P.polygon})})};};

// The person at the robot. They see what each device does (devices: a wheel's forward command, a roller's pull-in, a
// servo's position, a turret's angle) and know where the servos and turret should be (truth); they press a button for a
// few ticks, then let go. Returns the "Deck results" values from the screen once the check says Done.
async function operate(e,truth,log=[]){
  const servos={};for(const x of F.mechanismDevices(truth)){
    if(x.role==='kicker'||x.role==='ramp')servos[x.name]={first:x.down,second:x.up};
    else if(x.role==='feeder'&&Mech.servoFeeder(x.feeder))servos[x.name]={first:x.rest,second:x.feed};}
  let hold=0,rest=0,settle=0,seen={},last='';
  const press=button=>{e.setGamepad(1,{[button]:true});hold=3;log.push(button);};
  for(let i=0;i<60000&&e.mode==='program';i++){
    await e.programTick();if(hold>0){if(--hold===0){e.setGamepad(1,null);rest=3;}continue;}if(rest>0){rest--;continue;}
    const t=e.telemetry||{},dev=e.hubDevices||{},step=t.Step||'',answer=t.Answer||'',name=(/\("([^"]+)"\)\s*$/.exec(step)||[])[1],prompt=Object.keys(t).find(k=>!t[k]&&/^(Move|Now|Point)/.test(k))||'';
    if(step!==last){last=step;seen={};}
    if(step==='Done')return F.checkResults(t['Deck results']);
    if('Watch it: it turns now.' in t){const v=dev[name];if(Number.isFinite(v)&&Math.abs(v)>Math.abs(seen[name]||0))seen[name]=v;continue;}
    if(answer.startsWith('A: yes | B: no')){const v=seen[name]||0;press(v>.01?'a':v<-.01?'b':'x');continue;}
    if(answer==='A: turned it | B: skip'){press('b');continue;}
    if(answer==='A: run them | B: skip'){press('a');continue;}
    if(answer.startsWith('D-pad up/down: move')){
      // A servo: the first position asked (down, rest, straight ahead) or the second (up, feed, a quarter turn left).
      const second=/^Now/.test(prompt),turret=/turret/.test(step);let dp;
      if(turret){const want=second?90:0,mount=truth.shooters[0].turretReversed?-1:1;dp=(want-dev[name])/(mount*truth.turret.servoDegrees);}
      else{const s=servos[name];dp=(second?s.second:s.first)-dev[name];}
      press(Math.abs(dp)<=.005?'a':Math.abs(dp)>=.05?(dp>0?'dpad_right':'dpad_left'):(dp>0?'dpad_up':'dpad_down'));continue;}
    if(answer.startsWith('D-pad left/right: turn 1 degree')){
      // A turret motor: turn it until it points there, wait for it to get there, then A.
      const want=/^Now/.test(prompt)?90:0,diff=want-(dev[name]??0);
      if(Math.abs(diff)<=.6){if(++settle>90){settle=0;press('a');}continue;}
      settle=0;press(Math.abs(diff)>=6?(diff>0?'dpad_up':'dpad_down'):(diff>0?'dpad_left':'dpad_right'));continue;}
  }
  throw Error(`The check did not finish (${e.mode}: ${JSON.stringify(e.telemetry)} ${engine.error||''})`);
}
// Runs the check exported from `believed` on a robot wired as `truth`; returns the results and the corrected settings.
async function guided(truth,believed){
  const e=engine();
  try{const tm=Mech.sanitize({enabled:true,...truth.mechanisms}),bm=Mech.sanitize({enabled:true,...believed.mechanisms});
    const info=await e.load({field:'biobuzz',alliance:'red',mechanisms:tm,start,robot:C.robot(truth.robot),sensors:{localization:'fused'}});
    const {out}=exportFor(info,C.robot(believed.robot),bm);
    assert.equal((await e.run({kind:'opmode',files:out.files,opMode:out.check.opMode})).ok,true,String(engine.error));
    const results=await operate(e,tm),applied=F.applyCheck(results,{robot:C.robot(believed.robot),mechanisms:bm,localization:'fused'});
    return {results,applied,robot:C.robot(applied.robot),mechanisms:Mech.sanitize(applied.mechanisms),truth:{robot:C.robot(truth.robot),mechanisms:tm}};}
  finally{e.dispose();}
}
// The autonomous from these settings on the truth robot, and the simulator's own run of the same route.
async function autonomous(settings,truth){
  const run=async program=>{const e=engine();try{const info=await e.load({field:'biobuzz',alliance:'red',mechanisms:truth.mechanisms,start,robot:truth.robot,sensors:{localization:'fused'}});
    const {route,out}=exportFor(info,settings.robot,settings.mechanisms);
    assert.equal((await e.run(program==='route'?{kind:'route',route}:{kind:'opmode',files:out.files,opMode:out.opMode})).ok,true,String(engine.error));
    for(let i=0;i<3600&&e.mode==='program'&&e.telemetry?.Phase!=='Done';i++)await e.programTick();
    return e.mechanismState();}finally{e.dispose();}};
  return {planned:await run('route'),code:await run('code')};
}

test('the check TeleOp: every step, its question, and the results it reports',()=>{
  const m=Mech.sanitize({enabled:true,intakes:[{kind:'kicker',sides:['front'],servo:'kicker'}],shooters:[{type:'turret',indexerKind:'pusher',indexer:'pusher'}],shooter:{control:'power'},turret:{kind:'servo'}});
  const java=F.files({route:P.plan({start,zones:[],pins:[{x:40,y:30}],clearance:2},{front:8.5,rear:8.5,half:8.5}),layout,tuning:{},robot:C.robot(base),localization:'fused',mechanisms:m,target,setupName:'Guided',routeJava:'class R {}'}).files['org/firstinspires/ftc/teamcode/PlannedRouteCheck.java'];
  assert.match(java,/@TeleOp\(name = "Guided check \(Deck\)", group = "Deck Driver Station"\)/);
  assert.match(java,/private static final int STEPS = 9;/,'IMU, four wheels, kicker, flywheel, pusher, turret');
  assert.match(java,/Did the front left wheel turn so the robot would drive FORWARD\?/);assert.match(java,/position\(kicker1, Mechanisms\.KICKER_1_DOWN, "Move the kicker DOWN/);
  assert.match(java,/result\("shooters\.0\.restPos", number\(rest\)\)/);assert.match(java,/result\("turret\.servoCenter", number\(center\)\)/);
  assert.doesNotMatch(java,/topSpeed\(/,'a set-power flywheel has no top speed step');assert.match(java,/String\.format\(Locale\.US/,'numbers are written with a decimal point on every robot');
  // The results line read back and applied.
  const values=F.checkResults('Deck results : v1 robot.frontRight.reversed=true robot.frontLeft.reversed=true intakes.0.downPos=0.150 shooters.0.turretReversed=true turret.servoDegrees=272.7 shooter.pidf=1.2,0.12,0,12 shooters.0.restPos=?missing imu.turn=?backward');
  assert.deepEqual(values,{'robot.frontRight.reversed':'true','robot.frontLeft.reversed':'true','intakes.0.downPos':'0.150','shooters.0.turretReversed':'true','turret.servoDegrees':'272.7','shooter.pidf':'1.2,0.12,0,12','shooters.0.restPos':'?missing','imu.turn':'?backward'});
  const a=F.applyCheck(values,{robot:C.robot(base),mechanisms:m,localization:'fused'});
  assert.deepEqual(a.changes,['Front right wheel: turns the other way on.','Intake 1 kicker servo down position: 0 → 0.15.','Shooter 1 turret: turns the other way on.','Turret servo range: 300 → 272.7 degrees.','Flywheel velocity PIDF: P 1.2, I 0.12, D 0, F 12.'],'the front left wheel is reversed already, so it is no change');
  assert.deepEqual(a.problems,['Shooter 1 feeder is not on the robot: its name is not in the robot configuration, or it is another kind of device there.','IMU read the quarter turn left as a turn right: the Control Hub mounting in Deck (Setup → Robot controller) is wrong.']);
  assert.equal(C.robot(a.robot).devices.frontRight.reversed,true);assert.equal(Mech.sanitize(a.mechanisms).intakes[0].downPos,.15);
  assert.equal(F.checkResults('Step : Done'),null);assert.deepEqual(F.checkResults('v1'),{});
});

test('guided check on the virtual Control Hub: motors, rollers, flywheels, a feeder and a turret turning the wrong way, and the turret encoder',{skip},async()=>{
  const truth={robot:{...base,devices:{frontRight:{reversed:true},backLeft:{reversed:false}}},
    mechanisms:{intakes:[{kind:'siderollers',sides:['front'],device:'crservo',motor:'roller',motor2:'roller2',reversed2:true}],shooters:[{type:'turret',motor:'shooter',motor2:'shooter_b',reversed:true,indexerReversed:true}],turret:{ticksPerDegree:5}}};
  const believed={robot:base,mechanisms:{intakes:[{kind:'siderollers',sides:['front'],device:'crservo',motor:'roller',motor2:'roller2'}],shooters:[{type:'turret',motor:'shooter',motor2:'shooter_b'}]}};
  const g=await guided(truth,believed);
  assert.deepEqual(g.applied.problems,[]);
  assert.equal(g.results['robot.frontLeft.reversed'],'true');assert.equal(g.results['robot.frontRight.reversed'],'true');assert.equal(g.results['robot.backLeft.reversed'],'false');
  assert.deepEqual(['frontLeft','frontRight','backLeft','backRight'].map(k=>F.hardware(g.robot,'fused').drive.motors[k].mount),['frontLeft','frontRight','backLeft','backRight'].map(k=>F.hardware(g.truth.robot,'fused').drive.motors[k].mount),'every wheel now turns as the robot is wired');
  const [s,t]=[g.mechanisms.shooters[0],g.truth.mechanisms.shooters[0]];
  assert.deepEqual([!!g.mechanisms.intakes[0].reversed,!!g.mechanisms.intakes[0].reversed2,!!s.reversed,!!s.reversed2,!!s.indexerReversed,!!s.turretReversed],[false,true,true,false,true,false]);
  assert.ok(Math.abs(g.mechanisms.turret.ticksPerDegree-5)<.06,`turret encoder measured ${g.mechanisms.turret.ticksPerDegree} ticks per degree`);
  assert.ok(g.mechanisms.shooter.pidf&&Math.abs(g.mechanisms.shooter.pidf.f-32767/(g.truth.mechanisms.shooter.rpm*g.truth.mechanisms.shooter.ticksPerRev/60))<.01,'PIDF from the top speed');
  assert.equal(g.results['shooter.rpm'],undefined,'the flywheel reaches its shooting speed');
  assert.ok(g.applied.changes.some(c=>/^Shooter 1 flywheel: turns the other way on\./.test(c)),g.applied.changes.join('\n'));void t;
  // The autonomous from the checked settings shoots and picks up what the simulator planned.
  const {planned,code}=await autonomous({robot:g.robot,mechanisms:g.mechanisms},g.truth);
  assert.ok(planned.shots>=5,`the simulator shoots (${planned.shots})`);assert.deepEqual([code.shots,code.pickedUp,code.score],[planned.shots,planned.pickedUp,planned.score]);
});

test('guided check on the virtual Control Hub: kicker, pusher and servo turret positions',{skip},async()=>{
  const truth={robot:base,mechanisms:{intakes:[{kind:'kicker',sides:['front'],servo:'kicker',downPos:.15,upPos:.85}],shooters:[{type:'turret',indexerKind:'pusher',indexer:'pusher',feedPos:.65,restPos:.25,turretReversed:true}],shooter:{control:'power',power:.9},turret:{kind:'servo',servoCenter:.55,servoDegrees:270}}};
  const believed={robot:base,mechanisms:{intakes:[{kind:'kicker',sides:['front'],servo:'kicker'}],shooters:[{type:'turret',indexerKind:'pusher',indexer:'pusher'}],shooter:{control:'power',power:.9},turret:{kind:'servo'}}};
  const g=await guided(truth,believed);
  assert.deepEqual(g.applied.problems,[]);
  const i=g.mechanisms.intakes[0],s=g.mechanisms.shooters[0];
  assert.deepEqual([i.downPos,i.upPos,s.restPos,s.feedPos],[.15,.85,.25,.65]);
  assert.equal(s.turretReversed,true);assert.ok(Math.abs(g.mechanisms.turret.servoCenter-.55)<=.005,`center ${g.mechanisms.turret.servoCenter}`);assert.ok(Math.abs(g.mechanisms.turret.servoDegrees-270)<12,`range ${g.mechanisms.turret.servoDegrees}`);
  assert.equal(g.mechanisms.shooter.pidf,undefined,'no PIDF for a set-power flywheel');
  const {planned,code}=await autonomous({robot:g.robot,mechanisms:g.mechanisms},g.truth);
  assert.ok(planned.shots>=5,`the simulator shoots (${planned.shots})`);assert.deepEqual([code.shots,code.pickedUp,code.score],[planned.shots,planned.pickedUp,planned.score]);
});
