package deck.sim.hub;

import com.qualcomm.robotcore.hardware.ServoController;
import com.qualcomm.robotcore.hardware.ServoImplEx;

/** A positional servo port on the virtual Control Hub, for a mechanism such as a kicker. Like every hub servo it is a
 * ServoImplEx: setPwmRange changes the pulses it sends, and a servo with its PWM off goes limp (no position). */
final class SimServo extends ServoImplEx {
    private final int port;
    private Direction direction = Direction.FORWARD;
    private double position = Double.NaN, min = 0, max = 1;
    private PwmRange range;
    private boolean pwm = true;

    SimServo(int port) { this(port, null); }

    /** defaultPulses: what the configured servo type sends for 0 and 1 (Servo: 600-2400 us, ServoFullRange: 500-2500 us). */
    SimServo(int port, double[] defaultPulses) {
        this.port = port;
        range = defaultPulses == null ? PwmRange.defaultRange : new PwmRange(defaultPulses[0], defaultPulses[1]);
    }

    /** The commanded position after direction and range, 0..1 (NaN before the first command or with the PWM off). */
    double output() {
        if (Double.isNaN(position) || !pwm) return Double.NaN;
        double p = min + position * (max - min);
        return direction == Direction.REVERSE ? 1 - p : p;
    }

    /** The pulse the port sends now, microseconds (NaN when it sends none). */
    double pulse() {
        double p = output();
        return Double.isNaN(p) ? p : range.usPulseLower + p * (range.usPulseUpper - range.usPulseLower);
    }

    @Override public void setDirection(Direction direction) { this.direction = direction; }
    @Override public Direction getDirection() { return direction; }
    @Override public void setPosition(double position) { this.position = Math.max(0, Math.min(1, position)); pwm = true; }
    @Override public double getPosition() { return Double.isNaN(position) ? 0 : position; }
    @Override public void scaleRange(double min, double max) { this.min = Math.max(0, Math.min(1, min)); this.max = Math.max(0, Math.min(1, max)); }
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
    /** A pulse width sets the position it stands for in the current range. */
    @Override public void setPulseWidth(double us) {
        double p = (us - range.usPulseLower) / (range.usPulseUpper - range.usPulseLower);
        direction = Direction.FORWARD; min = 0; max = 1; setPosition(p);
    }
    @Override public double getPulseWidth() { double us = pulse(); return Double.isNaN(us) ? 0 : us; }
}
