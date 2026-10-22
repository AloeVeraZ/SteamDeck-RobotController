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
    if(!SUPPORTED[localization])throw Error('Pedro on a Control Hub needs position sensing: drive encoders, odometry pods, Pinpoint or OTOS. IMU-only setups export timed commands.');
    const drivetrain=robot.drivetrain||'mecanum',tank=TANK.has(drivetrain);
    if(!tank&&drivetrain!=='mecanum')throw Error('Pedro on a Control Hub is exported for mecanum and tank-style drivetrains (tank, differential, 6- and 8-wheel, tracks). Swerve, X-drive, Kiwi, H-drive and butterfly export timed commands or Pedro paths for your own drivetrain code.');
    const rpm=robot.driveRpm||312,inches=Math.PI*(robot.wheelDiameterMm||WHEEL_MM)/25.4;
    return {localization,imu:'imu',drive:{kind:tank?'tank':'mecanum',ticksPerInch:ticksPerRev(rpm)/inches,ticksPerRev:ticksPerRev(rpm),halfLength:robot.length/2,halfWidth:robot.width/2,motors:drivetrain==='tank2'?DIFF:MOTORS},
      pods:(PODS[localization]||[]).map(p=>({...p,ticksPerInch:POD_TICKS_PER_INCH})),...(localization==='fused'?{pinpoint:'pinpoint'}:{}),...(localization==='optical'?{otos:'sensor_otos'}:{})};
  }
  // Java double literals: Pedro's ConfigVar<Double>.set() rejects an int such as 2000.
  const n=v=>{const s=String(Number(Number(v).toPrecision(6)));return /[.eE]/.test(s)?s:s+'.0';};
  const comment=s=>String(s||'').replace(/\*\//g,'* /').replace(/[\r\n]+/g,' ').trim();
  const javaString=s=>'"'+String(s).replace(/[\\"]/g,c=>'\\'+c).replace(/[\u0000-\u001f]/g,'')+'"';
  const names=list=>`new String[] {${list.map(javaString).join(', ')}}`;
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
          make:h.drive.kind==='tank'?`new TankEncoderLocalizer(h, ${names(sides(h.drive.motors).left)}, ${names(sides(h.drive.motors).right)}, DRIVE_INCHES_PER_TICK,\n                ${imu.replace(/\n {16}/g,'\n                        ')}, "${h.imu}")`:`new DriveEncoderLocalizer(h, "${MOTORS.frontLeft.name}", "${MOTORS.frontRight.name}", "${MOTORS.backLeft.name}", "${MOTORS.backRight.name}", DRIVE_INCHES_PER_TICK,\n                ${imu.replace(/\n {16}/g,'\n                        ')}, "${h.imu}")`};
    }
  }
  function constants(h,tuning,options){
    const t=tuning,large=t.translationalP,small=t.translationalSmall??large/3,ratio=t.maxForward/t.maxStrafe,loc=localizerCode(h);
    const tank=h.drive.kind==='tank',side=sides(h.drive.motors);
    const imports=[...new Set(['com.pedropathing.algorithm.Foresight','com.pedropathing.algorithm.ForesightConfig','com.pedropathing.controllers.Controller','com.pedropathing.follower.Follower','com.pedropathing.math.Matrix','com.pedropathing.math.Vector2D',...(tank?[]:['com.pedropathing.revhub.drivetrains.Mecanum','com.pedropathing.revhub.drivetrains.MecanumConfig','com.qualcomm.robotcore.hardware.DcMotorSimple']),...loc.imports,'com.qualcomm.robotcore.hardware.HardwareMap'])].sort();
    const dir=m=>m.mount<0?'REVERSE':'FORWARD';
    return `package ${options.packageName}.pedro;

${imports.map(i=>`import ${i};`).join('\n')}

/**
 * Pedro Pathing 3 constants for "${String(options.setupName||'setup').replace(/\*\//g,'')}": ${tank?'tank drive (TankDrive.java)':'mecanum drive'}, ${SUPPORTED[h.localization]}.
 * Generated by Deck Driver Station. Hardware names and directions match the simulator's virtual
 * Control Hub; configure your robot with the same names, or change them here.
 *
 * The Foresight numbers were measured on the SIMULATED robot with Pedro AutoTune's procedures
 * (top speed, coast-down, braking distance). They are starting values: run AutoTune on your robot
 * and replace them before competing.
 */
public class Constants {
${tank?`    /** Drive motors on each side (left motors are reversed in TankDrive). */
    public static final String[] LEFT_MOTORS = ${names(side.left)};
    public static final String[] RIGHT_MOTORS = ${names(side.right)};
`:`    public static MecanumConfig driveConfig = new MecanumConfig(c -> {
${Object.entries(MOTORS).map(([k,m])=>`        c.${k}Name.set("${m.name}");`).join('\n')}
${Object.entries(MOTORS).map(([k,m])=>`        c.${k}Direction.set(DcMotorSimple.Direction.${dir(m)});`).join('\n')}
        c.powerThreshold.set(0.0); // Keep path power ceilings exact at every motor write.
    });
`}
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
        c.maxPathSpeed.set(${n(Math.max(.000001,t.maxPathSpeed))});
    });

    public static Follower create(HardwareMap h) {
        // The drivetrain sets the motor directions, so build it before a localizer reads the drive encoders.
        ${tank?'TankDrive drivetrain = new TankDrive(h, LEFT_MOTORS, RIGHT_MOTORS);':'Mecanum drivetrain = new Mecanum(h, driveConfig);'}
        motorPower(${n(t.maxPathSpeed)});
        liveDrive = new PowerDrive(drivetrain);
        return new Follower(${loc.make}, liveDrive, new Foresight(foresightConfig));
    }

    private static double powerLimit = ${n(t.maxPathSpeed)};
    private static PowerDrive liveDrive;
    /** Applied to every mixed motor, including corrections and turns. */
    public static void motorPower(double power) {
        powerLimit = Math.max(0, Math.min(1, power));
        if (powerLimit == 0 && liveDrive != null) liveDrive.stop();
        foresightConfig.maxPathSpeed.set(Math.max(0.000001, powerLimit));
    }
    private static final class PowerDrive implements com.pedropathing.drivetrain.Drivetrain {
        private final com.pedropathing.drivetrain.Drivetrain delegate;
        PowerDrive(com.pedropathing.drivetrain.Drivetrain delegate) { this.delegate = delegate; }
        public void drive(com.pedropathing.drivetrain.DrivePowers p, boolean manual) {
            if (powerLimit == 0) { delegate.stop(); return; }
            double peak = Math.abs(p.forward()) + Math.abs(p.strafe()) + Math.abs(p.turn());
            double scale = Math.max(1, peak / powerLimit);
            delegate.drive(new com.pedropathing.drivetrain.DrivePowers(p.forward()/scale, p.strafe()/scale, p.turn()/scale), manual);
        }
        public double maxScaling(com.pedropathing.drivetrain.DrivePowers a, com.pedropathing.drivetrain.DrivePowers b) { return delegate.maxScaling(a,b); }
        public void stop() { delegate.stop(); }
        public void stop(boolean brake) { delegate.stop(brake); }
        public double interpolateVelocity(double x, double y, double theta) { return delegate.interpolateVelocity(x,y,theta); }
        public java.util.Map<String,Object> debug() { return delegate.debug(); }
    }
}
`;
  }
  // Pedro 3 ships no tank drivetrain: this one mixes and saturates like its Mecanum, with no strafe.
  // Tank routes stop and turn to face each straight leg, so the follower only ever asks for forward
  // and turn power while it drives.
  function tankDrive(options){return `package ${options.packageName}.pedro;

import com.pedropathing.drivetrain.DrivePowers;
import com.pedropathing.drivetrain.Drivetrain;
import com.pedropathing.utils.Utils;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorEx;
import com.qualcomm.robotcore.hardware.DcMotorSimple;
import com.qualcomm.robotcore.hardware.HardwareMap;
import java.util.HashMap;
import java.util.Map;

/**
 * Tank (skid-steer) drivetrain for Pedro Pathing 3, which ships mecanum and swerve only. Left
 * motors are reversed; every motor on a side gets the same power. Like Pedro's Mecanum it floats
 * the motors while following a path and brakes for manual driving. Generated by Deck Driver Station.
 */
public final class TankDrive implements Drivetrain {
    private final DcMotorEx[] left, right;
    private double leftPower, rightPower;
    private DrivePowers powers = DrivePowers.zero();

    public TankDrive(HardwareMap map, String[] leftNames, String[] rightNames) {
        left = new DcMotorEx[leftNames.length];
        right = new DcMotorEx[rightNames.length];
        for (int i = 0; i < left.length; i++) {
            left[i] = map.get(DcMotorEx.class, leftNames[i]);
            left[i].setDirection(DcMotorSimple.Direction.REVERSE);
        }
        for (int i = 0; i < right.length; i++) {
            right[i] = map.get(DcMotorEx.class, rightNames[i]);
            right[i].setDirection(DcMotorSimple.Direction.FORWARD);
        }
        setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.FLOAT);
    }

    private static double[] wheels(DrivePowers p) {
        return new double[] {p.forward() - p.turn(), p.forward() + p.turn()};
    }

    @Override
    public void drive(DrivePowers p, boolean manual) {
        setZeroPowerBehavior(manual ? DcMotor.ZeroPowerBehavior.BRAKE : DcMotor.ZeroPowerBehavior.FLOAT);
        powers = p;
        double[] w = wheels(p);
        double max = Math.max(1.0, Math.max(Math.abs(w[0]), Math.abs(w[1])));
        leftPower = w[0] / max;
        rightPower = w[1] / max;
        for (DcMotorEx m : left) m.setPower(leftPower);
        for (DcMotorEx m : right) m.setPower(rightPower);
    }

    @Override
    public double maxScaling(DrivePowers current, DrivePowers delta) {
        double lambda = 1.0;
        double[] a = wheels(current), b = wheels(delta);
        for (int i = 0; i < 2; i++) {
            if (Math.abs(b[i]) < 1e-9) continue;
            double t1 = (1.0 - a[i]) / b[i], t2 = (-1.0 - a[i]) / b[i];
            if (t1 >= 0.0 && t1 < lambda) lambda = t1;
            if (t2 >= 0.0 && t2 < lambda) lambda = t2;
        }
        return Utils.clamp(lambda, 0.0, 1.0);
    }

    @Override
    public void stop() {
        stop(true);
    }

    @Override
    public void stop(boolean brake) {
        setZeroPowerBehavior(brake ? DcMotor.ZeroPowerBehavior.BRAKE : DcMotor.ZeroPowerBehavior.FLOAT);
        leftPower = rightPower = 0;
        for (DcMotorEx m : left) m.setPower(0);
        for (DcMotorEx m : right) m.setPower(0);
    }

    private void setZeroPowerBehavior(DcMotor.ZeroPowerBehavior behavior) {
        for (DcMotorEx m : left) m.setZeroPowerBehavior(behavior);
        for (DcMotorEx m : right) m.setZeroPowerBehavior(behavior);
    }

    @Override
    public Map<String, Object> debug() {
        Map<String, Object> map = new HashMap<>();
        map.put("forward", powers.forward());
        map.put("turn", powers.turn());
        map.put("leftPower", leftPower);
        map.put("rightPower", rightPower);
        return map;
    }

    @Override
    public double interpolateVelocity(double xRadius, double yRadius, double theta) {
        return 1.0 / (Math.abs(Math.cos(theta)) / xRadius + Math.abs(Math.sin(theta)) / yRadius);
    }
}
`;}
  function tankEncoderLocalizer(options){return `package ${options.packageName}.pedro;

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
 * Tank drive-encoder localizer for Pedro Pathing 3: forward travel is the average of both sides'
 * encoders (a tank robot cannot slide sideways), heading comes from the IMU. Wheel slip, especially
 * on tracks and while turning, makes drive encoders less accurate than odometry pods. Generated by
 * Deck Driver Station.
 */
public final class TankEncoderLocalizer implements Localizer {
    private final DcMotorEx[] left, right;
    private final CustomIMU imu;
    private final double inchesPerTick;
    private final Timer timer = new Timer();
    private double previous, previousHeading;
    private Pose pose = Pose.zero();
    private MotionState state = MotionState.ofVelocity(Pose.zero(), Velocity.zero());

    public TankEncoderLocalizer(HardwareMap map, String[] leftNames, String[] rightNames, double inchesPerTick, CustomIMU imu, String imuName) {
        left = new DcMotorEx[leftNames.length];
        right = new DcMotorEx[rightNames.length];
        for (int i = 0; i < left.length; i++) left[i] = map.get(DcMotorEx.class, leftNames[i]);
        for (int i = 0; i < right.length; i++) right[i] = map.get(DcMotorEx.class, rightNames[i]);
        this.inchesPerTick = inchesPerTick;
        this.imu = imu;
        imu.initialize(map, imuName);
        for (DcMotorEx[] side : new DcMotorEx[][] {left, right}) for (DcMotorEx motor : side) {
            motor.setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER);
            motor.setMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER);
        }
        reset();
    }

    /** Average forward travel of both sides, in ticks. */
    private double read() {
        double l = 0, r = 0;
        for (DcMotorEx m : left) l += m.getCurrentPosition();
        for (DcMotorEx m : right) r += m.getCurrentPosition();
        return (l / left.length + r / right.length) / 2;
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
        double now = read(), forward = (now - previous) * inchesPerTick;
        previous = now;
        double heading = imu.getHeading(), turn = Math.atan2(Math.sin(heading - previousHeading), Math.cos(heading - previousHeading));
        previousHeading = heading;
        double mid = pose.heading() + turn / 2, dx = forward * Math.cos(mid), dy = forward * Math.sin(mid);
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
public final class DriveEncoderLocalizer implements Localizer {
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
  function opMode(options){const R=options.className;return `package ${options.packageName};

import com.pedropathing.follower.Follower;
import com.pedropathing.math.Pose;
import com.pedropathing.paths.Path;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.util.ElapsedTime;
import ${options.packageName}.pedro.Constants;

/**
 * Autonomous generated by Deck Driver Station for "${comment(options.layoutName||'route')}". Follows ${R}
 * leg by leg: turns in place first when a leg needs a new heading, follows it (running the action of
 * an action path while it drives), waits for the robot to settle, turns if the pin asks for it, then
 * runs the pin's action and pause. Mechanism code goes in RobotActions.java; the driving comes from
 * the simulator. Paste ${R}.java, RouteActions.java, RobotActions.java, this file and pedro/ into TeamCode.
 */
@Autonomous(name = ${javaString(`${options.layoutName||'Planned route'} (Deck)`)}, group = "Deck Driver Station")
public class ${options.opModeName} extends LinearOpMode {
    private Follower follower;
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
                while (opModeIsActive() && follower.following()) {
                    follower.update();
                    if (!moving.isEmpty() && !movingDone) {
                        movingDone = act(moving, movingTimer.seconds(), movingFirst, false, true, ${R}.PIN[i]);
                        movingFirst = false;
                    }
                    report(i, legs.length, moving.isEmpty() ? "Driving" : "Action path");
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
                timer.reset();
                while (opModeIsActive() && timer.seconds() < 3 && !(near(end, 0.75) && follower.velocity().linSpeed() < 2)) {
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

import com.pedropathing.math.Pose;
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
        /** Where the robot thinks it is: Pedro field frame, inches and radians. */
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
    const out={[`${dir}/${className}.java`]:routeJava,[`${dir}/${opModeName}.java`]:opMode(options),[`${dir}/RouteActions.java`]:routeActions(options,list),[`${dir}/RobotActions.java`]:robotActions(options,list),[`${dir}/pedro/Constants.java`]:constants(h,tuning,options)};
    if(h.drive.kind==='tank')out[`${dir}/pedro/TankDrive.java`]=tankDrive(options);
    if(localization==='encoders')out[h.drive.kind==='tank'?`${dir}/pedro/TankEncoderLocalizer.java`:`${dir}/pedro/DriveEncoderLocalizer.java`]=h.drive.kind==='tank'?tankEncoderLocalizer(options):driveEncoderLocalizer(options);
    return {files:out,keep:[`${dir}/RobotActions.java`],opMode:`${packageName}.${opModeName}`,hardware:h,actions:list};
  }
  return {hardware,files,SUPPORTED,MOTORS,TANK,ticksPerRev};
});
