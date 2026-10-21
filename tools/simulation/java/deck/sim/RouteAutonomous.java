package deck.sim;

import com.pedropathing.follower.Follower;
import com.pedropathing.math.Pose;

/**
 * Built-in program: follow the planned route leg by leg. At each pin with a pause the robot
 * holds its position for the pause (the time a mechanism action takes), then continues.
 */
public final class RouteAutonomous implements DeckAutonomous {
    private int leg;
    private double arrived = -1;
    private final boolean tank;
    private boolean turning;
    private double turnStarted;
    private static final double SETTLE_SECONDS = .15;
    private double settleStarted = -1, settleHeading;
    public RouteAutonomous() { this(false); }
    public RouteAutonomous(boolean tank) { this.tank = tank; }
    private void beginLeg(SimRobot robot) {
        if (tank) {
            Pose p = robot.follower().pose();
            robot.follower().hold(new Pose(p.x(), p.y(), robot.routeLegs().get(leg).endPose().heading()));
            turning = true;
            turnStarted = robot.time();
        } else robot.follower().follow(robot.routeLegs().get(leg));
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
        if (turning) {
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
            turning = false;
            follower.follow(robot.routeLegs().get(leg));
            return;
        }
        robot.telemetry("phase", "Driving leg");
        if (follower.following()) return;
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
}
