package org.firstinspires.ftc.robotcore.external.navigation;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public enum UnnormalizedAngleUnit {
    DEGREES, RADIANS;
    public double fromDegrees(double degrees) { return this == DEGREES ? degrees : Math.toRadians(degrees); }
    public double fromRadians(double radians) { return this == RADIANS ? radians : Math.toDegrees(radians); }
    public double fromUnit(UnnormalizedAngleUnit them, double theirs) { return them == RADIANS ? fromRadians(theirs) : fromDegrees(theirs); }
    public double toDegrees(double angle) { return this == DEGREES ? angle : Math.toDegrees(angle); }
    public double toRadians(double angle) { return this == RADIANS ? angle : Math.toRadians(angle); }
    public AngleUnit getNormalized() { return this == DEGREES ? AngleUnit.DEGREES : AngleUnit.RADIANS; }
}
