# Agent test results

All commands run on this Windows laptop with the repo's Electron as Node:
`ELECTRON_RUN_AS_NODE=1 .cache/runtime-win32-x64-44.8.0/electron.exe …`

## Unit tests (`--test --test-concurrency=2 tests/*.test.cjs`)

| When | Result |
|---|---|
| Baseline (before changes) | 263/265. Fails: the planner time budget (already failing before this session) and the motor-ceiling test (run-folder collision bug). |
| After the Pedro export | 270/271. Only the time budget failed (6.2 s against 5 s). |
| Mid-session full run | 293/294. The one failure was a spin-limit test, fixed right after by raising the limit to 100 spins. |
| Full run (24 October, morning) | **324/324.** The 24-barrier time-budget test takes about 1.2 s. |
| After drag-to-pan, the field map and the two-view Paths panel | **325/325.** `tests/simulation-ui.cjs` passes too. |
| After mechanism hardware and Send to robot (24 October, afternoon) | **343/343** (one OnBot test updated for the check TeleOp beside the autonomous). New: `sim-mechanism-hardware` (7), `robot-link` (6). `tests/simulation-ui.cjs` passes all 16 sections. |
| After one-button setup, phase 2 (24 October, evening) | **350/350**. New: `sim-guided-check` (3), and 4 more `robot-link` tests (10 in all). The check TeleOp test in `sim-mechanism-hardware` was rewritten for the guided check. `tests/robot-setup-app.cjs` passes, and `tests/simulation-ui.cjs` passes all 16 sections. |
| After phase 3, where the odometry sits (24 October, night) | **357/357**. New: 6 in `sim-guided-check` (the settings, `deck-sim robot --odometry`, and the check on four mis-mounted robots), 1 in `sim-pedro-runtime`. The plain check in `sim-mechanism-hardware` now has the Pinpoint step. `tests/robot-setup-app.cjs` passes, and `tests/simulation-ui.cjs` passes all 16 sections. |

New test files:
- `sim-pedro`
- `sim-pedro-runtime`
- `sim-custom-curve`
- `sim-tangent`
- `sim-alliance`
- `sim-robot-log`
- `sim-preview`
- `sim-pp-headings`
- `sim-pp-import`
- `sim-hub-mounting`
- `sim-export-fuzz`
- `sim-action-names`

New tests were also added to `sim-planner`, `deck-sim`, `sim-pedro`, `sim-control-hub`, `sim-motionmodule` and `sim-robot-log`.

## Real-library compile check (`tools/simulation/check-ftc-sdk.cjs`, needs network)

Downloads FTC SDK RobotCore and Hardware 12.0.0 and Pedro Pathing core and revhub 3.0.2, verifies their SHA-1, compiles with `javac --release 8 -Xlint:all`, then deletes them.

The latest run passed with no warnings:
- Control Hub TeamCode: 11 cases.
- OnBot Java: 11 cases.
- Pedro export: 8 holonomic cases, a swerve robot, and 3 example setups. `DeckStarterConstants` was included for Pinpoint, OTOS, two pods and three pods.
- One case has the Control Hub mounted logo left, USB up.
- 40 compile steps in all, all without warnings (latest run, 24 October).
- Examples with mechanisms: TeamCode, OnBot and Pedro.
- Stand-ins: all 239 public members match the real SDK.

Run again after mechanism hardware (24 October, afternoon). It passed with no warnings:
- Every OnBot Java case now compiles with its check TeleOp.
- Four mechanism hardware cases compile as TeamCode, OnBot Java and Pedro:
  - continuous-servo rollers, a two-motor flywheel and PIDF;
  - set power, a servo pusher and a servo turret;
  - a kicker and a servo gate;
  - two shooters, one fixed.
- Stand-ins: 240 members match (`setVelocityPIDFCoefficients` added).

Run again after the guided check replaced the check TeleOp (24 October, evening). It passed with no warnings:
- every TeamCode, OnBot Java and Pedro case;
- the four mechanism hardware cases;
- every example and the swerve Pedro case.

The guided check now uses the IMU (`RevHubOrientationOnRobot`, `YawPitchRollAngles`) and `Locale`, and it compiles in all of them. Stand-ins: 240 members match.

Run again after phase 3, where the odometry sits (24 October, night). It passed with no warnings:
- every TeamCode, OnBot Java and Pedro case, the mechanism cases, every example and swerve;
- the Pinpoint export now calls `setOffsets`, `setEncoderResolution` and `setEncoderDirections`, the OTOS export `setOffset` and its scalars, and the check uses `getEncoderX`/`getEncoderY`.

