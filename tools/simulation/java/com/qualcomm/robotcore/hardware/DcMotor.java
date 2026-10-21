package com.qualcomm.robotcore.hardware;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset Pedro Pathing and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public interface DcMotor extends DcMotorSimple {
    enum ZeroPowerBehavior { UNKNOWN, BRAKE, FLOAT }
    enum RunMode {
        RUN_WITHOUT_ENCODER, RUN_USING_ENCODER, RUN_TO_POSITION, STOP_AND_RESET_ENCODER;
        public boolean isPIDMode() { return this == RUN_USING_ENCODER || this == RUN_TO_POSITION; }
    }
    void setZeroPowerBehavior(ZeroPowerBehavior zeroPowerBehavior);
    ZeroPowerBehavior getZeroPowerBehavior();
    void setMode(RunMode mode);
    RunMode getMode();
    void setTargetPosition(int position);
    int getTargetPosition();
    boolean isBusy();
    int getCurrentPosition();
    int getPortNumber();
}
