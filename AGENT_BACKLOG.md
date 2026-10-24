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

## Robot code correctness and safety

1. An optional Pedro export with Ivy commands, if `com.pedropathing:ivy` is published and stable.
2. Open a generated `.pp` in the hosted Pedro Visualizer website. Its loader and animation code already run against Deck's files under Node.

## Reliability and performance

3. The planner's turning search takes about 2.5 s on a 24-barrier stress field. Real setups plan in 3–210 ms, so this is low priority. Possible fixes: lazy hub-to-hub edges, or cached segment checks per heading.
4. A rare renderer crash ("Target crashed") was seen once during Optimize in the E2E. It has not happened in the two E2E runs since that went through Optimize. Watch for it.

## UI polish

5. A pass over the Setup wizard and the Run & review layout for beginners. The Setup screens, the Route and Diagnostics panels and the Export panel were reviewed at Steam Deck size; the export checkbox and two jargon notes were fixed.
