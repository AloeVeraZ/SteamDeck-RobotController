package deck.sim.hub;

import com.qualcomm.hardware.gobilda.GoBildaPinpointDriver;
import com.qualcomm.hardware.sparkfun.SparkFunOTOS;
import com.qualcomm.robotcore.hardware.IMU;
import com.qualcomm.robotcore.hardware.VoltageSensor;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.AngularVelocity;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;
import org.firstinspires.ftc.robotcore.external.navigation.Pose2D;
import org.firstinspires.ftc.robotcore.external.navigation.UnnormalizedAngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.YawPitchRollAngles;

/**
 * Virtual sensors on the Control Hub, fed each tick from the simulator's sensor model (its
 * odometry deltas carry the configured noise/scale error; its heading carries gyro drift).
 */
final class SimSensors {
    private SimSensors() {}

    /** The Control Hub's built-in IMU: yaw from the simulated gyro, zeroed by resetYaw(). */
    static final class Imu implements IMU {
        double heading, rate, zero;
        @Override public boolean initialize(Parameters parameters) { return true; }
        @Override public void resetYaw() { zero = heading; }
        @Override public YawPitchRollAngles getRobotYawPitchRollAngles() {
            return new YawPitchRollAngles(AngleUnit.RADIANS, AngleUnit.normalizeRadians(heading - zero), 0, 0, deck.sim.SimClock.nanoTime());
        }
        @Override public AngularVelocity getRobotAngularVelocity(AngleUnit unit) {
            return new AngularVelocity(unit, 0, 0, (float) unit.getUnnormalized().fromRadians(rate), deck.sim.SimClock.nanoTime());
        }
    }

    /** Field pose integrated from robot-frame odometry deltas and gyro heading. */
    static class Tracker {
        double x, y, heading, vx, vy, omega, headingZero;
        /** How far this device's heading frame is rotated from the field's (OTOS: +90°). */
        final double frame;
        Tracker(double frame) { this.frame = frame; }
        void advance(double dx, double dy, double gyro, double dt) {
            double previous = heading, next = gyro - headingZero, mid = previous + AngleUnit.normalizeRadians(next - previous) / 2 - frame;
            double fx = dx * Math.cos(mid) - dy * Math.sin(mid), fy = dx * Math.sin(mid) + dy * Math.cos(mid);
            x += fx; y += fy;
            vx = dt > 0 ? fx / dt : 0; vy = dt > 0 ? fy / dt : 0;
            omega = dt > 0 ? AngleUnit.normalizeRadians(next - previous) / dt : 0;
            heading = next;
        }
        void place(double px, double py, double ph, double gyro) { x = px; y = py; headingZero = gyro - ph; heading = ph; }
    }

    /** goBILDA Pinpoint: its own two pods and IMU, reporting a fused field pose. */
    static final class Pinpoint extends GoBildaPinpointDriver {
        final Tracker tracker = new Tracker(0);
        double gyro;
        @Override public void update() {}
        @Override public void setOffsets(double xOffset, double yOffset, DistanceUnit distanceUnit) {}
        @Override public void setEncoderResolution(GoBildaOdometryPods pods) {}
        @Override public void setEncoderResolution(double ticksPerUnit, DistanceUnit distanceUnit) {}
        @Override public void setEncoderDirections(EncoderDirection xEncoder, EncoderDirection yEncoder) {}
        @Override public void resetPosAndIMU() { tracker.place(0, 0, 0, gyro); }
        @Override public void recalibrateIMU() {}
        @Override public void setPosition(Pose2D pos) { tracker.place(pos.getX(DistanceUnit.INCH), pos.getY(DistanceUnit.INCH), pos.getHeading(AngleUnit.RADIANS), gyro); }
        @Override public double getPosX(DistanceUnit unit) { return unit.fromInches(tracker.x); }
        @Override public double getPosY(DistanceUnit unit) { return unit.fromInches(tracker.y); }
        @Override public double getHeading(AngleUnit unit) { return unit.fromRadians(tracker.heading); }
        @Override public double getVelX(DistanceUnit unit) { return unit.fromInches(tracker.vx); }
        @Override public double getVelY(DistanceUnit unit) { return unit.fromInches(tracker.vy); }
        @Override public double getHeadingVelocity(UnnormalizedAngleUnit unit) { return unit.fromRadians(tracker.omega); }
    }

    /** SparkFun OTOS: optical tracking with its own IMU. Its heading frame is the field's +90° (Pedro's convention). */
    static final class Otos extends SparkFunOTOS {
        final Tracker tracker = new Tracker(Math.PI / 2);
        double gyro;
        private DistanceUnit linear = DistanceUnit.INCH;
        private AngleUnit angular = AngleUnit.DEGREES;
        private Pose2D offset = new Pose2D();
        @Override public DistanceUnit getLinearUnit() { return linear; }
        @Override public void setLinearUnit(DistanceUnit unit) { linear = unit; }
        @Override public AngleUnit getAngularUnit() { return angular; }
        @Override public void setAngularUnit(AngleUnit unit) { angular = unit; }
        @Override public boolean calibrateImu() { return true; }
        @Override public void resetTracking() { tracker.place(0, 0, Math.PI / 2, gyro); }
        @Override public Pose2D getOffset() { return new Pose2D(offset); }
        @Override public void setOffset(Pose2D pose) { offset = new Pose2D(pose); }
        @Override public boolean setLinearScalar(double scalar) { return true; }
        @Override public boolean setAngularScalar(double scalar) { return true; }
        @Override public Pose2D getPosition() { return new Pose2D(linear.fromInches(tracker.x), linear.fromInches(tracker.y), angular.fromRadians(tracker.heading)); }
        @Override public void setPosition(Pose2D pose) { tracker.place(linear.toInches(pose.x), linear.toInches(pose.y), angular.toRadians(pose.h), gyro); }
        @Override public Pose2D getVelocity() { return new Pose2D(linear.fromInches(tracker.vx), linear.fromInches(tracker.vy), angular.getUnnormalized().fromRadians(tracker.omega)); }
    }

    static final class Battery implements VoltageSensor {
        @Override public double getVoltage() { return 12.8; }
    }
}
