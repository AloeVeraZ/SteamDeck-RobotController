package com.qualcomm.robotcore.util;

import java.util.concurrent.TimeUnit;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
// Reads the simulation clock, so a paused or sped-up simulation keeps OpMode timing consistent.
public class ElapsedTime {
    public enum Resolution { SECONDS, MILLISECONDS }
    private long start;
    private final double resolution;
    public ElapsedTime() { this(Resolution.SECONDS); }
    public ElapsedTime(long startTime) { start = startTime; resolution = 1e9; }
    public ElapsedTime(Resolution resolution) { reset(); this.resolution = resolution == Resolution.SECONDS ? 1e9 : 1e6; }
    protected long nsNow() { return deck.sim.SimClock.nanoTime(); }
    public long now(TimeUnit unit) { return unit.convert(nsNow(), TimeUnit.NANOSECONDS); }
    public void reset() { start = nsNow(); }
    public double startTime() { return start / resolution; }
    public long startTimeNanoseconds() { return start; }
    public double time() { return (nsNow() - start) / resolution; }
    public long time(TimeUnit unit) { return unit.convert(nanoseconds(), TimeUnit.NANOSECONDS); }
    public double seconds() { return nanoseconds() / 1e9; }
    public double milliseconds() { return nanoseconds() / 1e6; }
    public long nanoseconds() { return nsNow() - start; }
    @Override public String toString() { return String.format("%.4f seconds", seconds()); }
}
