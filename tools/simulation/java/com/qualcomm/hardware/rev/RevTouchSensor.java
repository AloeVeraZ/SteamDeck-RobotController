package com.qualcomm.hardware.rev;

import com.qualcomm.robotcore.hardware.TouchSensor;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
// REV Touch Sensor (RevTouchSensor in the configuration): pressed while its digital pin reads low.
public abstract class RevTouchSensor implements TouchSensor {
    protected RevTouchSensor() {}
    @Override public double getValue() { return isPressed() ? 1 : 0; }
    @Override public Manufacturer getManufacturer() { return Manufacturer.Lynx; }
    @Override public String getDeviceName() { return "REV Touch Sensor"; }
}
