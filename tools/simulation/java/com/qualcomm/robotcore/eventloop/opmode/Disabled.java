package com.qualcomm.robotcore.eventloop.opmode;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset Pedro Pathing and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
import java.lang.annotation.*;

@Documented
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
public @interface Disabled {
}