Stand-ins: 246 members match. New: `getEncoderX`, `getEncoderY`, `getLinearScalar`, `getAngularScalar`, `MIN_SCALAR`, `MAX_SCALAR`.

## Mechanism hardware on the virtual Control Hub (`tests/sim-mechanism-hardware.test.cjs`)

BIOBUZZ red, route with Spin up, Shoot, Intake. The OnBot export of each variant gives the same shots, pickups and points as the simulator's own run (6 shots, 2 picked up, 20 points):
- continuous-servo side rollers with a reversed second roller, a two-motor flywheel (second reversed) with PIDF, a reversed feeder and turret;
- a set-power flywheel, a servo pusher and a servo turret;
- a kicker and a servo gate.

Changing `INTAKE_1B_REVERSED` to false in the code picks up nothing.

MotionModule (its runtime, Python 3.12): continuous-servo rollers, a second flywheel motor and a pusher pick up and shoot. With one roller's sign flipped it picks up nothing.

## Send to robot (`tests/robot-link.test.cjs`, simulated Control Hub)

- The configuration XML is parsed: hubs, ports, the kind of each device tag.
- The check against an export:
  - suggests Pedro-style drive names;
  - matches `Intake` for `intake`;
  - for a turret configured as a servo, names the setting to change;
  - suggests each robot device once;
  - catches duplicate names.
- Robocol read of the active configuration, plus a robot with none, and one held by another Driver Station.
- OnBot Java:
  - uploads the export and builds it;
  - backs up a file edited on the robot;
  - respects kept files;
  - reports compile errors with file and line;
  - stops paths that leave `/src`;
  - its form encoding survives the round trip.
- In the app (Playwright probe): Check robot found 5 of 10 names to fix, Use these names applied them, Upload and build put both files on the simulated hub with the robot's names, and it built.

## One-button setup, phase 2 (24 October, evening)

**The guided check on the virtual Control Hub** (`tests/sim-guided-check.test.cjs`). The virtual robot is wired as the "true" settings say, and the code is exported from settings that get it wrong. A scripted person answers from what each device really did:
- **Motor robot.** Two drive wheels, the second roller, one flywheel motor and the feeder were wrong, and the turret encoder was 5 ticks per degree against the setting's 4.6.
  - Every direction was found in 29 presses.
  - Ticks per degree measured 5.011.
  - Top speed was 1400 ticks/s, with REV's PIDF from it.
- **Servo robot.** A kicker, a servo pusher and a reversed servo turret.
  - Positions were found exactly (0.15/0.85, 0.25/0.65).
  - The turret center was 0.55, its range 272.7° (truth 270), and its direction reversed. This took 58 presses.
- **Both.** The autonomous from the corrected settings shoots, picks up and scores what the simulator planned.

**Configurations and the check over Robocol** (`tests/robot-link.test.cjs`, now 10 tests). Port planning, adding to a configuration without changing it, a scanned configuration equal to the Configure Robot fixture line for line, swaps and refusals, save, activate, read back, restart, refusing a name the robot has, and the guided check run from Deck (INIT, START, presses from the panel and Controller 1, results, STOP).

**In the app** (`tests/robot-setup-app.cjs`, simulated hub with OnBot Java), passed:
- four Pedro-style names taken from the robot;
- two missing devices added to "competition Deck" with a port swapped by hand, then built;
- the Guided check answered from the panel;
- "Use these settings and send…" stopped the check, saved its setting and sent again, and the code on the robot then had the front left wheel FORWARD;
- Drive opened with "BIOBUZZ red auto (Deck)" selected;
- a robot with no configuration got "Deck biobuzz-red-auto" with all ten devices;
- at Steam Deck size (1280×800) the port list fits the panel with full labels (the selects stack);
- Space stopped a running check.

## One-button setup, phase 3: where the odometry sits (24 October, night)

**The guided check's floor steps on the virtual Control Hub** (`tests/sim-guided-check.test.cjs`, 4 new tests). The virtual robot is mounted as the "true" settings say, and the check is exported from the plain settings. A scripted person pushes the robot 48 in forward and 24 in left, then lets it spin. The autonomous is then run on a route with a turn, from the check's settings and from the plain ones:

| Robot | The check found | Route end, check's settings | Plain settings |
|---|---|---|---|
| Pinpoint: swingarm pods, Y pod reversed, offsets -2.5 / 5 in | swingarm, Y reversed, -2.500, 5.000 | 0.37 in | 44.8 in |
| OTOS: 90°, at (3, -1) in, linear 1.02, angular 0.99 | 90.1°, (2.979, -0.988), 1.0124, 0.990 | 0.27 in | 80.6 in |
| Two pods: forward at 5 in left, sideways reversed at 5 in back | 5.000, reversed, -5.000 | 0.48 in | 52.7 in |
| Three pods: 6.5 in left, 5.5 in right and reversed | 6.500, -5.500, reversed | 0.49 in | 90.3 in |

