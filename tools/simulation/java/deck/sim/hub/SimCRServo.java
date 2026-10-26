package deck.sim.hub;

import com.qualcomm.robotcore.hardware.CRServo;
import com.qualcomm.robotcore.hardware.ServoController;

/** A continuous-rotation servo port on the virtual Control Hub, for a mechanism such as an indexer. */
final class SimCRServo implements CRServo {
    private final int port;
    private Direction direction = Direction.FORWARD;
    private double power;

    SimCRServo(int port) { this.port = port; }

    /** Applied power after direction, -1..1. */
    double output() { return direction == Direction.REVERSE ? -power : power; }

    @Override public void setDirection(Direction direction) { this.direction = direction; }
    @Override public Direction getDirection() { return direction; }
    @Override public void setPower(double power) { this.power = Math.max(-1, Math.min(1, power)); }
    @Override public double getPower() { return power; }
    @Override public int getPortNumber() { return port; }
    @Override public ServoController getController() {
        return new ServoController() {
            @Override public void pwmEnable() {}
            @Override public void pwmDisable() {}
        };
    }
}
