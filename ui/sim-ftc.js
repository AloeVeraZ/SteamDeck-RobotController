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
    return {localization,imu:'imu',drive:{kind:tank?'tank':'mecanum',ticksPerInch:ticksPerRev(rpm)/inches,ticksPerRev:ticksPerRev(rpm),halfLength:robot.length/2,halfWidth:robot.width/2,motors:drivetrain==='tank2'?DIFF:MOTORS},
      pods:(PODS[localization]||[]).map(p=>({...p,ticksPerInch:POD_TICKS_PER_INCH})),...(localization==='fused'?{pinpoint:'pinpoint'}:{}),...(localization==='optical'?{otos:'sensor_otos'}:{})};
  }
  // Java double literals: Java numeric literals retain a decimal point for generated calibration constants.
  const n=v=>{const s=String(Number(Number(v).toPrecision(6)));return /[.eE]/.test(s)?s:s+'.0';};
  const comment=s=>String(s||'').replace(/\*\//g,'* /').replace(/[\r\n]+/g,' ').trim();
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
        config.maxPathSpeed=${n(t.maxPathSpeed??.6)};
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
        imu.initialize(new IMU.Parameters(new RevHubOrientationOnRobot(RevHubOrientationOnRobot.LogoFacingDirection.UP,RevHubOrientationOnRobot.UsbFacingDirection.FORWARD)));
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
                boolean through = i + 1 < legs.length && ${R}.WAIT_SECONDS[i] == 0 && ${R}.ACTIONS[i].isEmpty() && Double.isNaN(${R}.TURN_AFTER[i]) && DeckFollower.continuous(legs[i],legs[i+1]);
                while (opModeIsActive() && follower.following()) {
                    follower.update();
                    if (!moving.isEmpty() && !movingDone) {
                        movingDone = act(moving, movingTimer.seconds(), movingFirst, false, true, ${R}.PIN[i]);
                        movingFirst = false;
                    }
                    report(i, legs.length, moving.isEmpty() ? "Driving" : "Action path");
                    if (through && follower.remainingDistance() < 1.5 && near(legs[i].endPose(),1.5)) break;
                }
                boolean pathEnds = i == legs.length - 1 || ${R}.PATH[i + 1] != movingPath || ${R}.MOVING_ACTIONS[i + 1].isEmpty();
                if (!moving.isEmpty() && pathEnds) {
                    // The path is over: one last call so the action can stop its mechanisms.
                    if (!movingDone) act(moving, movingTimer.seconds(), movingFirst, true, true, ${R}.PIN[i]);
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
                // The pin's action runs until it reports done; the robot leaves once the pause is also over.
                String action = ${R}.ACTIONS[i];
                boolean done = action.isEmpty(), first = true;
                timer.reset();
                while (opModeIsActive() && (timer.seconds() < ${R}.WAIT_SECONDS[i] || !done)) {
                    follower.update();
                    if (!done) {
                        done = act(action, timer.seconds(), first, false, false, ${R}.PIN[i]);
                        first = false;
                    }
                    report(i, legs.length, done ? "Waiting" : "Action");
                }
            }
            while (opModeIsActive()) {
                follower.update();
                report(legs.length - 1, legs.length, "Done");
            }
        } finally {
            actions.stop();
            follower.stop();
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
  function routeActions(options,list){const Ex=options.exporter;return `package ${options.packageName};

import deck.pathing.DeckFollower.Pose;
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
    }

    protected HardwareMap hardwareMap;
    protected Telemetry telemetry;

    /** Called once during init, before START. Look up your mechanism hardware here. */
    public void init(HardwareMap hardwareMap, Telemetry telemetry) {
        this.hardwareMap = hardwareMap;
        this.telemetry = telemetry;
    }
${list.map(a=>`
    /** "${comment(a.name)}": ${a.uses.map(u=>Ex.where(u)).join('; ')}. Return true when finished. */
    public boolean ${a.slot}(Step step) {
        return notWritten(${javaString(a.name)});
    }
`).join('')}
    /** Called when the autonomous ends or is stopped: stop every mechanism. */
    public void stop() {
    }

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
  function robotActions(options,list){const Ex=options.exporter;return `package ${options.packageName};

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
        // Stop every mechanism here.
    }
}
`;}
  // Every TeamCode file for the Control Hub, keyed by path under TeamCode/src/main/java. RobotActions
  // is listed in keep: it is written only when it does not exist yet.
  function files({route,layout,tuning,robot,localization,setupName,packageName='org.firstinspires.ftc.teamcode',className='PlannedRoute',routeJava,exporter=globalThis.DeckSimExport||require('./sim-export.js')}){
    const h=hardware(robot,localization),dir=packageName.replace(/\./g,'/'),opModeName=className+'Auto',options={packageName,className,opModeName,layoutName:layout.name,setupName,exporter},list=exporter.actions(route);
    // Older callers export geometry before passing the measured robot tuning. Resolve inherited
    // power here as well, so generated code and the virtual follower use the same default.
    const powers=exporter.legs(route).map(l=>n(l.power??route.defaultPower??tuning.maxPathSpeed)).join(', ');
    routeJava=routeJava.replace(/public static final double\[\] MOTOR_POWER = \{[^}]*\}/,`public static final double[] MOTOR_POWER = {${powers}}`);
    const core=(globalThis.DeckFollowerSource||(typeof require==='function'?require('./sim-follower-source.js'):''));if(!core)throw Error('The bundled Deck controller source is missing.');
    const out={[`${dir}/${className}.java`]:routeJava,[`${dir}/${opModeName}.java`]:opMode(options),[`${dir}/RouteActions.java`]:routeActions(options,list),[`${dir}/RobotActions.java`]:robotActions(options,list),[`${dir}/drive/Constants.java`]:constants(h,tuning,options),[`${dir}/drive/RobotDrive.java`]:robotDrive(h,options),['deck/pathing/DeckFollower.java']:core};
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
  return {hardware,files,onBotJava,SUPPORTED,MOTORS,TANK,ticksPerRev};
});
