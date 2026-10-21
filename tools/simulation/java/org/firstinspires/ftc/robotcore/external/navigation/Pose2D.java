package org.firstinspires.ftc.robotcore.external.navigation;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset Pedro Pathing and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public class Pose2D {
    protected final double x, y, heading;
    protected final DistanceUnit distanceUnit;
    protected final AngleUnit headingUnit;
    public Pose2D(DistanceUnit distanceUnit, double x, double y, AngleUnit headingUnit, double heading) {
        this.distanceUnit = distanceUnit; this.x = x; this.y = y; this.headingUnit = headingUnit; this.heading = heading;
    }
    public double getX(DistanceUnit unit) { return unit.fromUnit(distanceUnit, x); }
    public double getY(DistanceUnit unit) { return unit.fromUnit(distanceUnit, y); }
    public double getHeading(AngleUnit unit) { return unit.fromUnit(headingUnit, heading); }
}
