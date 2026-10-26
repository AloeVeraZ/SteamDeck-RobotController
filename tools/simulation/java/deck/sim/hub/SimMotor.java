package deck.sim.hub;

import com.qualcomm.robotcore.hardware.DcMotorEx;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.CurrentUnit;

/**
 * A motor port on the virtual Control Hub. `mount` says which way the shaft turns the wheel
 * (+1: positive shaft rotation drives the robot forward, -1: mirrored, like a left-side drive
 * motor). As on the real SDK, REVERSE flips both the applied power and the reported encoder.
 * Pods plugged into a port use the same encoder path with no motor attached.
 */
final class SimMotor implements DcMotorEx {
    private final int port, mount;
    private Direction direction = Direction.FORWARD;
    private ZeroPowerBehavior zeroPower = ZeroPowerBehavior.BRAKE;
    private RunMode mode = RunMode.RUN_WITHOUT_ENCODER;
    private double power, rawTicks, resetTicks, ticksPerSecond, velocityTarget = Double.NaN;
    private int target, tolerance = 5;
    private boolean enabled = true;

    SimMotor(int port, int mount) {
        this.port = port;
        this.mount = mount;
    }

    private int sign() { return direction == Direction.REVERSE ? -1 : 1; }

    /** Wheel-forward command from this motor, -1..1, after direction and mounting. */
    double wheelCommand() { return enabled ? power * sign() * mount : 0; }

    /** A mechanism motor's encoder, set by the simulator (absolute ticks and ticks per second). */
    void encoder(double ticks, double tps) { rawTicks = ticks; ticksPerSecond = tps; }

    /** The commanded speed as a fraction of `fullTicksPerSecond` (velocity control) or the power. */
    double commanded(double fullTicksPerSecond) {
        if (!enabled) return 0;
        return Double.isNaN(velocityTarget) ? power * sign() : velocityTarget * sign() / Math.max(1e-9, fullTicksPerSecond);
    }

    /** RUN_TO_POSITION target in raw encoder ticks, or NaN when the motor is not positioning. */
    double targetTicks() { return mode == RunMode.RUN_TO_POSITION && enabled && power != 0 ? target * sign() + resetTicks : Double.NaN; }

    /** Advances the encoder by `ticks` of wheel-forward travel over `dt` seconds. */
    void advance(double ticks, double dt) {
        rawTicks += ticks * mount;
        ticksPerSecond = dt > 0 ? ticks * mount / dt : 0;
    }

    @Override public void setDirection(Direction direction) { this.direction = direction; }
    @Override public Direction getDirection() { return direction; }
    @Override public void setPower(double power) { this.power = Math.max(-1, Math.min(1, power)); velocityTarget = Double.NaN; }
    @Override public double getPower() { return power; }
    @Override public void setZeroPowerBehavior(ZeroPowerBehavior behavior) { zeroPower = behavior; }
    @Override public ZeroPowerBehavior getZeroPowerBehavior() { return zeroPower; }
    @Override public void setMode(RunMode mode) {
        if (mode == RunMode.STOP_AND_RESET_ENCODER) { resetTicks = rawTicks; power = 0; }
        else this.mode = mode;
    }
    @Override public RunMode getMode() { return mode; }
    @Override public void setTargetPosition(int position) { target = position; }
    @Override public int getTargetPosition() { return target; }
    @Override public boolean isBusy() { return mode == RunMode.RUN_TO_POSITION && Math.abs(getCurrentPosition() - target) > tolerance; }
    @Override public int getCurrentPosition() { return (int) Math.round((rawTicks - resetTicks) * sign()); }
    @Override public int getPortNumber() { return port; }
    @Override public void setMotorEnable() { enabled = true; }
    @Override public void setMotorDisable() { enabled = false; }
    @Override public boolean isMotorEnabled() { return enabled; }
    /** Velocity control (ticks per second), as the SDK runs it with RUN_USING_ENCODER. */
    @Override public void setVelocity(double angularRate) { velocityTarget = angularRate; power = 0; }
    @Override public void setVelocity(double angularRate, AngleUnit unit) { setVelocity(angularRate); }
    /** The simulator's flywheel reaches its speed over the spin-up time whatever the gains, so they change nothing here. */
    @Override public void setVelocityPIDFCoefficients(double p, double i, double d, double f) {}
    @Override public double getVelocity() { return ticksPerSecond * sign(); }
    @Override public double getVelocity(AngleUnit unit) { throw new UnsupportedOperationException("getVelocity(AngleUnit) needs the motor's ticks per revolution; use getVelocity()."); }
    @Override public double getCurrent(CurrentUnit unit) { return unit == CurrentUnit.AMPS ? Math.abs(power) * 4 : Math.abs(power) * 4000; }
    @Override public void setTargetPositionTolerance(int tolerance) { this.tolerance = tolerance; }
    @Override public int getTargetPositionTolerance() { return tolerance; }
}
