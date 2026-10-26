package deck.sim.hub;

import com.qualcomm.hardware.rev.RevTouchSensor;
import com.qualcomm.robotcore.hardware.DigitalChannel;

/**
 * A switch on a digital port of the virtual Control Hub (a touch sensor, a magnetic or mechanical limit switch). The hub
 * pulls the pin up, so a normally open switch wired to ground reads low (false) while it is closed; `inverted` is a
 * switch that reads the other way (normally closed). The simulator says each tick whether the switch is closed.
 * Configured as DigitalDevice it is a DigitalChannel; configured as RevTouchSensor it is a TouchSensor, as on a robot.
 */
final class SimDigital {
    private final boolean inverted;
    private boolean closed;

    SimDigital(boolean inverted) { this.inverted = inverted; }

    void closed(boolean closed) { this.closed = closed; }
    boolean closed() { return closed; }
    /** The pin's level: high unless a normally open switch is closed. */
    boolean level() { return inverted == closed; }

    /** As a DigitalDevice: reads the pin as an INPUT; as an OUTPUT it reads back what the code set. */
    final class Channel implements DigitalChannel {
        private final int port;
        private Mode mode = Mode.INPUT;
        private boolean out;
        Channel(int port) { this.port = port; }
        @Override public Mode getMode() { return mode; }
        @Override public void setMode(Mode mode) { if (mode != null) this.mode = mode; }
        @Override public boolean getState() { return mode == Mode.OUTPUT ? out : level(); }
        @Override public void setState(boolean state) { out = state; }
        @Override public String getConnectionInfo() { return "virtual; digital port " + port; }
    }

    /** As a RevTouchSensor: pressed while the pin reads low. */
    final class Touch extends RevTouchSensor {
        private final int port;
        Touch(int port) { this.port = port; }
        @Override public boolean isPressed() { return !level(); }
        @Override public String getConnectionInfo() { return "virtual; digital port " + port; }
    }
}
