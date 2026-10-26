package com.qualcomm.robotcore.hardware;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public interface Servo extends HardwareDevice {
    enum Direction { FORWARD, REVERSE }
    double MIN_POSITION = 0.0, MAX_POSITION = 1.0;
    ServoController getController();
    int getPortNumber();
    void setDirection(Direction direction);
    Direction getDirection();
    void setPosition(double position);
    double getPosition();
    void scaleRange(double min, double max);
}
