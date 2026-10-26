'use strict';
// A Control Hub on USB: its configurations read with ADB, the active one and Blocks' hardware list from its own web
// server, and each device turned into the Java that gets it from the hardware map.
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const R=require('../ui/ftc/robot-config.js'),L=require('../src/robot-link.cjs');
const XML=`<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<Robot type="FirstInspires-FTC">
    <Webcam name="Webcam 1" serialNumber="UC762" />
    <LynxUsbDevice name="Control Hub Portal" serialNumber="(embedded)" parentModuleAddress="173">
        <LynxModule name="Expansion Hub 2" port="2">
            <goBILDA5202SeriesMotor name="armMotor" port="0" />
        </LynxModule>
        <LynxModule name="Control Hub" port="173">
            <goBILDA5202SeriesMotor name="frontleft" port="0" />
            <Servo name="left claw" port="0" />
            <ContinuousRotationServo name="intake" port="1" />
            <RevTouchSensor name="liftHome" port="1" />
            <RevColorSensorV3 name="color" port="0" bus="1" />
            <goBILDAPinpoint name="pinpoint" port="0" bus="2" />
            <ControlHubImuBHI260AP name="imu" port="0" bus="0" />
        </LynxModule>
    </LynxUsbDevice>
</Robot>`;

test('each configured device as Java: its SDK type, import and hardwareMap.get line, as Blocks lists them',()=>{
  const j=R.javaOf(R.parse(XML).devices),line=n=>j.list.find(x=>x.device.name===n).declare;
  assert.equal(line('frontleft'),'DcMotorEx frontleft = hardwareMap.get(DcMotorEx.class, "frontleft");');
  assert.equal(line('left claw'),'Servo leftClaw = hardwareMap.get(Servo.class, "left claw");');
  assert.equal(line('intake'),'CRServo intake = hardwareMap.get(CRServo.class, "intake");');
  assert.equal(line('liftHome'),'TouchSensor liftHome = hardwareMap.get(TouchSensor.class, "liftHome");');
  assert.equal(line('color'),'NormalizedColorSensor color = hardwareMap.get(NormalizedColorSensor.class, "color");');
  assert.equal(line('pinpoint'),'GoBildaPinpointDriver pinpoint = hardwareMap.get(GoBildaPinpointDriver.class, "pinpoint");');
  assert.equal(line('Webcam 1'),'WebcamName webcam1 = hardwareMap.get(WebcamName.class, "Webcam 1");');
  assert.ok(j.imports.includes('import com.qualcomm.hardware.gobilda.GoBildaPinpointDriver;'));assert.equal(R.variableOf('class'),'classDevice');assert.equal(R.variableOf('2nd arm'),'device2ndArm');
  assert.deepEqual(['frontleft','backrightmotor','FL','left_front'].map(n=>R.tokens(n).join(' ')),['front left','back right','front left','front left'],'run-together names match their parts');
});

test('over USB: ADB lists and reads /sdcard/FIRST, the robot\'s web server names the active one and Blocks\' list',async()=>{
  const server=http.createServer((req,res)=>{if(req.url==='/js/rcInfo.json'){res.end(JSON.stringify({activeConfigName:'comp'}));return;}
    if(req.url==='/hardware'){res.end("var allHardwareIdentifiers = [ 'ControlHubAsREVModule', 'frontleftAsDcMotor', 'imuAsIMU', ];");return;}res.statusCode=404;res.end();});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port,calls=[];
  // A fake ADB: one hub, two configurations, and port forwarding onto the test server.
  const run=(file,args,opts,done)=>{calls.push(args.join(' '));const a=args.join(' ');
    if(a==='devices')return done(null,'List of devices attached\nABC123\tdevice\n\n','');
    if(/shell ls -1t/.test(a))return done(null,'practice.xml\ncomp.xml\nFastLoadBundle.jar\n','');
    if(/shell cat '\/sdcard\/FIRST\/comp\.xml'/.test(a))return done(null,XML,'');if(/shell cat '\/sdcard\/FIRST\/practice\.xml'/.test(a))return done(null,XML.replace('frontleft','fl'),'');
    if(/forward tcp:\d+ tcp:8080/.test(a)&&!/--remove/.test(a)){const local=+/tcp:(\d+) tcp:8080/.exec(a)[1];const proxy=require('node:net').createServer(s=>{const c=require('node:net').connect(port,'127.0.0.1');s.pipe(c).pipe(s);});proxy.listen(local,'127.0.0.1',()=>done(null,'',''));run.proxy=proxy;return;}
    return done(null,'','');};
  try{const r=await L.readUsb({run});assert.equal(r.serial,'ABC123');assert.deepEqual(r.configurations,['practice','comp']);assert.deepEqual(r.active,{name:'comp'});
    assert.ok(r.devices.some(d=>d.name==='frontleft'&&d.port===0));assert.deepEqual(r.blocks,[{identifier:'frontleftAsDcMotor',name:'frontleft',type:'DcMotor'},{identifier:'imuAsIMU',name:'imu',type:'IMU'}]);
    assert.ok(calls.some(c=>/forward --remove tcp:/.test(c)),'the forwarded port is given back');}
  finally{server.close();run.proxy?.close();}
  await assert.rejects(L.readUsb({run:(f,a,o,done)=>done(null,'List of devices attached\n\n','')}),/No Control Hub on USB/);
  await assert.rejects(L.readUsb({run:(f,a,o,done)=>done(null,'List of devices attached\nX\tunauthorized\n','')}),/has not allowed this computer/);
});
