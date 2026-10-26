# Driver Station changes and validation

22 October 2026 · Windows local build · branch `testing`

The previous completed work was pushed to `origin/testing` through `c4468d6`. This work continues in the same shared checkout used by Claude. Existing setups were backed up and preserved. A separate **Codex 6** setup was imported for the desktop checks.

## Field editing

| Previous issue | Result |
| --- | --- |
| Starting pose, obstacles and pins behaved as separate editors | One shared field stays on the left; the three editors sit together on the right |
| An obstacle could not move from Starting pose; pins could not move from Obstacles | Existing obstacles, resize handles, pins and the robot can be dragged from any planning tab |
| Entering Obstacles immediately started drawing a shape | Select is the default; creation tools live in Obstacles, and pin creation lives in Route pins |
| An old red pin stayed red after edits | Edits immediately discard the old route/error and recalculate clearance and movement |
| Only the first bad pin was reported | Every obstructed pin is marked, with an issue count, explanations and edit links in Diagnostics |
| Yellow pins were ambiguous | The diagnostics legend identifies pauses/actions separately from clearance errors |
| Field focus produced a white rectangle and dragging selected labels | The outer focus rectangle is removed; field/display text cannot be selected. Text inputs remain editable |
| Settings obscured the field or required scrolling | Planning/review keep the field visible; short windows paginate settings. Pin, path power, rotation and notes have separate compact editor pages |
| Small turns near walls were rejected using a full rotation envelope | The planner first validates the actual interpolated rotation sweep; obstructed sweeps still fail |

Wall and physical field-element contacts appear as runtime cautions, separately from custom no-go violations. The live route indicator is available from every planning tab. The existing view cube, Home action and robot pointer-lock drag are preserved.

## Motor power and tuning

- Setup has **Default autonomous motor power**, from **0 to 1**. `0.8` means an 80% ceiling, not 0.8% and not a guaranteed speed.
- Each ordinary or action path can inherit that default or override it. The setting applies to the whole line/spline leading to that pin. Later paths restore their own value or the setup default.
- Power changes pass through the physical acceleration model. Paths with different limits are separated into follower legs, so the robot can settle at a power transition; this is not a user-defined continuous power-ramp editor.
- Limits apply to mixed motor output, including turning and corrections, in the native follower and generated Control Hub code. Timed and MotionModule exports carry the settings too.
- A zero-power path stays stopped. It does not silently substitute a positive minimum. Change the setting and restart to continue.
- Path correction is always on with automatically selected gains; the old 0–2 correction strength and unrestricted raw PID entries are dropped on load. Position feedback is square-root shaped and takes priority over path speed when the motors saturate. High sensor-error settings produce calibration/repair guidance and reduced position feedback; no hidden ground-truth position corrects a broken sensor.
- Angular braking calibration now accumulates wrapped heading changes correctly. Crossing ±180° previously could look like almost a full extra revolution, causing bad braking predictions and unstable turns.
- The timed scheduler accounts for motor power shared with heading correction and for diagonal wheel mixing. The MotionModule test fixture was recalibrated for the revised dynamics.

## Electrical specifications and physics

REV lists **10 A continuous per motor port** and **20 A absolute maximum**; these describe port capability. REV's 12 V Slim Battery uses a **shared 20 A fuse**. The fuse is not an equal current allocation to each motor, nor an instantaneous current regulator. Actual draw depends on the motor, load and speed. Sources: [Control Hub specifications](https://docs.revrobotics.com/duo-control/control-system-overview/control-hub-basics), [REV battery fuse documentation](https://docs.revrobotics.com/duo-control/troubleshooting-the-control-system/12v-battery-best-practices-and-troubleshooting).

The reference motor is the **goBILDA 5203-2402-0019 Yellow Jacket** at 12 V: **312 RPM**, **24.3 kg·cm stall torque**, **9.2 A stall current**, **0.25 A no-load current**. These values describe that motor, not every FTC motor. [Manufacturer datasheet](https://www.gobilda.com/content/spec_sheets/5203-2402-0019_spec_sheet.pdf).

FTC's signed motor command runs from **−1 to +1**. The editor exposes its magnitude, **0–1**; route direction and drivetrain mixing supply the sign. A power command is not a direct current setting. [FTC motor interface](https://ftctechnh.github.io/ftc_app/doc/javadoc/com/qualcomm/robotcore/hardware/DcMotorSimple.html).

The arbitrary current-per-motor slider has been removed. Its old stored value remains readable for setup compatibility and no longer multiplies torque. Wheel diameter is now editable and is also reflected in encoder-distance conversion.

The reference drive model uses:

```
geared stall torque = reference torque × 312 / wheel RPM
wheel force         = motor count × geared torque × efficiency / wheel radius
acceleration        = min(wheel force / mass, estimated tile traction)
free linear speed   = wheel circumference × RPM / 60 × drive efficiency
rotational inertia  = mass × (length² + width²) / 12
angular acceleration depends on available force, wheel lever arm and inertia
```

Available accelerating torque falls with wheel speed relative to the commanded voltage fraction. Mass affects acceleration, braking authority, rotational inertia and contact momentum. Higher wheel RPM represents re-gearing this reference motor: more free speed, less torque. Larger wheels also trade force for speed. Lightweight robots remain traction-limited instead of receiving unlimited acceleration.

Motor efficiency, tile traction and coast/braking behavior are model estimates. The model does **not** simulate battery voltage sag, fuse heating/trip curves, motor temperature, every motor family or actual sensor firmware. It is a planning aid, not a hardware certification.

## Validation

**210 tests passed, 0 failed, 0 skipped** using:

```
node --test --test-concurrency=2 tests/*.test.cjs
```

The suite covers planner geometry, swept turns, all-invalid-pin diagnosis, regular/action path power, zero-power behavior, Java/FTC execution, MotionModule execution, sensing, saved setups, controller behavior and previous regressions. The new physics boundary matrix covers **96 combinations**: masses 0.5/5/25/100 lb, wheel speeds 50/312/1000/6000 RPM, diameters 24/104/200 mm, and two/four drive motors. The BIOBUZZ example still completes its native and exported autonomous checks within 30 seconds.

The first fully concurrent test run had one performance-threshold failure while packaging consumed CPU. The isolated planner suite passed; the complete suite then passed with concurrency limited to two. No performance threshold was loosened.

Desktop checks on the installed app included:

- Importing Codex 6 without replacing the existing setup bank.
- Two simultaneous red pins caused by overlapping obstacles.
- Moving a triangle from Starting pose; its pin immediately cleared.
- Moving a box from Route pins; the route regenerated and remaining errors cleared.
- Moving a pin and grabbing the robot from Field obstacles.
- Editing path 1 power to 0.4, pressing Done, and seeing the 40% summary persist.
- Compact pin/path editors with their Done buttons visible.
- Completing Codex 6 through the actual native simulator at differing path powers, with no custom no-go contacts; final position approximately (30.1, 109.8) inches for a (30, 110) target.
- Desktop, maximized and compact-window layout checks. Short layouts use pages instead of a scrolling settings column.

This is a finite regression and boundary matrix, not every combination of continuous inputs. Physical-robot trials were not performed. IMU-only timed spin/curve driving can still accumulate substantial X/Y error: the complex MotionModule stress route finishes within 12 inches of its target, with heading/action checks intact. That test previously used a 6-inch bound under the old acceleration model; the changed bound is explicit. Accurate recovery from position error requires position sensing, and the UI now explains that limitation.

Evidence, source snapshots, stored-data backup and build logs are in `test-results/unified-planner-2026-10-22/` (ignored by Git). Earlier UI and view-cube reports remain available separately.
