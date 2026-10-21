package com.qualcomm.robotcore.util;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset Pedro Pathing and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public final class Range {
    private Range() {}
    public static double clip(double number, double min, double max) { return number < min ? min : number > max ? max : number; }
    public static float clip(float number, float min, float max) { return number < min ? min : number > max ? max : number; }
    public static int clip(int number, int min, int max) { return number < min ? min : number > max ? max : number; }
    public static double scale(double n, double x1, double x2, double y1, double y2) { return y1 + (n - x1) * (y2 - y1) / (x2 - x1); }
    public static void throwIfRangeIsInvalid(double number, double min, double max) {
        if (number < min || number > max) throw new IllegalArgumentException(String.format("number %f is invalid; valid ranges are %f..%f", number, min, max));
    }
}
