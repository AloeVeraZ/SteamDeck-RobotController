package com.qualcomm.robotcore.hardware;

import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public interface DistanceSensor extends HardwareDevice {
    /** What getDistance returns when nothing is in range. */
    double distanceOutOfRange = DistanceUnit.infinity;
    double getDistance(DistanceUnit unit);
}
