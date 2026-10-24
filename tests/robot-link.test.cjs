'use strict';
// Send to robot: a Control Hub's robot configuration read over Robocol and checked against every device name an export
// uses, and the export uploaded and built with the hub's OnBot Java server. Runs against the simulated Control Hub
// (tools/ftc-sim.cjs), which answers the same commands and routes as FTC SDK 12.0.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const RobotConfig=require('../ui/ftc/robot-config.js'),F=require('../ui/sim-ftc.js'),Mech=require('../ui/sim-mechanisms.js'),P=require('../ui/sim-planner.js'),X=require('../ui/sim-export.js');
const {startUdpRobot,startOnBotJava,CONFIG_XML}=require('../tools/ftc-sim.cjs'),{readRobot,OnBotJava,send,buildErrors,formEncode,checkHost}=require('../src/robot-link.cjs');
const {FtcSocket}=require('../src/ftc.cjs'),robot={drivetrain:'mecanum',length:17,width:17,heightIn:12,driveRpm:312,intakeIn:0};
// The simulated robot and this station use their own loopback addresses (Robocol needs port 20884 on both ends), so these
// tests can run beside ftc.test.cjs, which uses 127.0.0.1 and 127.0.0.2.
const ROBOT='127.0.0.4',station=()=>new FtcSocket(ROBOT,{localAddress:'127.0.0.5'}).open();
const read=async(options={})=>{const socket=await station();try{return await readRobot(ROBOT,{...options,socket});}finally{await socket.close();}};

test('a robot configuration: every device with its kind, hub and port',()=>{
  const c=RobotConfig.parse(CONFIG_XML);
  assert.deepEqual(c.hubs.map(h=>[h.name,h.address]),[['Expansion Hub 2',2],['Control Hub',173]]);
  assert.deepEqual(c.devices.map(d=>[d.name,d.kind,d.hub,d.port]),[['shooter','motor','Expansion Hub 2',0],['indexer','motor','Expansion Hub 2',1],['turret','motor','Expansion Hub 2',2],['intake','motor','Expansion Hub 2',3],
    ['front_left','motor','Control Hub',0],['front_right','motor','Control Hub',1],['back_left','motor','Control Hub',2],['back_right','motor','Control Hub',3],['imu','imu','Control Hub',0],['pinpoint','pinpoint','Control Hub',0]]);
  assert.equal(c.devices.find(d=>d.name==='pinpoint').bus,1);
  // Servos, continuous servos, a SPARK Mini, entities in names, comments, and motor types added after this list.
  const other=RobotConfig.parse(`<?xml version="1.0"?><!-- a comment <Servo name="ghost"/> --><Robot type="FirstInspires-FTC"><LynxUsbDevice name="Portal" serialNumber="(embedded)" parentModuleAddress="173"><LynxModule name="Control Hub" port="173">
    <Servo name="kicker" port="0"/><ServoFullRange name="gate" port="1"/><ContinuousRotationServo name="roller &amp; belt" port="2"/><RevSPARKMini name="spark" port="3"/><goBILDA5203NewSeriesMotor name="new" port="0"/><RevColorSensorV3 name="color" port="0" bus="2"/></LynxModule></LynxUsbDevice><Webcam name="Webcam 1" serialNumber="SN1"/></Robot>`);
  assert.deepEqual(other.devices.map(d=>[d.name,d.kind]),[['kicker','servo'],['gate','servo'],['roller & belt','crservo'],['spark','crservo'],['new','motor'],['color','other'],['Webcam 1','webcam']]);
  assert.throws(()=>RobotConfig.parse('<html></html>'),/not an FTC robot configuration/);
});

