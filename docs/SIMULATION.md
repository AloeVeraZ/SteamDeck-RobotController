# Simulation view

Open **⋮ → Simulation** for offline route planning and driving practice. Entering simulation disconnects live robot controls. Simulation never uploads code or drives a real robot.

The workflow is **Setup → Path planning → Run & review**. Each saved setup owns its robot settings, sensing, fields, obstacles, route pins, model references and practice timing.

## Setup

FTC Control Hub defaults to drive encoders + IMU. Alternatives are two or three tracking pods + IMU, goBILDA Pinpoint, SparkFun OTOS and IMU only. MotionModule supports IMU only, pods and OTOS. Without X/Y sensing, translation uses timed power with IMU heading correction; it cannot recover a position error.

Set chassis dimensions, intake reach, mass, motor RPM and wheel diameter. The mass slider spans 0.5–100 lb; positive typed values may exceed convenience slider ranges. Collision planning uses the typed footprint, independently of visual CAD. A reference Yellow Jacket motor model derives geared torque and mass/traction-limited acceleration. Legacy current entries remain for compatibility and are no longer an editable torque multiplier. Electrical references and formulas are recorded in `UNIFIED_PLANNING_CHANGES.md`.

Default autonomous motor power is a ceiling from 0 to 1. Paths inherit it unless overridden; zero stays stopped. Direction comes from route geometry. Sensor noise, scale error and gyro drift are seeded error models. Correction response scales automatically selected gains within a bounded range. Drivetrain families include mecanum, swerve, tank/differential/tracks and omni approximations, identified in the UI.

Empty fields have editable dimensions; DECODE and BIOBUZZ use bundled physics layouts. Loose pieces can move and be pushed. Complete game rules, scoring and shooter/intake physics are not implemented. STEP assemblies merge into one visual body; GLB/STL/OBJ are also supported. Imported geometry is visual only and scales to the typed dimensions. View cubes support face/edge/corner views, pointer-locked drag orbit and Home. Setup JSON files transfer one setup; opening adds it to the saved setups. Virtual keyboard behavior is controlled in the three-dot menu.

## Shared field editing

One field remains visible beside Starting pose, Field obstacles and Route pins. Drag existing obstacles, pins or the robot from any submenu. Adding obstacles requires Field obstacles; adding pins requires Route pins. Select is the default obstacle tool. Axis and number labels cannot become text selections while dragging.

Mouse robot dragging locks the pointer and constrains the footprint against barriers, with sliding and no hidden pointer travel buildup. Touch follows the finger. Start at edge finds a clear boundary pose. Box, circle, triangle and custom-shape tools create physical barriers. Custom outlines are normalized; disconnected pieces remain separate.

Double-click an obstacle to edit its dimensions/angle/corners. Double-click a pin for pause, action, heading and note. Click a path for its power, shape, action while driving, heading and note. Hover a path for its modifiers and endpoint headings; color/styling identifies modifiers.

Each popup edits an isolated draft. Clicking outside or pressing Escape leaves it open. **Done** validates and saves that object; another editor cannot open until Done. Drag the header/grip to reposition it. Pick target on field keeps the popup visible while accepting the next field click. Escape cancels target picking.

Live diagnostics check every pin and path after pose, obstacle, footprint and route changes. They distinguish clearance failures, heading sweeps, target singularities, sensor warnings and timing cautions. Obstacles affect physics and route geometry.

## Shapes, headings and power

The global route shape is Smooth curves or Straight lines. Each path may inherit or override it. Old rounded-corner files still load; that redundant UI choice migrates to straight. Unsafe splines tighten or fall back to safe straight/detour geometry.

Optimize test-drives mixed straight/spline assignments through physics, keeping the fastest tested route that touches no zone and finishes within 1.5 inches of the final pin. Up to four unlocked paths are searched exhaustively; longer routes use bounded patterns and individual flips around the winner. Explicit path choices stay fixed. Optimizer-owned choices may be reconsidered. This is a measured candidate search, not proof of a global minimum.

Per-path motor power overrides the setup default. Heading modifiers include inherited heading, relative rotation, absolute heading, spin and tracking a field point. Relative turns accumulate: after +90°, an unmodified path keeps that orientation; -90° returns it. Target bearing uses the exact curve position, and its final heading carries into the next unmodified path. Pins can turn before the next path. Tank routes stop and turn between straight legs; all turns and pauses consume autonomous time.

