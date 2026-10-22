package deck.sim;

import deck.pathing.DeckFollower.Localizer;
import deck.pathing.DeckFollower.MotionState;
import deck.pathing.DeckFollower.Pose;
import deck.pathing.DeckFollower.Velocity;
import java.util.HashMap;
import java.util.Map;

/**
 * A Deck localizer fed by SIMULATED sensors, never by simulation ground truth. Each tick the
 * host sends a robot-frame odometry displacement (with the configured pod noise and slip) and
 * an IMU heading (with the configured drift). This class dead-reckons them the way an
 * odometry-pod localizer would, so the estimate can and does drift from the truth.
 * Gyro-only sensing provides no displacement; the host refuses path following in that case.
 */
public final class SimLocalizer implements Localizer {
    private Pose pose = Pose.zero();
    private Velocity velocity = Velocity.zero();
    private double headingOffset;
    private double imu;
    private double dx, dy, dt;
    private boolean fresh;

    void ingest(double robotDx, double robotDy, double imuHeading, double deltaTime) {
        dx += robotDx;
        dy += robotDy;
        dt += deltaTime;
        imu = imuHeading;
        fresh = true;
    }

    @Override
    public void update() {
        if (!fresh) return;
        double heading = imu + headingOffset;
        double mid = pose.heading() + Math.atan2(Math.sin(heading - pose.heading()), Math.cos(heading - pose.heading())) / 2;
        double fx = dx * Math.cos(mid) - dy * Math.sin(mid), fy = dx * Math.sin(mid) + dy * Math.cos(mid);
        double turn = Math.atan2(Math.sin(heading - pose.heading()), Math.cos(heading - pose.heading()));
        velocity = dt > 0 ? new Velocity(fx / dt, fy / dt, turn / dt) : Velocity.zero();
        pose = new Pose(pose.x() + fx, pose.y() + fy, heading);
        dx = dy = dt = 0;
        fresh = false;
    }

    @Override
    public void setPose(Pose next) {
        pose = next;
        headingOffset = next.heading() - imu;
        velocity = Velocity.zero();
        dx = dy = dt = 0;
        fresh = false;
    }

    @Override
    public MotionState state() {
        return MotionState.ofVelocity(pose, velocity);
    }

    @Override
    public void reset() {
        setPose(Pose.zero());
    }

    @Override
    public Map<String, Object> debug() {
        Map<String, Object> map = new HashMap<>();
        map.put("pose", pose);
        map.put("velocity", velocity);
        map.put("source", "simulated odometry + IMU");
        return map;
    }
}
