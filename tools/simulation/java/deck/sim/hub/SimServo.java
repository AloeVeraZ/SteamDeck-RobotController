package deck.sim.hub;

import com.qualcomm.robotcore.hardware.Servo;
import com.qualcomm.robotcore.hardware.ServoController;

/** A positional servo port on the virtual Control Hub, for a mechanism such as a kicker. */
final class SimServo implements Servo {
    private final int port;
    private Direction direction = Direction.FORWARD;
    private double position = Double.NaN, min = 0, max = 1;

    SimServo(int port) { this.port = port; }

    /** The commanded position after direction and range, 0..1 (NaN before the first command). */
    double output() {
        if (Double.isNaN(position)) return Double.NaN;
        double p = min + position * (max - min);
        return direction == Direction.REVERSE ? 1 - p : p;
    }

    @Override public void setDirection(Direction direction) { this.direction = direction; }
    @Override public Direction getDirection() { return direction; }
    @Override public void setPosition(double position) { this.position = Math.max(0, Math.min(1, position)); }
    @Override public double getPosition() { return Double.isNaN(position) ? 0 : position; }
    @Override public void scaleRange(double min, double max) { this.min = Math.max(0, Math.min(1, min)); this.max = Math.max(0, Math.min(1, max)); }
    @Override public int getPortNumber() { return port; }
    @Override public ServoController getController() {
        return new ServoController() {
            @Override public void pwmEnable() {}
            @Override public void pwmDisable() {}
        };
    }
}
