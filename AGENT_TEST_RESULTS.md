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

## Pedro Pathing 3.0.2's real Follower on the virtual Control Hub (`tests/sim-pedro-runtime.test.cjs`)

8/8 pass:
- Pinpoint: pause, turn, end within 1.5 in and 3°.
- OTOS.
- Stop mid-path zeroes the drive.
- A zero-power path stays stopped.
- The BIOBUZZ example with mechanisms parks.
- A custom curve with `.tangent()`.
- Two pods and three pods. These runs are paced in real time, because Pedro's pod localizers time velocity with `System.nanoTime`.
- A speed-limit leg boundary is driven straight through.

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
- Pedro starter constants are model estimates. A team must still run the Quickstart tuners.
- The Pedro Visualizer reading the new `.pp` files was checked by running its own loader and animation code under Node, not by opening the file in the hosted website.
