'use strict';
// The virtual Control Hub's own parts and sensors: team code drives a part of the robot's own design (a servo arm, a
// motor lift) through hub.kinematics, and reads sensors wired to it (an Axon-style analog feedback wire, a touch sensor
// at home, the motor's encoder) that the simulator feeds from the simulated joint, not from what the code commanded.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const K=require('../ui/sim-kinematics.js'),A=require('../ui/sim-actuators.js');
const built=fs.existsSync(path.join(__dirname,'../sim-runtime/driver/classes/deck/sim/hub/SimAnalog.class')),skip=built?false:'run node tools/simulation/build.cjs first';
const robot={drivetrain:'mecanum',length:17,width:17,heightIn:5,driveRpm:312,intakeIn:0},start={x:30,y:30,heading:0};
let H=null;try{H=require('../ui/sim-hardware.js');}catch{}
// Sensor models from the catalog when this checkout has it.
const model=(kind,fallback)=>H?.SENSORS?.find?.(x=>x.kind===kind)?.id??fallback;
// An arm on a servo (90°/s; CAD pose = 0, "up" at 90°) and a lift on a DC motor (8 in/s).
const kinematics={model:null,joints:[
  {id:'arm',name:'Arm',type:'revolute',axis:[0,1,0],lower:-10,upper:180,states:{down:0,up:90}},
  {id:'lift',name:'Lift',type:'prismatic',axis:[0,0,1],lower:0,upper:20,states:{down:0,up:12}}],
  actuators:[{id:'armServo',name:'Arm servo',joint:'arm',kind:'servo',speed:90,device:'armServo',servo:{center:.3}},
    {id:'liftMotor',name:'Lift motor',joint:'lift',kind:'dcmotor',speed:8,device:'liftMotor',cpr:537.7,ratio:20}]};
const wiring={hubs:{expansion:null,servoHub:null},devices:{},sensors:[
  {id:'armAngle',model:model('axonFeedback','axon-feedback'),for:'kin.armServo',use:'position',hub:'control',port:0,name:'armAngle',zeroVolts:1,voltsPerUnit:.01},
  {id:'armHome',model:model('touch','rev-touch'),for:'kin.arm',use:'home',hub:'control',port:1,name:'armHome'}]};
const source=(up,down)=>`package org.firstinspires.ftc.teamcode;

import com.qualcomm.hardware.lynx.LynxModule;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.hardware.AnalogInput;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorEx;
import com.qualcomm.robotcore.hardware.Servo;
import com.qualcomm.robotcore.hardware.TouchSensor;

@Autonomous(name = "Arm and lift check")
public class ArmCheck extends LinearOpMode {
    @Override public void runOpMode() {
        int hubs = 0;
        for (LynxModule hub : hardwareMap.getAll(LynxModule.class)) { hub.setBulkCachingMode(LynxModule.BulkCachingMode.AUTO); hubs++; }
        Servo arm = hardwareMap.get(Servo.class, "armServo");
        AnalogInput angle = hardwareMap.get(AnalogInput.class, "armAngle");
        TouchSensor home = hardwareMap.get(TouchSensor.class, "armHome");
        DcMotorEx lift = hardwareMap.get(DcMotorEx.class, "liftMotor");
        lift.setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER);
        telemetry.addData("Hubs", hubs);
        telemetry.addData("Init volts", angle.getVoltage());
        telemetry.addData("Init home", home.isPressed());
        telemetry.update();
        waitForStart();
        arm.setPosition(${up});
        lift.setTargetPosition(${A.ticks(kinematics.actuators[1],12)});
        lift.setMode(DcMotor.RunMode.RUN_TO_POSITION);
        lift.setPower(1);
        // Up until the feedback wire says the arm is there, then back down until the touch sensor is pressed.
        boolean down = false;
        while (opModeIsActive()) {
            double volts = angle.getVoltage();
            if (!down && volts > 1.895) { arm.setPosition(${down}); down = true; }
            telemetry.addData("Volts", volts);
            telemetry.addData("Home", home.isPressed());
            telemetry.addData("Lift", lift.getCurrentPosition());
            telemetry.addData("Lift busy", lift.isBusy());
            telemetry.addData("Down", down);
            telemetry.update();
            if (down && home.isPressed()) break;
        }
    }
}
`;
test('a servo part moves its joint at its own speed; the analog feedback and touch sensor read the simulated joint',{skip},async()=>{
  let error='';const {SimEngine}=require('../src/sim-engine.cjs'),e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-hub-sensors-')),now:()=>0,emit:m=>{if(m?.state==='error')error=m.error;}});
  try{await e.load({field:'empty',start,robot:{...robot,wiring},kinematics,sensors:{localization:'fused'}});
    // Robot settings keep their wiring once sim-config sanitizes it; until then the test hands it over directly.
    if(!e.config.robot.wiring?.sensors?.length)e.config.robot.wiring=wiring;
    const arm=K.sanitize(kinematics).actuators[0],up=A.position(arm,90),down=A.position(arm,0);
    const started=await e.run({kind:'opmode',files:{'org/firstinspires/ftc/teamcode/ArmCheck.java':source(up,down)},opMode:'org.firstinspires.ftc.teamcode.ArmCheck'});
    assert.equal(started.ok,true,error);
    const volts=q=>1+.01*q,seen=[];let top=0,released=false;
    for(let i=0;i<600&&e.mode==='program';i++){await e.programTick();const j=e.frame().joints,t=e.telemetry||{};
      if(i===0){assert.equal(t.Hubs,'1','the Control Hub is a LynxModule');assert.ok(Math.abs(+t['Init volts']-1)<1e-9,'at the CAD pose the wire reads zeroVolts');assert.equal(t['Init home'],'true','home switch pressed at the CAD pose');}
      if(t.Volts===undefined)continue;
      // The wire reads where the arm is this tick (simulated, moving at 90°/s), not where the code sent it.
      assert.ok(Math.abs(+t.Volts-volts(j.arm))<1e-3,`tick ${i}: ${t.Volts} V for the arm at ${j.arm}°`);
      assert.equal(t.Home,String(Math.abs(j.arm)<=.5),`tick ${i}: switch at ${j.arm}°`);
      seen.push(j.arm);top=Math.max(top,j.arm);if(t.Home==='false')released=true;}
    assert.ok(seen.some(q=>q>10&&q<80),'the arm passes through the middle of its swing');
    assert.ok(top>=89.5&&top<=90+1e-6,`it reached up (${top}°)`);assert.ok(released,'the switch opened as the arm left home');
    assert.equal(e.mode,'idle','the program saw the switch close at home again and ended');assert.ok(Math.abs(e.frame().joints.arm)<=.5);
    // The lift: RUN_TO_POSITION to 12 in (to the whole count nearest) through the motor's encoder, at 8 in/s.
    const lift=kinematics.actuators[1];assert.ok(Math.abs(e.frame().joints.lift-A.ticks(lift,12)/A.countsPer(lift))<1e-3,`lift at ${e.frame().joints.lift} in`);
    assert.ok(Math.abs(+e.telemetry.Lift-A.ticks(kinematics.actuators[1],12))<=1,'the encoder counts where the lift is');
  }finally{e.dispose();}
});

