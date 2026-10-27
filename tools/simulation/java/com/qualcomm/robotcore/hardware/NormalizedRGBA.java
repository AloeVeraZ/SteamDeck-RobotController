package com.qualcomm.robotcore.hardware;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public class NormalizedRGBA {
    public float red, green, blue, alpha;
    public NormalizedRGBA() {}
    /** As an Android color int (ARGB, 8 bits a channel). */
    public int toColor() {
        int a = channel(alpha), r = channel(red), g = channel(green), b = channel(blue);
        return a << 24 | r << 16 | g << 8 | b;
    }
    private static int channel(float v) { return Math.round(Math.max(0, Math.min(1, v)) * 255); }
}