The OTOS needed 1.02 / 1.005 = 1.0149 (the simulator's optical model reads 0.5% long on top); the test allows ±0.006.

Also new: the settings unit test (defaults dropped, out-of-range values refused, heading normalized), and `deck-sim robot --odometry` (sets, clears and refuses bad keys, ranges and values).

**Pedro's own localizers with the mounting** (`tests/sim-pedro-runtime.test.cjs`, 1 new test). Pedro's `PinpointLocalizer` (swingarm pods, reversed Y pod, offsets) and `OTOSLocalizer` (off centre, turned 90°, linear scalar 1.02) both end a route with a turn within 1.5 in and 5°. Three wrong mappings were tried in a scratch copy, and each missed:
- the OTOS offset passed unturned;
- the right position with the wrong heading;
- the Pinpoint's offsets swapped.

**Setup UI** (Playwright probe at 1280×800). The panel appears for Pinpoint, OTOS, two pods and three pods, and hides for drive encoders. Every field saves to `robot.odometry` and reads back; the right pod shows inches right of centre. An out-of-range offset (99) is refused with a message. At 420 px wide there is no horizontal overflow.

## Pedro Pathing 3.0.2's real Follower on the virtual Control Hub (`tests/sim-pedro-runtime.test.cjs`)

9/9 pass:
- Pinpoint: pause, turn, end within 1.5 in and 3°.
- OTOS.
- Stop mid-path zeroes the drive.
- A zero-power path stays stopped.
- The BIOBUZZ example with mechanisms parks.
- A custom curve with `.tangent()`.
- Two pods and three pods. These runs are paced in real time, because Pedro's pod localizers time velocity with `System.nanoTime`.
- A speed-limit leg boundary is driven straight through.
- Pinpoint and OTOS mounted off centre, turned and reversed, as the odometry settings say.

## Scenarios

- **A (new student, fresh install).** Setup → start at edge → click two destinations → set a heading → run → export.
  - Found and fixed NaN onion outlines.
  - Asking for a tangent heading next to the hive is correctly refused, with an explanation.
  - The export message now names the route issue.
- **B (complex route).** Custom curve, tangent, track, spin, reverse and actions.
  - `deck-sim pins` round-trips it exactly.
  - It runs to the end in the simulator follower (18.0 s), OnBot (17.0 s) and Pedro (16.2 s), ending within 0.31 in.
- **C (invalid input).**
  - NaN or off-field pins, a pin in a wall, a pin on the start, a target-less track, a bad start, no pins and bad zones all give clear errors.
  - A million spins hung the planner. Fixed by limiting it to 100 spins.
- **D (regression).**
  - Full unit suite.
  - E2E `tests/simulation-ui.cjs`: all 16 sections pass in one full run, with no page errors and no renderer crash. At baseline it stopped at its first check.

## lunala red auto (`deck-sim test`)

Re-run at the end of the session, after every generator change: 9.77 s, 9.83 s and 10.0 s, unchanged. All runs: 40 points, 12/12 shots, no contact.


Optimized route: 9.77 s with the follower, 9.83 s for OnBot on the virtual hub, 10.0 s for Pedro.
- Every run: 40 points, 12/12 shots, no contact, parked 0.06–0.42 in from the end point.
- With start nudges of ±0.75 in, it is faster than the original in every valid case.

## .pp files in the Pedro Visualizer's own code

The Visualizer's normalizer, path flattening and animation heading code (`segmentHeadingAt`, from its source at commit f953ee0) were run under Node against Deck's `.pp` output. The heading it shows was compared with the planner's heading at 41 points per segment.

| Case | Before the fix | After |
|---|---|---|
| Linear 90°, tangent, reverse, target, constant | at most 0.6° | at most 0.6° |
| Relative 270°, relative −180°, 2 spins | 180° (turned the wrong way) | 0.0° |
| Custom curve with a 120° turn | 8.75° | 0.12° |
| lunala, BIOBUZZ red, BIOBUZZ dual examples | | at most 0.1° |
| BIOBUZZ blue 15×15 | | 2.3° at the end of one tangent curve (the Visualizer uses a coarser tangent step) |

## .pp import

`tests/sim-pp-import.test.cjs` (6 tests):
- Exact round trip.
- Edited lines are converted instead.
- From lines alone, a route with a custom curve, tangent, long turn, tracking, spin and actions re-plans with the same end points and length.
- The Visualizer's default project (shifted to Deck's frame on BIOBUZZ, its goal shapes left out there).
- Sequence waits, groups, more than 3 control points, piecewise headings.
- Refusals.
- `deck-sim import-pp`.

