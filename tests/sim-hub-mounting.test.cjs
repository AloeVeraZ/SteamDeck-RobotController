'use strict';
// The Control Hub's mounting (logo and USB directions) is a robot setting written into every export that uses its IMU.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const C=require('../ui/sim-config.js'),P=require('../ui/sim-planner.js'),X=require('../ui/sim-export.js'),F=require('../ui/sim-ftc.js'),Pedro=require('../ui/sim-pedro.js'),D=require('../tools/deck-sim.cjs');
const pick=r=>({hubLogo:r.hubLogo,hubUsb:r.hubUsb});

test('robot settings keep a possible mounting and repair an impossible one',()=>{
  assert.deepEqual(pick(C.robot({},'ftc')),{hubLogo:'up',hubUsb:'forward'},'logo up, USB forward by default');
  assert.deepEqual(pick(C.robot({hubLogo:'left',hubUsb:'up'},'ftc')),{hubLogo:'left',hubUsb:'up'});
  assert.deepEqual(pick(C.robot({hubLogo:'up',hubUsb:'down'},'ftc')),{hubLogo:'up',hubUsb:'forward'},'USB along the logo axis is replaced');
  assert.deepEqual(pick(C.robot({hubLogo:'backward',hubUsb:'forward'},'ftc')),{hubLogo:'backward',hubUsb:'up'});
  assert.deepEqual(pick(C.robot({hubLogo:'sideways',hubUsb:7},'ftc')),{hubLogo:'up',hubUsb:'forward'});
});

test('OnBot, TeamCode and Pedro starter constants use the mounting',()=>{
  const start={x:24,y:24,heading:0},layout={name:'Hub',field:'empty',width:144,height:144,start,zones:[]},route=P.plan({start,zones:[],pins:[{x:90,y:24}],style:'sharp',clearance:1},{front:8,rear:8,half:8});
  const robot={...C.robot({hubLogo:'left',hubUsb:'up'},'ftc'),length:16,width:16},line=/LogoFacingDirection\.LEFT, ?RevHubOrientationOnRobot\.UsbFacingDirection\.UP/;
  assert.deepEqual(F.hardware(robot,'odometry').hub,{logo:'LEFT',usb:'UP'});assert.deepEqual(F.hardware({length:16,width:16},'encoders').hub,{logo:'UP',usb:'FORWARD'});
  const routeJava=X.java(route,layout,{polygon:P.polygon}),teamcode=F.files({route,layout,tuning:{},robot,localization:'odometry',routeJava});
  assert.match(Object.entries(teamcode.files).find(([k])=>k.endsWith('drive/RobotDrive.java'))[1],line);
  const onbot=F.onBotJava({route,layout,tuning:{},robot,localization:'encoders',routeJava}).source;assert.match(onbot,line);
  // Without tuning or a route default, power falls back to 0.8 instead of writing NaN into the Java.
  assert.match(onbot,/MOTOR_POWER = \{0\.8\}/);
  const tuning={maxForward:86.6,maxStrafe:69.3,forwardDeceleration:83.8,strafeDeceleration:68.9,linearBrakeForward:.0941,linearBrakeStrafe:.0403,quadraticBrakeForward:.00176,quadraticBrakeStrafe:.00237,headingBrakeLinear:.0601,headingBrakeQuadratic:.00486,headingP:3.95,translationalP:.304,translationalSmall:.101};
  for(const localization of ['odometry','odometry3'])assert.match(Pedro.starterConstants({hardware:F.hardware(robot,localization),tuning}),line,localization);
});

test('deck-sim robot --hub-logo/--hub-usb set the mounting and refuse an impossible one',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deck-hub-')),file=path.join(dir,'r.json'),log=console.log;console.log=()=>{};
  try{await D.main(['new',file,'--field','empty']);await D.main(['robot',file,'--hub-logo','left','--hub-usb','up']);
    assert.deepEqual(pick(JSON.parse(fs.readFileSync(file,'utf8')).robot),{hubLogo:'left',hubUsb:'up'});
    await assert.rejects(D.main(['robot',file,'--hub-usb','right']),/same axis/);await assert.rejects(D.main(['robot',file,'--hub-logo','north']),/--hub-logo is one of/);}
  finally{console.log=log;}
});
