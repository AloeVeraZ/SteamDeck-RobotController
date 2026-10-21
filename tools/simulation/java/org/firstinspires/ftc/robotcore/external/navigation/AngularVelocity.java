package org.firstinspires.ftc.robotcore.external.navigation;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset Pedro Pathing and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public class AngularVelocity {
    public AngleUnit unit;
    public float xRotationRate, yRotationRate, zRotationRate;
    public long acquisitionTime;
    public AngularVelocity() { this(AngleUnit.RADIANS, 0, 0, 0, 0); }
    public AngularVelocity(AngleUnit unit, float xRotationRate, float yRotationRate, float zRotationRate, long acquisitionTime) {
        this.unit = unit; this.xRotationRate = xRotationRate; this.yRotationRate = yRotationRate; this.zRotationRate = zRotationRate; this.acquisitionTime = acquisitionTime;
    }
}
