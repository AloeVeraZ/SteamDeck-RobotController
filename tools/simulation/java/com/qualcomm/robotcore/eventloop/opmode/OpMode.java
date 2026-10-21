package com.qualcomm.robotcore.eventloop.opmode;

import com.qualcomm.robotcore.hardware.Gamepad;
import com.qualcomm.robotcore.hardware.HardwareMap;
import org.firstinspires.ftc.robotcore.external.Telemetry;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset Pedro Pathing and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public abstract class OpMode {
    public Gamepad gamepad1 = new Gamepad(), gamepad2 = new Gamepad();
    public Telemetry telemetry;
    public HardwareMap hardwareMap;
    public double time;
    private long startNanos = deck.sim.SimClock.nanoTime();
    public abstract void init();
    public void init_loop() {}
    public void start() {}
    public abstract void loop();
    public void stop() {}
    public final void requestOpModeStop() { deck.sim.hub.OpModeHost.requestStop(); }
    public double getRuntime() { return (deck.sim.SimClock.nanoTime() - startNanos) / 1e9; }
    public void resetRuntime() { startNanos = deck.sim.SimClock.nanoTime(); }
}
