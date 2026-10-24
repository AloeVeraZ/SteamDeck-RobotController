package deck.sim.hub;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.eventloop.opmode.OpMode;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.HardwareMap;
import java.io.File;
import java.io.StringWriter;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.DoubleSupplier;
import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;

/**
 * A virtual REV Control Hub for exported autonomous code. The team files (OpMode, Constants,
 * route, Deck controller and hardware adapter) are compiled against FTC SDK stand-ins,
 * then run in lockstep with the simulation: the drive motors with encoders (four
 * mecanum, or two or four tank), odometry pods, Pinpoint/OTOS and the built-in IMU are fed from the
 * simulated sensors, and the motor powers the OpMode sets are turned back into chassis motion
 * through mecanum or tank kinematics.
 */
public final class VirtualHub {
    /** A problem in the team code, reported with the stage it happened in. */
    public static final class HubException extends RuntimeException {
        public final String stage;
        public final List<String> details;
        HubException(String stage, String message, List<String> details, Throwable cause) {
            super(message, cause);
            this.stage = stage;
            this.details = details;
        }
    }

    private static final class Pod {
        final SimMotor port;
        final double x, y, ticksPerInch;
        final boolean forward;
        Pod(SimMotor port, double x, double y, double ticksPerInch, boolean forward) {
            this.port = port; this.x = x; this.y = y; this.ticksPerInch = ticksPerInch; this.forward = forward;
        }
    }

    private final HardwareMap map = new HardwareMap() {};
    private final Map<String, SimMotor> drive = new LinkedHashMap<>();
    private final List<Pod> pods = new ArrayList<>();
    private final SimTelemetry telemetry = new SimTelemetry();
    private final SimSensors.Imu imu = new SimSensors.Imu();
    private SimSensors.Pinpoint pinpoint;
    private SimSensors.Otos otos;
    private final double wheelTicksPerInch, turnArm;
    private final boolean tank;
    private final String className;
    private double gyro;
    // Mechanisms named by the export: intake rollers (motors or continuous servos), kicker and ramp servos, and
    // shooters (flywheel motors, a feeder and a turret when it has one). Any may be absent. Each device's mount
    // is the physical truth from the setup (-1: mounted to turn the other way), so the code has to set the
    // same direction for a roller to pull pieces in or a flywheel to spin forward.
    /** Intake rollers: each one's pull-in command (mount x applied power), grouped by the intake they belong to. */
    private final Map<Integer, List<DoubleSupplier>> rollers = new LinkedHashMap<>();
    /** Kicker servos with their down and up positions: a kicker sent down counts as the intake running. */
    private final List<SimServo> kickers = new ArrayList<>();
    private final List<double[]> kickerPositions = new ArrayList<>();
    /** Ramp servos with their down and up positions: a ramp sent down folds down (its rollers are intake rollers). */
    private final List<SimServo> ramps = new ArrayList<>();
    private final List<double[]> rampPositions = new ArrayList<>();
    private final List<Shooter> shooters = new ArrayList<>();

    private static final class Shooter {
        final List<SimMotor> flywheels = new ArrayList<>();
        final List<Integer> flywheelMounts = new ArrayList<>();
        /** The feeder's command: a motor or continuous servo's mount x power, or 1 while a servo feeder sits nearer its feed position. */
        DoubleSupplier feeder = () -> 0;
        SimMotor turret;
        SimServo turretServo;
        int turretMount = 1;
        double full = 1, turretTicksPerDegree = 1, turretCenter = .5, turretDegrees = 300;

        /** Every motor of the flywheel has to spin it forward: the weakest one counts (a fraction of full speed). */
        double flywheel() {
            double weakest = Double.NaN;
            for (int i = 0; i < flywheels.size(); i++) {
                double v = flywheelMounts.get(i) * flywheels.get(i).commanded(full);
                weakest = Double.isNaN(weakest) ? v : Math.min(weakest, v);
            }
            return Double.isNaN(weakest) ? 0 : weakest;
        }

