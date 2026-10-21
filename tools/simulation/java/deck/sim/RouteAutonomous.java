package deck.sim;

import com.pedropathing.follower.Follower;
import com.pedropathing.math.Pose;
import java.util.ArrayDeque;

/**
 * Built-in program: follow the planned route leg by leg. At each pin with a pause the robot
 * holds its position for the pause (the time a mechanism action takes), then continues.
 * Turning routes (tank drivetrains, or holonomic routes that turn to fit past an obstacle) stop
 * and turn in place before a leg whose heading differs. If the robot stalls against something
 * mid-leg it backs out to where it recently drove, straightens up and resumes the leg.
 */
public final class RouteAutonomous implements DeckAutonomous {
    private int leg;
    private double arrived = -1;
    private final boolean turning;
    private boolean turningNow;
    private double turnStarted;
    private static final double SETTLE_SECONDS = .15;
    private double settleStarted = -1, settleHeading;
    // Stall recovery: recent poses, the moment progress stopped, and the back-out target.
    private static final double STALL_SPEED = 1.5, STALL_SECONDS = .8, BACKOFF_SECONDS = 2.5;
    private static final int MAX_RECOVERIES = 3;
    private final ArrayDeque<double[]> history = new ArrayDeque<>();
    private double legStarted, slowSince = -1, backoffStarted = -1;
    private Pose backoff;
    private int recoveries;
    public RouteAutonomous() { this(false); }
    public RouteAutonomous(boolean turning) { this.turning = turning; }
    private void beginLeg(SimRobot robot) {
        Pose p = robot.follower().pose();
        double target = robot.routeLegs().get(leg).endPose().heading();
        recoveries = 0;
        if (turning && Math.abs(Math.atan2(Math.sin(target - p.heading()), Math.cos(target - p.heading()))) > Math.toRadians(.5)) {
            robot.follower().hold(new Pose(p.x(), p.y(), target));
            turningNow = true;
            turnStarted = robot.time();
        } else startFollowing(robot);
    }
    private void startFollowing(SimRobot robot) {
        robot.follower().follow(robot.routeLegs().get(leg));
        legStarted = robot.time();
        slowSince = -1;
        history.clear();
    }

    @Override
    public void init(SimRobot robot) {
        if (robot.routeLegs().isEmpty()) throw new IllegalStateException("Plan a route before running it.");
        robot.follower().setPose(robot.startPose());
        beginLeg(robot);
    }

    @Override
    public void loop(SimRobot robot) {
        Follower follower = robot.follower();
        follower.update();
        robot.telemetry("leg", (leg + 1) + " of " + robot.routeLegs().size());
        if (turningNow) {
            double error = Math.atan2(Math.sin(robot.routeLegs().get(leg).endPose().heading() - follower.pose().heading()), Math.cos(robot.routeLegs().get(leg).endPose().heading() - follower.pose().heading()));
            robot.telemetry("phase", "Turning chassis");
            if (robot.time() - turnStarted > 30) throw new IllegalStateException("Chassis turn did not settle within 30 seconds. Check clearance, RPM and current budget.");
            // The localizer's per-tick angular velocity carries sensor noise, so judge settling by the
            // average rotation rate over a window spent inside the heading tolerance.
            if (Math.abs(error) > Math.toRadians(1.5)) { settleStarted = -1; return; }
            if (settleStarted < 0) { settleStarted = robot.time(); settleHeading = follower.pose().heading(); return; }
            double window = robot.time() - settleStarted;
            if (window < SETTLE_SECONDS) return;
            double drift = Math.atan2(Math.sin(follower.pose().heading() - settleHeading), Math.cos(follower.pose().heading() - settleHeading));
            if (Math.abs(drift) / window > .08) { settleStarted = -1; return; }
            settleStarted = -1;
            turningNow = false;
            startFollowing(robot);
            return;
        }
        if (backoff != null) {
            robot.telemetry("phase", "Backing out");
            if (!robot.near(backoff, 1, 5) && robot.time() - backoffStarted < BACKOFF_SECONDS) return;
            backoff = null;
            startFollowing(robot);
            return;
        }
        robot.telemetry("phase", "Driving leg");
        if (follower.following()) {
            if (stalled(robot, follower)) {
                if (++recoveries > MAX_RECOVERIES) {
                    Pose p = follower.pose();
                    throw new IllegalStateException(String.format("The robot is stuck near (%.0f, %.0f) in and backing out did not free it. Increase Space around zones or move the pins.", p.x(), p.y()));
                }
                Pose p = follower.pose(), end = robot.routeLegs().get(leg).endPose();
                double[] back = history.peekFirst();
                if (back == null) {
                    double d = Math.max(1e-6, Math.hypot(end.x() - p.x(), end.y() - p.y()));
                    back = new double[] { 0, p.x() - 4 * (end.x() - p.x()) / d, p.y() - 4 * (end.y() - p.y()) / d };
                }
                backoff = new Pose(back[1], back[2], end.heading());
                history.clear();
                backoffStarted = robot.time();
                follower.hold(backoff);
            }
            return;
        }
        Pose end = robot.routeLegs().get(leg).endPose();
        if (arrived < 0) arrived = robot.time();
        double held = robot.time() - arrived, pause = robot.stopWait(leg);
        // Pedro's default hold timeout (100 ms) is not a settling test: wait until the estimate
        // has actually settled (bounded), then count the pause from the moment it stopped.
        boolean settled = robot.near(end, 0.75, 3) && follower.velocity().linSpeed() < 2;
        boolean last = leg == robot.routeLegs().size() - 1;
        if (pause > 0) robot.waiting(leg, robot.stopAction(leg), pause - held);
        if (held < pause || (!settled && held < pause + 3)) return;
        robot.moving();
        if (last) {
            robot.finish();
            return;
        }
        leg++;
        arrived = -1;
        beginLeg(robot);
    }

    // Stalled: barely moving for a while with the leg's end still well ahead. History keeps the last
    // ~1.2 seconds of poses where the robot was moving, so the back-out target is a spot it recently
    // drove through (and was therefore clear), however long it has been stuck.
    private boolean stalled(SimRobot robot, Follower follower) {
        Pose p = follower.pose();
        double now = robot.time();
        if (now - legStarted < .5 || follower.remainingDistance() < 3 || follower.velocity().linSpeed() > STALL_SPEED) {
            history.addLast(new double[] { now, p.x(), p.y() });
            while (history.size() > 1 && now - history.peekFirst()[0] > 1.2) history.removeFirst();
            slowSince = -1;
            return false;
        }
        if (slowSince < 0) slowSince = now;
        return now - slowSince > STALL_SECONDS;
    }
}