On the example setups:
- lunala, BIOBUZZ red and BIOBUZZ dual all import exactly.
- Converted from their lines alone, they re-plan identical end points and lengths: 110.12, 142.52 and 128.32 in.
- In the app, importing a Visualizer-style file into the Control Hub fixture planned a 137 in route, and Ctrl+Z restored the previous one.

## Robot log comparison on a real file

`output/advantagescope/biobuzz-red-auto.wpilog` was already on disk (written by the app's own AdvantageScope export on 23 October).
- It reads as 225 poses from `/RealOutputs/Odometry/Robot`.
- Against the BIOBUZZ example route: mean deviation 0.68 in, worst 2.6 in, 0.41 in at the end.

## Checked in the app (Playwright probes)

- **Route preview:** scrub to 42% (path 3, 46 of 110 in), play, pause, run to the end.
- **Line widths:** 0.9 at fit, 0.46 when zoomed about 4×.
- **Delete:** removes the open path, and Ctrl+Z restores it.
- **Selected step under the mouse:** keeps its dark fill.
- **Shift-drag of a curve handle:** snaps to (32.5, 42).
- **Robot log comparison, end to end:** Run & review → Data → Open robot log…, with the real AdvantageScope file. It draws 225 logged poses in orange beside the plan, with the same mean, worst and end figures.
- **Control Hub mounting:** in the Control Hub fixture, choosing logo Left then USB Up greys out Left/Right for USB and saves the choice. The exported OnBot Java then contains `LogoFacingDirection.LEFT,RevHubOrientationOnRobot.UsbFacingDirection.UP`.
- **Narrow windows:** at 360 px and 390 px wide, no tab scrolls sideways.

## Action names

`tests/sim-action-names.test.cjs` covers: Shoot/shoot, 射击, Стрелять, 🎯, 射击 2, Lanzar épée, class, 3 point.
- Every name now has a slot and a dispatch case.
- The TeamCode export with these names compiles with the bundled javac against the SDK stand-ins.
- MotionModule's Python parses.
- Before the fix, the non-Latin names and the second "shoot" silently did nothing.

## Generator fuzzing

`tests/sim-export-fuzz.test.cjs` runs 80 seeded random routes through every generator (route Java, `.pp`, TeamCode, OnBot, Pedro, MotionModule), with measured tuning and with none. The routes mix headings, spins, tracking, curves, action paths, powers, pauses and turns.
- Before the fixes, exports with no tuning wrote `NaN.0` into `Constants.java` and `MOTOR_POWER`.
- Now nothing leaks: no NaN, Infinity or undefined.
- MotionModule Python with backslashes in names is parsed by Python 3.12 with warnings as errors.

## Planner fuzzing on the BIOBUZZ field

600 random routes with the real field structures: 1 to 5 pins, every heading modifier, curves, action paths, powers, pauses and turns.
- No JavaScript errors.
- Every failure was one of the planner's own explanations (for example "no room to turn while driving" or "the custom curve takes the robot into a wall").
- The 77 routes that planned all passed the planner's own analysis with no blocking issue.

## Planning time (`deck-sim` setups, planner only)

After the reduced visibility graph, the original planner and the new one were run side by side.
- The six example and fixture setups give identical routes: lunala 102 → 73 ms, BIOBUZZ blue 18 pins 181 → 145 ms.
- 450 random fields with up to 25 obstacles of every shape, three footprints and three clearances: 133 planned.
  - 130 routes are identical.
  - 3 are equal-length ties (one sharp, two spline routes 0.008–0.024 in shorter).
  - 317 failed identically in both (pins inside obstacles).
  - Total time 181 s → 72 s.
- The 24-barrier unit test case: 2.45 s → 0.72 s.
- Turn to fit, with a 26×12 in robot that must turn 90° to pass a gap: 11 random fields plan identical turning routes, 1.46× faster. A typical case takes about 0.3 s.

Before that change:

- 2 to 6 pins: 3–127 ms.
- 18-pin BIOBUZZ blue auto: about 190 ms.

## Not verified

- No physical robot test of any export. No robot hardware was available.
- Send to robot's configuration writing and the guided check have not run on a real Control Hub. Their formats come from the FTC SDK 12.0 classes, and they are tested against the simulated hub and, for the check TeleOp itself, the virtual Control Hub.
- Pedro starter constants are model estimates. A team must still run the Quickstart tuners.
- The Pedro Visualizer reading the new `.pp` files was checked by running its own loader and animation code under Node, not by opening the file in the hosted website.
