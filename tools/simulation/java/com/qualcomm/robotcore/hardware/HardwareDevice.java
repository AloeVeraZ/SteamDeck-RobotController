package com.qualcomm.robotcore.hardware;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public interface HardwareDevice {
    enum Manufacturer { Unknown, Other, Lego, HiTechnic, ModernRobotics, Adafruit, Matrix, Lynx, AMS, STMicroelectronics, Broadcom, DFRobot, SparkFun, GoBilda }
    default Manufacturer getManufacturer() { return Manufacturer.Other; }
    default String getDeviceName() { return getClass().getSimpleName(); }
    default String getConnectionInfo() { return "virtual"; }
    default int getVersion() { return 1; }
    default void resetDeviceConfigurationForOpMode() {}
    default void close() {}
}
