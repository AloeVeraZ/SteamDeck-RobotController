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
    return {localization,imu:'imu',hub:{logo:mount.hubLogo.toUpperCase(),usb:mount.hubUsb.toUpperCase()},drive:{kind:tank?'tank':'mecanum',ticksPerInch:ticksPerRev(rpm)/inches,ticksPerRev:ticksPerRev(rpm),halfLength:robot.length/2,halfWidth:robot.width/2,motors:drivetrain==='tank2'?DIFF:MOTORS},
      pods:(PODS[localization]||[]).map(p=>({...p,ticksPerInch:POD_TICKS_PER_INCH})),...(localization==='fused'?{pinpoint:'pinpoint'}:{}),...(localization==='optical'?{otos:'sensor_otos'}:{})};
  }
  // Java double literals: Java numeric literals retain a decimal point for generated calibration constants.
  const n=v=>{const s=String(Number(Number(v).toPrecision(6)));return /[.eE]/.test(s)?s:s+'.0';};
  const comment=s=>String(s||'').replace(/\*\//g,'* /').replace(/\\(?=u)/g,'\\ ').replace(/[\r\n]+/g,' ').trim();
  const javaString=s=>'"'+String(s).replace(/[\\"]/g,c=>'\\'+c).replace(/[\u0000-\u001f]/g,'')+'"';
  const names=list=>`new String[] {${list.map(javaString).join(', ')}}`;
  // The same application-owned controller is exported to the robot. Only this adapter
  // depends on the FTC SDK: hardware names, encoder geometry, sensor frames and motor mixing.
  function constants(h,t,options){return `package ${options.packageName}.drive;
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
${motors.map(([key,m],i)=>`        motors[${i}]=map.get(DcMotorEx.class, "${m.name}"); motors[${i}].setDirection(DcMotorSimple.Direction.${m.mount<0?'REVERSE':'FORWARD'});`).join('\n')}
        for(DcMotorEx m:motors){m.setMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER);m.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);}
${pods.map((p,i)=>`        pods[${i}]=map.get(DcMotorEx.class,"${p.name}");`).join('\n')}
        imu=map.get(IMU.class,"${h.imu}");
        // How the Control Hub is mounted (Deck: Setup → Robot controller). If this is wrong, every turn and heading is wrong.
        imu.initialize(new IMU.Parameters(new RevHubOrientationOnRobot(RevHubOrientationOnRobot.LogoFacingDirection.${h.hub.logo},RevHubOrientationOnRobot.UsbFacingDirection.${h.hub.usb})));
        pinpoint=${h.localization==='fused'?`map.get(GoBildaPinpointDriver.class,"${h.pinpoint}")`:'null'};
        otos=${h.localization==='optical'?`map.get(SparkFunOTOS.class,"${h.otos}")`:'null'};
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
        telemetry.addData("x", p.x());
        telemetry.addData("y", p.y());
        telemetry.addData("heading", Math.toDegrees(p.heading()));
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
${list.map(a=>`            case ${javaString(a.name)}: return ${a.slot}(step);\n`).join('')}            default: return true;
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
    // Example: private DcMotorEx intake;

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
  // The virtual Control Hub's mechanism ports for these settings.
  function mechanismHardware(m){
    const out={},rollers=m.intakes.filter(i=>i.kind!=='kicker'),kickers=m.intakes.filter(i=>i.kind==='kicker');if(rollers.length)out.intakes=rollers.map(i=>i.motor);
    if(kickers.length)out.kickers=kickers.map(i=>({name:i.servo,down:i.downPos,up:i.upPos}));
    const ramps=m.intakes.filter(i=>i.kind==='ramp');if(ramps.length)out.ramps=ramps.map(i=>({name:i.servo,down:i.downPos,up:i.upPos}));
    // A shooter on the first one's turret has no turret motor of its own.
    if(m.shooters.length)out.shooters=m.shooters.map(s=>({flywheel:{name:s.motor,ticksPerSecond:m.shooter.rpm*m.shooter.ticksPerRev/60},indexer:{name:s.indexer,kind:s.indexerKind},...(s.type==='turret'&&!s.sharesTurret?{turret:{name:s.turretMotor,ticksPerDegree:m.turret.ticksPerDegree}}:{})}));
    return out;
  }
  function mechanismsSource(options,m,target,robot={}){
    const Mech=globalThis.DeckMechanisms||require('./sim-mechanisms.js'),shooter=m.shooters.length>0,turret=m.shooters.some(s=>s.type==='turret'),fixed=m.shooters.some(s=>s.type==='fixed'),flywheel=m.shooter.rpm*m.shooter.ticksPerRev/60;
    const list=values=>values.length?`{${values.join(', ')}}`:'{}',where=mount=>Mech.MOUNTS[mount].toLowerCase();
    const describe=(s,i)=>` *  - Shooter ${i+1} (${Mech.PIECES[s.pieces].toLowerCase()}): ${s.sharesTurret?`on shooter 1's turret (turret motor "${comment(s.turretMotor)}")`:s.type==='turret'?`turret at the ${where(s.mount)}, turret motor "${comment(s.turretMotor)}"`:`fixed at the ${where(s.mount)}, firing toward the ${s.facing}`}; flywheel "${comment(s.motor)}", indexer ${s.indexerKind==='crservo'?'continuous servo':'motor'} "${comment(s.indexer)}".`;
    return `package ${options.packageName};

import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorEx;
import com.qualcomm.robotcore.hardware.DcMotorSimple;
import com.qualcomm.robotcore.hardware.Servo;
import com.qualcomm.robotcore.hardware.HardwareMap;
import com.qualcomm.robotcore.util.ElapsedTime;
import ${options.poseImport||'deck.pathing.DeckFollower.Pose'};

/**
 * The mechanisms of "${comment(options.layoutName||'route')}", generated by Deck Driver Station from its Mechanisms
 * settings. Export rewrites this file: change the settings in the simulator, or edit the constants
 * below to match your robot. Device names must match the Control Hub configuration.
 *  - ${m.intakes.length?`Intakes: ${m.intakes.map(i=>i.kind==='kicker'?`kicker servo "${comment(i.servo)}" (${i.sides.join(' + ')})`:i.kind==='ramp'?`ramp servo "${comment(i.servo)}" with roller motor "${comment(i.motor)}" (${i.sides.join(' + ')})`:`motor "${comment(i.motor)}" (${i.sides.join(' + ')})`).join(', ')}. Motors run at INTAKE_POWERS while an Intake action runs; kickers swing to KICKER_DOWN then, and back to KICKER_UP after; ramps fold to RAMP_DOWN then, and back to RAMP_UP after.`:'No intake: the robot shoots the pieces it starts with.'}
${shooter?m.shooters.map(describe).join('\n')+`
 *  - Flywheels use velocity control (RUN_USING_ENCODER); at speed they turn FLYWHEEL_TICKS_PER_SECOND
 *    (${n(m.shooter.rpm)} RPM x ${n(m.shooter.ticksPerRev)} encoder ticks per revolution / 60).${turret?`
 *  - Turrets use RUN_TO_POSITION. Zero is facing the robot's front at INIT; positive turns
 *    counterclockwise (to the robot's left). They aim at TARGET from the robot's pose.`:''}${fixed?`
 *  - Fixed shooters: the route turns the robot so they face TARGET before each Shoot.`:''}
 * Timing, with no piece sensor: a piece takes up to TRANSFER_SECONDS from touching an intake to sitting in
 * the shooter, and INDEX_SECONDS to move up into the shooter after the one ahead of it is shot; a piece in
 * the shooter fires as soon as the flywheel is at speed and the shooter is on target. Shooters spin up, aim
 * and feed together. "Shoot N" waits TRANSFER_SECONDS after the last intake, then runs the indexer for N
 * shots ((N - 1) x INDEX_SECONDS plus a moment for the last one). "Shoot" with no number shoots once for
 * every storage slot (STORAGE).`:' *  - No shooter.'}
 */
public class Mechanisms {
    public static final String[] INTAKE_MOTORS = ${list(m.intakes.filter(i=>i.kind!=='kicker').map(i=>javaString(i.motor)))};
    public static final double[] INTAKE_POWERS = ${list(m.intakes.filter(i=>i.kind!=='kicker').map(i=>n(i.power)))};
    /** Kicker servos and their positions down (scooping) and up (carrying in); KICKER_UP_SECONDS to swing back up. */
    public static final String[] KICKER_SERVOS = ${list(m.intakes.filter(i=>i.kind==='kicker').map(i=>javaString(i.servo)))};
    public static final double[] KICKER_DOWN = ${list(m.intakes.filter(i=>i.kind==='kicker').map(i=>n(i.downPos)))}, KICKER_UP = ${list(m.intakes.filter(i=>i.kind==='kicker').map(i=>n(i.upPos)))};
    public static final double KICKER_UP_SECONDS = ${n(Mech.liftSeconds(m))};
    /** Ramp servos and their positions down (picking up, rollers running) and up (folded in). */
    public static final String[] RAMP_SERVOS = ${list(m.intakes.filter(i=>i.kind==='ramp').map(i=>javaString(i.servo)))};
    public static final double[] RAMP_DOWN = ${list(m.intakes.filter(i=>i.kind==='ramp').map(i=>n(i.downPos)))}, RAMP_UP = ${list(m.intakes.filter(i=>i.kind==='ramp').map(i=>n(i.upPos)))};
    public static final String[] FLYWHEEL_MOTORS = ${list(m.shooters.map(s=>javaString(s.motor)))}, INDEXERS = ${list(m.shooters.map(s=>javaString(s.indexer)))};
    /** Each shooter's turret motor, or null for a fixed shooter (or one on the first shooter's turret). */
    public static final String[] TURRET_MOTORS = ${list(m.shooters.map(s=>s.type==='turret'&&!s.sharesTurret?javaString(s.turretMotor):'null'))};
    /** Where each turret turns, inches forward and left of the robot's center: each aims from its own spot. */
    public static final double[] TURRET_X = ${list(m.shooters.map(s=>n(Mech.mountOffset(s.mount,robot)[0])))}, TURRET_Y = ${list(m.shooters.map(s=>n(Mech.mountOffset(s.mount,robot)[1])))};
    public static final double TRANSFER_SECONDS = ${n(m.transfer.seconds)}, INDEX_SECONDS = ${n(m.indexer.seconds)}, INDEXER_POWER = ${n(m.indexer.power)}, FIRE_MARGIN_SECONDS = ${n(Mech.FIRE_MARGIN)};
    public static final double FLYWHEEL_TICKS_PER_SECOND = ${n(flywheel)}, SPIN_UP_SECONDS = ${n(m.shooter.spinUp)};
    /** Pieces the robot can hold: ${m.capacity.pollen} pollen${m.capacity.nectar?` and ${m.capacity.nectar} nectar`:''}. */
    public static final int STORAGE = ${m.storage};
    /** The field points shots aim at, in inches: the hive cell up at the start, and the other cell. */
    public static final double TARGET_X = ${n(target.x)}, TARGET_Y = ${n(target.y)}, OTHER_TARGET_X = ${n(target.x)}, OTHER_TARGET_Y = ${n(144-target.y)};
    public static final double TURRET_TICKS_PER_DEGREE = ${n(m.turret.ticksPerDegree)}, TURRET_MIN_DEGREES = ${n(m.turret.min)}, TURRET_MAX_DEGREES = ${n(m.turret.max)}, TURRET_POWER = 1.0;

    private final DcMotorEx[] intakes = new DcMotorEx[INTAKE_MOTORS.length];
    private final Servo[] kickers = new Servo[KICKER_SERVOS.length];
    private final Servo[] ramps = new Servo[RAMP_SERVOS.length];
    private final DcMotorEx[] flywheels = new DcMotorEx[FLYWHEEL_MOTORS.length];
    private final DcMotorSimple[] indexers = new DcMotorSimple[INDEXERS.length];
    private final DcMotorEx[] turrets = new DcMotorEx[TURRET_MOTORS.length];
    private final ElapsedTime clock = new ElapsedTime();
    private double feedStart = -1, spinStart = -1, lastIntake = -1e9;
    private boolean spinning, shot;

    public void init(HardwareMap map) {
        for (int i = 0; i < intakes.length; i++) {
            intakes[i] = map.get(DcMotorEx.class, INTAKE_MOTORS[i]);
            intakes[i].setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.FLOAT);
        }
        for (int i = 0; i < kickers.length; i++) {
            kickers[i] = map.get(Servo.class, KICKER_SERVOS[i]);
            kickers[i].setPosition(KICKER_UP[i]);
        }
        for (int i = 0; i < ramps.length; i++) {
            ramps[i] = map.get(Servo.class, RAMP_SERVOS[i]);
            ramps[i].setPosition(RAMP_UP[i]);
        }
        for (int i = 0; i < flywheels.length; i++) {
            indexers[i] = map.get(DcMotorSimple.class, INDEXERS[i]);
            flywheels[i] = map.get(DcMotorEx.class, FLYWHEEL_MOTORS[i]);
            flywheels[i].setMode(DcMotor.RunMode.RUN_USING_ENCODER);
            flywheels[i].setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.FLOAT);
            if (TURRET_MOTORS[i] == null) continue;
            turrets[i] = map.get(DcMotorEx.class, TURRET_MOTORS[i]);
            turrets[i].setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
            turrets[i].setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER);
            turrets[i].setTargetPosition(0);
            turrets[i].setMode(DcMotor.RunMode.RUN_TO_POSITION);
        }
    }

    public void intake(boolean on) {
        if (on && (intakes.length > 0 || kickers.length > 0)) lastIntake = clock.seconds();
        for (int i = 0; i < intakes.length; i++) intakes[i].setPower(on ? INTAKE_POWERS[i] : 0);
        for (int i = 0; i < kickers.length; i++) kickers[i].setPosition(on ? KICKER_DOWN[i] : KICKER_UP[i]);
        for (int i = 0; i < ramps.length; i++) ramps[i].setPosition(on ? RAMP_DOWN[i] : RAMP_UP[i]);
    }

    /** Flywheels on (to FLYWHEEL_TICKS_PER_SECOND) or off. */
    public void spin(boolean on) {
        if (on && !spinning) spinStart = clock.seconds();
        spinning = on;
        for (DcMotorEx flywheel : flywheels) flywheel.setVelocity(on ? FLYWHEEL_TICKS_PER_SECOND : 0);
    }

    /** Every flywheel is within 5% of its speed (or has had SPIN_UP_SECONDS plus half a second). */
    public boolean ready() {
        if (!spinning) return false;
        if (clock.seconds() - spinStart > SPIN_UP_SECONDS + 0.5) return true;
        for (DcMotorEx flywheel : flywheels) if (Math.abs(flywheel.getVelocity() - FLYWHEEL_TICKS_PER_SECOND) >= 0.05 * FLYWHEEL_TICKS_PER_SECOND) return false;
        return true;
    }

    /** Point every turret at a cell (0 TARGET, 1 OTHER_TARGET) from this pose. Fixed shooters are aimed by the route. */
    public void aim(Pose pose, int cell) {
        double x = cell == 1 ? OTHER_TARGET_X : TARGET_X, y = cell == 1 ? OTHER_TARGET_Y : TARGET_Y, c = Math.cos(pose.heading()), s = Math.sin(pose.heading());
        for (int i = 0; i < turrets.length; i++) {
            DcMotorEx turret = turrets[i];
            if (turret == null) continue;
            double tx = pose.x() + TURRET_X[i] * c - TURRET_Y[i] * s, ty = pose.y() + TURRET_X[i] * s + TURRET_Y[i] * c;
            double degrees = Math.toDegrees(Math.atan2(y - ty, x - tx) - pose.heading());
            degrees = ((degrees % 360) + 540) % 360 - 180;
            degrees = Math.max(TURRET_MIN_DEGREES, Math.min(TURRET_MAX_DEGREES, degrees));
            turret.setTargetPosition((int) Math.round(degrees * TURRET_TICKS_PER_DEGREE));
            turret.setMode(DcMotor.RunMode.RUN_TO_POSITION);
            turret.setPower(TURRET_POWER);
        }
    }

    public boolean aimed() {
        for (DcMotorEx turret : turrets) if (turret != null && turret.isBusy()) return false;
        return true;
    }

    private void feed(boolean on) {
        for (DcMotorSimple indexer : indexers) indexer.setPower(on ? INDEXER_POWER : 0);
    }

    /** One call of "Shoot N" (count 0: every storage slot). Returns true once all N shots have had time. */
    public boolean shoot(int count, RouteActions.Step step) {
        int want = count > 0 ? count : STORAGE;
        if (step.first) { feedStart = -1; shot = false; }
        if (shot) return true;
        spin(true);
        aim(step.pose, step.cell);
        double now = clock.seconds();
        // Start once spun up and on target, and pieces from the last intake have moved up.
        if (feedStart < 0 && ready() && aimed() && now - lastIntake >= TRANSFER_SECONDS + KICKER_UP_SECONDS) feedStart = now;
        // Shooting for a set time keeps feeding until the route's last call; otherwise long enough for N shots.
        double window = step.duration > 0 ? Double.MAX_VALUE : (want - 1) * INDEX_SECONDS + FIRE_MARGIN_SECONDS;
        boolean feeding = feedStart >= 0 && now - feedStart < window;
        feed(feeding && !step.last);
        if (feedStart >= 0 && !feeding) shot = true;
        boolean done = shot || step.last;
        if (done) { feed(false); spin(false); }
        return done;
    }

    public void stop() {
        intake(false);
        feed(false);
        spin(false);
        for (DcMotorEx turret : turrets) if (turret != null) turret.setPower(0);
    }
}
`;
  }
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
    return {files:out,keep:[`${dir}/RobotActions.java`],opMode:`${packageName}.${opModeName}`,hardware:h,actions:list};
  }
  // One SDK-only .java file for OnBot Java: controller, route, wiring and action slots
  // are nested in its OpMode. No external library upload or Android Studio project is needed.
  function onBotJava(options){
    options={...options,packageName:options.packageName||'org.firstinspires.ftc.teamcode'};
    const out=files(options),packageName=options.packageName,name=out.opMode.split('.').at(-1),imports=new Set(),nested=[];let outer='';
    for(const [file,source]of Object.entries(out.files)){
      for(const m of source.matchAll(/^import\s+([^;]+);/gm))if(!m[1].startsWith('deck.pathing.')&&!m[1].startsWith(packageName+'.'))imports.add(m[1]);
      const declaration=/\bpublic\s+((?:(?:abstract|final)\s+)*)class\s+(\w+)([^\{]*)\{/.exec(source);if(!declaration)throw Error('Cannot combine '+file);
      const className=declaration[2],body=source.slice(declaration.index+declaration[0].length,source.lastIndexOf('}'));
      // Qualify Java type tokens, preserving action names, notes and other string literals.
      const qualify=text=>text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\n]*|\/\*[\s\S]*?\*\/|\b(Pose|Point|Path|Paths|Interpolator|Config|Drivetrain|Localizer|MotionState|Velocity|DrivePowers)\b/g,(token,type)=>type?'DeckFollower.'+type:token).replace(/DeckFollower\.DeckFollower\./g,'DeckFollower.');
      if(className===name){const annotation=source.slice(source.indexOf('@Autonomous'),declaration.index);outer=annotation+`public class ${name}${declaration[3]}{`+qualify(body);}
      else nested.push(`    public static ${declaration[1]}class ${className}${className==='DeckFollower'?declaration[3]:qualify(declaration[3])}{\n${className==='DeckFollower'?body:qualify(body)}\n    }`);
    }
    const source=`package ${packageName};\n\n${[...imports].sort().map(i=>'import '+i+';').join('\n')}\n\n/** Upload this file to OnBot Java, match the robot hardware names and IMU mounting,\n * then Build Everything. Select this autonomous on the Driver Station and INIT/START.\n * All driving code is included. Fill in RobotActions for your intake/launcher/servos.\n * Calibrate wheel travel, pod offsets and control gains on the actual robot.\n */\n${outer}\n${nested.join('\n\n')}\n}\n`;
    return {name:name+'.java',source,opMode:out.opMode,files:{[packageName.replace(/\./g,'/')+'/'+name+'.java']:source},hardware:out.hardware};
  }
  // What a Control Hub export proves and what the team still has to do (shown with the export).
  function checklist({mechanisms=null,actions=[]}={}){
    return [
      {status:'verified',label:'Compiles',detail:'Deck’s export check compiles OnBot Java and TeamCode output against FTC SDK 12.0.0 (tools/simulation/check-ftc-sdk.cjs).'},
      {status:'verified',label:'Runs in simulation',detail:'Run & review → Program → OnBot Java export runs this exact file on the virtual Control Hub with simulated motors, sensors and physics.'},
      {status:'team',label:'Hardware names',detail:'Motor, IMU and sensor names, motor directions and IMU mounting must match your Control Hub configuration.'},
      {status:'calibration',label:'Calibration',detail:'Wheel travel, pod offsets and the generated gains are starting values. Check them on your robot.'},
      {status:'team',label:'Actions',detail:actions.length?(mechanisms?'Mechanisms.java drives the intake/shooter set up in Deck; check device names and directions. Other actions need code in RobotActions.java.':'Write the code for each action in RobotActions.java; until then they finish at once.'):'No actions in this route.'},
      {status:'physical',label:'Real-world test',detail:'Drive it on a practice field at low power first. Simulation and compilation do not prove the robot will follow the path.'}
    ];
  }
  return {checklist,hardware,files,onBotJava,mechanismHardware,mechanismAction,routeActions,robotActions,mechanismsSource,SUPPORTED,MOTORS,TANK,ticksPerRev};
});
