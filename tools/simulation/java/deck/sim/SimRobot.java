package deck.sim;

import com.pedropathing.algorithm.ForesightConfig;
import com.pedropathing.follower.Follower;
import com.pedropathing.math.Pose;
import com.pedropathing.paths.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What a simulated program can reach. Poses use Pedro's field frame, which matches the
 * simulator's: inches, origin at the bottom-left corner, +X right, +Y up, heading in radians
 * counter-clockwise from +X.
 */
public final class SimRobot {
    private final Follower follower;
    private final ForesightConfig config;
    private final Pose start;
    private final Path route;
    private final List<Pose> pins;
    final Map<String, String> telemetry = new LinkedHashMap<>();
    private double time;
    private boolean finished;

    SimRobot(Follower follower, ForesightConfig config, Pose start, Path route, List<Pose> pins) {
        this.follower = follower;
        this.config = config;
        this.start = start;
        this.route = route;
        this.pins = Collections.unmodifiableList(new ArrayList<>(pins));
    }

    /** The genuine Pedro Follower, driving the simulated drivetrain from simulated sensors. */
    public Follower follower() { return follower; }

    /** Foresight settings for the SIMULATED drivetrain (measured from DSIM's drive model). */
    public ForesightConfig foresight() { return config; }

    /** The starting pose placed on the field. The localizer starts here. */
    public Pose startPose() { return start; }

    /** The planner's collision-checked route as a Pedro path at constant heading, or null. */
    public Path plannedRoute() { return route; }

    /** The ordered waypoint pins (heading = starting heading). */
    public List<Pose> pins() { return pins; }

    /** Simulation seconds since the program started. */
    public double time() { return time; }

    public void telemetry(String key, Object value) {
        if (telemetry.size() >= 24 && !telemetry.containsKey(key)) return;
        String k = String.valueOf(key), v = String.valueOf(value);
        telemetry.put(k.length() > 40 ? k.substring(0, 40) : k, v.length() > 120 ? v.substring(0, 120) : v);
    }

    /** End the program; the robot stops. */
    public void finish() { finished = true; }

    /** True when the localizer estimate is within the given distance and angle of target. */
    public boolean near(Pose target, double inches, double degrees) {
        Pose p = follower.pose();
        double turn = Math.abs(Math.atan2(Math.sin(target.heading() - p.heading()), Math.cos(target.heading() - p.heading())));
        return p.distance(target) <= inches && Math.toDegrees(turn) <= degrees;
    }

    void time(double seconds) { time = seconds; }
    boolean finished() { return finished; }
}
