package org.firstinspires.ftc.teamcode;

import com.qualcomm.hardware.gobilda.GoBildaPinpointDriver;
import com.qualcomm.hardware.rev.RevHubOrientationOnRobot;
import com.qualcomm.hardware.sparkfun.SparkFunOTOS;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.hardware.*;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorEx;
import com.qualcomm.robotcore.hardware.DcMotorSimple;
import com.qualcomm.robotcore.hardware.HardwareMap;
import com.qualcomm.robotcore.util.ElapsedTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.function.LongSupplier;
import org.firstinspires.ftc.robotcore.external.Telemetry;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;
import org.firstinspires.ftc.robotcore.external.navigation.Pose2D;

/** Upload this file to OnBot Java, match the robot hardware names and IMU mounting,
 * then Build Everything. Select this autonomous on the Driver Station and INIT/START.
 * All driving code is included. Fill in RobotActions for your intake/launcher/servos.
 * Calibrate wheel travel, pod offsets and control gains on the actual robot.
 */
@Autonomous(name = "BIOBUZZ dual red (Deck)", group = "Deck Driver Station")
public class PlannedRouteAuto extends LinearOpMode {
    private DeckFollower follower;
    private RouteActions actions;
    private final RouteActions.Step step = new RouteActions.Step();

    @Override
    public void runOpMode() throws InterruptedException {
        follower = Constants.create(hardwareMap);
        follower.setPose(PlannedRoute.START);
        actions = new RobotActions();
        actions.init(hardwareMap, telemetry);
        DeckFollower.Path[] legs = PlannedRoute.legs();
        telemetry.addData("Route", legs.length + " legs");
        telemetry.update();
        waitForStart();
        try {
            ElapsedTime timer = new ElapsedTime(), movingTimer = new ElapsedTime();
            double plannedHeading = PlannedRoute.START.heading();
            int movingPath = 0;
            boolean movingDone = true, movingFirst = false;
            for (int i = 0; i < legs.length && opModeIsActive(); i++) {
                Constants.motorPower(PlannedRoute.MOTOR_POWER[i]);
                if (PlannedRoute.MOTOR_POWER[i] == 0) {
                    follower.stop();
                    while (opModeIsActive()) { report(i, legs.length, "Zero motor power: stopped"); idle(); }
                    break;
                }
                // Turn only where the plan changes heading (turning routes), not to chase small drift.
                if (Math.abs(angle(PlannedRoute.START_HEADING[i] - plannedHeading)) > Math.toRadians(0.5)) turnTo(PlannedRoute.START_HEADING[i], i, legs.length);
                // An action path's action starts with the path and may span several legs of it.
                String moving = PlannedRoute.MOVING_ACTIONS[i];
                if (!moving.isEmpty() && PlannedRoute.PATH[i] != movingPath) {
                    movingPath = PlannedRoute.PATH[i];
                    movingDone = false;
                    movingFirst = true;
                    movingTimer.reset();
                }
                follower.follow(legs[i]);
                step.wait = 0;
                boolean through = i + 1 < legs.length && PlannedRoute.WAIT_SECONDS[i] == 0 && PlannedRoute.ACTIONS[i].isEmpty() && Double.isNaN(PlannedRoute.TURN_AFTER[i]) && DeckFollower.continuous(legs[i],legs[i+1]);
                while (opModeIsActive() && follower.following()) {
                    follower.update();
                    if (!moving.isEmpty() && !movingDone) {
                        // A set time runs the action from the start of its path; the last call stops it.
                        double t = movingTimer.seconds();
                        boolean over = PlannedRoute.MOVING_SECONDS[i] > 0 && t >= PlannedRoute.MOVING_SECONDS[i];
                        step.duration = PlannedRoute.MOVING_SECONDS[i];
                        step.cell = PlannedRoute.MOVING_CELL[i];
                        movingDone = act(moving, t, movingFirst, over, true, PlannedRoute.PIN[i]) || over;
                        movingFirst = false;
                    }
                    report(i, legs.length, moving.isEmpty() ? "Driving" : "Action path");
                    if (through && follower.remainingDistance() < 1.5 && near(legs[i].endPose(),1.5)) break;
                }
                boolean pathEnds = i == legs.length - 1 || PlannedRoute.PATH[i + 1] != movingPath || PlannedRoute.MOVING_ACTIONS[i + 1].isEmpty();
                if (!moving.isEmpty() && pathEnds) {
                    // The path is over: one last call so the action can stop its mechanisms.
                    if (!movingDone) { step.duration = PlannedRoute.MOVING_SECONDS[i]; act(moving, movingTimer.seconds(), movingFirst, true, true, PlannedRoute.PIN[i]); }
                    movingDone = true;
                    movingPath = 0;
                }
                DeckFollower.Pose end = legs[i].endPose();
                plannedHeading = end.heading();
                if (through) continue;
                timer.reset();
                while (opModeIsActive() && timer.seconds() < 3 && !(near(end, 0.75) && follower.velocity().linSpeed() < .5)) {
                    follower.update();
                    report(i, legs.length, "Settling");
                }
                if (!Double.isNaN(PlannedRoute.TURN_AFTER[i])) {
                    turnTo(PlannedRoute.TURN_AFTER[i], i, legs.length);
                    plannedHeading = PlannedRoute.TURN_AFTER[i];
                }
                // At the pin: pause, then run the action for its set time (or until it reports done), then drive on.
                timer.reset();
                while (opModeIsActive() && timer.seconds() < PlannedRoute.WAIT_SECONDS[i]) {
                    follower.update();
                    report(i, legs.length, "Pause");
                }
                String action = PlannedRoute.ACTIONS[i];
                step.wait = PlannedRoute.WAIT_SECONDS[i];
                step.duration = PlannedRoute.ACTION_SECONDS[i];
                step.cell = PlannedRoute.ACTION_CELL[i];
                boolean done = action.isEmpty(), first = true;
                timer.reset();
                while (opModeIsActive() && !done) {
                    follower.update();
                    double t = timer.seconds();
                    boolean over = PlannedRoute.ACTION_SECONDS[i] > 0 && t >= PlannedRoute.ACTION_SECONDS[i];
                    done = act(action, t, first, over, false, PlannedRoute.PIN[i]) || over;
                    first = false;
                    report(i, legs.length, "Action");
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
        DeckFollower.Pose here = follower.pose();
        follower.hold(new DeckFollower.Pose(here.x(), here.y(), heading));
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

    private boolean near(DeckFollower.Pose target, double inches) {
        DeckFollower.Pose p = follower.pose();
        return Math.hypot(p.x() - target.x(), p.y() - target.y()) < inches;
    }

    private static double angle(double radians) {
        return Math.atan2(Math.sin(radians), Math.cos(radians));
    }

    private void report(int leg, int legs, String phase) {
        DeckFollower.Pose p = follower.pose();
        telemetry.addData("Leg", (leg + 1) + " of " + legs);
        telemetry.addData("Phase", phase);
        telemetry.addData("x", p.x());
        telemetry.addData("y", p.y());
        telemetry.addData("heading", Math.toDegrees(p.heading()));
        telemetry.update();
    }

    public static final class PlannedRoute {

    private PlannedRoute() {}

    public static final DeckFollower.Pose START = new DeckFollower.Pose(9.85, 30, Math.toRadians(-90));
    public static final double HEADING = Math.toRadians(-90);

    /** Actual field dimensions, inches (custom fields are not rescaled). */
    public static final double FIELD_WIDTH = 144;
    public static final double FIELD_HEIGHT = 144;

    /** Pause at the pin after each leg, before its action, in seconds. */
    public static final double[] WAIT_SECONDS = {0, 0, 0, 0};

    /** Motor power ceiling per leg, including setup defaults (0 disables that leg). */
    public static final double[] MOTOR_POWER = {1.0, 1.0, 1.0, 1.0};

    /** The action run at the pin after each leg, as named in the simulator ("" for none). */
    public static final String[] ACTIONS = {"Shoot", "Intake", "Shoot", "Shoot"};

    /** Which hive cell each pin action aims at: 0 the cell up at the start, 1 the other cell. */
    public static final int[] ACTION_CELL = {0, 0, 1, 1};

    /** How long each pin action runs, in seconds (0: until it reports done). */
    public static final double[] ACTION_SECONDS = {0, 0.1, 0, 0};

    /** The action run WHILE driving each leg: action paths ("" for regular paths). */
    public static final String[] MOVING_ACTIONS = {"Spin up", "Intake", "Spin up", "Intake"};

    /** Which hive cell each action path's action aims at (0 start cell, 1 the other cell). */
    public static final int[] MOVING_CELL = {0, 0, 0, 0};

    /** How long each action path's action runs from the start of its path, in seconds (0: the whole path). */
    public static final double[] MOVING_SECONDS = {0, 0, 0, 0};

    /** Which pin's path each leg drives (1 = the path from the start to pin 1). */
    public static final int[] PATH = {1, 2, 3, 4};

    /** The pin each leg ends at (0 = a turn point between pins). */
    public static final int[] PIN = {1, 2, 3, 4};

    /** Heading to face before each leg, radians. */
    public static final double[] START_HEADING = {Math.toRadians(-90), Math.toRadians(-90), Math.toRadians(-90), Math.toRadians(-90)};

    /** Heading to turn to in place after each leg, radians (NaN = no turn). */
    public static final double[] TURN_AFTER = {Double.NaN, Double.NaN, Double.NaN, Double.NaN};

    /** The route split into legs (see above). Leg i ends at pin 1, 2, 3, 4. */
    public static DeckFollower.Path[] legs() {
        return new DeckFollower.Path[] {
            DeckFollower.Paths.line(v(9.85, 30), v(13, 24)).heading(turn(-90, -90)),
            DeckFollower.Paths.line(v(13, 24), v(10, 13)).heading(turn(-90, -90)),
            DeckFollower.Paths.path(
                DeckFollower.Paths.curve(v(10, 13), v(12.241, 20.784), v(16.65, 36.097), v(16.723, 36.352)).heading(turn(-90, -90)),
                DeckFollower.Paths.curve(v(16.723, 36.352), v(16.796, 36.607), v(16.835, 36.871), v(16.878, 37.133)).heading(turn(-90, -90)),
                DeckFollower.Paths.curve(v(16.878, 37.133), v(16.922, 37.394), v(24.293, 81.711), v(28, 104)).heading(turn(-90, -90))
            ),
            DeckFollower.Paths.line(v(28, 104), v(11, 107)).heading(turn(-90, -90))
        };
    }

    /** No-go zones the route keeps clear of, as polygons {x, y} in inches. */
    public static final double[][][] NO_GO_ZONES = {};

    private static DeckFollower.Point v(double x, double y) {
        return DeckFollower.Point.cartesian(x, y);
    }

    /** Face a fixed field target at every point of the actual curve. */
    private static DeckFollower.Interpolator face(double x, double y) {
        return (curve, t) -> { DeckFollower.Point p = curve.get(t); return Math.atan2(y - p.y(), x - p.x()); };
    }

    /** Heading that turns steadily from one angle to another (degrees; may span whole spins) along a path. */
    private static DeckFollower.Interpolator turn(double fromDegrees, double toDegrees) {
        double from = Math.toRadians(fromDegrees), by = Math.toRadians(toDegrees - fromDegrees), full = 2 * Math.PI;
        return (curve, t) -> ((from + by * t) % full + full) % full;
    }

    }

    public static abstract class RouteActions {

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
        public DeckFollower.Pose pose;
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
    /** The intake, indexer and shooter set up in the simulator (Mechanisms.java). */
    protected final Mechanisms mech = new Mechanisms();

    /** Called once during init, before START. Look up your mechanism hardware here. */
    public void init(HardwareMap hardwareMap, Telemetry telemetry) {
        this.hardwareMap = hardwareMap;
        this.telemetry = telemetry;
        mech.init(hardwareMap);
    }

    /** "Spin up": while driving the path to pin 1; while driving the path to pin 3. Return true when finished. */
    public boolean spinUp(Step step) {
        mech.spin(true);
        return true;
    }

    /** "Shoot": stopped at pin 1; stopped at pin 3; stopped at pin 4. Return true when finished. */
    public boolean shoot(Step step) {
        return mech.shoot(0, step);
    }

    /** "Intake": while driving the path to pin 2; stopped at pin 2; while driving the path to pin 4. Return true when finished. */
    public boolean intake(Step step) {
        boolean done = step.last || (!step.moving && step.duration <= 0);
        mech.intake(!done);
        return done;
    }

    /** Called when the autonomous ends or is stopped: stop every mechanism. */
    public void stop() {
        mech.stop();
    }

    /** Runs the action with this simulator name. Names this file does not know count as finished. */
    public final boolean run(String name, Step step) {
        switch (name) {
            case "Spin up": return spinUp(step);
            case "Shoot": return shoot(step);
            case "Intake": return intake(step);
            default: return true;
        }
    }

    private boolean notWritten(String name) {
        if (telemetry != null) telemetry.addData("Action", name + ": no code yet (write it in RobotActions.java)");
        return true;
    }

    }

    public static class RobotActions extends RouteActions {

    // Example: private DcMotorEx intake;

    @Override
    public void init(HardwareMap hardwareMap, Telemetry telemetry) {
        super.init(hardwareMap, telemetry);
        // Example: intake = hardwareMap.get(DcMotorEx.class, "intake");
    }

    @Override
    public void stop() {
        super.stop();
        // Stop every mechanism you added here.
    }

    }

    public static final class Constants {

    private static RobotDrive hardware;
    private static DeckFollower.Config config;
    public static DeckFollower create(HardwareMap map) {
        hardware = new RobotDrive(map);
        config = new DeckFollower.Config();
        config.maxForward=77.0627; config.maxStrafe=61.65; config.maxTurn=6.42368;
        config.positionP=0.11948; config.positionD=0.00910324;
        config.headingP=3.1795; config.headingD=0.08;
        config.acceleration=200.766; config.tank=false;
        config.maxPathSpeed=1.0;
        ElapsedTime clock = new ElapsedTime();
        return new DeckFollower(hardware, hardware, config, () -> clock.nanoseconds());
    }
    public static void motorPower(double p) { config.maxPathSpeed=p; hardware.limit=p; }

    }

    public static final class RobotDrive implements DeckFollower.Drivetrain, DeckFollower.Localizer {

    private final DcMotorEx[] motors = new DcMotorEx[4], pods = new DcMotorEx[0];
    private final IMU imu;
    private final GoBildaPinpointDriver pinpoint;
    private final SparkFunOTOS otos;
    private final ElapsedTime clock = new ElapsedTime();
    private final int[] before = new int[4], podBefore = new int[0];
    private double oldImu, lastTime;
    double limit=0.6;
    private DeckFollower.MotionState state=DeckFollower.MotionState.ofVelocity(DeckFollower.Pose.zero(),DeckFollower.Velocity.zero());
    public RobotDrive(HardwareMap map) {
        motors[0]=map.get(DcMotorEx.class, "front_left"); motors[0].setDirection(DcMotorSimple.Direction.REVERSE);
        motors[1]=map.get(DcMotorEx.class, "front_right"); motors[1].setDirection(DcMotorSimple.Direction.FORWARD);
        motors[2]=map.get(DcMotorEx.class, "back_left"); motors[2].setDirection(DcMotorSimple.Direction.REVERSE);
        motors[3]=map.get(DcMotorEx.class, "back_right"); motors[3].setDirection(DcMotorSimple.Direction.FORWARD);
        for(DcMotorEx m:motors){m.setMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER);m.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);}

        imu=map.get(IMU.class,"imu");
        imu.initialize(new IMU.Parameters(new RevHubOrientationOnRobot(RevHubOrientationOnRobot.LogoFacingDirection.UP,RevHubOrientationOnRobot.UsbFacingDirection.FORWARD)));
        pinpoint=map.get(GoBildaPinpointDriver.class,"pinpoint");
        otos=null;
        if(otos!=null){otos.setLinearUnit(DistanceUnit.INCH);otos.setAngularUnit(AngleUnit.RADIANS);}
        setPose(DeckFollower.Pose.zero());
    }
    public DeckFollower.MotionState state(){return state;}
    public java.util.Map<String,Object> debug(){return java.util.Collections.emptyMap();}
    public void setPose(DeckFollower.Pose p){
        for(int i=0;i<motors.length;i++)before[i]=motors[i].getCurrentPosition();
        for(int i=0;i<pods.length;i++)podBefore[i]=pods[i].getCurrentPosition();
        oldImu=imu.getRobotYawPitchRollAngles().getYaw(AngleUnit.RADIANS);lastTime=clock.seconds();
        if(pinpoint!=null)pinpoint.setPosition(new Pose2D(DistanceUnit.INCH,p.x(),p.y(),AngleUnit.RADIANS,p.heading()));
        if(otos!=null)otos.setPosition(new SparkFunOTOS.Pose2D(p.x(),p.y(),p.heading()+Math.PI/2));
        state=DeckFollower.MotionState.ofVelocity(p,DeckFollower.Velocity.zero());
    }
    public void update(){
        double now=clock.seconds(),dt=now-lastTime;if(dt<=0)return;lastTime=now;DeckFollower.Pose p=state.pose(),next;
        double yaw=imu.getRobotYawPitchRollAngles().getYaw(AngleUnit.RADIANS),dh=DeckFollower.angle(yaw-oldImu);oldImu=yaw;
        if(pinpoint!=null){pinpoint.update();next=new DeckFollower.Pose(pinpoint.getPosX(DistanceUnit.INCH),pinpoint.getPosY(DistanceUnit.INCH),pinpoint.getHeading(AngleUnit.RADIANS));}
        else if(otos!=null){SparkFunOTOS.Pose2D q=otos.getPosition();next=new DeckFollower.Pose(q.x,q.y,q.h-Math.PI/2);}
        else {
            double[] d=new double[motors.length];for(int i=0;i<d.length;i++){int ticks=motors[i].getCurrentPosition();d[i]=(ticks-before[i])*0.0333065;before[i]=ticks;}
            double forward=(d[0]+d[1]+d[2]+d[3])/4,left=(-d[0]+d[1]+d[2]-d[3])/4;

            double mid=p.heading()+dh/2;next=new DeckFollower.Pose(p.x()+forward*Math.cos(mid)-left*Math.sin(mid),p.y()+forward*Math.sin(mid)+left*Math.cos(mid),p.heading()+dh);
        }
        state=DeckFollower.MotionState.ofVelocity(next,new DeckFollower.Velocity((next.x()-p.x())/dt,(next.y()-p.y())/dt,DeckFollower.angle(next.heading()-p.heading())/dt));
    }
    public void drive(DeckFollower.DrivePowers p,boolean manual){
        double[] powers=new double[]{p.forward()-p.strafe()-p.turn(),p.forward()+p.strafe()+p.turn(),p.forward()+p.strafe()-p.turn(),p.forward()-p.strafe()+p.turn()};
        double scale=1;for(double w:powers)scale=Math.max(scale,Math.abs(w)/Math.max(.000001,limit));
        for(int i=0;i<motors.length;i++)motors[i].setPower(limit<=0?0:powers[i]/scale);
    }
    public void stop(){for(DcMotorEx m:motors)m.setPower(0);}

    }

    public static final class DeckFollower {

    public static double angle(double v) { return Math.atan2(Math.sin(v), Math.cos(v)); }
    public static double clamp(double v, double lo, double hi) { return Math.max(lo, Math.min(hi, v)); }
    public static final class Point {
        private final double x;
        private final double y;
        public Point(double x, double y) { this.x=x;this.y=y; }
        public double x() { return x; }
        public double y() { return y; }

        public static Point cartesian(double x, double y) { return new Point(x, y); }
    }
    public static final class Pose {
        private final double x;
        private final double y;
        private final double heading;
        public Pose(double x, double y, double heading) { this.x=x;this.y=y;this.heading=heading; }
        public double x() { return x; }
        public double y() { return y; }
        public double heading() { return heading; }

        public static Pose zero() { return new Pose(0, 0, 0); }
        public double distance(Pose p) { return Math.hypot(x-p.x, y-p.y); }
    }
    public static final class Velocity {
        private final double x;
        private final double y;
        private final double heading;
        public Velocity(double x, double y, double heading) { this.x=x;this.y=y;this.heading=heading; }
        public double x() { return x; }
        public double y() { return y; }
        public double heading() { return heading; }

        public static Velocity zero() { return new Velocity(0, 0, 0); }
        public double linSpeed() { return Math.hypot(x, y); }
    }
    public static final class MotionState {
        private final Pose pose;
        private final Velocity velocity;
        public MotionState(Pose pose, Velocity velocity) { this.pose=pose;this.velocity=velocity; }
        public Pose pose() { return pose; }
        public Velocity velocity() { return velocity; }

        public static MotionState ofVelocity(Pose p, Velocity v) { return new MotionState(p, v); }
    }
    public interface Localizer {
        void update(); void setPose(Pose p); MotionState state();
        default void reset() { setPose(Pose.zero()); }
        default Map<String,Object> debug() { return java.util.Collections.emptyMap(); }
    }
    public static final class DrivePowers {
        private final double forward;
        private final double strafe;
        private final double turn;
        public DrivePowers(double forward, double strafe, double turn) { this.forward=forward;this.strafe=strafe;this.turn=turn; }
        public double forward() { return forward; }
        public double strafe() { return strafe; }
        public double turn() { return turn; }
    }
    public interface Drivetrain {
        void drive(DrivePowers p, boolean manual); void stop();
        default void stop(boolean brake) { stop(); }
        default double maxScaling(DrivePowers a, DrivePowers b) { return 1; }
        default double interpolateVelocity(double x, double y, double theta) { return 1/(Math.abs(Math.cos(theta))/x+Math.abs(Math.sin(theta))/y); }
        default Map<String,Object> debug() { return java.util.Collections.emptyMap(); }
    }
    public static final class Config {
        public double maxForward=60, maxStrafe=50, maxTurn=5, maxPathSpeed=.6, acceleration=70;
        public double positionP=.09, positionD=.01, headingP=2, headingD=.12;
        public boolean tank;
    }
    public interface Curve { Point get(double t); }
    public interface Interpolator { double interpolate(Curve curve, double t); }
    public static final class Path implements Curve {
        private final Point[] points;
        private final List<Path> parts;
        private Interpolator heading=(curve,t)->0;
        Path(Point... p) { if(p.length<2)throw new IllegalArgumentException("A path needs two points.");points=p.clone();parts=null; }
        Path(List<Path> p) { if(p.isEmpty())throw new IllegalArgumentException("Empty path.");points=null;parts=new ArrayList<>(p); }
        public Path heading(Interpolator i) { if(parts!=null)parts.forEach(p->p.heading(i));else heading=i;return this; }
        public Path constant(double h) { return heading((curve,t)->h); }
        public Point get(double t) {
            if(parts!=null){double q=clamp(t,0,1)*parts.size();return parts.get(Math.min(parts.size()-1,(int)q)).get(t==1?1:q-Math.floor(q));}
            Point[] q=points.clone();for(int n=q.length;n>1;n--)for(int i=0;i<n-1;i++)q[i]=new Point(q[i].x+(q[i+1].x-q[i].x)*t,q[i].y+(q[i+1].y-q[i].y)*t);return q[0];
        }
        public Pose endPose() { if(parts!=null)return parts.get(parts.size()-1).endPose();Point p=get(1);return new Pose(p.x,p.y,heading.interpolate(this,1)); }
        private void flatten(List<Path> out) { if(parts==null)out.add(this);else parts.forEach(p->p.flatten(out)); }
    }
    public static final class Paths {
        public static Path line(Point a, Point b) { return new Path(a,b); }
        public static Path line(Pose a, Pose b) { return line(new Point(a.x,a.y),new Point(b.x,b.y)); }
        public static Path curve(Point... p) { return new Path(p); }
        public static Path path(Path... p) { return new Path(Arrays.asList(p)); }
    }
    public enum Mode { IDLE, FOLLOWING, HOLDING }
    /** Continuous modifiers may change at a tangent boundary without a needless full stop. */
    public static boolean continuous(Path a,Path b) {
        Pose end=a.endPose();Point start=b.get(0),before=a.get(.99),after=b.get(.01);
        double ax=end.x-before.x,ay=end.y-before.y,bx=after.x-start.x,by=after.y-start.y;
        double lengths=Math.hypot(ax,ay)*Math.hypot(bx,by);
        List<Path> next=new ArrayList<>();b.flatten(next);
        return Math.hypot(end.x-start.x,end.y-start.y)<.01&&lengths>1e-6&&(ax*bx+ay*by)/lengths>.95&&Math.abs(angle(end.heading-next.get(0).heading.interpolate(next.get(0),0)))<.01;
    }
    private static final class Sample {
        private final double s;
        private final Pose pose;
        private final int part;
        public Sample(double s, Pose pose, int part) { this.s=s;this.pose=pose;this.part=part; }
        public double s() { return s; }
        public Pose pose() { return pose; }
        public int part() { return part; }
    }
    private final Localizer localizer;
    private final Drivetrain drive;
    private final Config config;
    private final LongSupplier clock;
    private final List<Sample> samples=new ArrayList<>();
    private Mode mode=Mode.IDLE;
    private Pose target=Pose.zero();
    private double progress, total, reference, speed, lastTime=-1, settled;
    private int nearest;
    public DeckFollower(Localizer l, Drivetrain d, Config c, LongSupplier nanos) { localizer=l;drive=d;config=c;clock=nanos; }
    public Pose pose() { return localizer.state().pose(); }
    public Velocity velocity() { return localizer.state().velocity(); }
    public void setPose(Pose p) { localizer.setPose(p);lastTime=-1; }
    public Config config() { return config; }
    public Mode mode() { return mode; }
    public boolean following() { return mode==Mode.FOLLOWING; }
    public boolean isBusy() { return following(); }
    public double completion() { return total>0?progress/total:1; }
    public double remainingDistance() { return Math.max(0,total-progress); }
    public int pathIndex() { return samples.isEmpty()?0:samples.get(nearest).part; }
    public Pose closestPose() { return samples.isEmpty()?target:sample(progress); }
    public void follow(Path path) {
        samples.clear();List<Path> parts=new ArrayList<>();path.flatten(parts);double arc=0;Point previous=null;
        for(int k=0;k<parts.size();k++){Path p=parts.get(k);double polygon=0;for(int i=1;i<p.points.length;i++)polygon+=Math.hypot(p.points[i].x-p.points[i-1].x,p.points[i].y-p.points[i-1].y);
            int count=Math.max(32,(int)Math.ceil(polygon*4));for(int i=0;i<=count;i++){double t=(double)i/count;Point q=p.get(t);if(previous!=null)arc+=Math.hypot(q.x-previous.x,q.y-previous.y);samples.add(new Sample(arc,new Pose(q.x,q.y,p.heading.interpolate(p,t)),k));previous=q;}}
        target=path.endPose();total=arc;progress=reference=settled=0;speed=velocity().linSpeed();nearest=0;lastTime=-1;mode=Mode.FOLLOWING;
    }
    public void hold(Pose p) { target=p;mode=Mode.HOLDING;speed=0;settled=0; }
    public void stop() { mode=Mode.IDLE;speed=0;drive.stop(); }
    private Pose sample(double s) {
        int lo=0,hi=samples.size()-1;while(lo<hi){int m=(lo+hi)/2;if(samples.get(m).s<s)lo=m+1;else hi=m;}
        if(lo==0)return samples.get(0).pose;Sample a=samples.get(lo-1),b=samples.get(lo);double t=clamp((s-a.s)/Math.max(1e-9,b.s-a.s),0,1);return new Pose(a.pose.x+(b.pose.x-a.pose.x)*t,a.pose.y+(b.pose.y-a.pose.y)*t,a.pose.heading+angle(b.pose.heading-a.pose.heading)*t);
    }
    public void update() {
        localizer.update();double now=clock.getAsLong()*1e-9,dt=lastTime<0?1.0/60:clamp(now-lastTime,.00001,.1);lastTime=now;
        if(mode==Mode.IDLE||config.maxPathSpeed<=0){drive.stop();return;}
        Pose p=pose();Velocity v=velocity();double vx=0,vy=0,omega=0;Pose aim=target;
        if(following()){
            double best=Double.POSITIVE_INFINITY;int index=nearest;
            for(int j=Math.max(0,nearest-4);j<samples.size()&&samples.get(j).s<=progress+20;j++){double d=p.distance(samples.get(j).pose);if(d<best){best=d;index=j;}}
            nearest=Math.max(nearest,index);progress=Math.max(progress,samples.get(nearest).s);
            double remaining=total-reference,cruise=config.maxForward*config.maxPathSpeed;
            // Leave braking headroom for wheel saturation, heading corrections and sensor delay.
            double wanted=Math.min(cruise,Math.sqrt(Math.max(0,.7*config.acceleration*remaining)));
            Pose here=sample(reference),look=sample(Math.min(total,reference+.5));
            double angularPerInch=Math.abs(angle(look.heading-here.heading))/Math.max(.001,Math.min(.5,total-reference));
            if(angularPerInch>1e-6)wanted=Math.min(wanted,config.maxTurn*config.maxPathSpeed*.65/angularPerInch);
            speed+=clamp(wanted-speed,-config.acceleration*dt,config.acceleration*dt);
            reference=Math.min(total,Math.min(reference+speed*dt,progress+Math.max(2,speed*.12)));
            aim=sample(reference);Pose ahead=sample(Math.min(total,reference+.25));double dx=ahead.x-aim.x,dy=ahead.y-aim.y,len=Math.hypot(dx,dy);
            if(len>1e-8&&reference<total){vx=dx/len*speed;vy=dy/len*speed;omega=angle(ahead.heading-aim.heading)/len*speed;}
            if(total-progress<.6&&p.distance(target)<.8){settled+=dt;if(settled>.1){mode=Mode.HOLDING;aim=target;vx=vy=omega=0;}}else settled=0;
        }
        double ex=aim.x-p.x,ey=aim.y-p.y,c=Math.cos(p.heading),s=Math.sin(p.heading);
        double forward=(vx*c+vy*s)/config.maxForward+config.positionP*(ex*c+ey*s)-config.positionD*((v.x-vx)*c+(v.y-vy)*s);
        double strafe=(-vx*s+vy*c)/config.maxStrafe+config.positionP*(-ex*s+ey*c)-config.positionD*(-(v.x-vx)*s+(v.y-vy)*c);
        double desiredHeading=aim.heading;
        if(config.tank&&following()&&Math.abs(forward)>.02)desiredHeading+=Math.signum(forward)*clamp(Math.atan2(-ex*s+ey*c,4),-.35,.35);
        double headingError=angle(desiredHeading-p.heading);
        double turn=config.headingP*headingError-config.headingD*(v.heading-omega)+omega/config.maxTurn;
        // Overcome the motor deadband at a nearly stationary heading error. Without this,
        // a light/fast drivetrain can stop just outside the turn-settling tolerance.
        if(Math.abs(headingError)>.015&&Math.abs(v.heading)<.1&&Math.abs(turn)<.045)turn=Math.copySign(.045,headingError);
        if(config.tank)strafe=0;
        double limit=config.maxPathSpeed,scale=Math.max(1,(Math.abs(forward)+Math.abs(strafe)+Math.abs(turn))/Math.max(.000001,limit));
        drive.drive(new DrivePowers(forward/scale,strafe/scale,turn/scale),true);
    }

    }

    public static class Mechanisms {

    public static final String[] INTAKE_MOTORS = {"intake", "intake2"};
    public static final double[] INTAKE_POWERS = {1.0, 1.0};
    public static final String[] FLYWHEEL_MOTORS = {"shooter", "shooter2"}, INDEXERS = {"indexer", "indexer2"};
    /** Each shooter's turret motor, or null for a fixed shooter. */
    public static final String[] TURRET_MOTORS = {"turret", "turret2"};
    /** Where each turret turns, inches forward and left of the robot's center: each aims from its own spot. */
    public static final double[] TURRET_X = {0.0, 0.0}, TURRET_Y = {4.7, -4.7};
    public static final double TRANSFER_SECONDS = 0.8, INDEX_SECONDS = 0.25, INDEXER_POWER = 1.0, FIRE_MARGIN_SECONDS = 0.15;
    public static final double FLYWHEEL_TICKS_PER_SECOND = 1586.67, SPIN_UP_SECONDS = 0.6;
    /** Pieces the robot can hold: 4 pollen. */
    public static final int STORAGE = 4;
    /** The field points shots aim at, in inches: the hive cell up at the start, and the other cell. */
    public static final double TARGET_X = 59.25, TARGET_Y = 58.5602, OTHER_TARGET_X = 59.25, OTHER_TARGET_Y = 85.4398;
    public static final double TURRET_TICKS_PER_DEGREE = 4.6, TURRET_MIN_DEGREES = -170.0, TURRET_MAX_DEGREES = 170.0, TURRET_POWER = 1.0;

    private final DcMotorEx[] intakes = new DcMotorEx[INTAKE_MOTORS.length];
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
        if (on && intakes.length > 0) lastIntake = clock.seconds();
        for (int i = 0; i < intakes.length; i++) intakes[i].setPower(on ? INTAKE_POWERS[i] : 0);
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
    public void aim(DeckFollower.Pose pose, int cell) {
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
        if (feedStart < 0 && ready() && aimed() && now - lastIntake >= TRANSFER_SECONDS) feedStart = now;
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
}
