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
import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;

/**
 * A virtual REV Control Hub for exported autonomous code. The team files (OpMode, Constants,
 * route) are compiled against the FTC SDK stand-ins and Pedro's real revhub drivetrain and
 * localizers, then run in lockstep with the simulation: four mecanum drive motors with encoders,
 * odometry pods, Pinpoint/OTOS and the built-in IMU are fed from the simulated sensors, and the
 * motor powers the OpMode sets are turned back into chassis motion through mecanum kinematics.
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

    private final HardwareMap map = new HardwareMap();
    private final Map<String, SimMotor> drive = new LinkedHashMap<>();
    private final List<Pod> pods = new ArrayList<>();
    private final SimTelemetry telemetry = new SimTelemetry();
    private final SimSensors.Imu imu = new SimSensors.Imu();
    private SimSensors.Pinpoint pinpoint;
    private SimSensors.Otos otos;
    private final double wheelTicksPerInch, turnArm;
    private final String className;
    private double gyro;

    private VirtualHub(JsonObject hub, double heading) {
        JsonObject d = hub.getAsJsonObject("drive");
        wheelTicksPerInch = d.get("ticksPerInch").getAsDouble();
        turnArm = d.get("halfLength").getAsDouble() + d.get("halfWidth").getAsDouble();
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
        // Mecanum wheel travel (forward-positive) for dx, dy, turn: the same mixing Pedro's Mecanum uses.
        double k = turnArm * turn;
        double[] travel = {dx - dy - k, dx + dy + k, dx + dy - k, dx - dy + k};
        String[] corners = {"frontLeft", "frontRight", "backLeft", "backRight"};
        for (int i = 0; i < 4; i++) { SimMotor m = drive.get(corners[i]); if (m != null) m.advance(travel[i] * wheelTicksPerInch, dt); }
        for (Pod p : pods) p.port.advance((p.forward ? dx - p.y * turn : dy + p.x * turn) * p.ticksPerInch, dt);
        if (pinpoint != null) { pinpoint.gyro = heading; pinpoint.tracker.advance(dx, dy, heading, dt); }
        if (otos != null) { otos.gyro = heading; otos.tracker.advance(dx, dy, heading, dt); }
        if (!OpModeHost.step(2000)) throw new HubException("loop", "The OpMode ran for more than 2 s without calling opModeIsActive(), idle() or sleep().", List.of(), null);
        check("loop");
    }

    private static double AngleUnit_normalize(double radians) {
        return org.firstinspires.ftc.robotcore.external.navigation.AngleUnit.normalizeRadians(radians);
    }

    /** Chassis command (forward, strafe left, turn CCW, float) from the four wheel commands. */
    public double[] command() {
        double fl = wheel("frontLeft"), fr = wheel("frontRight"), bl = wheel("backLeft"), br = wheel("backRight");
        boolean coast = true;
        for (SimMotor m : drive.values()) coast &= m.getZeroPowerBehavior() == DcMotor.ZeroPowerBehavior.FLOAT;
        return new double[] {(fl + fr + bl + br) / 4, (-fl + fr + bl - br) / 4, (-fl + fr - bl + br) / 4, coast ? 1 : 0};
    }

    private double wheel(String corner) {
        SimMotor m = drive.get(corner);
        return m == null ? 0 : m.wheelCommand();
    }

    public Map<String, String> telemetry() { return telemetry.shown(); }
    public boolean done() { return OpModeHost.finished(); }
    public String opMode() { return className; }
    public void stop() { OpModeHost.stop(); }
}