test('readings: volts, switches and counts from a part, and the hub description of parts and sensors',()=>{
  // Kin.reading: analog volts within 0-3.3 V, a switch at its position, encoder counts.
  assert.equal(K.reading('analog',90,{zeroVolts:1,voltsPerUnit:.01}),1.9);assert.equal(K.reading('analog',500,{zeroVolts:1,voltsPerUnit:.01}),3.3);
  assert.equal(K.reading('analog',0,{}),K.VOLTS/2,'the middle of the range at the CAD pose by default');
  assert.equal(K.reading('touch',.4,{}),true);assert.equal(K.reading('touch',3,{}),false);assert.equal(K.reading('limit',30,{at:30,band:1}),true);
  assert.equal(K.reading('encoder',90,{countsPerUnit:2}),180);assert.equal(K.reading('analog',NaN,{}),null);
  // The driver measures an actuator or a joint as it moves, and the model's own sensors as hub ports read them.
  const model=K.sanitize({...kinematics,sensors:[{id:'pot',kind:'potentiometer',joint:'arm'},{id:'homeSw',kind:'limit',joint:'arm',at:0,band:.5},{id:'enc',kind:'encoder',actuator:'liftMotor',cpr:100}]}),d=new K.Driver(model);
  d.start('Arm up');d.start('Lift up');for(let i=0;i<30;i++)d.tick(1/60);
  const m=d.measure({actuator:'armServo'});assert.ok(Math.abs(m.value-45)<1e-6&&Math.abs(m.velocity-90)<1e-6&&m.unit==='deg',JSON.stringify(m));
  assert.equal(d.measure({joint:'lift'}).unit,'in');assert.ok(Math.abs(d.sense({joint:'arm'},{kind:'analog',zeroVolts:1,voltsPerUnit:.01})-1.45)<1e-9);
  const r=d.readings();assert.equal(r.homeSw.pressed,false);assert.ok(Math.abs(r.pot.value-45)<1e-6);assert.ok(Math.abs(r.pot.volts-(K.VOLTS/2+45*K.VOLTS/360))<1e-9);assert.equal(typeof r.enc.counts,'number');
});

test('the hub description of parts and sensors follows the virtual hub contract',()=>{
  const {hubKinematics,hubSensors}=require('../src/sim-engine.cjs'),model=K.forEngine(kinematics),parts=hubKinematics(model,{...robot,wiring});
  const arm=parts.find(p=>p.id==='armServo'),lift=parts.find(p=>p.id==='liftMotor'),a=model.actuators[0];
  assert.deepEqual([arm.name,arm.type,!!arm.reversed],['armServo','servo',false]);
  // value = (position - center) x perUnit / (sign x ratio): the inverse of DeckActuators.position.
  const value=p=>(p-arm.servo.center)*arm.servo.perUnit/(arm.servo.sign*(arm.servo.ratio??1));
  for(const q of [0,45,90])assert.ok(Math.abs(value(A.position(a,q))-q)<1e-9,`servo value ${q}`);
  assert.deepEqual([lift.name,lift.type],['liftMotor','motor']);assert.ok(Math.abs(lift.countsPerUnit-A.countsPer(model.actuators[1]))<1e-9);
  const sensed=hubSensors({...robot,wiring},model,{enabled:false});
  assert.deepEqual(sensed.map(s=>[s.name,s.type,JSON.stringify(s.source)]),[['armAngle','analog','{"actuator":"armServo"}'],['armHome','touch','{"joint":"arm"}']]);
  assert.deepEqual([sensed[0].zeroVolts,sensed[0].voltsPerUnit],[1,.01]);
});

