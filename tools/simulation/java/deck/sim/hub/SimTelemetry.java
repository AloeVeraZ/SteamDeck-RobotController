package deck.sim.hub;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.firstinspires.ftc.robotcore.external.Telemetry;

/** Driver Station telemetry: update() publishes the lines added since the last clear, like the real one. */
final class SimTelemetry implements Telemetry {
    private final Map<String, String> pending = new LinkedHashMap<>();
    private volatile Map<String, String> shown = new LinkedHashMap<>();
    private boolean autoClear = true;
    private int interval = 250, lines;

    private final class Entry implements Item, Line {
        private String caption;
        Entry(String caption) { this.caption = caption; }
        @Override public Item setCaption(String caption) { String value = pending.remove(this.caption); this.caption = caption; pending.put(caption, value == null ? "" : value); return this; }
        @Override public Item setValue(String format, Object... args) { pending.put(caption, String.format(Locale.ROOT, format, args)); return this; }
        @Override public Item setValue(Object value) { pending.put(caption, String.valueOf(value)); return this; }
        @Override public Item addData(String caption, Object value) { return SimTelemetry.this.addData(caption, value); }
        @Override public Item addData(String caption, String format, Object... args) { return SimTelemetry.this.addData(caption, format, args); }
    }

    private Item put(String caption, String value) {
        if (pending.size() < 60) pending.put(caption == null || caption.isEmpty() ? "line " + ++lines : caption, value.length() > 4000 ? value.substring(0, 4000) : value);
        return new Entry(caption);
    }
    @Override public Item addData(String caption, String format, Object... args) { return put(caption, String.format(Locale.ROOT, format, args)); }
    @Override public Item addData(String caption, Object value) { return put(caption, String.valueOf(value)); }
    @Override public Line addLine() { return new Entry(""); }
    @Override public Line addLine(String lineCaption) { put(lineCaption, ""); return new Entry(lineCaption); }
    @Override public boolean update() {
        shown = new LinkedHashMap<>(pending);
        if (autoClear) { pending.clear(); lines = 0; }
        return true;
    }
    @Override public void clear() { pending.clear(); lines = 0; }
    @Override public void clearAll() { clear(); shown = new LinkedHashMap<>(); }
    @Override public void setAutoClear(boolean autoClear) { this.autoClear = autoClear; }
    @Override public boolean isAutoClear() { return autoClear; }
    @Override public void setMsTransmissionInterval(int msTransmissionInterval) { interval = msTransmissionInterval; }
    @Override public int getMsTransmissionInterval() { return interval; }
    Map<String, String> shown() { return shown; }
}