        /** The angle the turret was sent to, degrees from the robot's front (NaN when it is not positioning). */
        double turretTarget() {
            if (turret != null) { double t = turret.targetTicks(); return Double.isNaN(t) ? t : turretMount * t / turretTicksPerDegree; }
            if (turretServo != null) { double p = turretServo.output(); return Double.isNaN(p) ? p : turretMount * (p - turretCenter) * turretDegrees; }
            return Double.NaN;
        }
    }
    private VirtualHub(JsonObject hub, double heading) {
        JsonObject d = hub.getAsJsonObject("drive");
        wheelTicksPerInch = d.get("ticksPerInch").getAsDouble();
        tank = d.has("kind") && "tank".equals(d.get("kind").getAsString());
        // Mecanum wheels turn on the sum of half-length and half-width; tank wheels on the half-track.
        turnArm = tank ? d.get("halfWidth").getAsDouble() : d.get("halfLength").getAsDouble() + d.get("halfWidth").getAsDouble();
        int port = 0;
        for (Map.Entry<String, JsonElement> e : d.getAsJsonObject("motors").entrySet()) {
            JsonObject m = e.getValue().getAsJsonObject();
            SimMotor motor = new SimMotor(port++, m.get("mount").getAsInt());
            drive.put(e.getKey(), motor);
            map.put(m.get("name").getAsString(), motor);
        }
        if (hub.has("pods")) for (JsonElement e : hub.getAsJsonArray("pods")) {
            JsonObject p = e.getAsJsonObject();
            SimMotor encoder = new SimMotor(port++, 1);
            pods.add(new Pod(encoder, p.get("x").getAsDouble(), p.get("y").getAsDouble(), p.get("ticksPerInch").getAsDouble(), "forward".equals(p.get("axis").getAsString())));
            map.put(p.get("name").getAsString(), encoder);
        }
        gyro = heading;
        imu.heading = heading;
        map.put(hub.has("imu") ? hub.get("imu").getAsString() : "imu", imu);
        if (hub.has("pinpoint")) { pinpoint = new SimSensors.Pinpoint(); pinpoint.gyro = heading; map.put(hub.get("pinpoint").getAsString(), pinpoint); }
        if (hub.has("otos")) { otos = new SimSensors.Otos(); otos.gyro = heading; map.put(hub.get("otos").getAsString(), otos); }
        map.put("Control Hub", new SimSensors.Battery());
        if (hub.has("mechanisms")) {
            JsonObject mech = hub.getAsJsonObject("mechanisms");
            int servoPort = 0;
            if (mech.has("intakes")) for (JsonElement e : mech.getAsJsonArray("intakes")) {
                // A roller: {name, kind motor|crservo, mount, part}; older exports list motor names only.
                JsonObject r = e.isJsonObject() ? e.getAsJsonObject() : new JsonObject();
                String name = e.isJsonObject() ? r.get("name").getAsString() : e.getAsString();
                int mount = mount(r), part = r.has("part") ? r.get("part").getAsInt() : rollers.size();
                DoubleSupplier pull;
                if (r.has("kind") && "crservo".equals(r.get("kind").getAsString())) { SimCRServo servo = new SimCRServo(servoPort++); map.put(name, servo); pull = () -> mount * servo.output(); }
                else { SimMotor motor = new SimMotor(port++, 1); map.put(name, motor); pull = () -> mount * motor.commanded(1); }
                rollers.computeIfAbsent(part, k -> new ArrayList<>()).add(pull);
            }
            if (mech.has("kickers")) for (JsonElement e : mech.getAsJsonArray("kickers")) {
                JsonObject k = e.getAsJsonObject();
                SimServo servo = new SimServo(servoPort++);
                kickers.add(servo);
                kickerPositions.add(new double[] { k.get("down").getAsDouble(), k.get("up").getAsDouble() });
                map.put(k.get("name").getAsString(), servo);
            }
            if (mech.has("ramps")) for (JsonElement e : mech.getAsJsonArray("ramps")) {
                JsonObject k = e.getAsJsonObject();
                SimServo servo = new SimServo(servoPort++);
                ramps.add(servo);
                rampPositions.add(new double[] { k.get("down").getAsDouble(), k.get("up").getAsDouble() });
                map.put(k.get("name").getAsString(), servo);
            }
            if (mech.has("shooters")) for (JsonElement e : mech.getAsJsonArray("shooters")) {
                JsonObject s = e.getAsJsonObject();
                Shooter shooter = new Shooter();
                // Flywheel motors: {flywheels: [{name, mount}], ticksPerSecond}; older exports have one flywheel {name, ticksPerSecond}.
                if (s.has("flywheels")) {
                    shooter.full = s.get("ticksPerSecond").getAsDouble();
                    for (JsonElement f : s.getAsJsonArray("flywheels")) {
                        SimMotor motor = new SimMotor(port++, 1);
                        map.put(f.getAsJsonObject().get("name").getAsString(), motor);
                        shooter.flywheels.add(motor);
                        shooter.flywheelMounts.add(mount(f.getAsJsonObject()));
                    }
                } else {
                    JsonObject f = s.getAsJsonObject("flywheel");
                    SimMotor motor = new SimMotor(port++, 1);
                    map.put(f.get("name").getAsString(), motor);
                    shooter.flywheels.add(motor);
                    shooter.flywheelMounts.add(1);
                    shooter.full = f.get("ticksPerSecond").getAsDouble();
                }
                // The feeder: a motor or continuous servo (mount x power), or a servo pusher or gate (at its feed position or not).
                JsonObject x = s.getAsJsonObject("indexer");
                String kind = x.get("kind").getAsString(), feederName = x.get("name").getAsString();
                int feederMount = mount(x);
                if ("crservo".equals(kind)) { SimCRServo servo = new SimCRServo(servoPort++); map.put(feederName, servo); shooter.feeder = () -> feederMount * servo.output(); }
                else if ("pusher".equals(kind) || "gate".equals(kind)) {
                    SimServo servo = new SimServo(servoPort++);
                    double feed = x.get("feed").getAsDouble(), rest = x.get("rest").getAsDouble();
                    map.put(feederName, servo);
                    shooter.feeder = () -> { double p = servo.output(); return !Double.isNaN(p) && Math.abs(p - feed) < Math.abs(p - rest) ? 1 : 0; };
                } else { SimMotor motor = new SimMotor(port++, 1); map.put(feederName, motor); shooter.feeder = () -> feederMount * motor.commanded(1); }
                if (s.has("turret")) {
                    JsonObject t = s.getAsJsonObject("turret");
                    shooter.turretMount = mount(t);
                    if (t.has("kind") && "servo".equals(t.get("kind").getAsString())) {
                        map.put(t.get("name").getAsString(), shooter.turretServo = new SimServo(servoPort++));
                        shooter.turretCenter = t.get("center").getAsDouble();
                        shooter.turretDegrees = t.get("degrees").getAsDouble();
                    } else {
                        map.put(t.get("name").getAsString(), shooter.turret = new SimMotor(port++, 1));
                        shooter.turretTicksPerDegree = t.get("ticksPerDegree").getAsDouble();
                    }
                }
                shooters.add(shooter);
            }
        }
        className = hub.get("opmode").getAsString();
    }

