package com.qualcomm.robotcore.hardware;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
// A digital port. As an INPUT it reads the pin: the hub pulls it up, so a switch wired to ground reads false when closed.
public interface DigitalChannel extends HardwareDevice {
    enum Mode { INPUT, OUTPUT }
    Mode getMode();
    void setMode(Mode mode);
    boolean getState();
    void setState(boolean state);
}
