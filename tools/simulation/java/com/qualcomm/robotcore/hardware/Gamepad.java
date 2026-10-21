package com.qualcomm.robotcore.hardware;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset Pedro Pathing and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public class Gamepad {
    public float left_stick_x, left_stick_y, right_stick_x, right_stick_y, left_trigger, right_trigger;
    public boolean dpad_up, dpad_down, dpad_left, dpad_right, a, b, x, y, guide, start, back, left_bumper, right_bumper, left_stick_button, right_stick_button;
}
