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
  const PODS={
    odometry:[{name:'par',axis:'forward',x:0,y:4},{name:'perp',axis:'strafe',x:-3,y:0}],
    odometry3:[{name:'par_left',axis:'forward',x:0,y:6},{name:'par_right',axis:'forward',x:0,y:-6},{name:'perp',axis:'strafe',x:-3,y:0}]
  };
  const SUPPORTED={encoders:'drive encoders + IMU',odometry:'two odometry pods + IMU',odometry3:'three odometry pods + IMU',fused:'goBILDA Pinpoint',optical:'SparkFun OTOS'};
  // Wiring of the virtual Control Hub for a robot and sensing setup.
  function hardware(robot,localization){
    if(!SUPPORTED[localization])throw Error('Pedro on a Control Hub needs position sensing: drive encoders, odometry pods, Pinpoint or OTOS. IMU-only setups export timed commands.');
    const rpm=robot.driveRpm||312,inches=Math.PI*WHEEL_MM/25.4;
    return {localization,imu:'imu',drive:{ticksPerInch:ticksPerRev(rpm)/inches,ticksPerRev:ticksPerRev(rpm),halfLength:robot.length/2,halfWidth:robot.width/2,motors:MOTORS},
      pods:(PODS[localization]||[]).map(p=>({...p,ticksPerInch:POD_TICKS_PER_INCH})),...(localization==='fused'?{pinpoint:'pinpoint'}:{}),...(localization==='optical'?{otos:'sensor_otos'}:{})};
  }
  // Java double literals: Pedro's ConfigVar<Double>.set() rejects an int such as 2000.
  const n=v=>{const s=String(Number(Number(v).toPrecision(6)));return /[.eE]/.test(s)?s:s+'.0';};
  const javaString=s=>'"'+String(s).replace(/[\\"]/g,c=>'\\'+c).replace(/[\u0000-\u001f]/g,'')+'"';
  function localizerCode(h){
    const imu='new RevHubIMU(new RevHubOrientationOnRobot(\n                RevHubOrientationOnRobot.LogoFacingDirection.UP,\n                RevHubOrientationOnRobot.UsbFacingDirection.FORWARD))';
    const pod=name=>h.pods.find(p=>p.name===name);
    switch(h.localization){
      case 'odometry':{const par=pod('par'),perp=pod('perp');
        // Pedro's TwoWheelLocalizer subtracts xPodOffset·Δθ from the forward pod, which reads Δx - y·Δθ,
        // so its offset is minus the pod's lateral position; the strafe pod reads Δy + x·Δθ.
        return {imports:['com.pedropathing.revhub.localizers.RevHubIMU','com.pedropathing.revhub.localizers.TwoWheelConfig','com.pedropathing.revhub.localizers.TwoWheelLocalizer','com.pedropathing.revhub.localizers.Encoder','com.qualcomm.hardware.rev.RevHubOrientationOnRobot'],
          field:`    public static TwoWheelConfig localizerConfig = new TwoWheelConfig(c -> {
        c.xPodName.set("${par.name}");
        c.yPodName.set("${perp.name}");
        c.imuName.set("${h.imu}");
        c.xPodOffset.set(${n(-par.y)});
        c.yPodOffset.set(${n(perp.x)});
        c.forwardTicksToInches.set(${n(1/par.ticksPerInch)});
        c.strafeTicksToInches.set(${n(1/perp.ticksPerInch)});
        c.xPodDirection.set(Encoder.FORWARD);
        c.yPodDirection.set(Encoder.FORWARD);
        c.imu.set(${imu});
    });`,make:'new TwoWheelLocalizer(h, localizerConfig)'};}
      case 'odometry3':{const l=pod('par_left'),r=pod('par_right'),s=pod('perp');
        return {imports:['com.pedropathing.revhub.localizers.RevHubIMU','com.pedropathing.revhub.localizers.ThreeWheelIMUConfig','com.pedropathing.revhub.localizers.ThreeWheelIMULocalizer','com.pedropathing.revhub.localizers.Encoder','com.qualcomm.hardware.rev.RevHubOrientationOnRobot'],
          field:`    public static ThreeWheelIMUConfig localizerConfig = new ThreeWheelIMUConfig(c -> {
        c.leftEncoderName.set("${l.name}");
        c.rightEncoderName.set("${r.name}");
        c.strafeEncoderName.set("${s.name}");
        c.imuName.set("${h.imu}");
        c.leftPodY.set(${n(l.y)});
        c.rightPodY.set(${n(r.y)});
        c.strafePodX.set(${n(s.x)});
        c.forwardTicksToInches.set(${n(1/l.ticksPerInch)});
        c.strafeTicksToInches.set(${n(1/s.ticksPerInch)});
        c.turnTicksToRadians.set(${n(1/l.ticksPerInch)});
        c.leftEncoderDirection.set(Encoder.FORWARD);
        c.rightEncoderDirection.set(Encoder.FORWARD);
        c.strafeEncoderDirection.set(Encoder.FORWARD);
        c.imu.set(${imu});
    });`,make:'new ThreeWheelIMULocalizer(h, localizerConfig)'};}
      case 'fused':return {imports:['com.pedropathing.revhub.localizers.PinpointConfig','com.pedropathing.revhub.localizers.PinpointLocalizer','com.qualcomm.hardware.gobilda.GoBildaPinpointDriver'],
          field:`    public static PinpointConfig localizerConfig = new PinpointConfig(c -> {
        c.name.set("${h.pinpoint}");
        c.xPodOffset.set(0.0);
        c.yPodOffset.set(0.0);
        c.xPodDirection.set(GoBildaPinpointDriver.EncoderDirection.FORWARD);
        c.yPodDirection.set(GoBildaPinpointDriver.EncoderDirection.FORWARD);
    });`,make:'new PinpointLocalizer(h, localizerConfig)'};
      case 'optical':return {imports:['com.pedropathing.math.Pose','com.pedropathing.revhub.localizers.OTOSConfig','com.pedropathing.revhub.localizers.OTOSLocalizer'],
          field:`    public static OTOSConfig localizerConfig = new OTOSConfig(c -> {
        c.name.set("${h.otos}");
        c.offset.set(new Pose(0, 0, 0));
    });`,make:'new OTOSLocalizer(h, localizerConfig)'};
      default:return {imports:['com.pedropathing.revhub.localizers.RevHubIMU','com.qualcomm.hardware.rev.RevHubOrientationOnRobot'],
          field:`    /** Inches of wheel travel per drive-encoder tick (${n(h.drive.ticksPerRev)} ticks per wheel revolution, ${WHEEL_MM} mm wheels). */
    public static final double DRIVE_INCHES_PER_TICK = ${n(1/h.drive.ticksPerInch)};`,
          make:`new DriveEncoderLocalizer(h, "${MOTORS.frontLeft.name}", "${MOTORS.frontRight.name}", "${MOTORS.backLeft.name}", "${MOTORS.backRight.name}", DRIVE_INCHES_PER_TICK,\n                ${imu.replace(/\n {16}/g,'\n                        ')}, "${h.imu}")`};
    }
  }
  function constants(h,tuning,options){
    const t=tuning,large=t.translationalP,small=t.translationalSmall??large/3,ratio=t.maxForward/t.maxStrafe,loc=localizerCode(h);
    const imports=[...new Set(['com.pedropathing.algorithm.Foresight','com.pedropathing.algorithm.ForesightConfig','com.pedropathing.controllers.Controller','com.pedropathing.follower.Follower','com.pedropathing.math.Matrix','com.pedropathing.math.Vector2D','com.pedropathing.revhub.drivetrains.Mecanum','com.pedropathing.revhub.drivetrains.MecanumConfig',...loc.imports,'com.qualcomm.robotcore.hardware.DcMotorSimple','com.qualcomm.robotcore.hardware.HardwareMap'])].sort();
    const dir=m=>m.mount<0?'REVERSE':'FORWARD';
    return `package ${options.packageName}.pedro;

${imports.map(i=>`import ${i};`).join('\n')}

/**
 * Pedro Pathing 3 constants for "${String(options.setupName||'setup').replace(/\*\//g,'')}": mecanum drive, ${SUPPORTED[h.localization]}.
 * Generated by Deck Driver Station. Hardware names and directions match the simulator's virtual
 * Control Hub; configure your robot with the same names, or change them here.
 *
 * The Foresight numbers were measured on the SIMULATED robot with Pedro AutoTune's procedures
 * (top speed, coast-down, braking distance). They are starting values: run AutoTune on your robot
 * and replace them before competing.
 */
public class Constants {
    public static MecanumConfig driveConfig = new MecanumConfig(c -> {
${Object.entries(MOTORS).map(([k,m])=>`        c.${k}Name.set("${m.name}");`).join('\n')}
${Object.entries(MOTORS).map(([k,m])=>`        c.${k}Direction.set(DcMotorSimple.Direction.${dir(m)});`).join('\n')}
    });

${loc.field}

    public static ForesightConfig foresightConfig = new ForesightConfig(c -> {
        c.forwardTranslational.set(Controller.piecewise(Controller.pid(${n(small)}, 0, ${n(t.translationalD)})).put(2.5, Controller.pid(${n(large)}, 0, ${n(t.translationalD)})));
        c.strafeTranslational.set(Controller.piecewise(Controller.pid(${n(small*ratio)}, 0, ${n(t.translationalD)})).put(2.5, Controller.pid(${n(large*ratio)}, 0, ${n(t.translationalD)})));
        c.headingFeedback.set(Controller.pid(${n(t.headingP)}, 0, ${n(t.headingD)}));
        c.brake.set(Controller.proportionalFeedforward(${n(1/t.maxForward)}));
        c.coast.set(Controller.proportional(${n(1/t.maxForward)}));
        c.linearBrakeCoefficients.set(Matrix.diag(${n(t.linearBrakeForward)}, ${n(t.linearBrakeStrafe)}));
        c.quadraticBrakeCoefficients.set(Matrix.diag(${n(t.quadraticBrakeForward)}, ${n(t.quadraticBrakeStrafe)}));
        c.headingBrakeCoefficients.set(Vector2D.cartesian(${n(t.headingBrakeLinear)}, ${n(t.headingBrakeQuadratic)}));
        c.maxAchievableForwardVelocity.set(${n(t.maxForward)});
        c.maxAchievableStrafeVelocity.set(${n(t.maxStrafe)});
        c.naturalForwardDeceleration.set(${n(t.forwardDeceleration)});
        c.naturalStrafeDeceleration.set(${n(t.strafeDeceleration)});
        c.timeoutConstraint.set(${n(t.holdTimeoutMs)});
        c.maxPathSpeed.set(${n(t.maxPathSpeed)});
    });

    public static Follower create(HardwareMap h) {
        // The drivetrain sets the motor directions, so build it before a localizer reads the drive encoders.
        Mecanum drivetrain = new Mecanum(h, driveConfig);
        return new Follower(${loc.make}, drivetrain, new Foresight(foresightConfig));
    }
}
`;
  }
  // Pedro 3 ships no drive-encoder localizer, so drive-encoder setups get this one.
  function driveEncoderLocalizer(options){return `package ${options.packageName}.pedro;

import com.pedropathing.localization.Localizer;
import com.pedropathing.localization.MotionState;
import com.pedropathing.math.Pose;
import com.pedropathing.math.Velocity;
import com.pedropathing.revhub.localizers.CustomIMU;
import com.pedropathing.utils.Timer;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorEx;
import com.qualcomm.robotcore.hardware.HardwareMap;

/**
 * Mecanum drive-encoder localizer for Pedro Pathing 3, which has none of its own. Translation comes
 * from the four drive encoders (mecanum forward kinematics), heading from the IMU. Wheel slip makes
 * drive encoders less accurate than odometry pods. Generated by Deck Driver Station.
 */
public class DriveEncoderLocalizer implements Localizer {
    private final DcMotorEx frontLeft, frontRight, backLeft, backRight;
    private final CustomIMU imu;
    private final double inchesPerTick;
    private final Timer timer = new Timer();
    private int[] previous = new int[4];
    private double previousHeading;
    private Pose pose = Pose.zero();
    private MotionState state = MotionState.ofVelocity(Pose.zero(), Velocity.zero());

    public DriveEncoderLocalizer(HardwareMap map, String frontLeftName, String frontRightName, String backLeftName, String backRightName,
                                 double inchesPerTick, CustomIMU imu, String imuName) {
        frontLeft = map.get(DcMotorEx.class, frontLeftName);
        frontRight = map.get(DcMotorEx.class, frontRightName);
        backLeft = map.get(DcMotorEx.class, backLeftName);
        backRight = map.get(DcMotorEx.class, backRightName);
        this.inchesPerTick = inchesPerTick;
        this.imu = imu;
        imu.initialize(map, imuName);
        for (DcMotorEx motor : new DcMotorEx[] {frontLeft, frontRight, backLeft, backRight}) {
            motor.setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER);
            motor.setMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER);
        }
        reset();
    }

    private int[] read() {
        return new int[] {frontLeft.getCurrentPosition(), frontRight.getCurrentPosition(), backLeft.getCurrentPosition(), backRight.getCurrentPosition()};
    }

    @Override
    public void setPose(Pose setPose) {
        pose = setPose;
        previous = read();
        previousHeading = imu.getHeading();
        state = MotionState.ofVelocity(setPose, Velocity.zero());
    }

    @Override
    public void update() {
        double seconds = timer.nanoseconds() / 1e9;
        timer.reset();
        int[] now = read();
        double fl = (now[0] - previous[0]) * inchesPerTick, fr = (now[1] - previous[1]) * inchesPerTick;
        double bl = (now[2] - previous[2]) * inchesPerTick, br = (now[3] - previous[3]) * inchesPerTick;
        previous = now;
        double heading = imu.getHeading(), turn = Math.atan2(Math.sin(heading - previousHeading), Math.cos(heading - previousHeading));
        previousHeading = heading;
        // Mecanum forward kinematics (rollers at 45 degrees); turning cancels out of both sums.
        double forward = (fl + fr + bl + br) / 4, left = (-fl + fr + bl - br) / 4, mid = pose.heading() + turn / 2;
        double dx = forward * Math.cos(mid) - left * Math.sin(mid), dy = forward * Math.sin(mid) + left * Math.cos(mid);
        pose = new Pose(pose.x() + dx, pose.y() + dy, pose.heading() + turn);
        state = seconds > 0 ? MotionState.ofVelocity(pose, new Velocity(dx / seconds, dy / seconds, turn / seconds)) : MotionState.ofVelocity(pose, Velocity.zero());
    }

    @Override
    public MotionState state() {
        return state;
    }

    @Override
    public void reset() {
        imu.resetYaw();
        setPose(Pose.zero());
    }
}
`;}
  function opMode(options){return `package ${options.packageName};

import com.pedropathing.follower.Follower;
import com.pedropathing.math.Pose;
import com.pedropathing.paths.Path;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.util.ElapsedTime;
import ${options.packageName}.pedro.Constants;

/**
 * Autonomous generated by Deck Driver Station for "${String(options.layoutName||'route').replace(/\*\//g,'')}". Follows ${options.className}
 * leg by leg: turns in place first when a leg needs a new heading, follows it, waits for the robot to
 * settle, then holds for that pin's pause. Paste ${options.className}.java, this file and pedro/ into TeamCode.
 */
@Autonomous(name = ${javaString(`${options.layoutName||'Planned route'} (Deck)`)}, group = "Deck Driver Station")
public class ${options.opModeName} extends LinearOpMode {
    private Follower follower;

    @Override
    public void runOpMode() throws InterruptedException {
        follower = Constants.create(hardwareMap);
        follower.setPose(${options.className}.START);
        Path[] legs = ${options.className}.legs();
        telemetry.addData("Route", legs.length + " legs");
        telemetry.update();
        waitForStart();
        ElapsedTime timer = new ElapsedTime();
        double plannedHeading = ${options.className}.START.heading();
        for (int i = 0; i < legs.length && opModeIsActive(); i++) {
            Pose end = legs[i].endPose();
            // Turn only where the plan changes heading (turning routes), not to chase small drift.
            boolean turn = Math.abs(angle(end.heading() - plannedHeading)) > Math.toRadians(0.5);
            plannedHeading = end.heading();
            if (turn) {
                Pose here = follower.pose();
                follower.hold(new Pose(here.x(), here.y(), end.heading()));
                timer.reset();
                // Turn in place: done when the heading has stayed within 1.5 degrees for 0.15 s.
                double settledSince = -1;
                while (opModeIsActive() && timer.seconds() < 5) {
                    follower.update();
                    report(i, legs.length, "Turning");
                    boolean on = Math.abs(angle(end.heading() - follower.pose().heading())) < Math.toRadians(1.5);
                    if (!on) settledSince = -1;
                    else if (settledSince < 0) settledSince = timer.seconds();
                    else if (timer.seconds() - settledSince > 0.15) break;
                }
            }
            follower.follow(legs[i]);
            while (opModeIsActive() && follower.following()) {
                follower.update();
                report(i, legs.length, "Driving");
            }
            timer.reset();
            while (opModeIsActive() && timer.seconds() < 3 && !(near(end, 0.75) && follower.velocity().linSpeed() < 2)) {
                follower.update();
                report(i, legs.length, "Settling");
            }
            timer.reset();
            while (opModeIsActive() && timer.seconds() < ${options.className}.WAIT_SECONDS[i]) {
                follower.update();
                telemetry.addData("Action", ${options.className}.ACTIONS[i]);
                report(i, legs.length, "Waiting");
            }
        }
        while (opModeIsActive()) {
            follower.update();
            report(legs.length - 1, legs.length, "Done");
        }
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
  // Every TeamCode file for the Control Hub, keyed by path under TeamCode/src/main/java.
  function files({route,layout,tuning,robot,localization,setupName,packageName='org.firstinspires.ftc.teamcode',className='PlannedRoute',routeJava}){
    const h=hardware(robot,localization),dir=packageName.replace(/\./g,'/'),opModeName=className+'Auto',options={packageName,className,opModeName,layoutName:layout.name,setupName};
    const out={[`${dir}/${className}.java`]:routeJava,[`${dir}/${opModeName}.java`]:opMode(options),[`${dir}/pedro/Constants.java`]:constants(h,tuning,options)};
    if(localization==='encoders')out[`${dir}/pedro/DriveEncoderLocalizer.java`]=driveEncoderLocalizer(options);
    return {files:out,opMode:`${packageName}.${opModeName}`,hardware:h};
  }
  return {hardware,files,SUPPORTED,MOTORS,ticksPerRev};
});