test('the check: names the export uses against the robot, with suggestions, wrong kinds and the setting to change',()=>{
  const m=Mech.sanitize({enabled:true}),needs=F.robotNeeds(robot,'fused',m);
  assert.deepEqual(needs.map(n=>[n.name,n.need]),[['front_left','motor'],['front_right','motor'],['back_left','motor'],['back_right','motor'],['imu','imu'],['pinpoint','pinpoint'],['intake','motorOrCr'],['shooter','motor'],['indexer','motorOrCr'],['turret','motor']]);
  assert.deepEqual(needs.find(n=>n.name==='turret').setting,{list:'shooters',index:0,field:'turretMotor'});assert.deepEqual(needs[0].setting,{robot:'frontLeft'});
  const all=RobotConfig.check(needs,RobotConfig.parse(CONFIG_XML));assert.equal(all.ok,true,JSON.stringify(all.rows.filter(r=>r.status!=='ok')));assert.deepEqual(all.unused,[]);
  // A robot configured with the Pedro Quickstart's drive names, a continuous servo intake and a servo turret.
  const theirs=RobotConfig.parse(CONFIG_XML.replace('"front_left"','"leftFront"').replace('"front_right"','"rightFront"').replace('"back_left"','"leftRear"').replace('"back_right"','"rightRear"')
    .replace('<goBILDA5202SeriesMotor name="intake" port="3" />','<ContinuousRotationServo name="Intake" port="0" />').replace('<goBILDA5202SeriesMotor name="turret" port="2" />','<Servo name="turret" port="1" />'));
  const r=RobotConfig.check(needs,theirs),row=name=>r.rows.find(x=>x.name===name);assert.equal(r.ok,false);
  assert.deepEqual(['front_left','front_right','back_left','back_right'].map(n=>row(n).suggestion),['leftFront','rightFront','leftRear','rightRear'],'drive names that mean the same wheel');
  assert.equal(row('intake').suggestion,'Intake','a continuous servo fits an intake roller, and the name differs only in case');
  assert.equal(row('turret').status,'kind');assert.match(RobotConfig.explain(row('turret')),/is a servo on the robot; the code needs a motor\. In Mechanisms, set the turret to turn on a servo\./);
  assert.equal(row('shooter').status,'ok');assert.match(RobotConfig.explain(row('shooter')),/"shooter" is a motor on Expansion Hub 2, port 0\./);
  // A robot device is suggested once, and a name already in use goes last.
  const two=RobotConfig.check([{name:'intake',need:'motorOrCr',label:'A'},{name:'intake2',need:'motorOrCr',label:'B'}],RobotConfig.parse('<Robot><LynxModule name="Control Hub" port="173"><ContinuousRotationServo name="Intake" port="0"/></LynxModule></Robot>'));
  assert.deepEqual(two.rows.map(x=>x.suggestion??null),['Intake',null]);
  // Two Deck devices of different kinds under one name.
  const dup=RobotConfig.check([{name:'arm',need:'motor',label:'Turret'},{name:'arm',need:'servo',label:'Kicker'}],{devices:[]});assert.match(RobotConfig.explain(dup.rows[1]),/also the name Deck uses for turret/);
  assert.deepEqual(RobotConfig.tokens('left_front_drive'),RobotConfig.tokens('frontLeftMotor'));assert.deepEqual(RobotConfig.tokens('LF'),['front','left']);assert.notDeepEqual(RobotConfig.tokens('intake2'),RobotConfig.tokens('intake'));
});

test('Send to robot reads the active configuration over Robocol, as a Driver Station does',async t=>{
  let robot2;try{robot2=await startUdpRobot({address:ROBOT});}catch(e){t.skip(ROBOT+' loopback is unavailable: '+e.message);return;}
  t.after(()=>robot2.close());
  const r=await read();assert.deepEqual(r.active,{name:'competition',dirty:false});assert.deepEqual(r.configurations,['competition']);assert.equal(r.devices.length,10);assert.equal(r.xml,CONFIG_XML);
  assert.ok(r.opModes.length>0,'the op mode list comes along');
  // No active configuration on the robot: nothing to check against, and that is said.
  robot2.sim.active='No Config Set';const none=await read();assert.equal(none.active,null);assert.deepEqual(none.devices,[]);
});

test('Send to robot refuses a robot that another Driver Station is using, and an address that is not one',async t=>{
  let robot2;try{robot2=await startUdpRobot({address:ROBOT,reject:true});}catch(e){t.skip(ROBOT+' loopback is unavailable: '+e.message);return;}
  t.after(()=>robot2.close());
  await assert.rejects(read(),/Another Driver Station is connected/);
  for(const bad of ['http://192.168.43.1','192.168.43.1:8080','a b','',null])assert.throws(()=>checkHost(bad),/Enter the robot address/);assert.equal(checkHost(' 192.168.43.1 '),'192.168.43.1');
});

