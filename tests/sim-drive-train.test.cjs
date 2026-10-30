'use strict';
// What drives a mechanism that has no motor of its own in the CAD: its pulleys followed through belts, shared shafts and
// gears to a motor elsewhere (DeckHardware.driveTrain), as on a student robot whose intake and indexer run on two motors
// in the chassis; mechanisms belted to one motor counted once against BIOBUZZ R503 (red when over); and Set up from the
// Control Hub giving the robot's one device to both of them.
const {test}=require('node:test'),assert=require('node:assert/strict');
const H=require('../ui/sim-hardware.js'),HS=require('../ui/sim-hub-setup.js'),RC=require('../ui/ftc/robot-config.js'),M=require('../ui/sim-mechanisms.js'),C=require('../ui/sim-config.js'),T=require('../ui/sim-test-robot.js');

// The student robot's intake drive, in inches, as its STEP import has it: a motor in the chassis, a 15T pulley on its
// shaft, a belt up to a 25T + 19T pulley pair on one shaft, a long belt to the intake's 31T pulley, the intake's own belt,
// and a mecanum wheel beside the intake's last pulley (touching its box, on another axle).
const at=(key,name,box)=>({ref:'#'+key,key:`robot/${key}`,name,box});
const INTAKE=[
  at('drivetrain/m1','Motor Part',[-9.68,1.8,4.42,-6.57,3.25,5.86]),
  at('drivetrain/p15','GT2 2mm 15t (3.175mm Bore) Pulley',[-10.36,2.29,4.9,-9.66,2.76,5.37]),
  at('drivetrain/b1','Belt',[-10.26,1.07,4.94,-10.02,2.73,6.98]),
  at('drivetrain/p25','[LS] Pulley 2mm Pitch 25T',[-10.35,1.01,6.27,-9.92,1.78,7.03]),
  at('drivetrain/p19','[LS] Pulley 2mm Pitch 19T',[-10.91,1.09,6.35,-10.48,1.7,6.96]),
  at('b2','Belt',[-10.79,-5,6.4,-10.55,1.65,9.56]),
  at('intake/p31a','[LS] Pulley 2mm Pitch 31T',[-10.87,-5.05,8.71,-10.48,-4.14,9.62]),
  at('intake/p31b','[LS] Pulley 2mm Pitch 31T',[-11.7,-5.05,8.71,-11.3,-4.14,9.62]),
  at('intake/b3','Belt',[-11.62,-6.08,6.7,-11.38,-4.19,9.56]),
  at('intake/p30','[LS] Pulley 2mm Pitch 30T',[-11.67,-6.09,6.69,-11,-5.29,7.49]),
  at('drivetrain/wheel','104mm Mecanum Wheel (GB)',[-11.7,-5.37,3.84,-10.21,-1.31,7.92])];
// A drive motor geared to that wheel through a pinion and a 108T gear on the wheel's axle.
const DRIVE=[
  at('drivetrain/m2','Motor Part',[-9.68,-2.39,4.42,-6.57,-0.94,5.86]),
  at('drivetrain/pinion','1/8" Bore 32 Pitch Shaft Mount Pinion Gear (Steel) 9 Tooth',[-10.07,-1.84,4.97,-9.66,-1.5,5.31]),
  at('drivetrain/g108','2302 Series Aluminum, MOD 0.8, Hub Mount Gear (14mm Bore, 108 Tooth)',[-10.09,-5.08,4.15,-9.86,-1.62,7.62])];

test('the intake with no motor of its own is driven by the chassis motor its belts lead to, not the drive motor beside it',()=>{
  const t=H.driveTrain([...INTAKE,...DRIVE]),hit=t.from(['robot/intake']);
  assert.equal(t.actuators.length,2);
  assert.equal(t.actuators.find(a=>a.key==='robot/drivetrain/m2').drive,true,'geared to the mecanum wheel');
  assert.equal(t.actuators.find(a=>a.key==='robot/drivetrain/m1').drive,false,'the wheel beside the intake pulley is on another axle');
  assert.equal(hit.actuator.key,'robot/drivetrain/m1');assert.equal(hit.actuator.kind,'dcmotor');assert.equal(hit.belts,2);
  // A motor the team already gave to another device is passed over; nothing else drives the intake.
  assert.equal(t.from(['robot/intake'],{skip:a=>a.key==='robot/drivetrain/m1'}),null);
  // Without the long belt nothing leads out of the intake.
  assert.equal(H.driveTrain([...INTAKE.filter(p=>p.key!=='robot/b2'),...DRIVE]).from(['robot/intake']),null);
});

