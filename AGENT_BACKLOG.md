# Agent backlog (prioritized)

## Done this session

- Pedro 3 export, compiled against the real libraries and run with Pedro's real Follower.
- Starter constants for Pinpoint, OTOS, two pods and three pods.
- `.pp` files in the current Pedro Visualizer schema.
- Mechanism code compile check.
- Custom curves, tangent headings and alliance switching.
- Zoom and pan, onion outlines and handle coordinate boxes.
- Duplicate path, the Keys line in Help, Delete removes the open path.
- Route preview scrubber, which marks the path card it is on.
- Shift-snap for curve handles.
- Control Hub mounting setting for the IMU.
- `.pp` turns shown correctly in the Pedro Visualizer.
- `deck-sim compare`.
- `.pp` import (Paths button and `deck-sim import-pp`).
- Robot-log comparison. Checked on the app's own AdvantageScope export.
- Planner made about 40% faster.
- Lunala optimized.
- Bugs fixed:
  - Start-pose typing.
  - Run-folder collision.
  - Spin hang.
  - NaN outlines.
  - Phone layout.
  - Generated `finally` blocks stop the drive before mechanisms.
  - Unicode escapes in generated comments.
  - NaN motor power in exports without tuning.
  - CSV robot logs from spreadsheets.
  - Backslashes in names breaking the MotionModule Python.

## One-button setup, phase 2 (see docs/MECHANISM_ACTIONS.md)

- Try Send to robot on a real Control Hub (only the simulated one has been used).
- Write a configuration for a robot that has none:
  - generate the XML from the setup and a port list;
  - get the hub layout from `CMD_SCAN`;
  - save it as a new name with `CMD_SAVE_CONFIGURATION`, never over an existing one.
- Ask "did the intake pull in?" during the check TeleOp and flip that direction in the setup.
- Read the check TeleOp's measurements (top speed and PIDF, servo positions) from telemetry back into the setup.
- Select the new autonomous on the Driver Station after a successful build.
- Piece sensors (stop intaking when full, shoot until empty), and an adjustable hood servo.

## Robot code correctness and safety

1. An optional Pedro export with Ivy commands. Checked on 24 October:
   - Maven Central has `com.pedropathing:ivy` 0.0.1 (February) and 1.0.0 (April), plus newer `ivy/core` and `ivy/pedro` artifacts (July), so the API is still moving.
   - The Pedro Quickstart does not depend on Ivy, and the current LinearOpMode export needs only the Quickstart.
   - Revisit when the Quickstart adopts Ivy.
2. Open a generated `.pp` in the hosted Pedro Visualizer website. Its loader and animation code already run against Deck's files under Node.

## Reliability and performance

4. A rare renderer crash ("Target crashed") was seen once during Optimize in the E2E. It has not happened in the two E2E runs since that went through Optimize. Watch for it.

## UI polish

5. A pass over the Setup wizard and the Run & review layout for beginners. The Setup screens, the Route and Diagnostics panels and the Export panel were reviewed at Steam Deck size; the export checkbox and two jargon notes were fixed.
