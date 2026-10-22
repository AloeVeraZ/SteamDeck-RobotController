package com.qualcomm.robotcore.eventloop.opmode;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
// Each opModeIsActive(), idle() and sleep() step waits for the next simulation tick, so one pass of
// a while (opModeIsActive()) loop is one physics step (the hub's lockstep loop).
public abstract class LinearOpMode extends OpMode {
    public abstract void runOpMode() throws InterruptedException;
    public final void waitForStart() { deck.sim.hub.OpModeHost.waitForStart(); }
    public final boolean opModeIsActive() { deck.sim.hub.OpModeHost.sync(); return deck.sim.hub.OpModeHost.started() && !deck.sim.hub.OpModeHost.stopRequested(); }
    public final boolean opModeInInit() { deck.sim.hub.OpModeHost.sync(); return !deck.sim.hub.OpModeHost.started() && !deck.sim.hub.OpModeHost.stopRequested(); }
    public final boolean isStarted() { return deck.sim.hub.OpModeHost.started(); }
    public final boolean isStopRequested() { return deck.sim.hub.OpModeHost.stopRequested(); }
    public final void idle() { deck.sim.hub.OpModeHost.sync(); }
    public final void sleep(long milliseconds) { deck.sim.hub.OpModeHost.sleep(milliseconds); }
    @Override public final void init() {}
    @Override public final void loop() {}
}
