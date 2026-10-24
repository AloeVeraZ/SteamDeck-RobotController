# Agent test results

All commands run on this Windows laptop with the repo's Electron as Node:
`ELECTRON_RUN_AS_NODE=1 .cache/runtime-win32-x64-44.8.0/electron.exe …`

## Unit tests (`--test --test-concurrency=2 tests/*.test.cjs`)

| When | Result |
|---|---|
| Baseline (before changes) | 263/265. Fails: the planner time budget (already failing before this session) and the motor-ceiling test (run-folder collision bug). |
| After the Pedro export | 270/271. Only the time budget failed (6.2 s against 5 s). |
| Latest full run | 293/294. The one failure was a spin-limit test, fixed right after by raising the limit to 100 spins. The time-budget test now passes (about 3 s). |
| Since then | `sim-pedro` 8/8, `sim-pedro-runtime` 8/8, `sim-planner`/`deck-sim`/`sim-tangent`/`sim-custom-curve` 32/32. |

New test files:
- `sim-pedro`
- `sim-pedro-runtime`
- `sim-custom-curve`
- `sim-tangent`
- `sim-alliance`
- `sim-robot-log`

New tests were also added to `sim-planner` and `deck-sim`.

## Real-library compile check (`tools/simulation/check-ftc-sdk.cjs`, needs network)

Downloads FTC SDK RobotCore and Hardware 12.0.0 and Pedro Pathing core and revhub 3.0.2, verifies their SHA-1, compiles with `javac --release 8 -Xlint:all`, then deletes them.

The latest run passed with no warnings:
- Control Hub TeamCode: 11 cases.
- OnBot Java: 11 cases.
- Pedro export: 8 holonomic cases plus 3 example setups. `DeckStarterConstants` was included for Pinpoint, OTOS, two pods and three pods.
- Examples with mechanisms: TeamCode, OnBot and Pedro.
- Stand-ins: all 239 public members match the real SDK.

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
  - E2E `tests/simulation-ui.cjs`: every section passes. At baseline it stopped at its first check.
    - A full run passed 14 sections up to the Control Hub/Pedro export section.
    - After the MotionModule step was updated, the remaining three sections (Control Hub, MotionModule, cleanup) passed in a trimmed run of just those sections.

## lunala red auto (`deck-sim test`)

Optimized route: 9.77 s with the follower, 9.83 s for OnBot on the virtual hub, 10.0 s for Pedro.
- Every run: 40 points, 12/12 shots, no contact, parked 0.06–0.42 in from the end point.
- With start nudges of ±0.75 in, it is faster than the original in every valid case.

## Robot log comparison on a real file

`output/advantagescope/biobuzz-red-auto.wpilog` was already on disk (written by the app's own AdvantageScope export on 23 October).
- It reads as 225 poses from `/RealOutputs/Odometry/Robot`.
- Against the BIOBUZZ example route: mean deviation 0.68 in, worst 2.6 in, 0.41 in at the end.

## Checked in the app (Playwright probes)

- **Route preview:** scrub to 42% (path 3, 46 of 110 in), play, pause, run to the end.
- **Line widths:** 0.9 at fit, 0.46 when zoomed about 4×.
- **Delete:** removes the open path, and Ctrl+Z restores it.
- **Selected step under the mouse:** keeps its dark fill.

## Not verified

- No physical robot test of any export. No robot hardware was available.
- Pedro starter constants are model estimates. A team must still run the Quickstart tuners.
- The Pedro Visualizer reading the new `.pp` files was checked against its loader's source code, not by opening the file in the website.