## Run and review

Planned route uses the application-owned Deck controller, or timed power + IMU without X/Y sensing. OnBot Java export runs the exact single-file FTC program on a virtual Control Hub. Java program runs a custom local `deck.sim.DeckAutonomous`; this simulator interface is not an FTC OpMode.

Program explains each mode and lists saved route steps. Output shows run lifecycle messages, telemetry, println output and compiler/runtime errors. **Escape** stops autonomous or the active practice timer, like Stop. Reset restores the starting pose. Practice supports autonomous, teleop and full-match phases; controller input is gated to teleop and stops on stale input. All phase clocks use simulation time.

## FTC OnBot Java export

For supported FTC mecanum and tank/differential/tracked robots with positional sensing, **OnBot Java (.java)** exports one public LinearOpMode containing the complete Deck controller, route geometry/headings, motor powers, turns/waits, hardware/localization adapter and mechanism action slots. Imports are only FTC SDK and Java standard library. No external pathing library, deck.sim package, companion source file or Android Studio project is needed.

Upload the file through Control Hub OnBot Java, Build Everything, then select the autonomous on the Driver Station and INIT/START. See the [official FIRST tutorial](https://ftc-docs.firstinspires.org/en/latest/programming_resources/onbot_java/OnBot-Java-Tutorial.html). Match hardware names, motor directions, IMU mounting, wheel travel and sensor offsets to the actual robot. Generated gains are starting values requiring real calibration. Fill RobotActions with actual intake/launcher/servo code; labels cannot identify or operate a team's mechanisms. The virtual hub completes placeholder actions immediately; configured pauses supply their simulated duration.

Control Hub TeamCode exports the same implementation as separate package files and preserves existing RobotActions.java. Route Java exports geometry for the bundled Deck API and is not a standalone FTC program. Deck path JSON carries geometry/modifiers for other consumers. MotionModule has its own timed Python exporter and virtual runtime check. Unsupported hardware adapters and IMU-only FTC setups do not claim a complete positional FTC export.

## Controller, physics and development

Coordinates are inches from bottom-left, +X right, +Y up, headings counterclockwise from +X. The Deck controller samples exact Bezier geometry by arc length, ramps reference speed, applies velocity feedforward, position feedback and heading PD, and caps combined wheel commands to motor power. It consumes sensor estimates, never truth. Native timing uses an injected simulation clock; FTC uses ElapsedTime.

DSIM advances at 60 Hz with reference-motor dynamics, traction, contact and braking. DECODE/custom fields are planar; BIOBUZZ uses Rapier 3D. Truth and sensor estimates are displayed separately. Poor calibration or sensor errors may still cause an execution miss. Bounded stall recovery can back out along recent motion; it does not plan around unknown real obstacles.

The virtual Control Hub compiles the exported OpMode, Deck controller and adapter against project-authored SDK stand-ins, running in lockstep with physics. The actual FTC SDK is not bundled. Motor directions, encoder signs, braking, pods, Pinpoint, OTOS and IMU readings feed the generated adapter.

Build with `node tools/simulation/build.cjs`; fetch pinned dependencies with `tools/simulation/fetch.cjs`. DSIM is the upstream simulator source dependency. The own controller is `tools/simulation/java/deck/pathing/DeckFollower.java`; its exact source is embedded in `ui/sim-follower-source.js` for exports. Generated runtime files are under `sim-runtime/driver/`, `occt/` and `java/`; the Java bridge is `deck.sim.RunBridge`. The renderer uses a planning worker and a separate simulation utility process. Stop invalidates pending replies and stops Java. CAD import runs off the UI thread.

Run `node --test --test-concurrency=2 tests/*.test.cjs`. `node tools/simulation/check-ftc-sdk.cjs` temporarily downloads checksum-verified FTC SDK 12.0 RobotCore/Hardware references, compiles both export formats as Java 8 for sensor/turn/action/tank cases, checks stand-in member signatures and deletes the references. These checks do not establish physical robot calibration or performance.

Public packages omit field/chassis CAD whose terms forbid redistribution. Personal local builds may preserve existing assets. DSIM is PolyForm Noncommercial. Historical drivetrain-adapter BSD attribution and all dependency notices remain in `THIRD-PARTY-NOTICES.md` and bundled licenses.