    /** Compiles the team files, runs the OpMode's init and returns once it waits for start. */
    public static VirtualHub start(JsonObject hub, double heading, File workDir) throws Exception {
        VirtualHub v = new VirtualHub(hub, heading);
        Class<?> type = compile(hub.getAsJsonObject("files"), v.className, workDir);
        OpMode opMode;
        try {
            opMode = (OpMode) type.getDeclaredConstructor().newInstance();
        } catch (ClassCastException e) {
            throw new HubException("compile", v.className + " must extend OpMode or LinearOpMode.", List.of(), e);
        }
        opMode.hardwareMap = v.map;
        opMode.telemetry = v.telemetry;
        Runnable body = opMode instanceof LinearOpMode ? () -> {
            try {
                ((LinearOpMode) opMode).runOpMode();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        } : () -> {
            opMode.init();
            while (!OpModeHost.started() && !OpModeHost.stopRequested()) { opMode.init_loop(); OpModeHost.sync(); }
            if (OpModeHost.stopRequested()) return;
            opMode.start();
            while (!OpModeHost.stopRequested()) { opMode.loop(); OpModeHost.sync(); }
            opMode.stop();
        };
        if (!OpModeHost.launch(body, 20000)) throw new HubException("init", "init took longer than 20 s without reaching waitForStart().", List.of(), null);
        v.check("init");
        return v;
    }

    private static Class<?> compile(JsonObject files, String className, File workDir) throws Exception {
        File src = new File(workDir, "teamcode"), out = new File(workDir, "teamcode-classes");
        out.mkdirs();
        List<File> sources = new ArrayList<>();
        for (Map.Entry<String, JsonElement> e : files.entrySet()) {
            String rel = e.getKey();
            if (!rel.matches("[A-Za-z0-9_/]+\\.java") || rel.contains("..")) throw new HubException("compile", "Invalid team file name " + rel, List.of(), null);
            File file = new File(src, rel);
            file.getParentFile().mkdirs();
            Files.write(file.toPath(), e.getValue().getAsString().getBytes(StandardCharsets.UTF_8));
            sources.add(file);
        }
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) throw new HubException("compile", "The bundled Java runtime has no compiler.", List.of(), null);
        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        boolean ok;
        try (StandardJavaFileManager fm = compiler.getStandardFileManager(diagnostics, Locale.ROOT, StandardCharsets.UTF_8)) {
            List<String> options = List.of("-classpath", System.getProperty("java.class.path"), "-d", out.getAbsolutePath(), "-proc:none", "-Xlint:none", "--release", "17");
            ok = compiler.getTask(new StringWriter(), fm, diagnostics, options, null, fm.getJavaFileObjectsFromFiles(sources)).call();
        }
        if (!ok) {
            List<String> lines = new ArrayList<>();
            for (Diagnostic<? extends JavaFileObject> d : diagnostics.getDiagnostics())
                if (d.getKind() == Diagnostic.Kind.ERROR && lines.size() < 20)
                    lines.add((d.getSource() == null ? "" : new File(d.getSource().toUri()).getName()) + ":" + d.getLineNumber() + ": " + d.getMessage(Locale.ROOT));
            throw new HubException("compile", lines.isEmpty() ? "Compilation failed." : lines.get(0), lines, null);
        }
        URLClassLoader loader = new URLClassLoader(new URL[] {out.toURI().toURL()}, VirtualHub.class.getClassLoader());
        try {
            return Class.forName(className, true, loader);
        } catch (ClassNotFoundException e) {
            throw new HubException("compile", "No OpMode class " + className + " in the exported files.", List.of(), e);
        }
    }

