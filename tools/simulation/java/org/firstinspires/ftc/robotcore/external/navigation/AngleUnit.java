package org.firstinspires.ftc.robotcore.external.navigation;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public enum AngleUnit {
    DEGREES, RADIANS;
    public double fromDegrees(double degrees) { return this == DEGREES ? normalize(degrees) : normalize(Math.toRadians(degrees)); }
    public double fromRadians(double radians) { return this == RADIANS ? normalize(radians) : normalize(Math.toDegrees(radians)); }
    public double fromUnit(AngleUnit them, double theirs) { return them == RADIANS ? fromRadians(theirs) : fromDegrees(theirs); }
    public double toDegrees(double angle) { return this == DEGREES ? angle : Math.toDegrees(angle); }
    public double toRadians(double angle) { return this == RADIANS ? angle : Math.toRadians(angle); }
    public double normalize(double angle) { return this == DEGREES ? normalizeDegrees(angle) : normalizeRadians(angle); }
    public static double normalizeDegrees(double degrees) { while (degrees >= 180.0) degrees -= 360.0; while (degrees < -180.0) degrees += 360.0; return degrees; }
    public static double normalizeRadians(double radians) { while (radians >= Math.PI) radians -= 2 * Math.PI; while (radians < -Math.PI) radians += 2 * Math.PI; return radians; }
    public UnnormalizedAngleUnit getUnnormalized() { return this == DEGREES ? UnnormalizedAngleUnit.DEGREES : UnnormalizedAngleUnit.RADIANS; }
}
