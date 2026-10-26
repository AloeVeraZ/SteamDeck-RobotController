package com.qualcomm.hardware.rev;

import com.qualcomm.hardware.stmicroelectronics.VL53L0X;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
// REV 2m Distance Sensor (REV_VL53L0X_RANGE_SENSOR in the configuration).
public abstract class Rev2mDistanceSensor extends VL53L0X {
    protected Rev2mDistanceSensor() {}
    @Override public String getDeviceName() { return "REV 2M ToF Distance Sensor"; }
}
