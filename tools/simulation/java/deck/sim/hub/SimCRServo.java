package deck.sim.hub;

import com.qualcomm.robotcore.hardware.CRServoImplEx;
import com.qualcomm.robotcore.hardware.ServoController;

/** A continuous-rotation servo port on the virtual Control Hub, for a mechanism such as an indexer. */
final class SimCRServo extends CRServoImplEx {
    private final int port;
    private Direction direction = Direction.FORWARD;
    private double power;
    private PwmRange range = PwmRange.defaultRange;
    private boolean pwm = true;

    SimCRServo(int port) { this.port = port; }

    /** Applied power after direction, -1..1 (0 with the PWM off). */
    double output() { return !pwm ? 0 : direction == Direction.REVERSE ? -power : power; }

    @Override public void setDirection(Direction direction) { this.direction = direction; }
    @Override public Direction getDirection() { return direction; }
    @Override public void setPower(double power) { this.power = Math.max(-1, Math.min(1, power)); pwm = true; }
    @Override public double getPower() { return power; }
    @Override public int getPortNumber() { return port; }
    @Override public ServoController getController() {
        return new ServoController() {
            @Override public void pwmEnable() { pwm = true; }
            @Override public void pwmDisable() { pwm = false; }
        };
    }
    @Override public void setPwmRange(PwmRange range) { if (range != null) this.range = range; }
    @Override public PwmRange getPwmRange() { return range; }
    @Override public void setPwmEnable() { pwm = true; }
    @Override public void setPwmDisable() { pwm = false; }
    @Override public boolean isPwmEnabled() { return pwm; }
    @Override public void setPulseWidth(double us) { direction = Direction.FORWARD; setPower(2 * (us - range.usPulseLower) / (range.usPulseUpper - range.usPulseLower) - 1); }
    @Override public double getPulseWidth() { return range.usPulseLower + (output() + 1) / 2 * (range.usPulseUpper - range.usPulseLower); }
}
