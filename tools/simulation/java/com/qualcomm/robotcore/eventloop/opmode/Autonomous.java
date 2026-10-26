package com.qualcomm.robotcore.eventloop.opmode;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset the generated controller and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
import java.lang.annotation.*;

@Documented
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
public @interface Autonomous {
    String name() default "";
    String group() default "";
    String preselectTeleOp() default "";
}
