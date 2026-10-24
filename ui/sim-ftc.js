(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.DeckSimFtc=value;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  // The FTC Control Hub side of an export: the robot wiring (motor names, directions, encoder
  // resolution, pod placement) and the team files built from it. The simulator's virtual Control
  // Hub is wired from the same description, so exported code and the virtual robot cannot disagree.
  // Field frame: inches, +X right, +Y up, heading CCW. Robot frame: +x forward, +y left.
  const WHEEL_MM=104,POD_TICKS_PER_INCH=2000/(Math.PI*32/25.4);
  // goBILDA Yellow Jacket style motors report 28 counts per motor revolution; the gearbox sets the rest.
  const ticksPerRev=rpm=>28*6000/rpm;
  const MOTORS={frontLeft:{name:'front_left',mount:-1},frontRight:{name:'front_right',mount:1},backLeft:{name:'back_left',mount:-1},backRight:{name:'back_right',mount:1}};
  // Tank, 6- and 8-wheel and tracked robots: the same four motor names, two per side; a two-wheel
  // differential robot has one motor per side.
  const TANK=new Set(['tank','tank2','tank6','tank8','tracks']),DIFF={left:{name:'left_drive',mount:-1},right:{name:'right_drive',mount:1}};
  const sides=motors=>Object.entries(motors).reduce((o,[k,m])=>{o[/left/i.test(k)?'left':'right'].push(m.name);return o;},{left:[],right:[]});
  const PODS={
    odometry:[{name:'par',axis:'forward',x:0,y:4},{name:'perp',axis:'strafe',x:-3,y:0}],
    odometry3:[{name:'par_left',axis:'forward',x:0,y:6},{name:'par_right',axis:'forward',x:0,y:-6},{name:'perp',axis:'strafe',x:-3,y:0}]
  };
  const SUPPORTED={encoders:'drive encoders + IMU',odometry:'two odometry pods + IMU',odometry3:'three odometry pods + IMU',fused:'goBILDA Pinpoint',optical:'SparkFun OTOS'};
  // Wiring of the virtual Control Hub for a robot and sensing setup.
  function hardware(robot,localization){
    if(!SUPPORTED[localization])throw Error('Autonomous on a Control Hub needs position sensing: drive encoders, odometry pods, Pinpoint or OTOS. IMU-only setups export timed commands.');
    const drivetrain=robot.drivetrain||'mecanum',tank=TANK.has(drivetrain);
    if(!tank&&drivetrain!=='mecanum')throw Error('Autonomous on a Control Hub is exported for mecanum and tank-style drivetrains (tank, differential, 6- and 8-wheel, tracks). Swerve, X-drive, Kiwi, H-drive and butterfly export timed commands or route geometry for your own drivetrain code.');
    const rpm=robot.driveRpm||312,inches=Math.PI*(robot.wheelDiameterMm||WHEEL_MM)/25.4;
    const mount=(globalThis.DeckSimConfig||require('./sim-config.js')).hubMounting(robot);
    // The robot's own names for these devices (Setup → Robot controller, or picked from its configuration), and drive
    // motors set to turn the other way. mount is the physical truth the virtual Control Hub drives: -1 is REVERSE.
    const own=robot.devices||{},named=(key,fallback)=>own[key]?.name||fallback;
    const motors=Object.fromEntries(Object.entries(drivetrain==='tank2'?DIFF:MOTORS).map(([key,m])=>[key,{name:named(key,m.name),mount:typeof own[key]?.reversed==='boolean'?(own[key].reversed?-1:1):m.mount}]));
    return {localization,imu:named('imu','imu'),hub:{logo:mount.hubLogo.toUpperCase(),usb:mount.hubUsb.toUpperCase()},drive:{kind:tank?'tank':'mecanum',ticksPerInch:ticksPerRev(rpm)/inches,ticksPerRev:ticksPerRev(rpm),halfLength:robot.length/2,halfWidth:robot.width/2,motors},
      pods:(PODS[localization]||[]).map(p=>({...p,name:named(p.name,p.name),ticksPerInch:POD_TICKS_PER_INCH})),...(localization==='fused'?{pinpoint:named('pinpoint','pinpoint')}:{}),...(localization==='optical'?{otos:named('otos','sensor_otos')}:{})};
  }
  // Deck's own name for each drive and sensor device a robot of this kind uses, keyed as robot.devices keys them, with
  // what it is (for the robot configuration check and the Robot controller step).
  function deviceSlots(robot,localization){
    let h;try{h=hardware(robot,localization);}catch{return [];}
    const labels={frontLeft:'Front left drive motor',frontRight:'Front right drive motor',backLeft:'Back left drive motor',backRight:'Back right drive motor',left:'Left drive motor',right:'Right drive motor'};
    return [...Object.entries(h.drive.motors).map(([key,m])=>({key,label:labels[key],name:m.name,kind:'motor',reversed:m.mount<0})),{key:'imu',label:'IMU',name:h.imu,kind:'imu'},
      ...h.pods.map((p,i)=>({key:PODS[localization][i].name,label:`Odometry pod (${p.axis==='forward'?'forward':'sideways'}${p.y>0?', left':p.y<0?', right':''}): plugged into a motor port's encoder`,name:p.name,kind:'motor'})),
      ...(h.pinpoint?[{key:'pinpoint',label:'goBILDA Pinpoint',name:h.pinpoint,kind:'pinpoint'}]:[]),...(h.otos?[{key:'otos',label:'SparkFun OTOS',name:h.otos,kind:'otos'}]:[])];
  }
  // The hardware description for drivetrains the Control Hub exports support, or null (a swerve robot's Pedro export
  // then comes without starter constants).
  function hardwareIfSupported(robot,localization){try{return hardware(robot,localization);}catch{return null;}}
  // Every device name a Control Hub export looks up, what the robot configuration must have under it, and the setting that
  // holds the name: the list Send to robot checks against the robot's own configuration. motorOrCr: the code uses
  // DcMotorSimple there, so a motor or a continuous servo both work.
  function robotNeeds(robot,localization,mechanisms){
    const slots=deviceSlots(robot,localization).map(s=>({name:s.name,need:s.kind,label:s.label,setting:{robot:s.key}}));
    const mech=mechanisms?.enabled?mechanismDevices(mechanisms,robot).map(x=>({name:x.name,need:x.device==='servo'?'servo':x.role==='flywheel'||x.role==='turret'?'motor':'motorOrCr',label:x.label,setting:x.setting})):[];
    return [...slots,...mech];
  }
  // Java double literals: Java numeric literals retain a decimal point for generated calibration constants.
  const n=v=>{const s=String(Number(Number(v).toPrecision(6)));return /[.eE]/.test(s)?s:s+'.0';};
  const comment=s=>String(s||'').replace(/\*\//g,'* /').replace(/\\(?=u)/g,'\\ ').replace(/[\r\n]+/g,' ').trim();
  const javaString=s=>'"'+String(s).replace(/[\\"]/g,c=>'\\'+c).replace(/[\u0000-\u001f]/g,'')+'"';
  const names=list=>`new String[] {${list.map(javaString).join(', ')}}`;
  // The same application-owned controller is exported to the robot. Only this adapter
  // depends on the FTC SDK: hardware names, encoder geometry, sensor frames and motor mixing.
  // Tuning the simulator has not measured falls back to the Deck controller's own Config defaults, so no NaN
  // reaches the Java.
  const DEFAULT_TUNING={maxForward:60,maxStrafe:50,maxTurn:5,translationalP:.09/.35,translationalD:.01,headingP:2/.7,headingD:.12};
  function constants(h,raw,options){const t={...raw};for(const [k,v] of Object.entries(DEFAULT_TUNING))if(!Number.isFinite(t[k]))t[k]=v;return `package ${options.packageName}.drive;
import deck.pathing.DeckFollower;
import com.qualcomm.robotcore.hardware.HardwareMap;
import com.qualcomm.robotcore.util.ElapsedTime;
public final class Constants {
    private static RobotDrive hardware;
    private static DeckFollower.Config config;
    public static DeckFollower create(HardwareMap map) {
        hardware = new RobotDrive(map);
        config = new DeckFollower.Config();
        config.maxForward=${n(t.maxForward)}; config.maxStrafe=${n(t.maxStrafe)}; config.maxTurn=${n(t.maxTurn??5)};
        config.positionP=${n(t.translationalP*.35)}; config.positionD=${n(t.translationalD)};
        config.headingP=${n(t.headingP*.7)}; config.headingD=${n(Math.max(.08,t.headingD))};
        config.acceleration=${n(Math.max(20,Math.min(t.maxForward*3,(t.maxAcceleration??t.maxForward*2)*.65)))}; config.tank=${h.drive.kind==='tank'};
        config.maxPathSpeed=${n(t.maxPathSpeed??.8)};
        ElapsedTime clock = new ElapsedTime();
        return new DeckFollower(hardware, hardware, config, () -> clock.nanoseconds());
    }
    public static void motorPower(double p) { config.maxPathSpeed=p; hardware.limit=p; }
}
`;}
  function robotDrive(h,options){const motors=Object.entries(h.drive.motors),pods=h.pods,kind=h.drive.kind;
    return `package ${options.packageName}.drive;
import deck.pathing.DeckFollower;
import deck.pathing.DeckFollower.*;
import com.qualcomm.robotcore.hardware.*;
import com.qualcomm.hardware.rev.RevHubOrientationOnRobot;
import com.qualcomm.hardware.gobilda.GoBildaPinpointDriver;
import com.qualcomm.hardware.sparkfun.SparkFunOTOS;
import com.qualcomm.robotcore.util.ElapsedTime;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;
import org.firstinspires.ftc.robotcore.external.navigation.Pose2D;
/** Set motor names, directions, wheel gearing and sensor offsets to match your real robot.
 * Gains measured in simulation are starting values; calibrate distances and turns on the field.
 * IMU mounting below assumes logo up, USB forward; edit it for your Control Hub mounting. */
public final class RobotDrive implements Drivetrain, Localizer {
    private final DcMotorEx[] motors = new DcMotorEx[${motors.length}], pods = new DcMotorEx[${pods.length}];
    private final IMU imu;
    private final GoBildaPinpointDriver pinpoint;
    private final SparkFunOTOS otos;
    private final ElapsedTime clock = new ElapsedTime();
    private final int[] before = new int[${motors.length}], podBefore = new int[${pods.length}];
    private double oldImu, lastTime;
    double limit=${n(.6)};
    private MotionState state=MotionState.ofVelocity(Pose.zero(),Velocity.zero());
    public RobotDrive(HardwareMap map) {
${motors.map(([key,m],i)=>`        motors[${i}]=map.get(DcMotorEx.class, ${javaString(m.name)}); motors[${i}].setDirection(DcMotorSimple.Direction.${m.mount<0?'REVERSE':'FORWARD'});`).join('\n')}
        for(DcMotorEx m:motors){m.setMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER);m.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);}
${pods.map((p,i)=>`        pods[${i}]=map.get(DcMotorEx.class,${javaString(p.name)});`).join('\n')}
        imu=map.get(IMU.class,${javaString(h.imu)});
        // How the Control Hub is mounted (Deck: Setup → Robot controller). If this is wrong, every turn and heading is wrong.
        imu.initialize(new IMU.Parameters(new RevHubOrientationOnRobot(RevHubOrientationOnRobot.LogoFacingDirection.${h.hub.logo},RevHubOrientationOnRobot.UsbFacingDirection.${h.hub.usb})));
        pinpoint=${h.localization==='fused'?`map.get(GoBildaPinpointDriver.class,${javaString(h.pinpoint)})`:'null'};
        otos=${h.localization==='optical'?`map.get(SparkFunOTOS.class,${javaString(h.otos)})`:'null'};
        if(otos!=null){otos.setLinearUnit(DistanceUnit.INCH);otos.setAngularUnit(AngleUnit.RADIANS);}
        setPose(Pose.zero());
    }
    public MotionState state(){return state;}
    public java.util.Map<String,Object> debug(){return java.util.Collections.emptyMap();}
    public void setPose(Pose p){
        for(int i=0;i<motors.length;i++)before[i]=motors[i].getCurrentPosition();
        for(int i=0;i<pods.length;i++)podBefore[i]=pods[i].getCurrentPosition();
        oldImu=imu.getRobotYawPitchRollAngles().getYaw(AngleUnit.RADIANS);lastTime=clock.seconds();
        if(pinpoint!=null)pinpoint.setPosition(new Pose2D(DistanceUnit.INCH,p.x(),p.y(),AngleUnit.RADIANS,p.heading()));
        if(otos!=null)otos.setPosition(new SparkFunOTOS.Pose2D(p.x(),p.y(),p.heading()+Math.PI/2));
        state=MotionState.ofVelocity(p,Velocity.zero());
    }
    public void update(){
        double now=clock.seconds(),dt=now-lastTime;if(dt<=0)return;lastTime=now;Pose p=state.pose(),next;
        double yaw=imu.getRobotYawPitchRollAngles().getYaw(AngleUnit.RADIANS),dh=DeckFollower.angle(yaw-oldImu);oldImu=yaw;
        if(pinpoint!=null){pinpoint.update();next=new Pose(pinpoint.getPosX(DistanceUnit.INCH),pinpoint.getPosY(DistanceUnit.INCH),pinpoint.getHeading(AngleUnit.RADIANS));}
        else if(otos!=null){SparkFunOTOS.Pose2D q=otos.getPosition();next=new Pose(q.x,q.y,q.h-Math.PI/2);}
        else {
            double[] d=new double[motors.length];for(int i=0;i<d.length;i++){int ticks=motors[i].getCurrentPosition();d[i]=(ticks-before[i])*${n(1/h.drive.ticksPerInch)};before[i]=ticks;}
            double forward=${kind==='tank'?'('+motors.map((_,i)=>`d[${i}]`).join('+')+')/'+motors.length:'(d[0]+d[1]+d[2]+d[3])/4'},left=${kind==='tank'?'0':'(-d[0]+d[1]+d[2]-d[3])/4'};
${pods.length?`            double[] pod=new double[pods.length];for(int i=0;i<pods.length;i++){int ticks=pods[i].getCurrentPosition();pod[i]=ticks-podBefore[i];podBefore[i]=ticks;}
            forward=(${pods.map((p,i)=>p.axis==='forward'?`pod[${i}]*${n(1/p.ticksPerInch)}+${n(p.y)}*dh`:null).filter(Boolean).map(t=>'('+t+')').join('+')})/${pods.filter(p=>p.axis==='forward').length};
            left=${pods.map((p,i)=>p.axis==='strafe'?`pod[${i}]*${n(1/p.ticksPerInch)}-(${n(p.x)})*dh`:null).filter(Boolean).join('+')};`:''}
            double mid=p.heading()+dh/2;next=new Pose(p.x()+forward*Math.cos(mid)-left*Math.sin(mid),p.y()+forward*Math.sin(mid)+left*Math.cos(mid),p.heading()+dh);
        }
        state=MotionState.ofVelocity(next,new Velocity((next.x()-p.x())/dt,(next.y()-p.y())/dt,DeckFollower.angle(next.heading()-p.heading())/dt));
    }
    public void drive(DrivePowers p,boolean manual){
        double[] powers=new double[]{${kind==='tank'?motors.map(([key])=>`p.forward()${/left/i.test(key)?'-':'+'}p.turn()`).join(','):'p.forward()-p.strafe()-p.turn(),p.forward()+p.strafe()+p.turn(),p.forward()+p.strafe()-p.turn(),p.forward()-p.strafe()+p.turn()'}};
        double scale=1;for(double w:powers)scale=Math.max(scale,Math.abs(w)/Math.max(.000001,limit));
        for(int i=0;i<motors.length;i++)motors[i].setPower(limit<=0?0:powers[i]/scale);
    }
    public void stop(){for(DcMotorEx m:motors)m.setPower(0);}
}
`;}
  function opMode(options){const R=options.className;return `package ${options.packageName};

import deck.pathing.DeckFollower;
import deck.pathing.DeckFollower.Pose;
import deck.pathing.DeckFollower.Path;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.util.ElapsedTime;
import ${options.packageName}.drive.Constants;

/**
 * Autonomous generated by Deck Driver Station for "${comment(options.layoutName||'route')}". Follows ${R}
 * leg by leg: turns in place first when a leg needs a new heading, follows it (running the action of
 * an action path while it drives), waits for the robot to settle, turns if the pin asks for it, then
 * runs the pin's action and pause. Mechanism code goes in RobotActions.java; the driving comes from
 * the simulator. Paste ${R}.java, RouteActions.java, RobotActions.java, this file and drive/ with pathing/ into TeamCode.
 */
@Autonomous(name = ${javaString(`${options.layoutName||'Planned route'} (Deck)`)}, group = "Deck Driver Station")
public class ${options.opModeName} extends LinearOpMode {
    private DeckFollower follower;
    private RouteActions actions;
    private final RouteActions.Step step = new RouteActions.Step();

    @Override
    public void runOpMode() throws InterruptedException {
        follower = Constants.create(hardwareMap);
        follower.setPose(${R}.START);
        actions = new RobotActions();
        actions.init(hardwareMap, telemetry);
        Path[] legs = ${R}.legs();
        telemetry.addData("Route", legs.length + " legs");
        telemetry.update();
        waitForStart();
        try {
            ElapsedTime timer = new ElapsedTime(), movingTimer = new ElapsedTime();
            double plannedHeading = ${R}.START.heading();
            int movingPath = 0;
            boolean movingDone = true, movingFirst = false;
            for (int i = 0; i < legs.length && opModeIsActive(); i++) {
                Constants.motorPower(${R}.MOTOR_POWER[i]);
                if (${R}.MOTOR_POWER[i] == 0) {
                    follower.stop();
                    while (opModeIsActive()) { report(i, legs.length, "Zero motor power: stopped"); idle(); }
                    break;
                }
                // Turn only where the plan changes heading (turning routes), not to chase small drift.
                if (Math.abs(angle(${R}.START_HEADING[i] - plannedHeading)) > Math.toRadians(0.5)) turnTo(${R}.START_HEADING[i], i, legs.length);
                // An action path's action starts with the path and may span several legs of it.
                String moving = ${R}.MOVING_ACTIONS[i];
                if (!moving.isEmpty() && ${R}.PATH[i] != movingPath) {
                    movingPath = ${R}.PATH[i];
                    movingDone = false;
                    movingFirst = true;
                    movingTimer.reset();
                }
                follower.follow(legs[i]);
                step.wait = 0;
                boolean through = i + 1 < legs.length && ${R}.WAIT_SECONDS[i] == 0 && ${R}.ACTIONS[i].isEmpty() && Double.isNaN(${R}.TURN_AFTER[i]) && DeckFollower.continuous(legs[i],legs[i+1]);
                while (opModeIsActive() && follower.following()) {
                    follower.update();
                    if (!moving.isEmpty() && !movingDone) {
                        // A set time runs the action from the start of its path; the last call stops it.
                        double t = movingTimer.seconds();
                        boolean over = ${R}.MOVING_SECONDS[i] > 0 && t >= ${R}.MOVING_SECONDS[i];
                        step.duration = ${R}.MOVING_SECONDS[i];
                        step.cell = ${R}.MOVING_CELL[i];
                        movingDone = act(moving, t, movingFirst, over, true, ${R}.PIN[i]) || over;
                        movingFirst = false;
                    }
                    report(i, legs.length, moving.isEmpty() ? "Driving" : "Action path");
                    if (through && follower.remainingDistance() < 1.5 && near(legs[i].endPose(),1.5)) break;
                }
                boolean pathEnds = i == legs.length - 1 || ${R}.PATH[i + 1] != movingPath || ${R}.MOVING_ACTIONS[i + 1].isEmpty();
                if (!moving.isEmpty() && pathEnds) {
                    // The path is over: one last call so the action can stop its mechanisms.
                    if (!movingDone) { step.duration = ${R}.MOVING_SECONDS[i]; act(moving, movingTimer.seconds(), movingFirst, true, true, ${R}.PIN[i]); }
                    movingDone = true;
                    movingPath = 0;
                }
                Pose end = legs[i].endPose();
                plannedHeading = end.heading();
                if (through) continue;
                timer.reset();
                while (opModeIsActive() && timer.seconds() < 3 && !(near(end, 0.75) && follower.velocity().linSpeed() < .5)) {
                    follower.update();
                    report(i, legs.length, "Settling");
                }
                if (!Double.isNaN(${R}.TURN_AFTER[i])) {
                    turnTo(${R}.TURN_AFTER[i], i, legs.length);
                    plannedHeading = ${R}.TURN_AFTER[i];
                }
                // At the pin: pause, then run the action for its set time (or until it reports done), then drive on.
                timer.reset();
                while (opModeIsActive() && timer.seconds() < ${R}.WAIT_SECONDS[i]) {
                    follower.update();
                    report(i, legs.length, "Pause");
                }
                String action = ${R}.ACTIONS[i];
                step.wait = ${R}.WAIT_SECONDS[i];
                step.duration = ${R}.ACTION_SECONDS[i];
                step.cell = ${R}.ACTION_CELL[i];
                boolean done = action.isEmpty(), first = true;
                timer.reset();
                while (opModeIsActive() && !done) {
                    follower.update();
                    double t = timer.seconds();
                    boolean over = ${R}.ACTION_SECONDS[i] > 0 && t >= ${R}.ACTION_SECONDS[i];
                    done = act(action, t, first, over, false, ${R}.PIN[i]) || over;
                    first = false;
                    report(i, legs.length, "Action");
                }
            }
            while (opModeIsActive()) {
                follower.update();
                report(legs.length - 1, legs.length, "Done");
            }
        } finally {
            // Stop the drive first: an error in a mechanism's stop code must not leave the wheels turning.
            try {
                follower.stop();
            } finally {
                actions.stop();
            }
        }
    }

    /** Turn in place: done when the heading has stayed within 1.5 degrees for 0.15 s (at most 5 s). */
    private void turnTo(double heading, int leg, int legs) {
        Pose here = follower.pose();
        follower.hold(new Pose(here.x(), here.y(), heading));
        ElapsedTime timer = new ElapsedTime();
        double settledSince = -1;
        while (opModeIsActive() && timer.seconds() < 5) {
            follower.update();
            report(leg, legs, "Turning");
            boolean on = Math.abs(angle(heading - follower.pose().heading())) < Math.toRadians(1.5);
            if (!on) settledSince = -1;
            else if (settledSince < 0) settledSince = timer.seconds();
            else if (timer.seconds() - settledSince > 0.15) break;
        }
    }

    private boolean act(String name, double elapsed, boolean first, boolean last, boolean moving, int pin) {
        step.elapsed = elapsed;
        step.first = first;
        step.last = last;
        step.moving = moving;
        step.pin = pin;
        step.pose = follower.pose();
        telemetry.addData("Action", name);
        return actions.run(name, step);
    }

    private boolean near(Pose target, double inches) {
        Pose p = follower.pose();
        return Math.hypot(p.x() - target.x(), p.y() - target.y()) < inches;
    }

    private static double angle(double radians) {
        return Math.atan2(Math.sin(radians), Math.cos(radians));
    }

    private void report(int leg, int legs, String phase) {
        Pose p = follower.pose();
        telemetry.addData("Leg", (leg + 1) + " of " + legs);
        telemetry.addData("Phase", phase);
        telemetry.addData("x", "%.1f", p.x());
        telemetry.addData("y", "%.1f", p.y());
        telemetry.addData("heading", "%.1f", Math.toDegrees(p.heading()));
        telemetry.update();
    }
}
`;}
  // The action slots: one method per action named in the simulator, regenerated on every export.
  function routeActions(options,list){const Ex=options.exporter,mech=options.mechanisms?.enabled?options.mechanisms:null;return `package ${options.packageName};

import ${options.poseImport||'deck.pathing.DeckFollower.Pose'};
import com.qualcomm.robotcore.hardware.HardwareMap;
import org.firstinspires.ftc.robotcore.external.Telemetry;

/**
 * Action slots for "${comment(options.layoutName||'route')}", generated by Deck Driver Station. Export rewrites
 * this file: write your mechanism code in RobotActions.java, which extends it.
 *
 * Each action named in the simulator is one method here. It is called every loop while it runs and
 * returns true once it has finished.
 *  - At a pin the robot is stopped. It leaves once the action has finished AND the pin's pause is over,
 *    so set the pause in the simulator to how long the action takes on the real robot.
 *  - On an action path the robot keeps driving. The action is called until it returns true or the
 *    path ends; if the path ends first it gets one final call with step.last = true.
 * The same name at several pins or paths runs the same method.
 *
 * Actions in this route:
${list.length?list.map(a=>` *   ${a.slot}(): "${comment(a.name)}", ${a.uses.map(u=>Ex.where(u)+(u.note?` (${comment(u.note)})`:'')).join('; ')}`).join('\n'):' *   (none yet: name an action on a pin or an action path in the simulator)'}
 */
public abstract class RouteActions {
    /** What a running action can see. */
    public static final class Step {
        /** Seconds since this action started. */
        public double elapsed;
        /** True on the first call. */
        public boolean first;
        /** True on the final call of an action path (the path has ended): stop moving parts now. */
        public boolean last;
        /** True on an action path (the robot is driving), false at a pin (the robot is stopped). */
        public boolean moving;
        /** The pin the robot is at, or the pin the action path leads to. */
        public int pin;
        /** Estimated field pose, in inches and radians counterclockwise from +X. */
        public Pose pose;
        /** At a pin: its pause in seconds, already over when the action starts (0 on an action path). */
        public double wait;
        /** How long this action runs, in seconds: the route calls it with last = true when the time is up.
         *  0 at a pin: run until you return true. 0 on an action path: the whole path. */
        public double duration;
        /** The hive cell to aim at: 0 the cell up at the start, 1 the other cell (up after the first tip). */
        public int cell;
    }

    protected HardwareMap hardwareMap;
    protected Telemetry telemetry;
${mech?`    /** The intake, indexer and shooter set up in the simulator (Mechanisms.java). */
    protected final Mechanisms mech = new Mechanisms();
`:''}
    /** Called once during init, before START. Look up your mechanism hardware here. */
    public void init(HardwareMap hardwareMap, Telemetry telemetry) {
        this.hardwareMap = hardwareMap;
        this.telemetry = telemetry;
${mech?'        mech.init(hardwareMap);\n':''}    }
${list.map(a=>`
    /** "${comment(a.name)}": ${a.uses.map(u=>Ex.where(u)).join('; ')}. Return true when finished. */
    public boolean ${a.slot}(Step step) {
        ${mechanismAction(a.name,mech)||`return notWritten(${javaString(a.name)});`}
    }
`).join('')}
    /** Called when the autonomous ends or is stopped: stop every mechanism. */
    public void stop() {
${mech?'        mech.stop();\n':''}    }

    /** Runs the action with this simulator name. Names this file does not know count as finished. */
    public final boolean run(String name, Step step) {
        switch (name) {
${list.flatMap(a=>(a.names||[a.name]).map(name=>`            case ${javaString(name)}: return ${a.slot}(step);\n`)).join('')}            default: return true;
        }
    }

    private boolean notWritten(String name) {
        if (telemetry != null) telemetry.addData("Action", name + ": no code yet (write it in RobotActions.java)");
        return true;
    }
}
`;}
  // The team's own file: created once with a method for each action, never overwritten afterwards.
  function robotActions(options,list){const Ex=options.exporter,mech=options.mechanisms?.enabled?options.mechanisms:null;list=list.filter(a=>!mechanismAction(a.name,mech));return `package ${options.packageName};

import com.qualcomm.robotcore.hardware.HardwareMap;
import org.firstinspires.ftc.robotcore.external.Telemetry;

/**
 * YOUR mechanism code for the autonomous actions (intake, shooter, arm...). Deck Driver Station
 * created this file once and never overwrites it. The simulator plans the driving; this file does
 * the rest. Each method is called every loop while its action runs and returns true when finished
 * (RouteActions.java has the rules and the current list of actions).
 *
 * After you add or rename an action in the simulator and export again, its method appears in
 * RouteActions.java: copy it here (keep @Override) and write the code. Delete methods for actions
 * you removed.
 */
public class RobotActions extends RouteActions {
${mech?`    // Deck's Intake, Spin up, Aim and Shoot already run the mechanisms set up in Deck (Mechanisms.java, as
    // mech). To do one of them your own way, override it here. For example, to shoot with your own code:
    //     @Override
    //     public boolean shoot(Step step) {
    //         // Called every loop until it returns true. Never sleep() here: the robot stops following its path.
    //         return mech.shoot(0, step); // Deck's version: start from it, or replace it
    //     }

`:''}    // Example: private DcMotorEx intake;

    @Override
    public void init(HardwareMap hardwareMap, Telemetry telemetry) {
        super.init(hardwareMap, telemetry);
        // Example: intake = hardwareMap.get(DcMotorEx.class, "intake");
    }
${list.map(a=>`
    /** "${comment(a.name)}": ${a.uses.map(u=>Ex.where(u)).join('; ')}. */
    @Override
    public boolean ${a.slot}(Step step) {
        // TODO: ${comment(a.name)}${a.uses.find(u=>u.note)?` (${comment(a.uses.find(u=>u.note).note)})`:''}.
        // ${a.uses.some(u=>u.moving)?'Example: if (step.first) intake.setPower(1); if (step.last) intake.setPower(0); return step.last;':'Example: if (step.first) shooter.setPower(1); if (step.elapsed < 1.5) return false; shooter.setPower(0); return true;'}
        return true;
    }
`).join('')}
    @Override
    public void stop() {
        super.stop();
        // Stop every mechanism you added here.
    }
}
`;}
  // ---------------------------------------------------------------- mechanisms
  // The simulator's built-in actions as they run on the robot. "Shoot" feeds once per storage slot.
  function mechanismAction(name,mech){
    if(!mech)return '';const a=(globalThis.DeckMechanisms||require('./sim-mechanisms.js')).action(name),shooter=mech.shooter.type!=='none';
    if(a.kind==='intake'&&mech.intake.enabled)return 'boolean done = step.last || (!step.moving && step.duration <= 0);\n        mech.intake(!done);\n        return done;';
    if(a.kind==='spin'&&shooter)return 'mech.spin(true);\n        return true;';
    if(a.kind==='aim'&&shooter)return 'mech.aim(step.pose, step.cell);\n        return step.moving ? step.last : mech.aimed();';
    if(a.kind==='shoot'&&shooter)return `return mech.shoot(${a.count}, step);`;
    return '';
  }
  // Every mechanism device the export drives, with the Java field and constant it gets. Mechanisms.java, the
  // mechanism check, the robot configuration check and the virtual Control Hub are all built from this one list.
  // device: what it is in the robot configuration (motor, crservo or servo).
  function mechanismDevices(m,robot={}){
    const Mech=globalThis.DeckMechanisms||require('./sim-mechanisms.js'),out=[];
    m.intakes.forEach((i,k)=>{const no=k+1,base={part:'intake',index:k};
      if(i.kind!=='kicker'){const device=i.device==='crservo'?'crservo':'motor';
        out.push({...base,role:'roller',field:`intake${no}`,constant:`INTAKE_${no}`,name:i.motor,device,reversed:!!i.reversed,power:i.power,label:`Intake ${no} roller`,setting:{list:'intakes',index:k,field:'motor'}});
        if(i.motor2)out.push({...base,role:'roller',field:`intake${no}b`,constant:`INTAKE_${no}B`,name:i.motor2,device,reversed:!!i.reversed2,power:i.power,label:`Intake ${no} second roller`,setting:{list:'intakes',index:k,field:'motor2'}});}
      if(Mech.deploys(i.kind))out.push({...base,role:i.kind,field:`${i.kind}${no}`,constant:`${i.kind.toUpperCase()}_${no}`,name:i.servo,device:'servo',down:i.downPos,up:i.upPos,label:`Intake ${no} ${i.kind} servo`,setting:{list:'intakes',index:k,field:'servo'}});
    });
    m.shooters.forEach((s,k)=>{const no=k+1,base={part:'shooter',index:k};
      out.push({...base,role:'flywheel',field:`flywheel${no}`,constant:`FLYWHEEL_${no}`,name:s.motor,device:'motor',reversed:!!s.reversed,label:`Shooter ${no} flywheel`,setting:{list:'shooters',index:k,field:'motor'}});
      if(s.motor2)out.push({...base,role:'flywheel',field:`flywheel${no}b`,constant:`FLYWHEEL_${no}B`,name:s.motor2,device:'motor',reversed:!!s.reversed2,label:`Shooter ${no} second flywheel motor`,setting:{list:'shooters',index:k,field:'motor2'}});
      const kind=s.indexerKind;
      out.push({...base,role:'feeder',field:`feeder${no}`,constant:`FEEDER_${no}`,name:s.indexer,device:kind==='motor'||kind==='crservo'?kind:'servo',feeder:kind,reversed:!!s.indexerReversed,feed:s.feedPos,rest:s.restPos,label:`Shooter ${no} feeder`,setting:{list:'shooters',index:k,field:'indexer'}});
      if(s.type==='turret'&&!s.sharesTurret)out.push({...base,role:'turret',field:`turret${no}`,constant:`TURRET_${no}`,name:s.turretMotor,device:m.turret.kind==='servo'?'servo':'motor',reversed:!!s.turretReversed,offset:Mech.mountOffset(s.mount,robot),label:`Shooter ${no} turret`,setting:{list:'shooters',index:k,field:'turretMotor'}});
    });
    return out;
  }
  // The virtual Control Hub's mechanism ports for these settings. mount is the physical truth from the settings (-1: the
  // device is mounted to turn the other way), so robot code has to set the same direction for a piece to go in.
  function mechanismHardware(m){
    const d=mechanismDevices(m),Mech=globalThis.DeckMechanisms||require('./sim-mechanisms.js'),out={},mount=x=>x.reversed?-1:1;
    const rollers=d.filter(x=>x.role==='roller');if(rollers.length)out.intakes=rollers.map(x=>({name:x.name,kind:x.device,mount:mount(x),part:x.index}));
    for(const role of ['kicker','ramp']){const list=d.filter(x=>x.role===role);if(list.length)out[role+'s']=list.map(x=>({name:x.name,down:x.down,up:x.up}));}
    if(m.shooters.length)out.shooters=m.shooters.map((s,k)=>{const mine=d.filter(x=>x.part==='shooter'&&x.index===k),f=mine.find(x=>x.role==='feeder'),t=mine.find(x=>x.role==='turret');
      return {flywheels:mine.filter(x=>x.role==='flywheel').map(x=>({name:x.name,mount:mount(x)})),ticksPerSecond:m.shooter.rpm*m.shooter.ticksPerRev/60,
        indexer:{name:f.name,kind:f.feeder,mount:mount(f),...(Mech.servoFeeder(f.feeder)?{feed:f.feed,rest:f.rest}:{})},
        ...(t?{turret:t.device==='servo'?{name:t.name,kind:'servo',center:m.turret.servoCenter,degrees:m.turret.servoDegrees,mount:mount(t)}:{name:t.name,kind:'motor',ticksPerDegree:m.turret.ticksPerDegree,mount:mount(t)}}:{})};});
    return out;
  }
  function mechanismsSource(options,m,target,robot={}){
    const Mech=globalThis.DeckMechanisms||require('./sim-mechanisms.js'),d=mechanismDevices(m,robot),of=role=>d.filter(x=>x.role===role),velocity=m.shooter.control!=='power';
    const rollers=of('roller'),swings=d.filter(x=>x.role==='kicker'||x.role==='ramp'),flywheels=of('flywheel'),feeders=of('feeder'),turrets=of('turret');
    const motorTurrets=turrets.filter(x=>x.device==='motor'),servoTurrets=turrets.filter(x=>x.device==='servo'),pushers=feeders.filter(x=>x.feeder==='pusher');
    const q=s=>`"${comment(s)}"`,turns=x=>x.reversed?' (turns the other way)':'',where=mount=>Mech.MOUNTS[mount].toLowerCase(),list=values=>`{${values.join(', ')}}`;
    const FEEDERS={motor:'motor',crservo:'continuous servo',pusher:'servo pusher',gate:'servo gate'};
    const intakeText=(i,k)=>{const mine=d.filter(x=>x.part==='intake'&&x.index===k);
      return ` *  - Intake ${k+1} (${i.sides.join(' + ')} ${Mech.INTAKES[i.kind].toLowerCase()}): ${mine.map(x=>x.role==='roller'?`${x.device==='crservo'?'continuous servo':'motor'} ${q(x.name)}${turns(x)}`:`${x.role} servo ${q(x.name)}`).join(', ')}.`;};
    const shooterText=(s,k)=>{const mine=d.filter(x=>x.part==='shooter'&&x.index===k),f=mine.find(x=>x.role==='feeder'),t=mine.find(x=>x.role==='turret'),fw=mine.filter(x=>x.role==='flywheel');
      const kind=s.sharesTurret?`on shooter 1's turret`:s.type==='turret'?`turret at the ${where(s.mount)}`:`fixed at the ${where(s.mount)}, firing toward the ${s.facing}`;
      return ` *  - Shooter ${k+1} (${Mech.PIECES[s.pieces].toLowerCase()}): ${kind}; flywheel motor${fw.length>1?'s':''} ${fw.map(x=>q(x.name)+turns(x)).join(' and ')}, feeder ${FEEDERS[f.feeder]} ${q(f.name)}${Mech.servoFeeder(f.feeder)?'':turns(f)}${t?`, turret ${t.device} ${q(t.name)}${turns(t)}`:''}.`;};
    // Constants, one block per part, then the shared timing.
    const C=[];
    m.intakes.forEach((i,k)=>{const mine=d.filter(x=>x.part==='intake'&&x.index===k);C.push(`    // ---- Intake ${k+1}: ${i.sides.join(' + ')} ${Mech.INTAKES[i.kind].toLowerCase()}.`);
      for(const x of mine){if(x.role==='roller')C.push(`    /** ${x.label}: a ${x.device==='crservo'?'continuous servo':'DC motor'} that runs at its power while an Intake action runs. */`,`    public static final String ${x.constant} = ${javaString(x.name)};`,`    public static final boolean ${x.constant}_REVERSED = ${x.reversed};`,`    public static final double ${x.constant}_POWER = ${n(x.power)};`);
        else C.push(`    /** ${x.label}: its position down (${x.role==='kicker'?'scooping':'picking up'}) while an Intake action runs, and up otherwise. */`,`    public static final String ${x.constant} = ${javaString(x.name)};`,`    public static final double ${x.constant}_DOWN = ${n(x.down)}, ${x.constant}_UP = ${n(x.up)};`);}
      C.push('');});
    m.shooters.forEach((s,k)=>{const mine=d.filter(x=>x.part==='shooter'&&x.index===k);C.push(`    // ---- Shooter ${k+1}: ${Mech.PIECES[s.pieces].toLowerCase()}.`);
      const fw=mine.filter(x=>x.role==='flywheel');C.push(`    /** Flywheel motor${fw.length>1?'s (both spin the flywheel; set each one\'s direction so they push the same way)':''}. */`,`    public static final String ${fw.map(x=>`${x.constant} = ${javaString(x.name)}`).join(', ')};`,`    public static final boolean ${fw.map(x=>`${x.constant}_REVERSED = ${x.reversed}`).join(', ')};`);
      const f=mine.find(x=>x.role==='feeder');
      if(Mech.servoFeeder(f.feeder))C.push(`    /** Feeder: a ${FEEDERS[f.feeder]}. ${f.feeder==='pusher'?'FEED pushes a piece into the flywheel; REST lets the next one drop in.':'FEED is open (pieces pass); REST is closed.'} */`,`    public static final String ${f.constant} = ${javaString(f.name)};`,`    public static final double ${f.constant}_FEED = ${n(f.feed)}, ${f.constant}_REST = ${n(f.rest)};`);
      else C.push(`    /** Feeder: a ${FEEDERS[f.feeder]} that runs at FEEDER_POWER while shooting. */`,`    public static final String ${f.constant} = ${javaString(f.name)};`,`    public static final boolean ${f.constant}_REVERSED = ${f.reversed};`);
      const t=mine.find(x=>x.role==='turret');
      if(t)C.push(`    /** Turret: a ${t.device==='servo'?'servo':'motor with an encoder'}. It aims from where it turns on the robot, inches forward and left of the center. */`,`    public static final String ${t.constant} = ${javaString(t.name)};`,`    public static final boolean ${t.constant}_REVERSED = ${t.reversed};`,`    public static final double ${t.constant}_X = ${n(t.offset[0])}, ${t.constant}_Y = ${n(t.offset[1])};`);
      C.push('');});
    if(m.shooters.length){
      C.push('    // ---- Flywheels (every shooter).');
      if(velocity)C.push(`    /** Shooting speed in encoder ticks per second: ${+m.shooter.rpm.toPrecision(6)} RPM x ${+m.shooter.ticksPerRev.toPrecision(6)} ticks per revolution / 60. */`,`    public static final double FLYWHEEL_TICKS_PER_SECOND = ${n(m.shooter.rpm*m.shooter.ticksPerRev/60)};`,
        '    /** A flywheel is at speed within this fraction of FLYWHEEL_TICKS_PER_SECOND. */',`    public static final double AT_SPEED_TOLERANCE = ${n(m.shooter.tolerance)};`,
        '    /** Seconds to reach speed. A flywheel still short of it SPIN_UP_SECONDS + 0.5 s after starting shoots anyway. */',`    public static final double SPIN_UP_SECONDS = ${n(m.shooter.spinUp)};`,
        ...(m.shooter.pidf?['    /** Velocity PIDF for the flywheel motors (REV: F = 32767 / top speed, P = 0.1 F, I = 0.1 P, D = 0). */',`    public static final double FLYWHEEL_P = ${n(m.shooter.pidf.p)}, FLYWHEEL_I = ${n(m.shooter.pidf.i)}, FLYWHEEL_D = ${n(m.shooter.pidf.d)}, FLYWHEEL_F = ${n(m.shooter.pidf.f)};`]:[]));
      else C.push('    /** No encoder: the flywheels run at FLYWHEEL_POWER and count as at speed SPIN_UP_SECONDS after they start. */',`    public static final double FLYWHEEL_POWER = ${n(m.shooter.power)}, SPIN_UP_SECONDS = ${n(m.shooter.spinUp)};`);
      C.push('','    // ---- Feeding (every shooter), timed: there is no piece sensor.',
        '    /** From a piece touching an intake to sitting in the shooter; how long a kicker takes to swing back up after an intake. */',`    public static final double TRANSFER_SECONDS = ${n(m.transfer.seconds)}, KICKER_UP_SECONDS = ${n(Mech.liftSeconds(m))};`,
        `    /** For the next piece to move up into the shooter after a shot.${pushers.length?' A pusher pushes for PUSH_SECONDS at the start of every FEED_CYCLE_SECONDS.':''} */`,`    public static final double INDEX_SECONDS = ${n(m.indexer.seconds)}${pushers.length?`, PUSH_SECONDS = ${n(m.indexer.pushSeconds)}`:''};`,
        `    /** A volley of N shots feeds for (N - 1) x FEED_CYCLE_SECONDS + LAST_SHOT_SECONDS. */`,`    public static final double FEED_CYCLE_SECONDS = ${n(pushers.length?Math.max(m.indexer.seconds,2*m.indexer.pushSeconds):m.indexer.seconds)}, LAST_SHOT_SECONDS = ${n(Mech.shootSeconds(m,1))};`,
        ...(feeders.some(x=>!Mech.servoFeeder(x.feeder))?[`    public static final double FEEDER_POWER = ${n(m.indexer.power)};`]:[]),
        `    /** Pieces the robot can hold: ${m.capacity.pollen} pollen${m.capacity.nectar?` and ${m.capacity.nectar} nectar`:''}. "Shoot" with no number shoots this many. */`,`    public static final int STORAGE = ${m.storage};`,
        '    /** The field points shots aim at, in inches: the hive cell up at the start, and the other cell. */',`    public static final double TARGET_X = ${n(target.x)}, TARGET_Y = ${n(target.y)}, OTHER_TARGET_X = ${n(target.x)}, OTHER_TARGET_Y = ${n(144-target.y)};`);
      if(turrets.length)C.push('','    // ---- Turrets: 0 degrees faces the robot\'s front, positive turns counterclockwise (to the robot\'s left).',`    public static final double TURRET_MIN_DEGREES = ${n(m.turret.min)}, TURRET_MAX_DEGREES = ${n(m.turret.max)};`,
        ...(motorTurrets.length?['    /** Encoder ticks per turret degree and the motor power for RUN_TO_POSITION. Zero is where the turret is at INIT. */',`    public static final double TURRET_TICKS_PER_DEGREE = ${n(m.turret.ticksPerDegree)}, TURRET_POWER = 1.0;`]:[]),
        ...(servoTurrets.length?['    /** Servo position facing the front, and turret degrees from servo position 0 to 1. A servo has no feedback, so its angle', '     *  is tracked as it turns at TURRET_DEGREES_PER_SECOND, and it counts as aimed within AIMED_DEGREES of its target. */',`    public static final double TURRET_SERVO_CENTER = ${n(m.turret.servoCenter)}, TURRET_SERVO_DEGREES = ${n(m.turret.servoDegrees)}, TURRET_DEGREES_PER_SECOND = ${n(m.turret.speed)}, AIMED_DEGREES = 2.0;`]:[]));
    }
    // Device fields and setup.
    const type=x=>x.device==='servo'?'Servo':x.role==='flywheel'||x.role==='turret'?'DcMotorEx':'DcMotorSimple';
    const fields=d.map(x=>`    private ${type(x)} ${x.field};`);
    const init=[];
    for(const x of d){
      if(x.role==='roller')init.push(`        ${x.field} = map.get(DcMotorSimple.class, ${x.constant});`,`        ${x.field}.setDirection(direction(${x.constant}_REVERSED));`,`        if (${x.field} instanceof DcMotor) ((DcMotor) ${x.field}).setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.FLOAT);`);
      else if(x.role==='kicker'||x.role==='ramp')init.push(`        ${x.field} = map.get(Servo.class, ${x.constant});`,`        ${x.field}.setPosition(${x.constant}_UP);`);
      else if(x.role==='flywheel')init.push(`        ${x.field} = flywheel(map, ${x.constant}, ${x.constant}_REVERSED);`);
      else if(x.role==='feeder')init.push(...(Mech.servoFeeder(x.feeder)?[`        ${x.field} = map.get(Servo.class, ${x.constant});`,`        ${x.field}.setPosition(${x.constant}_REST);`]:[`        ${x.field} = map.get(DcMotorSimple.class, ${x.constant});`,`        ${x.field}.setDirection(direction(${x.constant}_REVERSED));`]));
      else if(x.role==='turret')init.push(...(x.device==='servo'?[`        ${x.field} = map.get(Servo.class, ${x.constant});`,`        ${x.field}.setPosition(TURRET_SERVO_CENTER);`]:[`        ${x.field} = turretMotor(map, ${x.constant}, ${x.constant}_REVERSED);`]));
    }
    const intakeLines=[...rollers.map(x=>`        ${x.field}.setPower(on ? ${x.constant}_POWER : 0);`),...swings.map(x=>`        ${x.field}.setPosition(on ? ${x.constant}_DOWN : ${x.constant}_UP);`)];
    const spinLines=!flywheels.length?[]:velocity?['        double speed = on ? FLYWHEEL_TICKS_PER_SECOND : 0;',...flywheels.map(x=>`        ${x.field}.setVelocity(speed);`)]:['        double power = on ? FLYWHEEL_POWER : 0;',...flywheels.map(x=>`        ${x.field}.setPower(power);`)];
    const feedLines=feeders.map(x=>x.feeder==='pusher'?`        ${x.field}.setPosition(push ? ${x.constant}_FEED : ${x.constant}_REST);`:x.feeder==='gate'?`        ${x.field}.setPosition(feeding ? ${x.constant}_FEED : ${x.constant}_REST);`:`        ${x.field}.setPower(feeding ? FEEDER_POWER : 0);`);
    const turnLines=turrets.map(x=>`        turn${x.field[0].toUpperCase()+x.field.slice(1)}(degrees);`),aimLines=turrets.map(x=>`        turn${x.field[0].toUpperCase()+x.field.slice(1)}(bearing(pose, ${x.constant}_X, ${x.constant}_Y, x, y));`);
    const turnMethods=turrets.map(x=>{const name='turn'+x.field[0].toUpperCase()+x.field.slice(1);
      return x.device==='servo'?`
    /** Turret ${x.index+1} to an angle (degrees from the robot's front, counterclockwise), within its range. */
    private void ${name}(double degrees) {
        degrees = Math.max(TURRET_MIN_DEGREES, Math.min(TURRET_MAX_DEGREES, degrees));
        trackServoTurrets();
        ${x.field}Degrees = degrees;
        double position = TURRET_SERVO_CENTER + (${x.constant}_REVERSED ? -degrees : degrees) / TURRET_SERVO_DEGREES;
        ${x.field}.setPosition(Math.max(0, Math.min(1, position)));
    }`:`
    /** Turret ${x.index+1} to an angle (degrees from the robot's front, counterclockwise), within its range. */
    private void ${name}(double degrees) {
        degrees = Math.max(TURRET_MIN_DEGREES, Math.min(TURRET_MAX_DEGREES, degrees));
        ${x.field}.setTargetPosition((int) Math.round(degrees * TURRET_TICKS_PER_DEGREE));
        ${x.field}.setMode(DcMotor.RunMode.RUN_TO_POSITION);
        ${x.field}.setPower(TURRET_POWER);
    }`;}).join('\n');
    const aimed=[...motorTurrets.map(x=>`!${x.field}.isBusy()`),...servoTurrets.map(x=>`Math.abs(${x.field}At - ${x.field}Degrees) <= AIMED_DEGREES`)];
    const servos=d.filter(x=>x.device==='servo');
    const shooter=m.shooters.length>0;
    return `package ${options.packageName};

import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorEx;
import com.qualcomm.robotcore.hardware.DcMotorSimple;
import com.qualcomm.robotcore.hardware.HardwareMap;
import com.qualcomm.robotcore.hardware.Servo;
import com.qualcomm.robotcore.util.ElapsedTime;
import ${options.poseImport||'deck.pathing.DeckFollower.Pose'};

/**
 * The mechanisms of "${comment(options.layoutName||'route')}", generated by Deck Driver Station from Setup → Mechanisms.
 * Export rewrites this file: change the settings in Deck, or edit the constants below to match your robot.
 *
 * The route's actions call these methods every loop. None of them waits, so the robot keeps following
 * its path (or holding its pin) while they run:
 *  - Intake: intake(true) runs the rollers at their power and lowers kickers and ramps; intake(false)
 *    stops the rollers and raises them again.${shooter?`
 *  - Spin up: spin(true) starts the flywheels toward their speed${velocity?' (velocity control on the hub: RUN_USING_ENCODER)':' (a set power: no encoder)'}.
 *  - Aim: aim(pose, cell) turns each turret toward the hive cell from the robot's estimated pose.
 *  - Shoot: shoot(n, step) spins up and aims. Once ready() and aimed(), and pieces from the last intake
 *    have had TRANSFER_SECONDS to move up, the feeders run for n shots: the first piece is already in the
 *    shooter, and each next one needs FEED_CYCLE_SECONDS. Then the feeders and flywheels stop.`:`
 *  - No shooter.`}
 * To replace one of these with your own code, override that action in RobotActions.
 *
 * Hardware. Names must match the Control Hub configuration exactly, and "turns the other way" is set
 * in Deck (each device's direction is applied in init):
${[...m.intakes.map(intakeText),...m.shooters.map(shooterText)].join('\n')||' *  - No mechanisms.'}
 * Test every device with the mechanism check TeleOp before running the autonomous.
 */
public class Mechanisms {
${C.join('\n').replace(/\n+$/,'')}

${fields.join('\n')}
    private final ElapsedTime clock = new ElapsedTime();
    private double feedStart = -1, spinStart = -1, lastIntake = -1e9${servoTurrets.length?`, trackedAt = 0${servoTurrets.map(x=>`, ${x.field}Degrees = 0, ${x.field}At = 0`).join('')}`:''};
    private boolean spinning, shot;

    public void init(HardwareMap map) {
${init.join('\n')}
    }

    private static DcMotorSimple.Direction direction(boolean reversed) {
        return reversed ? DcMotorSimple.Direction.REVERSE : DcMotorSimple.Direction.FORWARD;
    }
${flywheels.length?`
    private static DcMotorEx flywheel(HardwareMap map, String name, boolean reversed) {
        DcMotorEx motor = map.get(DcMotorEx.class, name);
        motor.setDirection(direction(reversed));
        motor.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.FLOAT);
        motor.setMode(DcMotor.RunMode.${velocity?'RUN_USING_ENCODER':'RUN_WITHOUT_ENCODER'});${velocity&&m.shooter.pidf?`
        motor.setVelocityPIDFCoefficients(FLYWHEEL_P, FLYWHEEL_I, FLYWHEEL_D, FLYWHEEL_F);`:velocity?`
        // Velocity control uses the SDK's default PIDF. For a heavy flywheel, measure its top speed with the
        // mechanism check (Y) and enter the PIDF it prints in Deck.`:''}
        return motor;
    }
`:''}${motorTurrets.length?`
    private static DcMotorEx turretMotor(HardwareMap map, String name, boolean reversed) {
        DcMotorEx motor = map.get(DcMotorEx.class, name);
        motor.setDirection(direction(reversed));
        motor.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
        // Zero is wherever the turret is now: start the robot with the turret facing forward.
        motor.setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER);
        motor.setTargetPosition(0);
        motor.setMode(DcMotor.RunMode.RUN_TO_POSITION);
        return motor;
    }
`:''}
    /** Intake on or off: rollers run at their power; kickers and ramps go down, and back up when it stops. */
    public void intake(boolean on) {
        if (on) lastIntake = clock.seconds();
${intakeLines.join('\n')}
    }

    /** Flywheels on (toward their speed) or off. */
    public void spin(boolean on) {
        if (on && !spinning) spinStart = clock.seconds();
        spinning = on;
${spinLines.join('\n')}
    }

    /** ${velocity?'True once every flywheel is within AT_SPEED_TOLERANCE of its speed (or SPIN_UP_SECONDS + 0.5 s have passed).':'True once the flywheels have had SPIN_UP_SECONDS.'} */
    public boolean ready() {
        if (!spinning) return false;${!flywheels.length?`
        return true;`:velocity?`
        if (clock.seconds() - spinStart > SPIN_UP_SECONDS + 0.5) return true;
        return ${flywheels.map(x=>`atSpeed(${x.field})`).join(' && ')};`:`
        return clock.seconds() - spinStart >= SPIN_UP_SECONDS;`}
    }
${velocity&&flywheels.length?`
    private static boolean atSpeed(DcMotorEx flywheel) {
        return Math.abs(flywheel.getVelocity() - FLYWHEEL_TICKS_PER_SECOND) < AT_SPEED_TOLERANCE * FLYWHEEL_TICKS_PER_SECOND;
    }
`:''}
    /** Point every turret at a hive cell (0 TARGET, 1 OTHER_TARGET) from this pose. Fixed shooters are aimed by the route. */
    public void aim(Pose pose, int cell) {${turrets.length?`
        double x = cell == 1 ? OTHER_TARGET_X : TARGET_X, y = cell == 1 ? OTHER_TARGET_Y : TARGET_Y;
${aimLines.join('\n')}`:''}
    }

    /** Every turret to this angle, degrees from the robot's front (counterclockwise). The mechanism check uses it. */
    public void turnTurrets(double degrees) {
${turnLines.join('\n')}
    }
${turrets.length?`
    /** Degrees from the robot's front (counterclockwise) to (x, y), from a turret at (dx, dy) on the robot. */
    private static double bearing(Pose pose, double dx, double dy, double x, double y) {
        double c = Math.cos(pose.heading()), s = Math.sin(pose.heading());
        double tx = pose.x() + dx * c - dy * s, ty = pose.y() + dx * s + dy * c;
        double degrees = Math.toDegrees(Math.atan2(y - ty, x - tx) - pose.heading());
        return ((degrees % 360) + 540) % 360 - 180;
    }
${turnMethods}
`:''}
${servoTurrets.length?`    /** Where the servo turrets are by now: each turns toward its target at TURRET_DEGREES_PER_SECOND. */
    private void trackServoTurrets() {
        double now = clock.seconds(), step = (now - trackedAt) * TURRET_DEGREES_PER_SECOND;
        trackedAt = now;
${servoTurrets.map(x=>`        ${x.field}At += Math.max(-step, Math.min(step, ${x.field}Degrees - ${x.field}At));`).join('\n')}
    }

`:''}    /** True once every turret has reached its angle. */
    public boolean aimed() {${servoTurrets.length?`
        trackServoTurrets();`:''}
        return ${aimed.join(' && ')||'true'};
    }

    /** Feeders on or off, for the mechanism check: rollers run, gates open, pushers push. */
    public void feed(boolean on) {
        feeders(on, 0);
    }

    /** The feeders t seconds into a volley: rollers run and gates stay open while feeding${pushers.length?'; a pusher pushes for\n     *  PUSH_SECONDS at the start of every FEED_CYCLE_SECONDS and is back at rest in between, so the next piece can drop in':''}. */
    private void feeders(boolean feeding, double t) {${pushers.length?`
        boolean push = feeding && t % FEED_CYCLE_SECONDS < PUSH_SECONDS;`:''}
${feedLines.join('\n')}
    }

    /** One call of "Shoot N" (count 0: every storage slot). Returns true once all N shots have had time. */
    public boolean shoot(int count, RouteActions.Step step) {${shooter?`
        int want = count > 0 ? count : STORAGE;
        if (step.first) { feedStart = -1; shot = false; }
        if (shot) return true;
        spin(true);
        aim(step.pose, step.cell);
        double now = clock.seconds();
        // Start once spun up and on target, and pieces from the last intake have moved up.
        if (feedStart < 0 && ready() && aimed() && now - lastIntake >= TRANSFER_SECONDS + KICKER_UP_SECONDS) feedStart = now;
        // Shooting for a set time keeps feeding until the route's last call; otherwise long enough for N shots.
        double window = step.duration > 0 ? Double.MAX_VALUE : (want - 1) * FEED_CYCLE_SECONDS + LAST_SHOT_SECONDS;
        boolean feeding = feedStart >= 0 && now - feedStart < window;
        feeders(feeding && !step.last, feedStart >= 0 ? now - feedStart : 0);
        if (feedStart >= 0 && !feeding) shot = true;
        boolean done = shot || step.last;
        if (done) { feeders(false, 0); spin(false); }
        return done;`:`
        return true;`}
    }

    /** Measured flywheel speeds in encoder ticks per second, in the order of flywheels(). */
    public double[] flywheelSpeeds() {
        return new double[] ${list(flywheels.map(x=>`${x.field}.getVelocity()`))};
    }

    /** The flywheel motors and their names, for the mechanism check. */
    public DcMotorEx[] flywheels() {
        return new DcMotorEx[] ${list(flywheels.map(x=>x.field))};
    }

    public static final String[] FLYWHEEL_NAMES = ${list(flywheels.map(x=>x.constant))};

    /** Every servo (kickers, ramps, servo feeders, servo turrets) and its name, for finding positions with the mechanism check. */
    public Servo[] servos() {
        return new Servo[] ${list(servos.map(x=>x.field))};
    }

    public static final String[] SERVO_NAMES = ${list(servos.map(x=>x.constant))};

    public void stop() {
        intake(false);
        feeders(false, 0);
        spin(false);
${motorTurrets.map(x=>`        ${x.field}.setPower(0);`).join('\n')}
    }
}
`.replace(/\n\n\n+/g,'\n\n');
  }
  // The check TeleOp: runs each device the autonomous uses on its own, so names, directions, servo positions and
  // flywheel speed can be checked on the robot before the autonomous runs. mechType is Mechanisms, or
  // Outer.Mechanisms for the single OnBot Java file.
  function checkOpMode(options,h,m,mechType='Mechanisms'){
    // h is null for a drivetrain Deck exports no drive code for (a Pedro swerve robot): the check then has no drive test.
    const name=options.checkName,motors=h?.drive?Object.values(h.drive.motors):[],velocity=!m||m.shooter.control!=='power',d=m?mechanismDevices(m):[];
    const has=role=>d.some(x=>x.role===role),turret=has('turret'),servos=d.some(x=>x.device==='servo');
    return `package ${options.packageName};

import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.eventloop.opmode.TeleOp;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorEx;
import com.qualcomm.robotcore.hardware.DcMotorSimple;
import com.qualcomm.robotcore.hardware.Servo;
import com.qualcomm.robotcore.util.ElapsedTime;

/**
 * Checks the hardware the "${comment(options.layoutName||'route')}" autonomous uses, one device at a time, before you run it.
 * Generated by Deck Driver Station with the autonomous. Put the robot on blocks: the wheels will turn.
 *
 * Hold on gamepad 1:${motors.length?`
 *  - A: each drive wheel in turn, at low power. Each one must turn so the robot would drive FORWARD.`:''}${m?`
 *  - Right bumper: the intake. Pieces must go IN.${m.shooters.length?`
 *  - Left trigger: the flywheels at their shooting speed${velocity?'; telemetry shows the speed each one measures':''}.
 *  - Right trigger: the feeders (a pusher pushes, a gate opens).${velocity?`
 *  - Y: the flywheels at full power for their top speed, and REV's velocity PIDF from it.`:''}`:''}${turret?`
 *  - D-pad left / right / up: the turrets 30 degrees left / right / straight ahead.`:''}${servos?`
 *  - Back: the next servo. Then move the left stick up or down to move it slowly and read its position.`:''}`:''}
 * Anything that turns the wrong way: set "turns the other way" for it in Deck and export again.
 */
@TeleOp(name = ${javaString((options.layoutName||'Planned route')+' check (Deck)')}, group = "Deck Driver Station")
public class ${name} extends LinearOpMode {
    /** The drive motors, in the order A turns them, and which are reversed (as the autonomous sets them). */
    private static final String[] DRIVE = ${names(motors.map(x=>x.name))};
    private static final boolean[] DRIVE_REVERSED = {${motors.map(x=>String(x.mount<0)).join(', ')}};

    @Override
    public void runOpMode() {
        DcMotorEx[] drive = new DcMotorEx[DRIVE.length];
        String missing = "";
        for (int i = 0; i < DRIVE.length; i++) {
            drive[i] = hardwareMap.tryGet(DcMotorEx.class, DRIVE[i]);
            if (drive[i] == null) { missing += " " + DRIVE[i]; continue; }
            drive[i].setDirection(DRIVE_REVERSED[i] ? DcMotorSimple.Direction.REVERSE : DcMotorSimple.Direction.FORWARD);
            drive[i].setMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER);
        }${m?`
        ${mechType} mech = new ${mechType}();
        String mechProblem = "";
        try {
            mech.init(hardwareMap);
        } catch (IllegalArgumentException e) {
            mechProblem = e.getMessage();
            mech = null;
        }`:''}
        telemetry.addLine("Robot on blocks? Press START, then hold a button (see the list in the file).");
        if (!missing.isEmpty()) telemetry.addLine("Not in the robot configuration:" + missing);${m?`
        if (mech == null) telemetry.addLine("Mechanisms: " + mechProblem);`:''}
        telemetry.update();
        waitForStart();
        ElapsedTime wheels = new ElapsedTime();${m?`
        boolean intaking = false, spinning = false, feeding = false, measuring = false, back = false;
        int turret = 0, servo = 0;
        double top = 0;
        ElapsedTime loop = new ElapsedTime();`:''}
        while (opModeIsActive()) {${motors.length?`
            // A: one drive wheel at a time, 1.5 s each.
            int wheel = gamepad1.a ? (int) (wheels.seconds() / 1.5) % DRIVE.length : -1;
            if (!gamepad1.a) wheels.reset();
            for (int i = 0; i < DRIVE.length; i++) if (drive[i] != null) drive[i].setPower(i == wheel ? 0.3 : 0);
            telemetry.addData("Drive", wheel < 0 ? "hold A" : DRIVE[wheel] + " should turn the robot FORWARD");`:''}${m?`
            if (mech != null) {
                // Each test starts and stops when its button changes, so the servo finder can move servos in between.
                if (gamepad1.right_bumper != intaking) { intaking = gamepad1.right_bumper; mech.intake(intaking); }
                telemetry.addData("Intake", intaking ? "running: pieces should go IN" : "hold right bumper");${m.shooters.length?`
                boolean spin = gamepad1.left_trigger > 0.5;
                if (spin != spinning && !measuring) { spinning = spin; mech.spin(spinning); }
                double[] speeds = mech.flywheelSpeeds();
                String measured = "";
                for (int i = 0; i < speeds.length; i++) measured += String.format("%s %.0f  ", ${mechType}.FLYWHEEL_NAMES[i], speeds[i]);
                telemetry.addData("Flywheels", spinning ? ${velocity?`String.format("target %.0f ticks/s, %s", ${mechType}.FLYWHEEL_TICKS_PER_SECOND, mech.ready() ? "at speed" : "spinning up")`:`String.format("power %.2f", ${mechType}.FLYWHEEL_POWER)`} : "hold left trigger");
                telemetry.addData("Measured ticks/s", measured);
                boolean feed = gamepad1.right_trigger > 0.5;
                if (feed != feeding) { feeding = feed; mech.feed(feeding); }
                telemetry.addData("Feeders", feeding ? "feeding" : "hold right trigger");${velocity?`
                // Y: full power without velocity control; the highest speed seen is the top speed.
                if (gamepad1.y && !measuring) {
                    measuring = true;
                    top = 0;
                    for (DcMotorEx f : mech.flywheels()) { f.setMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER); f.setPower(1); }
                } else if (!gamepad1.y && measuring) {
                    measuring = false;
                    for (DcMotorEx f : mech.flywheels()) { f.setPower(0); f.setMode(DcMotor.RunMode.RUN_USING_ENCODER); }
                    spinning = false;
                }
                if (measuring) for (double v : speeds) top = Math.max(top, Math.abs(v));
                if (top > 0) {
                    double f = 32767 / top, p = 0.1 * f, i = 0.1 * p;
                    telemetry.addData("Top speed", "%.0f ticks/s (hold Y for 3 s on a full battery)", top);
                    telemetry.addData("Velocity PIDF for Deck", "P %.3f  I %.4f  D 0  F %.3f", p, i, f);
                }`:''}`:''}${turret?`
                if (gamepad1.dpad_left && turret != 30) { turret = 30; mech.turnTurrets(30); }
                if (gamepad1.dpad_right && turret != -30) { turret = -30; mech.turnTurrets(-30); }
                if (gamepad1.dpad_up && turret != 0) { turret = 0; mech.turnTurrets(0); }
                telemetry.addData("Turrets", "%d degrees (%s)", turret, mech.aimed() ? "there" : "turning");`:''}${servos?`
                // Back picks the next servo; the left stick moves it 0.3 of its range per second.
                Servo[] servos = mech.servos();
                if (gamepad1.back && !back) servo = (servo + 1) % servos.length;
                back = gamepad1.back;
                double dt = loop.seconds();
                if (Math.abs(gamepad1.left_stick_y) > 0.1) servos[servo].setPosition(Math.max(0, Math.min(1, servos[servo].getPosition() - gamepad1.left_stick_y * 0.3 * dt)));
                telemetry.addData("Servo (back: next)", "%s at %.3f", ${mechType}.SERVO_NAMES[servo], servos[servo].getPosition());`:''}
            }
            loop.reset();`:''}
            telemetry.update();
        }
        for (DcMotorEx motor : drive) if (motor != null) motor.setPower(0);${m?`
        if (mech != null) mech.stop();`:''}
    }
}
`;}
  // Every TeamCode file for the Control Hub, keyed by path under TeamCode/src/main/java. RobotActions
  // is listed in keep: it is written only when it does not exist yet.
  function files({route,layout,tuning,robot,localization,setupName,packageName='org.firstinspires.ftc.teamcode',className='PlannedRoute',routeJava,mechanisms=null,target=null,exporter=globalThis.DeckSimExport||require('./sim-export.js')}){
    const h=hardware(robot,localization),dir=packageName.replace(/\./g,'/'),opModeName=className+'Auto',mech=mechanisms?.enabled?mechanisms:null,options={packageName,className,opModeName,layoutName:layout.name,setupName,exporter,mechanisms:mech},list=exporter.actions(route);
    if(mech)h.mechanisms=mechanismHardware(mech);
    // Older callers export geometry before passing the measured robot tuning. Resolve inherited
    // power here as well, so generated code and the virtual follower use the same default.
    const powers=exporter.legs(route).map(l=>n(l.power??route.defaultPower??tuning.maxPathSpeed??.8)).join(', ');
    routeJava=routeJava.replace(/public static final double\[\] MOTOR_POWER = \{[^}]*\}/,`public static final double[] MOTOR_POWER = {${powers}}`);
    const core=(globalThis.DeckFollowerSource||(typeof require==='function'?require('./sim-follower-source.js'):''));if(!core)throw Error('The bundled Deck controller source is missing.');
    const out={[`${dir}/${className}.java`]:routeJava,[`${dir}/${opModeName}.java`]:opMode(options),[`${dir}/RouteActions.java`]:routeActions(options,list),[`${dir}/RobotActions.java`]:robotActions(options,list),[`${dir}/drive/Constants.java`]:constants(h,tuning,options),[`${dir}/drive/RobotDrive.java`]:robotDrive(h,options),['deck/pathing/DeckFollower.java']:core};
    if(mech)out[`${dir}/Mechanisms.java`]=mechanismsSource(options,mech,target||{x:72,y:72},{length:robot?.length,width:robot?.width});
    // The check TeleOp tests the drive motors and every mechanism device on the robot before the autonomous runs.
    const checkName=className+'Check',check=`${dir}/${checkName}.java`;out[check]=checkOpMode({...options,checkName},h,mech);
    return {files:out,keep:[`${dir}/RobotActions.java`],opMode:`${packageName}.${opModeName}`,check:{path:check,opMode:`${packageName}.${checkName}`},hardware:h,actions:list};
  }
  // One SDK-only .java file for OnBot Java: controller, route, wiring and action slots
  // are nested in its OpMode. No external library upload or Android Studio project is needed.
  function onBotJava(options){
    options={...options,packageName:options.packageName||'org.firstinspires.ftc.teamcode'};
    const out=files(options),packageName=options.packageName,name=out.opMode.split('.').at(-1),imports=new Set(),nested=[];let outer='';
    for(const [file,source]of Object.entries(out.files)){
      if(file===out.check.path)continue;
      for(const m of source.matchAll(/^import\s+([^;]+);/gm))if(!m[1].startsWith('deck.pathing.')&&!m[1].startsWith(packageName+'.'))imports.add(m[1]);
      const declaration=/\bpublic\s+((?:(?:abstract|final)\s+)*)class\s+(\w+)([^\{]*)\{/.exec(source);if(!declaration)throw Error('Cannot combine '+file);
      const className=declaration[2],body=source.slice(declaration.index+declaration[0].length,source.lastIndexOf('}'));
      // Qualify Java type tokens, preserving action names, notes and other string literals.
      const qualify=text=>text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\n]*|\/\*[\s\S]*?\*\/|\b(Pose|Point|Path|Paths|Interpolator|Config|Drivetrain|Localizer|MotionState|Velocity|DrivePowers)\b/g,(token,type)=>type?'DeckFollower.'+type:token).replace(/DeckFollower\.DeckFollower\./g,'DeckFollower.');
      if(className===name){const annotation=source.slice(source.indexOf('@Autonomous'),declaration.index);outer=annotation+`public class ${name}${declaration[3]}{`+qualify(body);}
      else nested.push(`    public static ${declaration[1]}class ${className}${className==='DeckFollower'?declaration[3]:qualify(declaration[3])}{\n${className==='DeckFollower'?body:qualify(body)}\n    }`);
    }
    const source=`package ${packageName};\n\n${[...imports].sort().map(i=>'import '+i+';').join('\n')}\n\n/** Upload this file to OnBot Java, match the robot hardware names and IMU mounting,\n * then Build Everything. Select this autonomous on the Driver Station and INIT/START.\n * All driving code is included. The intake and shooter set up in Deck run in Mechanisms;\n * write anything else (or your own version of an action) in RobotActions.\n * Calibrate wheel travel, pod offsets and control gains on the actual robot.\n */\n${outer}\n${nested.join('\n\n')}\n}\n`;
    // The check TeleOp is its own file (an OpMode cannot be nested) and uses this file's Mechanisms.
    const dir=packageName.replace(/\./g,'/'),checkName=out.check.opMode.split('.').at(-1),mech=options.mechanisms?.enabled?options.mechanisms:null;
    const check={name:checkName+'.java',source:checkOpMode({packageName,layoutName:options.layout.name,setupName:options.setupName,checkName},out.hardware,mech,name+'.Mechanisms'),opMode:out.check.opMode};
    return {name:name+'.java',source,opMode:out.opMode,check,files:{[dir+'/'+name+'.java']:source,[dir+'/'+check.name]:check.source},hardware:out.hardware};
  }
  // What a Control Hub export proves and what the team still has to do (shown with the export).
  function checklist({mechanisms=null,actions=[]}={}){
    return [
      {status:'verified',label:'Compiles',detail:'Deck’s export check compiles OnBot Java and TeamCode output against FTC SDK 12.0.0 (tools/simulation/check-ftc-sdk.cjs).'},
      {status:'verified',label:'Runs in simulation',detail:'Run & review → Program → OnBot Java export runs this exact file on the virtual Control Hub with simulated motors, sensors and physics.'},
      {status:'team',label:'Hardware names',detail:'Motor, IMU and sensor names, motor directions and IMU mounting must match your Control Hub configuration. Send to robot checks the names against it.'},
      {status:'calibration',label:'Calibration',detail:'Wheel travel, pod offsets and the generated gains are starting values. Check them on your robot.'},
      {status:'team',label:'Actions',detail:actions.length?(mechanisms?'Mechanisms.java drives the intake and shooter set up in Deck. Run the check TeleOp first: it tests every device, its direction, servo positions and flywheel speed. Other actions need code in RobotActions.java.':'Write the code for each action in RobotActions.java; until then they finish at once.'):'No actions in this route.'},
      {status:'physical',label:'Real-world test',detail:'Drive it on a practice field at low power first. Simulation and compilation do not prove the robot will follow the path.'}
    ];
  }
  return {checklist,hardware,hardwareIfSupported,deviceSlots,robotNeeds,files,onBotJava,mechanismDevices,mechanismHardware,mechanismAction,routeActions,robotActions,mechanismsSource,checkOpMode,SUPPORTED,MOTORS,TANK,ticksPerRev};
});
