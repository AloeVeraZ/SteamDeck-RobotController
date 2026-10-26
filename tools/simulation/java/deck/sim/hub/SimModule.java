package deck.sim.hub;

import com.qualcomm.hardware.lynx.LynxModule;
import com.qualcomm.robotcore.hardware.VoltageSensor;

/** A hub of the virtual robot, by its configuration name ("Control Hub", "Expansion Hub 2"): the LynxModule the code
 * sets bulk caching on, and its battery voltage (both live under the hub's name in the SDK's hardware map). */
final class SimModule extends LynxModule implements VoltageSensor {
    private final int address;
    private final boolean parent;

    SimModule(int address, boolean parent) { this.address = address; this.parent = parent; }

    @Override public int getModuleAddress() { return address; }
    @Override public boolean isParent() { return parent; }
    @Override public double getVoltage() { return 12.8; }
    @Override public String getDeviceName() { return parent ? "Control Hub" : "Expansion Hub"; }
}
