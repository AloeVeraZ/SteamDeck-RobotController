package com.qualcomm.robotcore.hardware;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
// An analog port (0-3.3 V), such as an Axon's feedback wire or a potentiometer. The virtual hub sets the voltage.
public abstract class AnalogInput implements HardwareDevice {
    protected AnalogInput() {}
    public abstract double getVoltage();
    public double getMaxVoltage() { return 3.3; }
    @Override public Manufacturer getManufacturer() { return Manufacturer.Lynx; }
    @Override public String getDeviceName() { return "Analog Input"; }
}
