package com.qualcomm.hardware.rev;

import com.qualcomm.robotcore.hardware.ImuOrientationOnRobot;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset Pedro Pathing and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public class RevHubOrientationOnRobot implements ImuOrientationOnRobot {
    public enum LogoFacingDirection { UP, DOWN, FORWARD, BACKWARD, LEFT, RIGHT }
    public enum UsbFacingDirection { UP, DOWN, FORWARD, BACKWARD, LEFT, RIGHT }
    public final LogoFacingDirection logoFacingDirection;
    public final UsbFacingDirection usbFacingDirection;
    public RevHubOrientationOnRobot(LogoFacingDirection logoFacingDirection, UsbFacingDirection usbFacingDirection) {
        if (logoFacingDirection.ordinal() / 2 == usbFacingDirection.ordinal() / 2) throw new IllegalArgumentException("The logo and USB port cannot face along the same axis.");
        this.logoFacingDirection = logoFacingDirection;
        this.usbFacingDirection = usbFacingDirection;
    }
}