test('a motor’s bracket, plate or pinion is not a motor; a motor in pieces is one',()=>{
  for(const n of ['UltraPlanetary Outside Mounting Bracket (REV-41-1621)','UltraPlanetary 550 Motor Plate (REV-41-1607)','UltraPlanetary 550 Motor Pinion Gear - 13 Tooth (REV-41-1608)'])assert.equal(H.fromCadName(n),null,n);
  assert.deepEqual(H.fromCadName('REV-41-1300'),{kind:'dcmotor',model:'rev-core-hex'});
  const t=H.driveTrain([at('m','Motor Part',[0,0,0,3,1.4,1.4]),at('s','Motor Sleeve',[1,-.01,-.01,2,1.41,1.41]),at('p','20t Gt2-2 Pulley',[3,.4,.4,3.5,1,1])]);
  assert.equal(t.actuators.length,1);
});

test('mechanisms belted to one motor count once against R503; over the limit is red but does not hold the steps after it',()=>{
  const row=(key,name,family='motor',role='roller')=>({key,name,family,role,kind:family==='motor'?'dcmotor':'servo'});
  const drive=['frontLeft','frontRight','backLeft','backRight'].map(k=>row('robot.'+k,k,'motor','drive'));
  const mech=[row('intakes.0.motor','intake'),row('shooters.0.motor','shooter','motor','flywheel'),row('shooters.1.motor','shooter2','motor','flywheel'),row('shooters.0.indexer','indexer','motor','feeder')];
  const limit=list=>H.conflicts(list,null).filter(p=>/R503/.test(p.text));
  assert.deepEqual(limit([...drive,...mech,row('shooters.1.indexer','indexer','motor','feeder')]),[],'the two feeders share “indexer”: 8 motors');
  const over=limit([...drive,...mech,row('shooters.1.indexer','indexer2','motor','feeder')]);
  assert.equal(over.length,1);assert.equal(over[0].level,'limit');assert.match(over[0].text,/9 motors; the game allows 8 \(R503\)\. Take 1 off/);
});

test('Configure from Control Hub: two feeders sharing “indexer” both take the robot’s one indexer; its sensing names both IMUs',()=>{
  const s=T.setup(),p={...s,robot:C.robot(s.robot,'ftc')};
  p.mechanisms=M.sanitize({...s.mechanisms,enabled:true,shooters:[{type:'turret',pieces:'pollen',mount:'front',motor:'shooter',indexer:'indexer'},{type:'turret',pieces:'nectar',mount:'back',motor:'shooter2',indexer:'indexer'}]});
  const cfg=RC.parse(`<?xml version='1.0'?><Robot type="FirstInspires-FTC"><LynxUsbDevice name="Control Hub Portal" serialNumber="(embedded)" parentModuleAddress="173"><LynxModule name="Control Hub" port="173"><goBILDA5202SeriesMotor name="indexer" port="2" /><ControlHubImuBHI260AP name="imu" port="0" bus="0" /><goBILDAPinpoint name="pinpoint" port="1" bus="1" /></LynxModule></LynxUsbDevice></Robot>`);
  const r=HS.plan(p,cfg),by=k=>r.assign.find(a=>a.key===k);
  assert.deepEqual([by('shooters.0.indexer')?.name,by('shooters.1.indexer')?.name],['indexer','indexer']);
  assert.equal(by('shooters.1.indexer').port,2);assert.ok(by('shooters.0.indexer').shared||by('shooters.1.indexer').shared);
  assert.ok(!r.missing.some(m=>/indexer/.test(m.key)),JSON.stringify(r.missing));
  assert.match(HS.lines(r)[0].text,/Pinpoint reads its 2 goBILDA odometry pods.*Control Hub’s IMU is used too/);
});

test('an Axon MINI configured on the robot as a plain servo takes its positional twin, and back',()=>{
  const s=T.setup(),p={...s,robot:C.robot({...s.robot,wiring:{devices:{'shooters.0.turretMotor':{model:'axon-mini-cr'}}}},'ftc')};
  p.mechanisms=M.sanitize({...s.mechanisms,enabled:true,shooters:[{type:'turret',pieces:'pollen',mount:'front',turretMotor:'turret'}],turret:{kind:'crservo'}});
  const cfg=kind=>RC.parse(`<?xml version='1.0'?><Robot type="FirstInspires-FTC"><LynxUsbDevice name="Control Hub Portal" serialNumber="(embedded)" parentModuleAddress="173"><LynxModule name="Control Hub" port="173"><${kind} name="turret" port="1" /><ControlHubImuBHI260AP name="imu" port="0" bus="0" /></LynxModule></LynxUsbDevice></Robot>`);
  const servo=HS.plan(p,cfg('Servo')).assign.find(a=>a.key==='shooters.0.turretMotor');
  assert.deepEqual([servo.kind,servo.model],['servo','axon-mini']);
  const cr=HS.plan(p,cfg('ContinuousRotationServo')).assign.find(a=>a.key==='shooters.0.turretMotor');
  assert.equal(cr.model,undefined,'already the continuous-mode model');assert.equal(HS.apply(p,HS.plan(p,cfg('ContinuousRotationServo'))).mechanisms.turret.kind,'crservo');
});
