package deck.sim;

import com.pedropathing.follower.Follower;
import com.pedropathing.math.Pose;

/** Built-in program: follow the planner's route with Pedro, then hold until settled. */
public final class RouteAutonomous implements DeckAutonomous {
    private double holdingSince = -1;

    @Override
    public void init(SimRobot robot) {
        if (robot.plannedRoute() == null) throw new IllegalStateException("Plan a route before running it.");
        robot.follower().setPose(robot.startPose());
        robot.follower().follow(robot.plannedRoute());
    }

    @Override
    public void loop(SimRobot robot) {
        Follower follower = robot.follower();
        follower.update();
        Pose end = robot.pins().get(robot.pins().size() - 1);
        robot.telemetry("mode", follower.mode());
        robot.telemetry("path", (follower.pathIndex() + 1) + " of " + robot.plannedRoute().getSegments().size());
        if (follower.following()) return;
        if (holdingSince < 0) holdingSince = robot.time();
        // Pedro's default hold timeout (100 ms) is not a settling test, so wait for the estimate
        // to actually settle, with a bounded hold.
        double speed = follower.velocity().linSpeed();
        if ((robot.near(end, 0.5, 2) && speed < 1) || robot.time() - holdingSince > 3) robot.finish();
    }
}
