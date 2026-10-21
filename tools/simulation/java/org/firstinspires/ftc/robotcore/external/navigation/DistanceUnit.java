package org.firstinspires.ftc.robotcore.external.navigation;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset Pedro Pathing and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public enum DistanceUnit {
    METER(0.0254), CM(2.54), MM(25.4), INCH(1.0);
    public static final double infinity = Double.MAX_VALUE;
    private final double perInch;
    DistanceUnit(double perInch) { this.perInch = perInch; }
    public double fromInches(double inches) { return inches * perInch; }
    public double toInches(double value) { return value / perInch; }
    public double fromMeters(double meters) { return fromInches(meters / 0.0254); }
    public double toMeters(double value) { return toInches(value) * 0.0254; }
    public double fromMm(double mm) { return fromInches(mm / 25.4); }
    public double toMm(double value) { return toInches(value) * 25.4; }
    public double fromCm(double cm) { return fromInches(cm / 2.54); }
    public double toCm(double value) { return toInches(value) * 2.54; }
    public double fromUnit(DistanceUnit them, double theirs) { return fromInches(them.toInches(theirs)); }
}