    private void check(String stage) {
        Throwable failure = OpModeHost.failure();
        if (failure == null) return;
        List<String> frames = new ArrayList<>();
        for (StackTraceElement f : failure.getStackTrace()) if (frames.size() < 12) frames.add(f.toString());
        String message = failure.getMessage();
        throw new HubException(stage, failure.getClass().getSimpleName() + (message == null ? "" : ": " + message), frames, failure);
    }

    /**
     * One physics tick: robot-frame odometry deltas (dx forward, dy left, inches) and the gyro
     * heading feed every virtual sensor, then the OpMode runs until its next sync point.
     */
    public void tick(double dx, double dy, double heading, double dt) throws InterruptedException {
        double turn = AngleUnit_normalize(heading - gyro);
        gyro = heading;
        imu.heading = heading;
        imu.rate = dt > 0 ? turn / dt : 0;
        double k = turnArm * turn;
        if (tank) {
            // Tank wheel travel: each side rolls forward, plus or minus the turn at the half-track.
            for (Map.Entry<String, SimMotor> e : drive.entrySet()) e.getValue().advance((left(e.getKey()) ? dx - k : dx + k) * wheelTicksPerInch, dt);
        } else {
            // Mecanum wheel travel (forward-positive) for dx, dy, turn: standard mecanum wheel mixing.
            double[] travel = {dx - dy - k, dx + dy + k, dx + dy - k, dx - dy + k};
            String[] corners = {"frontLeft", "frontRight", "backLeft", "backRight"};
            for (int i = 0; i < 4; i++) { SimMotor m = drive.get(corners[i]); if (m != null) m.advance(travel[i] * wheelTicksPerInch, dt); }
        }
        for (Pod p : pods) p.port.advance((p.forward ? dx - p.y * turn : dy + p.x * turn) * p.ticksPerInch, dt);
        if (pinpoint != null) { pinpoint.gyro = heading; pinpoint.tracker.advance(dx, dy, heading, dt); }
        if (otos != null) { otos.gyro = heading; otos.tracker.advance(dx, dy, heading, dt); }
        if (!OpModeHost.step(2000)) throw new HubException("loop", "The OpMode ran for more than 2 s without calling opModeIsActive(), idle() or sleep().", List.of(), null);
        check("loop");
    }

    private static double AngleUnit_normalize(double radians) {
        return org.firstinspires.ftc.robotcore.external.navigation.AngleUnit.normalizeRadians(radians);
    }

    /** Chassis command (forward, strafe left, turn CCW, float) from the wheel commands. */
    public double[] command() {
        boolean coast = true;
        for (SimMotor m : drive.values()) coast &= m.getZeroPowerBehavior() == DcMotor.ZeroPowerBehavior.FLOAT;
        if (tank) {
            double l = 0, r = 0;
            int nl = 0, nr = 0;
            for (Map.Entry<String, SimMotor> e : drive.entrySet()) {
                if (left(e.getKey())) { l += e.getValue().wheelCommand(); nl++; } else { r += e.getValue().wheelCommand(); nr++; }
            }
            l /= Math.max(1, nl);
            r /= Math.max(1, nr);
            return new double[] {(l + r) / 2, 0, (r - l) / 2, coast ? 1 : 0};
        }
        double fl = wheel("frontLeft"), fr = wheel("frontRight"), bl = wheel("backLeft"), br = wheel("backRight");
        return new double[] {(fl + fr + bl + br) / 4, (-fl + fr + bl - br) / 4, (-fl + fr - bl + br) / 4, coast ? 1 : 0};
    }

