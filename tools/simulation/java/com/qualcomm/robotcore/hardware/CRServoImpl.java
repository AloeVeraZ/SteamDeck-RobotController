package com.qualcomm.robotcore.hardware;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
// Every continuous servo port on a hub is a CRServoImplEx; the virtual hub's extend it (deck.sim.hub.SimCRServo).
public abstract class CRServoImpl implements CRServo {
    protected CRServoImpl() {}
}
