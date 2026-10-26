package com.qualcomm.robotcore.hardware;

import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.CurrentUnit;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public interface DcMotorEx extends DcMotor {
    void setMotorEnable();
    void setMotorDisable();
    boolean isMotorEnabled();
    void setVelocity(double angularRate);
    void setVelocity(double angularRate, AngleUnit unit);
    void setVelocityPIDFCoefficients(double p, double i, double d, double f);
    double getVelocity();
    double getVelocity(AngleUnit unit);
    double getCurrent(CurrentUnit unit);
    void setTargetPositionTolerance(int tolerance);
    int getTargetPositionTolerance();
}