    private static boolean left(String key) {
        return key.toLowerCase(Locale.ROOT).contains("left");
    }

    private double wheel(String corner) {
        SimMotor m = drive.get(corner);
        return m == null ? 0 : m.wheelCommand();
    }

    /** How a mechanism device is mounted: -1 when it turns the other way (the setup says so), else 1. */
    private static int mount(JsonObject device) { return device.has("mount") && device.get("mount").getAsInt() < 0 ? -1 : 1; }

    /** The simulator's flywheel speed (a fraction of full) and turret angle, read by the OpMode through the encoders. */
    public void mechanismState(JsonObject state) {
        if (state == null) return;
        for (int i = 0; i < shooters.size(); i++) {
            Shooter s = shooters.get(i);
            // Every flywheel motor reports the shared flywheel speed, as its own encoder sees it.
            if (state.has("flywheel")) for (int k = 0; k < s.flywheels.size(); k++) s.flywheels.get(k).encoder(0, s.flywheelMounts.get(k) * state.get("flywheel").getAsDouble() * s.full);
            // Each turret reads its own angle; older states carry one shared angle.
            boolean own = state.has("turrets") && state.getAsJsonArray("turrets").size() > i;
            if (s.turret != null && (own || state.has("turret"))) s.turret.encoder(s.turretMount * (own ? state.getAsJsonArray("turrets").get(i).getAsDouble() : state.get("turret").getAsDouble()) * s.turretTicksPerDegree, 0);
        }
    }

    /** What the OpMode commands its mechanisms to do this tick. The simulator runs intakes and shooters together, so it
     * reads whether any intake pulls pieces in (every roller of an intake has to pull in), the strongest forward feed
     * and flywheel command (0 when nothing runs forward), and each turret's angle. */
    public JsonObject mechanismOutputs() {
        JsonObject out = new JsonObject();
        if (!rollers.isEmpty() || !kickers.isEmpty()) {
            double intake = 0;
            for (List<DoubleSupplier> part : rollers.values()) {
                double weakest = Double.POSITIVE_INFINITY;
                for (DoubleSupplier r : part) weakest = Math.min(weakest, r.getAsDouble());
                intake = Math.max(intake, weakest);
            }
            for (int i = 0; i < kickers.size(); i++) {
                double p = kickers.get(i).output(), down = kickerPositions.get(i)[0], up = kickerPositions.get(i)[1];
                if (!Double.isNaN(p) && Math.abs(p - down) < Math.abs(p - up)) intake = 1;
            }
            out.addProperty("intake", intake);
        }
        if (!ramps.isEmpty()) {
            // 1 while any ramp servo sits nearer its down position than its up one.
            double ramp = 0;
            for (int i = 0; i < ramps.size(); i++) {
                double p = ramps.get(i).output(), down = rampPositions.get(i)[0], up = rampPositions.get(i)[1];
                if (!Double.isNaN(p) && Math.abs(p - down) < Math.abs(p - up)) ramp = 1;
            }
            out.addProperty("ramp", ramp);
        }
        if (!shooters.isEmpty()) {
            double indexer = 0, flywheel = 0;
            com.google.gson.JsonArray degrees = new com.google.gson.JsonArray();
            for (Shooter s : shooters) {
                indexer = Math.max(indexer, s.feeder.getAsDouble());
                flywheel = Math.max(flywheel, s.flywheel());
                // Each turret's own commanded angle (null for a fixed shooter or one not yet positioned).
                double target = s.turretTarget();
                if (!Double.isNaN(target) && !out.has("turretDeg")) out.addProperty("turretDeg", target);
                if (Double.isNaN(target)) degrees.add(com.google.gson.JsonNull.INSTANCE); else degrees.add(target);
            }
            out.addProperty("indexer", indexer);
            out.addProperty("flywheel", flywheel);
            out.add("turretDegs", degrees);
        }
        return out;
    }
    public Map<String, String> telemetry() { return telemetry.shown(); }
    public boolean done() { return OpModeHost.finished(); }
    public String opMode() { return className; }
    public void stop() { OpModeHost.stop(); }
}