test('Send to robot uploads the export with OnBot Java, builds it, keeps a copy of a file someone changed on the robot, and reports compile errors',async t=>{
  let onbot;try{onbot=await startOnBotJava({address:'127.0.0.2',port:0});}catch(e){t.skip('127.0.0.2 loopback is unavailable: '+e.message);return;}
  t.after(()=>onbot.close());const client=new OnBotJava('127.0.0.2',{port:onbot.port}),backupDir=fs.mkdtempSync(path.join(os.tmpdir(),'deck-robot-backups-'));
  // The real OnBot Java export: the autonomous and its check TeleOp.
  const start={x:9.83,y:27,heading:0},route=P.plan({start,zones:[],pins:[{x:40,y:30,action:'Shoot'}],clearance:2},{front:8.5,rear:8.5,half:8.5}),layout={name:'Send test',start,zones:[]};
  const out=F.onBotJava({route,layout,tuning:{},robot,localization:'fused',mechanisms:Mech.sanitize({enabled:true}),target:{x:59,y:58},setupName:'Send test',routeJava:X.java(route,layout,{polygon:P.polygon})});
  const progress=[],first=await send('127.0.0.2',out.files,{client,backupDir,onProgress:(stage,file)=>progress.push(stage+(file?' '+file:''))});
  assert.equal(first.built,true);assert.deepEqual(first.written,['PlannedRouteAuto.java','PlannedRouteCheck.java']);assert.deepEqual(first.backups,[]);assert.equal(onbot.counts.builds,1);
  assert.deepEqual([...onbot.files.keys()],['/src/org/firstinspires/ftc/teamcode/PlannedRouteAuto.java','/src/org/firstinspires/ftc/teamcode/PlannedRouteCheck.java']);
  assert.equal(onbot.files.get('/src/org/firstinspires/ftc/teamcode/PlannedRouteAuto.java'),out.source,'the file arrives exactly as exported');assert.deepEqual(progress,['uploading PlannedRouteAuto.java','uploading PlannedRouteCheck.java','building']);
  // Someone edited the autonomous in OnBot Java: sending again keeps their copy on this computer first.
  onbot.files.set('/src/org/firstinspires/ftc/teamcode/PlannedRouteAuto.java',out.source.replace('// Example: private DcMotorEx intake;','private int theirs;'));
  const again=await send('127.0.0.2',out.files,{client,backupDir});assert.equal(again.backups.length,1);assert.match(fs.readFileSync(again.backups[0],'utf8'),/private int theirs;/);assert.match(path.basename(again.backups[0]),/PlannedRouteAuto\.java$/);
  // Files in keep are written only when the robot does not have them yet.
  const kept=await send('127.0.0.2',{'org/firstinspires/ftc/teamcode/RobotActions.java':'class RobotActions {}'},{client,keep:['org/firstinspires/ftc/teamcode/RobotActions.java']});assert.deepEqual(kept.written,['RobotActions.java']);
  const keptAgain=await send('127.0.0.2',{'org/firstinspires/ftc/teamcode/RobotActions.java':'class RobotActions { int changed; }'},{client,keep:['org/firstinspires/ftc/teamcode/RobotActions.java']});assert.deepEqual([keptAgain.written,keptAgain.kept],[[],['RobotActions.java']]);
  // A build that fails reports each error with its file and line.
  const failing=await startOnBotJava({address:'127.0.0.2',port:0,compile:()=>['/src/org/firstinspires/ftc/teamcode/PlannedRouteAuto.java:42: error: cannot find symbol']});t.after(()=>failing.close());
  const bad=await send('127.0.0.2',out.files,{client:new OnBotJava('127.0.0.2',{port:failing.port})});assert.equal(bad.built,false);assert.deepEqual(bad.errors,[{file:'PlannedRouteAuto.java',line:42,message:'cannot find symbol'}]);
  // Paths stay under /src as Java files.
  await assert.rejects(send('127.0.0.2',{'../evil.java':'x'},{client}),/not a Java source path/);
});

test('the OnBot Java form encoding and build log parsing',async()=>{
  const text='a+b = 100% & "quoted" \'single\' (x)*! é\r\nline';assert.equal(new URLSearchParams('data='+formEncode(text)).get('data'),text,'every character survives the robot\'s form decoding');
  assert.doesNotMatch(formEncode("!'()*"),/[!'()*]/);
  assert.deepEqual(buildErrors('Foo.java:3:5: error: ; expected\nnote: something\nsrc/org/Bar.java:10: error: incompatible types'),[{file:'Foo.java',line:3,message:'; expected'},{file:'Bar.java',line:10,message:'incompatible types'}]);
  // Nothing listening: the message says where it looked and what to check.
  await assert.rejects(new OnBotJava('127.0.0.2',{port:9,timeout:2000}).available(),/Could not reach the robot's OnBot Java at http:\/\/127\.0\.0\.2:9.*Join the robot's Wi-Fi/);
});
