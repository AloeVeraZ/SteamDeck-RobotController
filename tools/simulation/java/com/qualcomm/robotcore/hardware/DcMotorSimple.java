package com.qualcomm.robotcore.hardware;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public interface DcMotorSimple extends HardwareDevice {
    enum Direction {
        FORWARD, REVERSE;
        public Direction inverted() { return this == FORWARD ? REVERSE : FORWARD; }
    }
    void setDirection(Direction direction);
    Direction getDirection();
    void setPower(double power);
    double getPower();
}