test('a motor part on power homes on a limit switch (DigitalChannel); a distance sensor follows it; both hubs are LynxModules',{skip},async()=>{
  let error='';const {SimEngine}=require('../src/sim-engine.cjs'),e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-hub-limit-')),now:()=>0,emit:m=>{if(m?.state==='error')error=m.error;}});
  const limit=H?.SENSORS?.find?.(x=>(x.kind==='limit'||x.kind==='magnetic')&&x.xmlType==='DigitalDevice')?.id??'limit-switch',range=model('distance','rev-2m-distance');
  const wired={hubs:{expansion:{address:2},servoHub:null},devices:{},sensors:[
    {id:'liftHome',model:limit,for:'kin.lift',use:'home',hub:'control',port:0,name:'liftHome'},
    {id:'liftRange',model:range,for:'kin.lift',use:'position',hub:'control',bus:1,name:'liftRange'}]};
  const java=`package org.firstinspires.ftc.teamcode;

import com.qualcomm.hardware.lynx.LynxModule;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.hardware.DcMotorEx;
import com.qualcomm.robotcore.hardware.DigitalChannel;
import com.qualcomm.robotcore.hardware.DistanceSensor;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;

@Autonomous(name = "Lift to the switch")
public class LiftCheck extends LinearOpMode {
    @Override public void runOpMode() {
        java.util.List<LynxModule> hubs = hardwareMap.getAll(LynxModule.class);
        for (LynxModule hub : hubs) hub.setBulkCachingMode(LynxModule.BulkCachingMode.MANUAL);
        DcMotorEx lift = hardwareMap.get(DcMotorEx.class, "liftMotor");
        DigitalChannel home = hardwareMap.get(DigitalChannel.class, "liftHome");
        home.setMode(DigitalChannel.Mode.INPUT);
        DistanceSensor range = hardwareMap.get(DistanceSensor.class, "liftRange");
        waitForStart();
        // Up 3 in by the encoder, then down until the home switch closes.
        lift.setPower(.5);
        boolean down = false;
        while (opModeIsActive()) {
            for (LynxModule hub : hubs) hub.clearBulkCache();
            // A normally open switch to ground: the pin reads false while it is closed.
            boolean closed = !home.getState();
            if (!down && lift.getCurrentPosition() > ${A.ticks(kinematics.actuators[1],3)}) { lift.setPower(-.5); down = true; }
            if (down && closed) lift.setPower(0);
            telemetry.addData("Hubs", hubs.size() + " " + hubs.get(0).isParent() + " " + hubs.get(1).getModuleAddress());
            telemetry.addData("Home", closed);
            telemetry.addData("Down", down);
            telemetry.addData("Range", range.getDistance(DistanceUnit.MM));
            telemetry.update();
        }
    }
}
`;
  try{await e.load({field:'empty',start,robot:{...robot,wiring:wired},kinematics,sensors:{localization:'fused'}});
    if(!e.config.robot.wiring?.sensors?.length)e.config.robot.wiring=wired;
    assert.equal((await e.run({kind:'opmode',files:{'org/firstinspires/ftc/teamcode/LiftCheck.java':java},opMode:'org.firstinspires.ftc.teamcode.LiftCheck'})).ok,true,error);
    let top=0,opened=false;
    for(let i=0;i<300&&e.mode==='program';i++){await e.programTick();const t=e.telemetry||{},q=e.frame().joints.lift;if(t.Range===undefined)continue;
      assert.equal(t.Hubs,'2 true 2','the Control Hub and Expansion Hub 2');
      assert.ok(Math.abs(+t.Range-(50+25.4*q))<.01,`range ${t.Range} mm with the lift at ${q} in`);
      // A home switch closes where the CAD has the part (within half a unit).
      assert.equal(t.Home,String(Math.abs(q)<=.5),`switch with the lift at ${q} in`);top=Math.max(top,q);if(t.Home==='false')opened=true;}
    const q=e.frame().joints.lift;assert.ok(opened&&top>3&&top<3.2,`went up 3 in (${top}) and the switch opened`);
    assert.ok(q>.4&&q<=.5,`the lift stopped as the switch closed (${q} in), moving 4 in/s at half power`);
    assert.equal(e.hubDevices.liftHome,1,'devices() shows the switch closed');assert.ok(Math.abs(e.hubDevices.liftRange-(50+25.4*q))<.01);
  }finally{e.dispose();}
});
