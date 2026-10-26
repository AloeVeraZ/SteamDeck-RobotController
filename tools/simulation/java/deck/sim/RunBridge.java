package deck.sim;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import deck.pathing.DeckFollower.Config;
import deck.pathing.DeckFollower.Paths;
import deck.pathing.DeckFollower;
import deck.pathing.DeckFollower.Pose;
import deck.pathing.DeckFollower.Point;
import deck.pathing.DeckFollower.Path;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintStream;
import java.io.StringWriter;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;

/**
 * Deck controller simulation bridge. One process per run. The host writes one JSON object per
 * line on stdin (init, then tick ... stop) and reads one JSON reply per line on stdout:
 * ready | cmd | error. Lines are bounded both ways. Program output (System.out/err) is captured
 * into a bounded log, so user code cannot corrupt the protocol. EOF on stdin ends the process,
 * so a crashed host never leaves this running.
 */
public final class RunBridge {
    private static final int MAX_LINE = 1 << 20;
    private static PrintStream protocol;
    private static final Deque<String> log = new ArrayDeque<>();
    private static final StringBuilder partial = new StringBuilder();

    private SimLocalizer localizer;
    private SimDrivetrain drivetrain;
    private SimRobot robot;
    private DeckAutonomous program;
    private deck.sim.hub.VirtualHub hub;
    private boolean done;
    private double started = -1;

    public static void main(String[] args) throws IOException {
        protocol = new PrintStream(new FileOutputStream(FileDescriptor.out), true, "UTF-8");
        PrintStream capture = new PrintStream(new OutputStream() {
            @Override
            public synchronized void write(int b) {
                if (b == '\n') flushLine();
                else if (b != '\r' && partial.length() < 400) partial.append((char) b);
            }
        }, true, "UTF-8");
        System.setOut(capture);
        System.setErr(capture);
        Locale.setDefault(Locale.ROOT);
        RunBridge bridge = new RunBridge();
        InputStream in = System.in;
        String line;
        while ((line = readLine(in)) != null) {
            if (line.isEmpty()) continue;
            JsonObject reply;
            try {
                reply = bridge.handle(JsonParser.parseString(line).getAsJsonObject());
            } catch (UserCodeException e) {
                reply = error(e.stage, e.getMessage(), e.trace);
            } catch (Throwable e) {
                reply = error("bridge", String.valueOf(e), trace(e, null));
            }
            if (reply == null) break;
            send(reply);
            if ("error".equals(reply.get("type").getAsString())) break;
        }
        protocol.flush();
        System.exit(0);
    }

