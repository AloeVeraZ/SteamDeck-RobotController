package deck.sim;

import deck.pathing.DeckFollower.Config;
import deck.pathing.DeckFollower;
import deck.pathing.DeckFollower.Pose;
import deck.pathing.DeckFollower.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What a simulated program can reach. Poses use the simulator field frame: inches, origin at the bottom-left corner, +X right, +Y up, heading in radians
 * counter-clockwise from +X.
 */
public final class SimRobot {
    private final DeckFollower follower;
    private final SimDrivetrain drivetrain;
    private final Config config;
    private final Pose start;
    private final Path route;
    private final List<Pose> pins;
    private final List<Path> legs;
    private final List<Double> waits;
    private final List<String> actions;
    int waitingStop = -1;
    String waitingAction = "";
    double waitingRemaining;
    String actingName = "";
    int actingLeg = -1;
    boolean actingMoving, mechanismBusy;
    final Map<String, String> telemetry = new LinkedHashMap<>();
    private double time;
    private boolean finished;

    SimRobot(DeckFollower follower, SimDrivetrain drivetrain, Config config, Pose start, Path route, List<Pose> pins, List<Path> legs, List<Double> waits, List<String> actions) {
        this.drivetrain = drivetrain;
        this.legs = Collections.unmodifiableList(new ArrayList<>(legs));
        this.waits = Collections.unmodifiableList(new ArrayList<>(waits));
        this.actions = Collections.unmodifiableList(new ArrayList<>(actions));
        this.follower = follower;
        this.config = config;
        this.start = start;
        this.route = route;
        this.pins = Collections.unmodifiableList(new ArrayList<>(pins));
    }

    /** The Deck controller, driving the simulated drivetrain from simulated sensors. */
    public DeckFollower follower() { return follower; }

    /** Controller settings for the SIMULATED drivetrain (measured from DSIM's drive model). */
    public Config driveConfig() { return config; }

    /** The starting pose placed on the field. The localizer starts here. */
    public Pose startPose() { return start; }

    /** The planner's collision-checked route as a compound path, or null. */
    public Path plannedRoute() { return route; }

    /** The planned route split at each pin that has a pause. Leg i ends at stop i. */
    public List<Path> routeLegs() { return legs; }

    /** Seconds to pause after leg i (0 for the final pin when no pause was set). */
    public double stopWait(int leg) { return waits.get(leg); }

    /** The action name entered for the stop after leg i ("" when none). */
    public String stopAction(int leg) { return actions.get(leg); }

    // Per-leg details from the simulator's leg plan (pin turns, action paths); empty for older routes.
    private List<Double> legHeadings = Collections.emptyList(), turnsAfter = Collections.emptyList();
    private List<String> moving = Collections.emptyList();
    private List<Double> powers = Collections.emptyList();
    void legPowers(List<Double> values) { powers = new ArrayList<>(values); }
    public double legPower(int leg) { return leg < powers.size() ? powers.get(leg) : config.maxPathSpeed; }
    public void applyLegPower(int leg) {
        double power = legPower(leg);
        config.maxPathSpeed = Math.max(0.000001, power);
        drivetrain.powerLimit(power);
    }

    // How long each pin action and each action path's action runs (NaN: until it finishes / the whole
    // path), and which planned path each leg belongs to (an action path may span several legs).
    private List<Double> actionSeconds = Collections.emptyList(), movingSeconds = Collections.emptyList();
    private List<Integer> legPaths = Collections.emptyList();

    void legDetails(List<Double> headings, List<Double> turnAfter, List<String> movingActions, List<Double> actionTimes, List<Double> movingTimes, List<Integer> paths) {
        legHeadings = Collections.unmodifiableList(new ArrayList<>(headings));
        turnsAfter = Collections.unmodifiableList(new ArrayList<>(turnAfter));
        moving = Collections.unmodifiableList(new ArrayList<>(movingActions));
        actionSeconds = Collections.unmodifiableList(new ArrayList<>(actionTimes));
        movingSeconds = Collections.unmodifiableList(new ArrayList<>(movingTimes));
        legPaths = Collections.unmodifiableList(new ArrayList<>(paths));
    }

    /** Seconds the pin action after leg i runs, or NaN to run until it reports done. */
    public double actionSeconds(int leg) { return leg < actionSeconds.size() ? actionSeconds.get(leg) : Double.NaN; }

    /** Seconds the action path's action runs from the start of its path, or NaN for the whole path. */
    public double movingSeconds(int leg) { return leg < movingSeconds.size() ? movingSeconds.get(leg) : Double.NaN; }

    /** The planned path (numbered from 1) leg i is part of. */
    public int legPath(int leg) { return leg < legPaths.size() ? legPaths.get(leg) : leg + 1; }

    /** Heading (radians) to face before following leg i. */
    public double legHeading(int leg) { return leg < legHeadings.size() ? legHeadings.get(leg) : legs.get(leg).endPose().heading(); }

    /** Heading (radians) to turn to in place after leg i, or NaN for none. */
    public double turnAfter(int leg) { return leg < turnsAfter.size() ? turnsAfter.get(leg) : Double.NaN; }

    /** The action run while driving leg i (an action path), or "" for a regular path. */
    public String movingAction(int leg) { return leg < moving.size() ? moving.get(leg) : ""; }

    /** Report that the robot is pausing at a stop, for the simulator's telemetry. */
    public void waiting(int leg, String action, double remainingSeconds) {
        waitingStop = leg;
        waitingAction = action == null ? "" : action;
        waitingRemaining = remainingSeconds;
    }

    /** Clear the pause report. */
    public void moving() { waitingStop = -1; }

    /** Report the action running now: at a pin (moving false) or along an action path (moving true). */
    public void acting(int leg, String action, boolean moving) {
        actingLeg = leg;
        actingName = action == null ? "" : action;
        actingMoving = moving;
    }

    /** True while the simulated mechanisms are still finishing the pin's action (for example, shooting). */
    public boolean mechanismBusy() { return mechanismBusy; }

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
