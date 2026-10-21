package org.firstinspires.ftc.robotcore.external.navigation;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset Pedro Pathing and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public class YawPitchRollAngles {
    private final AngleUnit angleUnit;
    private final double yaw, pitch, roll;
    private final long acquisitionTime;
    public YawPitchRollAngles(AngleUnit angleUnit, double yaw, double pitch, double roll, long acquisitionTime) {
        this.angleUnit = angleUnit; this.yaw = yaw; this.pitch = pitch; this.roll = roll; this.acquisitionTime = acquisitionTime;
    }
    public double getYaw(AngleUnit unit) { return unit.fromUnit(angleUnit, yaw); }
    public double getPitch(AngleUnit unit) { return unit.fromUnit(angleUnit, pitch); }
    public double getRoll(AngleUnit unit) { return unit.fromUnit(angleUnit, roll); }
    public double getYaw() { return yaw; }
    public double getPitch() { return pitch; }
    public double getRoll() { return roll; }
    public long getAcquisitionTime() { return acquisitionTime; }
}
