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

## One-button setup (see docs/MECHANISM_ACTIONS.md)

Phases 2 and 3 are done: configurations for missing devices, the guided check, Drive preselect, and where the odometry sits (with the check's floor steps). Next:

1. Try Send to robot and the guided check on a real Control Hub. Only the simulated one has been used. Watch:
   - how long the robot's web server takes to answer after the configuration restart;
   - the real telemetry line format (`caption : value`);
   - the odometry steps on a real floor: whether `getEncoderX`/`getEncoderY` give the pods' own counts with both directions set forward, how straight a push by hand is, and whether a 30% spin turns the robot cleanly on carpet tiles.
2. A Road Runner export could take the same odometry settings (`parYTicks`, `perpXTicks`, the OTOS and Pinpoint offsets).
3. Use an Expansion Hub that is plugged in but missing from the configuration when ports run out (a scanned hub can be added as a new `LynxModule` element).
4. Piece sensors (stop intaking when full, shoot until empty), and an adjustable hood servo.

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
