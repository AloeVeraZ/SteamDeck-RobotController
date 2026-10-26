package com.qualcomm.robotcore.hardware;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
// The pulses a servo port sends: setPwmRange changes the pulse widths for positions 0 and 1 (SDK default 600-2400 us).
public interface PwmControl {
    class PwmRange {
        public static final double usFrameDefault = 20000, usPulseUpperDefault = 2400, usPulseLowerDefault = 600;
        public static final PwmRange defaultRange = new PwmRange(usPulseLowerDefault, usPulseUpperDefault);
        public final double usPulseLower, usPulseUpper, usFrame;
        public PwmRange(double usPulseLower, double usPulseUpper) { this(usPulseLower, usPulseUpper, usFrameDefault); }
        public PwmRange(double usPulseLower, double usPulseUpper, double usFrame) { this.usPulseLower = usPulseLower; this.usPulseUpper = usPulseUpper; this.usFrame = usFrame; }
        @Override public boolean equals(Object o) {
            if (!(o instanceof PwmRange)) return false;
            PwmRange r = (PwmRange) o;
            return usPulseLower == r.usPulseLower && usPulseUpper == r.usPulseUpper && usFrame == r.usFrame;
        }
        @Override public int hashCode() { return Double.hashCode(usPulseLower) * 31 * 31 + Double.hashCode(usPulseUpper) * 31 + Double.hashCode(usFrame); }
    }
    void setPwmRange(PwmRange range);
    PwmRange getPwmRange();
    void setPwmEnable();
    void setPwmDisable();
    boolean isPwmEnabled();
    void setPulseWidth(double pulseWidth);
    double getPulseWidth();
}
