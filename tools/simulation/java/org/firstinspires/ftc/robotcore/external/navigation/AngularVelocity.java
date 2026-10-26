package org.firstinspires.ftc.robotcore.external.navigation;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public class AngularVelocity {
    public UnnormalizedAngleUnit angleUnit;
    public float xRotationRate, yRotationRate, zRotationRate;
    public long acquisitionTime;
    public AngularVelocity() { this(UnnormalizedAngleUnit.RADIANS, 0, 0, 0, 0); }
    public AngularVelocity(UnnormalizedAngleUnit angleUnit, float xRotationRate, float yRotationRate, float zRotationRate, long acquisitionTime) {
        this.angleUnit = angleUnit; this.xRotationRate = xRotationRate; this.yRotationRate = yRotationRate; this.zRotationRate = zRotationRate; this.acquisitionTime = acquisitionTime;
    }
    public AngularVelocity(AngleUnit angleUnit, float xRotationRate, float yRotationRate, float zRotationRate, long acquisitionTime) {
        this(angleUnit.getUnnormalized(), xRotationRate, yRotationRate, zRotationRate, acquisitionTime);
    }
    public AngularVelocity toAngleUnit(AngleUnit unit) {
        UnnormalizedAngleUnit to = unit.getUnnormalized();
        return new AngularVelocity(to, (float) to.fromUnit(angleUnit, xRotationRate), (float) to.fromUnit(angleUnit, yRotationRate), (float) to.fromUnit(angleUnit, zRotationRate), acquisitionTime);
    }
    @Override public String toString() { return String.format("{x=%.3f, y=%.3f, z=%.3f}", xRotationRate, yRotationRate, zRotationRate); }
}
