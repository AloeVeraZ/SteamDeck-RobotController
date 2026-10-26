package com.qualcomm.hardware.gobilda;

import com.qualcomm.robotcore.hardware.HardwareDevice;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;
import org.firstinspires.ftc.robotcore.external.navigation.Pose2D;
import org.firstinspires.ftc.robotcore.external.navigation.UnnormalizedAngleUnit;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
// Pose and velocity come from the simulation through the virtual hub (deck.sim.hub.SimPinpoint).
public abstract class GoBildaPinpointDriver implements HardwareDevice {
    public enum EncoderDirection { FORWARD, REVERSED }
    public enum GoBildaOdometryPods { goBILDA_SWINGARM_POD, goBILDA_4_BAR_POD }
    public enum DeviceStatus { NOT_READY, READY, CALIBRATING, FAULT_X_POD_NOT_DETECTED, FAULT_Y_POD_NOT_DETECTED, FAULT_NO_PODS_DETECTED, FAULT_IMU_RUNAWAY, FAULT_BAD_READ }
    public enum ReadData { ONLY_UPDATE_HEADING }
    protected GoBildaPinpointDriver() {}
    public abstract void update();
    public void update(ReadData data) { update(); }
    public abstract void setOffsets(double xOffset, double yOffset, DistanceUnit distanceUnit);
    public abstract void setEncoderResolution(GoBildaOdometryPods pods);
    public abstract void setEncoderResolution(double ticksPerUnit, DistanceUnit distanceUnit);
    public abstract void setEncoderDirections(EncoderDirection xEncoder, EncoderDirection yEncoder);
    public abstract void resetPosAndIMU();
    public abstract void recalibrateIMU();
    public abstract void setPosition(Pose2D pos);
    public abstract int getEncoderX();
    public abstract int getEncoderY();
    public abstract double getPosX(DistanceUnit distanceUnit);
    public abstract double getPosY(DistanceUnit distanceUnit);
    public abstract double getHeading(AngleUnit angleUnit);
    public abstract double getVelX(DistanceUnit distanceUnit);
    public abstract double getVelY(DistanceUnit distanceUnit);
    public abstract double getHeadingVelocity(UnnormalizedAngleUnit unnormalizedAngleUnit);
    public Pose2D getPosition() { return new Pose2D(DistanceUnit.INCH, getPosX(DistanceUnit.INCH), getPosY(DistanceUnit.INCH), AngleUnit.RADIANS, getHeading(AngleUnit.RADIANS)); }
    public DeviceStatus getDeviceStatus() { return DeviceStatus.READY; }
    @Override public Manufacturer getManufacturer() { return Manufacturer.GoBilda; }
}
