package com.qualcomm.hardware.sparkfun;

import com.qualcomm.robotcore.hardware.HardwareDevice;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset Pedro Pathing and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
// Pose and velocity come from the simulation through the virtual hub (deck.sim.hub.SimOtos).
public abstract class SparkFunOTOS implements HardwareDevice {
    public static class Pose2D {
        public double x, y, h;
        public Pose2D() {}
        public Pose2D(double x, double y, double h) { this.x = x; this.y = y; this.h = h; }
        public Pose2D(Pose2D pose) { this(pose.x, pose.y, pose.h); }
        public void set(Pose2D pose) { x = pose.x; y = pose.y; h = pose.h; }
    }
    public abstract DistanceUnit getLinearUnit();
    public abstract void setLinearUnit(DistanceUnit unit);
    public abstract AngleUnit getAngularUnit();
    public abstract void setAngularUnit(AngleUnit unit);
    public abstract boolean calibrateImu();
    public abstract void resetTracking();
    public abstract Pose2D getOffset();
    public abstract void setOffset(Pose2D pose);
    public abstract boolean setLinearScalar(double scalar);
    public abstract boolean setAngularScalar(double scalar);
    public abstract Pose2D getPosition();
    public abstract void setPosition(Pose2D pose);
    public abstract Pose2D getVelocity();
    @Override public Manufacturer getManufacturer() { return Manufacturer.SparkFun; }
}
