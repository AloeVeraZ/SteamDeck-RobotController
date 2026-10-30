package org.firstinspires.ftc.teamcode;

import com.qualcomm.hardware.gobilda.GoBildaPinpointDriver;
import com.qualcomm.hardware.lynx.LynxModule;
import com.qualcomm.hardware.rev.RevHubOrientationOnRobot;
import com.qualcomm.hardware.sparkfun.SparkFunOTOS;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.eventloop.opmode.TeleOp;
import com.qualcomm.robotcore.hardware.AnalogInput;
import com.qualcomm.robotcore.hardware.CRServo;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorEx;
import com.qualcomm.robotcore.hardware.DigitalChannel;
import com.qualcomm.robotcore.hardware.DistanceSensor;
import com.qualcomm.robotcore.hardware.HardwareDevice;
import com.qualcomm.robotcore.hardware.IMU;
import com.qualcomm.robotcore.hardware.NormalizedColorSensor;
import com.qualcomm.robotcore.hardware.NormalizedRGBA;
import com.qualcomm.robotcore.hardware.PwmControl;
import com.qualcomm.robotcore.hardware.Servo;
import com.qualcomm.robotcore.hardware.TouchSensor;
import com.qualcomm.robotcore.hardware.VoltageSensor;

import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.CurrentUnit;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;
import org.firstinspires.ftc.robotcore.external.navigation.YawPitchRollAngles;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Torque's live hardware debug (Calibrate → Electronics → Live debug). Deck installs this file with OnBot Java; it is
 * the same for every robot: it finds every motor, servo, continuous servo, digital and analog input and I2C sensor in
 * the active configuration, and while it runs it streams their readings to Deck and drives the outputs Deck asks for.
 *
 * It listens on TCP port 20886 (Deck reaches it through ADB on the USB cable, or at the hub's address on its Wi-Fi).
 * Robot to Deck: one JSON line describing the devices, then one JSON line of readings each loop (at most 50 a second),
 * stamped with this hub's clock. Deck to robot: one tab-separated command a line (see apply()). Outputs are written
 * only by this op mode's loop, and only while Deck keeps talking: a motor or continuous servo power lasts WATCHDOG_MS
 * unless Deck sends it again (Deck repeats it while its slider is held), and with nothing heard for WATCHDOG_MS, or the
 * connection closed, every motor and continuous servo stops and servos that are not latched go limp. STOP on the Driver Station
 * stops everything too. Hub reads follow gm0: one bulk read per hub per loop; motor current and I2C sensors, which each
 * cost a transaction of their own, one device a loop in turn.
 */
@TeleOp(name = "Deck Debug", group = "Deck")
public class DeckDebug extends LinearOpMode {
    public static final int PORT = 20886;
    static final long WATCHDOG_MS = 300, FRAME_MS = 20;
    /** A motor drawing more than this for STALL_MS is cut until it is commanded again (a 312 RPM goBILDA stalls at 9.2 A). */
    static final double STALL_AMPS = 7.0;
    static final long STALL_MS = 400;

    // ---- devices, in the order the manifest lists them
    final List<String> motorNames = new ArrayList<>(), servoNames = new ArrayList<>(), crNames = new ArrayList<>(), digitalNames = new ArrayList<>(), touchNames = new ArrayList<>(), analogNames = new ArrayList<>(), i2cNames = new ArrayList<>(), i2cKinds = new ArrayList<>();
    final List<DcMotorEx> motors = new ArrayList<>();
    final List<Servo> servos = new ArrayList<>();
    final List<CRServo> crservos = new ArrayList<>();
    final List<DigitalChannel> digitals = new ArrayList<>();
    final List<TouchSensor> touches = new ArrayList<>();
    final List<AnalogInput> analogs = new ArrayList<>();
    final List<HardwareDevice> i2c = new ArrayList<>();
    List<LynxModule> hubs = new ArrayList<>();
    VoltageSensor battery;

    // ---- what Deck has asked for
    double[] motorPower, motorAmps, crPower, servoPos;
    boolean[] servoOn, servoLatched, motorCut;
    long[] motorOverSince, motorAt, crAt;
    String[] i2cLast;
    long[] i2cAt;
    /** A loop Deck runs on the robot (a step test): one actuator, one sensor, gains in the sensor's raw units. */
    static final class Loop {
        String actuator, sensor, mode; boolean cr; int index, sensorIndex; boolean analog;
        double target, kP, kI, kD, kF, kS, kG, tol, wrap, integral, last = Double.NaN, out, error;
    }
    Loop loop;

    final ConcurrentLinkedQueue<String> commands = new ConcurrentLinkedQueue<>();
    final AtomicReference<String> latest = new AtomicReference<>();
    volatile long heard;
    volatile boolean connected, running = true;
    volatile String manifest = "";
    ServerSocket server;
    Socket client;
    final Object wake = new Object();

    @Override
    public void runOpMode() throws InterruptedException {
        hubs = hardwareMap.getAll(LynxModule.class);
        for (LynxModule hub : hubs) hub.setBulkCachingMode(LynxModule.BulkCachingMode.MANUAL);
        for (DcMotorEx m : hardwareMap.getAll(DcMotorEx.class)) { motors.add(m); motorNames.add(nameOf(m)); }
        for (Servo s : hardwareMap.getAll(Servo.class)) { servos.add(s); servoNames.add(nameOf(s)); }
        for (CRServo s : hardwareMap.getAll(CRServo.class)) { crservos.add(s); crNames.add(nameOf(s)); }
        for (DigitalChannel d : hardwareMap.getAll(DigitalChannel.class)) { d.setMode(DigitalChannel.Mode.INPUT); digitals.add(d); digitalNames.add(nameOf(d)); }
        for (TouchSensor t : hardwareMap.getAll(TouchSensor.class)) { touches.add(t); touchNames.add(nameOf(t)); }
        for (AnalogInput a : hardwareMap.getAll(AnalogInput.class)) { analogs.add(a); analogNames.add(nameOf(a)); }
        for (IMU imu : hardwareMap.getAll(IMU.class)) {
            // Deck reads yaw, pitch and roll as the hub lies flat, logo up and USB forward; the robot's own code sets the real mounting.
            try { imu.initialize(new IMU.Parameters(new RevHubOrientationOnRobot(RevHubOrientationOnRobot.LogoFacingDirection.UP, RevHubOrientationOnRobot.UsbFacingDirection.FORWARD))); } catch (RuntimeException ignored) { }
            addI2c(imu, "imu");
        }
        for (GoBildaPinpointDriver p : hardwareMap.getAll(GoBildaPinpointDriver.class)) addI2c(p, "pinpoint");
        for (SparkFunOTOS o : hardwareMap.getAll(SparkFunOTOS.class)) addI2c(o, "otos");
        for (NormalizedColorSensor c : hardwareMap.getAll(NormalizedColorSensor.class)) addI2c(c, "color");
        // A colour sensor is a distance sensor too: it is one device, read once.
        for (DistanceSensor d : hardwareMap.getAll(DistanceSensor.class)) if (!(d instanceof NormalizedColorSensor)) addI2c(d, "distance");
        List<VoltageSensor> volts = hardwareMap.getAll(VoltageSensor.class);
        battery = volts.isEmpty() ? null : volts.get(0);

        motorPower = new double[motors.size()]; motorAmps = new double[motors.size()]; motorCut = new boolean[motors.size()]; motorOverSince = new long[motors.size()]; motorAt = new long[motors.size()]; crAt = new long[crservos.size()];
        crPower = new double[crservos.size()]; servoPos = new double[servos.size()]; servoOn = new boolean[servos.size()]; servoLatched = new boolean[servos.size()];
        i2cLast = new String[i2c.size()]; i2cAt = new long[i2c.size()];
        for (int i = 0; i < motors.size(); i++) { motorAmps[i] = Double.NaN; motors.get(i).setPower(0); }
        for (int i = 0; i < servos.size(); i++) { servoPos[i] = Double.NaN; if (servos.get(i) instanceof PwmControl) ((PwmControl) servos.get(i)).setPwmDisable(); }
        manifest = manifest();

        Thread serve = new Thread(this::serve, "Deck Debug server"), send = new Thread(this::send, "Deck Debug sender");
        serve.setDaemon(true); send.setDaemon(true); serve.start(); send.start();
        telemetry.addLine("Deck Debug: press START, then connect from Torque (Calibrate → Electronics → Live debug).");
        telemetry.addData("Devices", "%d motors, %d servos, %d CR servos, %d digital, %d analog, %d I2C", motors.size(), servos.size(), crservos.size(), digitals.size() + touches.size(), analogs.size(), i2c.size());
        telemetry.update();
        waitForStart();
        long start = System.nanoTime(), lastFrame = 0, loops = 0, loopStart = System.nanoTime();
        double loopMs = 0, volts12 = Double.NaN;
        int turn = 0;
        try {
            while (opModeIsActive()) {
                for (LynxModule hub : hubs) hub.clearBulkCache();
                long now = System.currentTimeMillis();
                for (String line; (line = commands.poll()) != null; ) apply(line);
                // The watchdog: Deck went quiet or hung up.
                if (!connected || now - heard > WATCHDOG_MS) stopOutputs(false);
                // A power Deck stopped repeating has expired (a slider let go without its 0 arriving).
                for (int i = 0; i < motors.size(); i++) if (now - motorAt[i] > WATCHDOG_MS && !(loop != null && !loop.cr && loop.index == i)) motorPower[i] = 0;
                for (int i = 0; i < crservos.size(); i++) if (now - crAt[i] > WATCHDOG_MS && !(loop != null && loop.cr && loop.index == i)) crPower[i] = 0;
                runLoop();
                for (int i = 0; i < motors.size(); i++) motors.get(i).setPower(motorCut[i] ? 0 : motorPower[i]);
                for (int i = 0; i < crservos.size(); i++) crservos.get(i).setPower(crPower[i]);
                for (int i = 0; i < servos.size(); i++) {
                    Servo s = servos.get(i);
                    if (servoOn[i] && !Double.isNaN(servoPos[i])) { if (s instanceof PwmControl && !((PwmControl) s).isPwmEnabled()) ((PwmControl) s).setPwmEnable(); s.setPosition(servoPos[i]); }
                    else if (s instanceof PwmControl && ((PwmControl) s).isPwmEnabled()) ((PwmControl) s).setPwmDisable();
                }
                // One motor's current and one I2C sensor a loop, in turn.
                if (!motors.isEmpty()) { int m = turn % motors.size(); motorAmps[m] = motors.get(m).getCurrent(CurrentUnit.AMPS); stall(m, now); }
                if (!i2c.isEmpty()) { int k = turn % i2c.size(); i2cLast[k] = readI2c(k); i2cAt[k] = now; }
                if (battery != null && turn % 25 == 0) volts12 = battery.getVoltage();
                turn++; loops++;
                long t = System.nanoTime();
                if (loops % 20 == 0) { loopMs = (t - loopStart) / 20e6; loopStart = t; }
                if (connected && now - lastFrame >= FRAME_MS) { lastFrame = now; latest.set(frame((t - start) / 1e6, loopMs, volts12, now)); synchronized (wake) { wake.notifyAll(); } }
                if (turn % 10 == 0) { telemetry.addData("Deck Debug", connected ? "Torque connected" : "Waiting for Torque on port " + PORT); telemetry.addData("Loop", "%.1f ms", loopMs); telemetry.update(); }
            }
        } finally {
            running = false; stopOutputs(true);
            for (int i = 0; i < motors.size(); i++) motors.get(i).setPower(0);
            for (CRServo s : crservos) s.setPower(0);
            close();
        }
    }

    // ---- commands from Deck: a letter, then tab-separated fields
    //   P                         still here (feeds the watchdog)
    //   M name power              motor power, -1..1, for WATCHDOG_MS unless sent again (cancels a loop on it)
    //   C name power              continuous servo power, -1..1, the same
    //   S name position           servo position, 0..1 (turns its pulses on)
    //   E name 0|1                servo pulses off or on
    //   L name 0|1                latch: the servo keeps its position when the watchdog fires
    //   R name                    reset the motor's encoder to 0
    //   Q actuator sensor mode target kP kI kD kF kS kG tolerance wrap
    //                             run a loop here: actuator a motor or CR servo; sensor "enc:<motor>" or "ana:<analog>";
    //                             mode pos (target in ticks or volts) or vel (ticks a second); wrap > 0 takes the
    //                             shortest way round a circle of that many units; gains in power per raw unit
    //   T target                  move the running loop's target
    //   X                         stop: every output off, loops ended, servos limp unless latched
    void apply(String line) {
        String[] f = line.split("\t", -1);
        if (f.length == 0 || f[0].isEmpty()) return;
        try {
            switch (f[0]) {
                case "P": break;
                case "M": { int i = motorNames.indexOf(f[1]); if (i >= 0) { if (loop != null && !loop.cr && loop.index == i) loop = null; motorPower[i] = clamp(Double.parseDouble(f[2]), -1, 1); motorAt[i] = System.currentTimeMillis(); motorCut[i] = false; motorOverSince[i] = 0; } break; }
                case "C": { int i = crNames.indexOf(f[1]); if (i >= 0) { if (loop != null && loop.cr && loop.index == i) loop = null; crPower[i] = clamp(Double.parseDouble(f[2]), -1, 1); crAt[i] = System.currentTimeMillis(); } break; }
                case "S": { int i = servoNames.indexOf(f[1]); if (i >= 0) { servoPos[i] = clamp(Double.parseDouble(f[2]), 0, 1); servoOn[i] = true; } break; }
                case "E": { int i = servoNames.indexOf(f[1]); if (i >= 0) servoOn[i] = "1".equals(f[2]) && !Double.isNaN(servoPos[i]); break; }
                case "L": { int i = servoNames.indexOf(f[1]); if (i >= 0) servoLatched[i] = "1".equals(f[2]); break; }
                case "R": { int i = motorNames.indexOf(f[1]); if (i >= 0) { DcMotorEx m = motors.get(i); m.setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER); m.setMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER); } break; }
                case "Q": startLoop(f); break;
                case "T": if (loop != null) { loop.target = Double.parseDouble(f[1]); loop.integral = 0; } break;
                case "X": stopOutputs(false); break;
                default: break;
            }
        } catch (RuntimeException ignored) { }
    }

    void startLoop(String[] f) {
        Loop l = new Loop();
        l.actuator = f[1]; l.sensor = f[2]; l.mode = f[3];
        l.index = motorNames.indexOf(f[1]);
        if (l.index < 0) { l.index = crNames.indexOf(f[1]); l.cr = true; }
        if (l.index < 0) return;
        if (f[2].startsWith("ana:")) { l.analog = true; l.sensorIndex = analogNames.indexOf(f[2].substring(4)); }
        else l.sensorIndex = motorNames.indexOf(f[2].startsWith("enc:") ? f[2].substring(4) : f[1]);
        if (l.sensorIndex < 0) return;
        l.target = Double.parseDouble(f[4]); l.kP = Double.parseDouble(f[5]); l.kI = Double.parseDouble(f[6]); l.kD = Double.parseDouble(f[7]);
        l.kF = Double.parseDouble(f[8]); l.kS = Double.parseDouble(f[9]); l.kG = Double.parseDouble(f[10]); l.tol = Math.abs(Double.parseDouble(f[11])); l.wrap = Double.parseDouble(f[12]);
        if (!l.cr) { motorCut[l.index] = false; motorOverSince[l.index] = 0; }
        loop = l;
    }

    /** The loop Deck asked for, one step: PID on the sensor's raw reading, plus feedforward (kF for speed, kS against friction, kG against gravity). */
    void runLoop() {
        Loop l = loop;
        if (l == null) return;
        boolean vel = "vel".equals(l.mode);
        double measured = l.analog ? analogs.get(l.sensorIndex).getVoltage() : vel ? motors.get(l.sensorIndex).getVelocity() : motors.get(l.sensorIndex).getCurrentPosition();
        double e = l.target - measured;
        if (l.wrap > 0) { e %= l.wrap; if (e > l.wrap / 2) e -= l.wrap; if (e < -l.wrap / 2) e += l.wrap; }
        double dt = FRAME_MS / 1000.0, d = Double.isNaN(l.last) ? 0 : (e - l.last) / dt;
        l.last = e;
        l.integral = clamp(l.integral + e * dt, -1e6, 1e6);
        double out = l.kP * e + l.kI * l.integral + l.kD * d + l.kG;
        if (vel) out += l.kF * l.target + l.kS * Math.signum(l.target);
        else if (Math.abs(e) > l.tol) out += l.kS * Math.signum(e);
        l.out = clamp(out, -1, 1); l.error = e;
        if (l.cr) crPower[l.index] = l.out; else motorPower[l.index] = l.out;
    }

    void stall(int m, long now) {
        if (Math.abs(motorPower[m]) > 0.05 && motorAmps[m] > STALL_AMPS) { if (motorOverSince[m] == 0) motorOverSince[m] = now; else if (now - motorOverSince[m] > STALL_MS) { motorCut[m] = true; if (loop != null && !loop.cr && loop.index == m) loop = null; } }
        else motorOverSince[m] = 0;
    }

    void stopOutputs(boolean all) {
        loop = null;
        java.util.Arrays.fill(motorPower, 0);
        java.util.Arrays.fill(crPower, 0);
        for (int i = 0; i < servos.size(); i++) if (all || !servoLatched[i]) servoOn[i] = false;
    }

    // ---- readings
    String readI2c(int k) {
        HardwareDevice d = i2c.get(k);
        try {
            switch (i2cKinds.get(k)) {
                case "imu": {
                    IMU imu = (IMU) d; YawPitchRollAngles a = imu.getRobotYawPitchRollAngles();
                    return "{\"yaw\":" + num(a.getYaw(AngleUnit.DEGREES)) + ",\"pitch\":" + num(a.getPitch(AngleUnit.DEGREES)) + ",\"roll\":" + num(a.getRoll(AngleUnit.DEGREES)) + ",\"wz\":" + num(imu.getRobotAngularVelocity(AngleUnit.DEGREES).zRotationRate) + "}";
                }
                case "pinpoint": {
                    GoBildaPinpointDriver p = (GoBildaPinpointDriver) d; p.update();
                    return "{\"x\":" + num(p.getPosX(DistanceUnit.MM)) + ",\"y\":" + num(p.getPosY(DistanceUnit.MM)) + ",\"h\":" + num(p.getHeading(AngleUnit.DEGREES)) + ",\"ex\":" + p.getEncoderX() + ",\"ey\":" + p.getEncoderY() + ",\"status\":" + str(String.valueOf(p.getDeviceStatus())) + "}";
                }
                case "otos": {
                    SparkFunOTOS o = (SparkFunOTOS) d; SparkFunOTOS.Pose2D p = o.getPosition();
                    return "{\"x\":" + num(p.x) + ",\"y\":" + num(p.y) + ",\"h\":" + num(p.h) + "}";
                }
                case "color": {
                    NormalizedRGBA c = ((NormalizedColorSensor) d).getNormalizedColors();
                    String dist = d instanceof DistanceSensor ? ",\"d\":" + num(((DistanceSensor) d).getDistance(DistanceUnit.CM)) : "";
                    return "{\"r\":" + num(c.red) + ",\"g\":" + num(c.green) + ",\"b\":" + num(c.blue) + ",\"a\":" + num(c.alpha) + dist + "}";
                }
                case "distance": return "{\"d\":" + num(((DistanceSensor) d).getDistance(DistanceUnit.CM)) + "}";
                default: return "null";
            }
        } catch (RuntimeException e) { return "{\"error\":" + str(e.getClass().getSimpleName()) + "}"; }
    }

    String frame(double t, double loopMs, double volts, long now) {
        StringBuilder b = new StringBuilder(512);
        b.append("{\"t\":").append(num(t)).append(",\"loop\":").append(num(loopMs)).append(",\"v\":").append(num(volts)).append(",\"m\":[");
        for (int i = 0; i < motors.size(); i++) { DcMotorEx m = motors.get(i); if (i > 0) b.append(','); b.append('[').append(m.getCurrentPosition()).append(',').append(num(m.getVelocity())).append(',').append(num(motorCut[i] ? 0 : motorPower[i])).append(',').append(num(motorAmps[i])).append(',').append(motorCut[i] ? 1 : 0).append(']'); }
        b.append("],\"s\":[");
        for (int i = 0; i < servos.size(); i++) { if (i > 0) b.append(','); b.append('[').append(num(servoPos[i])).append(',').append(servoOn[i] ? 1 : 0).append(',').append(servoLatched[i] ? 1 : 0).append(']'); }
        b.append("],\"c\":[");
        for (int i = 0; i < crservos.size(); i++) { if (i > 0) b.append(','); b.append(num(crPower[i])); }
        b.append("],\"d\":[");
        for (int i = 0; i < digitals.size(); i++) { if (i > 0) b.append(','); b.append(digitals.get(i).getState() ? 1 : 0); }
        b.append("],\"touch\":[");
        for (int i = 0; i < touches.size(); i++) { if (i > 0) b.append(','); b.append(touches.get(i).isPressed() ? 1 : 0); }
        b.append("],\"a\":[");
        for (int i = 0; i < analogs.size(); i++) { if (i > 0) b.append(','); b.append(num(analogs.get(i).getVoltage())); }
        b.append("],\"i\":[");
        for (int i = 0; i < i2c.size(); i++) { if (i > 0) b.append(','); b.append("{\"age\":").append(i2cLast[i] == null ? "null" : String.valueOf(now - i2cAt[i])).append(",\"v\":").append(i2cLast[i] == null ? "null" : i2cLast[i]).append('}'); }
        b.append(']');
        Loop l = loop;
        if (l != null) b.append(",\"q\":{\"actuator\":").append(str(l.actuator)).append(",\"target\":").append(num(l.target)).append(",\"error\":").append(num(l.error)).append(",\"out\":").append(num(l.out)).append('}');
        return b.append('}').toString();
    }

    String manifest() {
        StringBuilder b = new StringBuilder("{\"deck\":\"debug\",\"version\":1");
        list(b, "motors", motorNames); list(b, "servos", servoNames); list(b, "crservos", crNames); list(b, "digital", digitalNames); list(b, "touch", touchNames);
        b.append(",\"analog\":[");
        for (int i = 0; i < analogs.size(); i++) { if (i > 0) b.append(','); b.append("{\"n\":").append(str(analogNames.get(i))).append(",\"max\":").append(num(analogs.get(i).getMaxVoltage())).append('}'); }
        b.append("],\"i2c\":[");
        for (int i = 0; i < i2c.size(); i++) { if (i > 0) b.append(','); b.append("{\"n\":").append(str(i2cNames.get(i))).append(",\"k\":").append(str(i2cKinds.get(i))).append('}'); }
        b.append("],\"hubs\":[");
        for (int i = 0; i < hubs.size(); i++) { LynxModule h = hubs.get(i); if (i > 0) b.append(','); b.append("{\"n\":").append(str(nameOf(h))).append(",\"address\":").append(h.getModuleAddress()).append(",\"parent\":").append(h.isParent()).append('}'); }
        return b.append("]}").toString();
    }

    void addI2c(HardwareDevice d, String kind) { for (HardwareDevice x : i2c) if (x == d) return; i2c.add(d); i2cNames.add(nameOf(d)); i2cKinds.add(kind); }
    String nameOf(HardwareDevice d) { Iterator<String> names = hardwareMap.getNamesOf(d).iterator(); return names.hasNext() ? names.next() : d.getDeviceName(); }
    static void list(StringBuilder b, String key, List<String> names) { b.append(",\"").append(key).append("\":["); for (int i = 0; i < names.size(); i++) { if (i > 0) b.append(','); b.append(str(names.get(i))); } b.append(']'); }
    static double clamp(double v, double lo, double hi) { return Math.max(lo, Math.min(hi, v)); }
    static String num(double v) { return Double.isNaN(v) || Double.isInfinite(v) ? "null" : String.valueOf(Math.round(v * 10000) / 10000.0); }
    static String str(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) { if (c == '"' || c == '\\') b.append('\\').append(c); else if (c < 0x20) b.append(' '); else b.append(c); }
        return b.append('"').toString();
    }

    // ---- the connection: one Deck at a time; a newer one takes over
    void serve() {
        try {
            server = new ServerSocket(); server.setReuseAddress(true); server.bind(new InetSocketAddress(PORT));
            while (running) {
                Socket s = server.accept();
                s.setTcpNoDelay(true);
                synchronized (this) { closeClient(); client = s; }
                heard = System.currentTimeMillis(); connected = true; latest.set(null);
                synchronized (wake) { wake.notifyAll(); }
                Thread read = new Thread(() -> read(s), "Deck Debug reader"); read.setDaemon(true); read.start();
            }
        } catch (IOException ignored) { }
    }
    void read(Socket s) {
        try (BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8))) {
            for (String line; running && (line = in.readLine()) != null; ) { heard = System.currentTimeMillis(); if (commands.size() < 256) commands.add(line); }
        } catch (IOException ignored) { }
        synchronized (this) { if (client == s) { connected = false; closeClient(); } }
    }
    void send() {
        Socket sentTo = null;
        while (running) {
            try {
                Socket s; synchronized (this) { s = client; }
                if (s == null) { synchronized (wake) { wake.wait(200); } continue; }
                OutputStream out = s.getOutputStream();
                if (s != sentTo) { out.write((manifest + "\n").getBytes(StandardCharsets.UTF_8)); out.flush(); sentTo = s; }
                String f = latest.getAndSet(null);
                if (f == null) { synchronized (wake) { wake.wait(100); } continue; }
                out.write((f + "\n").getBytes(StandardCharsets.UTF_8)); out.flush();
            } catch (IOException e) { synchronized (this) { connected = false; closeClient(); } sentTo = null; }
            catch (InterruptedException e) { return; }
        }
    }
    synchronized void closeClient() { if (client != null) { try { client.close(); } catch (IOException ignored) { } client = null; } }
    void close() { synchronized (this) { closeClient(); } try { if (server != null) server.close(); } catch (IOException ignored) { } }
}
