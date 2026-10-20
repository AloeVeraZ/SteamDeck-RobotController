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

    @Override
    public void init(SimRobot robot) {
        if (robot.routeLegs().isEmpty()) throw new IllegalStateException("Plan a route before running it.");
        robot.follower().setPose(robot.startPose());
        robot.follower().follow(robot.routeLegs().get(0));
    }

    @Override
    public void loop(SimRobot robot) {
        Follower follower = robot.follower();
        follower.update();
        robot.telemetry("leg", (leg + 1) + " of " + robot.routeLegs().size());
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
        follower.follow(robot.routeLegs().get(leg));
    }
}
