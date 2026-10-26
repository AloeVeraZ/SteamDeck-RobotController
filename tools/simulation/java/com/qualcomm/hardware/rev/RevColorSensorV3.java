package com.qualcomm.hardware.rev;

import com.qualcomm.robotcore.hardware.ColorRangeSensor;
import com.qualcomm.robotcore.hardware.DistanceSensor;
import com.qualcomm.robotcore.hardware.OpticalDistanceSensor;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
// REV Color Sensor V3 (RevColorSensorV3 in the configuration): color, light and a rough distance (best within 10 cm).
public abstract class RevColorSensorV3 implements DistanceSensor, OpticalDistanceSensor, ColorRangeSensor {
    protected RevColorSensorV3() {}
    /** The proximity reading, 0-2047 (more when nearer). */
    public abstract int rawOptical();
    @Override public double getRawLightDetectedMax() { return 2047; }
    @Override public String status() { return getDeviceName() + " (virtual)"; }
    @Override public Manufacturer getManufacturer() { return Manufacturer.Broadcom; }
    @Override public String getDeviceName() { return "REV Color Sensor v3"; }
}
