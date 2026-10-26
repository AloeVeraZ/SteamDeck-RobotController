package org.firstinspires.ftc.robotcore.external.navigation;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public enum CurrentUnit {
    AMPS, MILLIAMPS;
    public double toAmps(double current) { return this == AMPS ? current : current / 1000; }
    public double toMilliAmps(double current) { return this == MILLIAMPS ? current : current * 1000; }
    public double convert(double current, CurrentUnit unit) { return this == AMPS ? unit.toAmps(current) : unit.toMilliAmps(current); }
}
