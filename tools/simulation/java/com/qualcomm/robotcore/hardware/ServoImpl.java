package com.qualcomm.robotcore.hardware;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
// Every servo port on a hub is a ServoImplEx; the virtual hub's servos extend it (deck.sim.hub.SimServo).
public abstract class ServoImpl implements Servo {
    protected ServoImpl() {}
}
