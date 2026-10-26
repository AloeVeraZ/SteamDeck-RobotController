package com.qualcomm.hardware.stmicroelectronics;

import com.qualcomm.robotcore.hardware.DistanceSensor;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public abstract class VL53L0X implements DistanceSensor {
    protected VL53L0X() {}
    public boolean didTimeoutOccur() { return false; }
    @Override public Manufacturer getManufacturer() { return Manufacturer.STMicroelectronics; }
    @Override public String getDeviceName() { return "STMicroelectronics VL53L0X Range Sensor"; }
}
