package deck.sim.hub;

import com.qualcomm.hardware.rev.Rev2mDistanceSensor;
import com.qualcomm.hardware.rev.RevColorSensorV3;
import com.qualcomm.robotcore.hardware.DistanceSensor;
import com.qualcomm.robotcore.hardware.NormalizedRGBA;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;

/**
 * I2C range sensors on the virtual Control Hub, fed each tick: a REV 2m Distance Sensor's distance, and a REV Color
 * Sensor V3's color and distance (what is in front of it: a game piece, or nothing). Millimetres; NaN or infinity when
 * nothing is in range.
 */
final class SimRange {
    private SimRange() {}

    private static double distance(double mm, DistanceUnit unit) {
        return Double.isNaN(mm) || Double.isInfinite(mm) ? DistanceSensor.distanceOutOfRange : unit.fromMm(mm);
    }

    /** REV 2m Distance Sensor (REV_VL53L0X_RANGE_SENSOR). */
    static final class Distance extends Rev2mDistanceSensor {
        double mm = Double.POSITIVE_INFINITY;
        @Override public double getDistance(DistanceUnit unit) { return distance(mm, unit); }
    }

    /** REV Color Sensor V3: normalized color (0-1 a channel, before gain) and a rough distance. */
    static final class Color extends RevColorSensorV3 {
        double mm = Double.POSITIVE_INFINITY;
        float red, green, blue, alpha;
        private float gain = 1;
        private static final int RAW = 65535;

        private float scaled(float v) { return Math.max(0, Math.min(1, v * gain)); }
        @Override public NormalizedRGBA getNormalizedColors() {
            NormalizedRGBA c = new NormalizedRGBA();
            c.red = scaled(red); c.green = scaled(green); c.blue = scaled(blue); c.alpha = scaled(alpha);
            return c;
        }
        @Override public float getGain() { return gain; }
        @Override public void setGain(float gain) { this.gain = gain; }
        @Override public int red() { return Math.round(scaled(red) * RAW); }
        @Override public int green() { return Math.round(scaled(green) * RAW); }
        @Override public int blue() { return Math.round(scaled(blue) * RAW); }
        @Override public int alpha() { return Math.round(scaled(alpha) * RAW); }
        @Override public int argb() { return getNormalizedColors().toColor(); }
        @Override public void enableLed(boolean enable) {}
        @Override public double getDistance(DistanceUnit unit) { return distance(mm, unit); }
        /** Proximity: 2047 touching, falling off to 0 by 10 cm. */
        @Override public int rawOptical() { return Double.isNaN(mm) || mm >= 100 ? 0 : (int) Math.round(2047 * (1 - mm / 100)); }
        @Override public double getLightDetected() { return rawOptical() / 2047.0; }
        @Override public double getRawLightDetected() { return rawOptical(); }
    }
}
