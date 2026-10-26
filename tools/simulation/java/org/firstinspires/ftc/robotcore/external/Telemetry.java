package org.firstinspires.ftc.robotcore.external;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public interface Telemetry {
    interface Item {
        Item setCaption(String caption);
        Item setValue(String format, Object... args);
        Item setValue(Object value);
        Item addData(String caption, Object value);
        Item addData(String caption, String format, Object... args);
    }
    interface Line {
        Item addData(String caption, Object value);
        Item addData(String caption, String format, Object... args);
    }
    Item addData(String caption, String format, Object... args);
    Item addData(String caption, Object value);
    Line addLine();
    Line addLine(String lineCaption);
    boolean update();
    void clear();
    void clearAll();
    void setAutoClear(boolean autoClear);
    boolean isAutoClear();
    void setMsTransmissionInterval(int msTransmissionInterval);
    int getMsTransmissionInterval();
}