    private static synchronized void flushLine() {
        if (log.size() >= 60) log.removeFirst();
        log.addLast(partial.toString());
        partial.setLength(0);
    }

    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        int b;
        while ((b = in.read()) != -1) {
            if (b == '\n') return bytes.toString("UTF-8");
            if (bytes.size() >= MAX_LINE) throw new IOException("Protocol line exceeds 1 MiB.");
            bytes.write(b);
        }
        return bytes.size() > 0 ? bytes.toString("UTF-8") : null;
    }

    private static void send(JsonObject reply) {
        synchronized (RunBridge.class) {
            if (partial.length() > 0) flushLine();
            if (!log.isEmpty()) {
                JsonArray lines = new JsonArray();
                for (String s : log) lines.add(s);
                reply.add("log", lines);
                log.clear();
            }
        }
        protocol.print(reply.toString());
        protocol.print('\n');
        protocol.flush();
    }

    private JsonObject handle(JsonObject message) throws Exception {
        String type = message.get("type").getAsString();
        if ("init".equals(type)) return init(message);
        if ("tick".equals(type)) return tick(message);
        if ("stop".equals(type)) return null;
        throw new IllegalArgumentException("Unknown message type " + type);
    }

    private static double num(JsonObject o, String key) {
        double v = o.get(key).getAsDouble();
        if (!Double.isFinite(v)) throw new IllegalArgumentException(key + " must be finite");
        return v;
    }

    private JsonObject init(JsonObject m) throws Exception {
        if ("opmode".equals(m.getAsJsonObject("program").get("kind").getAsString())) return initHub(m);
        JsonObject drive = m.getAsJsonObject("drive"), tune = m.getAsJsonObject("tuning"), start = m.getAsJsonObject("start");
        String driveKind = drive.get("kind").getAsString();
        SimDrivetrain.Kind kind = "swerve".equals(driveKind) ? SimDrivetrain.Kind.SWERVE : "tank".equals(driveKind) ? SimDrivetrain.Kind.TANK : SimDrivetrain.Kind.MECANUM;
        drivetrain = new SimDrivetrain(kind, num(drive, "halfLength"), num(drive, "halfWidth"));
        localizer = new SimLocalizer();
        double maxF = num(tune, "maxForward"), maxS = num(tune, "maxStrafe");
        Config config = new Config();
        config.maxForward=maxF; config.maxStrafe=maxS; config.maxTurn=tune.has("maxTurn")?num(tune,"maxTurn"):5; config.tank=kind==SimDrivetrain.Kind.TANK;
        config.maxPathSpeed=tune.has("maxPathSpeed")?num(tune,"maxPathSpeed"):.6;
        config.positionP=num(tune,"translationalP")*.35; config.positionD=num(tune,"translationalD");
        config.headingP=num(tune,"headingP")*.7; config.headingD=Math.max(.08,num(tune,"headingD"));
        config.acceleration=Math.max(20,Math.min(maxF*3,num(tune,"maxAcceleration")*.65));
        DeckFollower follower = new DeckFollower(localizer, drivetrain, config, SimClock::nanoTime);
        Pose startPose = new Pose(num(start, "x"), num(start, "y"), num(start, "heading"));
        List<Pose> pins = new ArrayList<>();
        List<Path> legs = new ArrayList<>();
        List<Double> waits = new ArrayList<>();
        List<String> actions = new ArrayList<>();
        List<Double> powers = new ArrayList<>();
        Path route = null;
        Object[] details = null;
        boolean turning = kind == SimDrivetrain.Kind.TANK;
        if (m.has("route") && m.get("route").isJsonObject()) {
            JsonObject r = m.getAsJsonObject("route");
            double heading = num(r, "heading");
            // Turning routes (tank, or holonomic routes that turn to fit past obstacles) give each
            // segment its own heading; the robot stops and turns in place where the heading changes.
            turning = turning || (r.has("turns") && r.get("turns").getAsBoolean());
            List<Path> parts = new ArrayList<>();
            List<Double> partHeadings = new ArrayList<>();
            for (JsonElement e : r.getAsJsonArray("segments")) {
                JsonObject s = e.getAsJsonObject();
                List<Point> points = new ArrayList<>();
                for (JsonElement p : s.getAsJsonArray("points")) points.add(Point.cartesian(num(p.getAsJsonObject(), "x"), num(p.getAsJsonObject(), "y")));
                Path part = points.size() == 2 ? Paths.line(points.get(0), points.get(1)) : Paths.curve(points.toArray(new Point[0]));
                double partHeading = turning && s.has("heading") ? Math.toRadians(num(s, "heading")) : heading;
                // A path the robot turns or spins along: its heading changes steadily from start to end.
                if (s.has("tangent") && s.get("tangent").getAsBoolean()) {
                    double flip = s.has("reverse") && s.get("reverse").getAsBoolean() ? Math.PI : 0;
                    parts.add(part.heading((curve, t) -> { Point a = curve.get(Math.max(0, t - 1e-4)), b = curve.get(Math.min(1, t + 1e-4)); return Math.atan2(b.y() - a.y(), b.x() - a.x()) + flip; }));
                } else if (s.has("target")) {
                    JsonObject target = s.getAsJsonObject("target");
                    double x = num(target, "x"), y = num(target, "y");
                    parts.add(part.heading((curve, t) -> { Point p = curve.get(t); return Math.atan2(y - p.y(), x - p.x()); }));
                } else parts.add(turning && s.has("endHeading") ? part.heading(turn(partHeading, Math.toRadians(num(s, "endHeading")))) : part.constant(partHeading));
                partHeadings.add(partHeading);
            }
            if (!parts.isEmpty()) route = r.has("legs") ? join(parts) : chain(parts, heading);
            // A pin with a pause ends a leg: the robot stops there, waits, then follows the next leg.
            JsonArray stops = r.getAsJsonArray("stops");
            int from = 0;
            if (r.has("legs")) {
                // The simulator's leg plan (shared with every export): where legs end, the heading to
                // face first, a turn in place at the pin, the pin's pause and action, and action paths.
                List<Double> legHeadings = new ArrayList<>(), turnAfter = new ArrayList<>();
                List<String> moving = new ArrayList<>();
                List<Double> actionTimes = new ArrayList<>(), movingTimes = new ArrayList<>();
                List<Integer> paths = new ArrayList<>();
                for (JsonElement e : r.getAsJsonArray("legs")) {
                    JsonObject l = e.getAsJsonObject();
                    int last = Math.min(l.get("last").getAsInt(), parts.size() - 1);
                    if (last < from) continue;
                    legs.add(join(parts.subList(from, last + 1)));
                    waits.add(num(l, "wait"));
                    actions.add(l.get("action").getAsString());
                    powers.add(l.has("power") ? num(l, "power") : config.maxPathSpeed);
                    moving.add(l.get("moving").getAsString());
                    legHeadings.add(l.has("heading") ? Math.toRadians(num(l, "heading")) : partHeadings.get(from));
                    turnAfter.add(l.has("turn") && !l.get("turn").isJsonNull() ? Math.toRadians(num(l, "turn")) : Double.NaN);
                    actionTimes.add(l.has("actionSeconds") && !l.get("actionSeconds").isJsonNull() ? num(l, "actionSeconds") : Double.NaN);
                    movingTimes.add(l.has("movingSeconds") && !l.get("movingSeconds").isJsonNull() ? num(l, "movingSeconds") : Double.NaN);
                    paths.add(l.has("path") ? l.get("path").getAsInt() : legs.size());
                    from = last + 1;
                }
                for (JsonElement e : stops) pins.add(new Pose(num(e.getAsJsonObject(), "x"), num(e.getAsJsonObject(), "y"), heading));
                details = new Object[] { legHeadings, turnAfter, moving, actionTimes, movingTimes, paths };
                stops = new JsonArray();
            } else if (turning) {
                // A turning leg also ends wherever the next segment needs a different heading.
                double pause = 0; String action = "";
                for (int i = 0; i < parts.size(); i++) {
                    for (JsonElement e : stops) { JsonObject stop = e.getAsJsonObject(); if (stop.get("segment").getAsInt() == i) { pause += num(stop, "wait"); if (!stop.get("action").getAsString().isEmpty()) action = stop.get("action").getAsString(); } }
                    boolean last = i == parts.size() - 1;
                    boolean turnNext = !last && Math.abs(Math.atan2(Math.sin(partHeadings.get(i + 1) - partHeadings.get(i)), Math.cos(partHeadings.get(i + 1) - partHeadings.get(i)))) > 1e-6;
                    if (last || turnNext || pause > 0) {
                        legs.add(chain(parts.subList(from, i + 1), partHeadings.get(i)));
                        waits.add(pause); actions.add(action);
                        from = i + 1; pause = 0; action = "";
                    }
                }
            }
            for (int i = 0; i < stops.size(); i++) {
                JsonObject s = stops.get(i).getAsJsonObject();
                pins.add(new Pose(num(s, "x"), num(s, "y"), heading));
                double wait = num(s, "wait");
                int end = Math.min(s.get("segment").getAsInt(), parts.size() - 1);
                boolean last = i == stops.size() - 1;
                if (turning) continue;
                if ((wait > 0 || last) && end >= from) {
                    legs.add(chain(parts.subList(from, end + 1), heading));
                    waits.add(wait);
                    actions.add(s.get("action").getAsString());
                    from = end + 1;
                } else if (wait > 0 && !legs.isEmpty()) {
                    waits.set(waits.size() - 1, waits.get(waits.size() - 1) + wait);
                }
            }
        }
        localizer.ingest(0, 0, num(start, "heading"), 0);
        localizer.update();
        localizer.setPose(startPose);
        robot = new SimRobot(follower, drivetrain, config, startPose, route, pins, legs, waits, actions);
        robot.legPowers(powers);
        if (details != null) robot.legDetails((List<Double>) details[0], (List<Double>) details[1], (List<String>) details[2], (List<Double>) details[3], (List<Double>) details[4], (List<Integer>) details[5]);
        JsonObject programSpec = m.getAsJsonObject("program");
        String kindName = programSpec.get("kind").getAsString();
        if ("route".equals(kindName)) program = new RouteAutonomous(turning);
        else program = compile(programSpec.get("source").getAsString(), new File(m.get("workDir").getAsString()));
        try {
            program.init(robot);
        } catch (Throwable e) {
            throw new UserCodeException("init", describe(e), trace(e, program.getClass().getName()));
        }
        JsonObject ready = new JsonObject();
        ready.addProperty("type", "ready");
        ready.addProperty("program", program.getClass().getName());
        ready.add("drive", drivetrainJson());
        return ready;
    }

    private JsonObject tick(JsonObject m) throws Exception {
        if (hub != null) return tickHub(m);
        if (program == null) throw new IllegalStateException("tick before init");
        double t = num(m, "t");
        SimClock.setSeconds(t);
        if (started < 0) started = t;
        robot.time(t - started);
        JsonObject mech = m.has("mech") && m.get("mech").isJsonObject() ? m.getAsJsonObject("mech") : null;
        robot.mechanismBusy = mech != null && mech.has("busy") && mech.get("busy").getAsBoolean();
        robot.actingName = "";
        JsonObject odo = m.has("odo") && m.get("odo").isJsonObject() ? m.getAsJsonObject("odo") : null;
        localizer.ingest(odo == null ? 0 : num(odo, "dx"), odo == null ? 0 : num(odo, "dy"), num(m, "imu"), num(m, "dt"));
        if (!done) {
            try {
                program.loop(robot);
            } catch (Throwable e) {
                throw new UserCodeException("loop", describe(e), trace(e, program.getClass().getName()));
            }
            if (robot.finished()) {
                done = true;
                robot.follower().stop();
            }
        }
        if (done) drivetrain.stop();
        JsonObject cmd = new JsonObject();
        cmd.addProperty("type", "cmd");
        cmd.addProperty("seq", m.get("seq").getAsLong());
        cmd.add("drive", drivetrainJson());
        Pose p = robot.follower().pose();
        JsonObject estimate = new JsonObject();
        estimate.addProperty("x", p.x());
        estimate.addProperty("y", p.y());
        estimate.addProperty("heading", p.heading());
        cmd.add("estimate", estimate);
        DeckFollower f = robot.follower();
        JsonObject follower = new JsonObject();
        follower.addProperty("mode", f.mode().name());
        follower.addProperty("busy", f.isBusy());
        follower.addProperty("pathIndex", f.pathIndex());
        if (f.following()) {
            safe(follower, "completion", f::completion);
            safe(follower, "remaining", f::remainingDistance);
            Pose closest = null;
            try { closest = f.closestPose(); } catch (RuntimeException ignored) {}
            if (closest != null) {
                JsonObject c = new JsonObject();
                c.addProperty("x", closest.x());
                c.addProperty("y", closest.y());
                c.addProperty("heading", closest.heading());
                follower.add("closest", c);
            }
        }
        cmd.add("follower", follower);
        JsonObject telemetry = new JsonObject();
        robot.telemetry.forEach(telemetry::addProperty);
        cmd.add("telemetry", telemetry);
        cmd.addProperty("done", done);
        if (!robot.actingName.isEmpty()) {
            JsonObject act = new JsonObject();
            act.addProperty("name", robot.actingName);
            act.addProperty("leg", robot.actingLeg);
            act.addProperty("moving", robot.actingMoving);
            cmd.add("act", act);
        }
        if (robot.waitingStop >= 0) {
            JsonObject wait = new JsonObject();
            wait.addProperty("stop", robot.waitingStop);
            wait.addProperty("action", robot.waitingAction);
            wait.addProperty("remaining", Math.max(0, robot.waitingRemaining));
            cmd.add("wait", wait);
        }
        return cmd;
    }

    // Exported team code (OpMode, Constants, route) on the virtual Control Hub. See deck.sim.hub.VirtualHub.
    private JsonObject initHub(JsonObject m) throws Exception {
        JsonObject spec = m.getAsJsonObject("program");
        try {
            hub = deck.sim.hub.VirtualHub.start(spec.getAsJsonObject("hub"), num(m.getAsJsonObject("start"), "heading"), new File(m.get("workDir").getAsString()));
        } catch (deck.sim.hub.VirtualHub.HubException e) {
            throw hubError(e);
        }
        JsonObject ready = new JsonObject();
        ready.addProperty("type", "ready");
        ready.addProperty("program", hub.opMode());
        return ready;
    }

    private JsonObject tickHub(JsonObject m) throws Exception {
        SimClock.setSeconds(num(m, "t"));
        JsonObject odo = m.has("odo") && m.get("odo").isJsonObject() ? m.getAsJsonObject("odo") : null;
        hub.mechanismState(m.has("mech") && m.get("mech").isJsonObject() ? m.getAsJsonObject("mech") : null);
        // The robot's own parts (where each motor-driven one is) and every sensor's reading, from the simulated joints.
        hub.kinematicsState(m.has("kin") && m.get("kin").isJsonObject() ? m.getAsJsonObject("kin") : null);
        hub.sensorState(m.has("sensors") && m.get("sensors").isJsonObject() ? m.getAsJsonObject("sensors") : null);
        for (int user = 1; user <= 2; user++) if (m.has("gamepad" + user) && m.get("gamepad" + user).isJsonObject()) hub.gamepad(user, m.getAsJsonObject("gamepad" + user));
        if (!hub.done()) {
            try {
                hub.tick(odo == null ? 0 : num(odo, "dx"), odo == null ? 0 : num(odo, "dy"), num(m, "imu"), num(m, "dt"));
            } catch (deck.sim.hub.VirtualHub.HubException e) {
                throw hubError(e);
            }
        }
        double[] c = hub.done() ? new double[4] : hub.command();
        JsonObject cmd = new JsonObject(), d = new JsonObject(), telemetry = new JsonObject();
        cmd.addProperty("type", "cmd");
        cmd.addProperty("seq", m.get("seq").getAsLong());
        d.addProperty("forward", c[0]);
        d.addProperty("strafe", c[1]);
        d.addProperty("turn", c[2]);
        d.addProperty("float", c[3] > 0);
        cmd.add("drive", d);
        hub.telemetry().forEach(telemetry::addProperty);
        cmd.add("telemetry", telemetry);
        cmd.add("mech", hub.mechanismOutputs());
        if (hub.hasKinematics()) cmd.add("kin", hub.kinematicsOutputs());
        cmd.add("devices", hub.devices());
        cmd.addProperty("done", hub.done());
        return cmd;
    }

    private UserCodeException hubError(deck.sim.hub.VirtualHub.HubException e) {
        JsonArray lines = new JsonArray();
        for (String line : e.details) lines.add(line);
        return new UserCodeException(e.stage, e.getMessage(), lines);
    }

    private static Path chain(List<Path> parts, double heading) {
        return parts.size() == 1 ? parts.get(0) : Paths.path(parts.toArray(new Path[0])).constant(heading);
    }

    /** Parts joined into one path, each keeping its own heading. */
    private static Path join(List<Path> parts) {
        return parts.size() == 1 ? parts.get(0) : Paths.path(parts.toArray(new Path[0]));
    }

    /** Heading that turns steadily from one angle to another (radians; may span whole spins). */
    private static deck.pathing.DeckFollower.Interpolator turn(double from, double to) {
        double by = to - from, full = 2 * Math.PI;
        return (curve, t) -> ((from + by * t) % full + full) % full;
    }

    private interface DoubleGetter { double get(); }

    private static void safe(JsonObject o, String key, DoubleGetter getter) {
        try {
            double v = getter.get();
            if (Double.isFinite(v)) o.addProperty(key, v);
        } catch (RuntimeException ignored) {
        }
    }

    private JsonObject drivetrainJson() {
        JsonObject d = new JsonObject();
        d.addProperty("forward", drivetrain.forward());
        d.addProperty("strafe", drivetrain.strafe());
        d.addProperty("turn", drivetrain.turn());
        d.addProperty("float", !drivetrain.brake());
        return d;
    }

    private static final Pattern CLASS = Pattern.compile("public\\s+(?:final\\s+|abstract\\s+)*class\\s+([A-Za-z_$][A-Za-z0-9_$]*)");
    private static final Pattern PACKAGE = Pattern.compile("^\\s*package\\s+([A-Za-z_$][A-Za-z0-9_$.]*)\\s*;", Pattern.MULTILINE);

    private DeckAutonomous compile(String source, File workDir) throws Exception {
        Matcher cm = CLASS.matcher(source);
        if (!cm.find()) throw new UserCodeException("compile", "No public class found. Declare: public class MyAuto implements DeckAutonomous", new JsonArray());
        String simple = cm.group(1);
        Matcher pm = PACKAGE.matcher(source);
        String pkg = pm.find() ? pm.group(1) : "";
        String name = pkg.isEmpty() ? simple : pkg + "." + simple;
        File src = new File(workDir, "src"), out = new File(workDir, "classes");
        File file = new File(src, (pkg.isEmpty() ? "" : pkg.replace('.', File.separatorChar) + File.separator) + simple + ".java");
        file.getParentFile().mkdirs();
        out.mkdirs();
        Files.write(file.toPath(), source.getBytes(StandardCharsets.UTF_8));
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) throw new UserCodeException("compile", "The bundled Java runtime has no compiler.", new JsonArray());
        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        StringWriter output = new StringWriter();
        boolean ok;
        try (StandardJavaFileManager files = compiler.getStandardFileManager(diagnostics, Locale.ROOT, StandardCharsets.UTF_8)) {
            List<String> options = new ArrayList<>();
            options.add("-classpath");
            options.add(System.getProperty("java.class.path"));
            options.add("-d");
            options.add(out.getAbsolutePath());
            options.add("-proc:none");
            options.add("-Xlint:none");
            ok = compiler.getTask(output, files, diagnostics, options, null, files.getJavaFileObjects(file)).call();
        }
        if (!ok) {
            JsonArray lines = new JsonArray();
            StringBuilder first = new StringBuilder();
            for (Diagnostic<? extends JavaFileObject> d : diagnostics.getDiagnostics()) {
                if (d.getKind() != Diagnostic.Kind.ERROR) continue;
                String text = simple + ".java:" + d.getLineNumber() + ": " + d.getMessage(Locale.ROOT);
                if (first.length() == 0) first.append(text);
                if (lines.size() < 20) lines.add(text);
            }
            throw new UserCodeException("compile", first.length() > 0 ? first.toString() : "Compilation failed.", lines);
        }
        URLClassLoader loader = new URLClassLoader(new URL[] {out.toURI().toURL()}, RunBridge.class.getClassLoader());
        Class<?> type;
        try {
            type = Class.forName(name, true, loader);
        } catch (Throwable e) {
            throw new UserCodeException("load", describe(e), trace(e, name));
        }
        if (!DeckAutonomous.class.isAssignableFrom(type)) throw new UserCodeException("load", name + " must implement deck.sim.DeckAutonomous.", new JsonArray());
        try {
            return (DeckAutonomous) type.getDeclaredConstructor().newInstance();
        } catch (Throwable e) {
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            throw new UserCodeException("load", describe(cause), trace(cause, name));
        }
    }

    private static String describe(Throwable e) {
        String message = e.getMessage();
        return e.getClass().getSimpleName() + (message == null ? "" : ": " + (message.length() > 300 ? message.substring(0, 300) : message));
    }

    private static JsonArray trace(Throwable e, String userClass) {
        JsonArray frames = new JsonArray();
        for (StackTraceElement f : e.getStackTrace()) {
            boolean user = userClass != null && f.getClassName().startsWith(userClass);
            if (frames.size() < 12 && (user || frames.size() < 4)) frames.add(f.toString());
        }
        return frames;
    }

    private static JsonObject error(String stage, String message, JsonArray trace) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "error");
        o.addProperty("stage", stage);
        o.addProperty("message", message);
        o.add("trace", trace == null ? new JsonArray() : trace);
        return o;
    }

    private static final class UserCodeException extends RuntimeException {
        final String stage;
        final JsonArray trace;

        UserCodeException(String stage, String message, JsonArray trace) {
            super(message);
            this.stage = stage;
            this.trace = trace;
        }
    }
}
