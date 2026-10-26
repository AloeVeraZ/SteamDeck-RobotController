package deck.sim.hub;

import com.qualcomm.robotcore.hardware.AnalogInput;

/** An analog port on the virtual Control Hub (an Axon's feedback wire, a potentiometer, an absolute encoder): the
 * simulator sets its voltage each tick from the part it measures (0-3.3 V). */
final class SimAnalog extends AnalogInput {
    private final int port;
    double volts;

    SimAnalog(int port) { this.port = port; }

    @Override public double getVoltage() { return volts; }
    @Override public String getConnectionInfo() { return "virtual; analog port " + port; }
}
