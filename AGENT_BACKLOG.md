# Agent backlog (prioritized)

## Done this session

- Pedro 3 export, compiled against the real libraries and run with Pedro's real Follower.
- Starter constants for Pinpoint, OTOS, two pods and three pods.
- `.pp` files in the current Pedro Visualizer schema.
- Mechanism code compile check.
- Custom curves, tangent headings and alliance switching.
- Zoom and pan, onion outlines and handle coordinate boxes.
- Duplicate path, the Keys line in Help, Delete removes the open path.
- Route preview scrubber.
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

## Robot code correctness and safety

1. An optional Pedro export with Ivy commands, if `com.pedropathing:ivy` is published and stable.
2. Open a generated `.pp` in the hosted Pedro Visualizer to confirm it loads. This was only checked against its loader source.

## Path planning UX

3. Snap the curve handles to a 0.5 in grid while Shift is held.
4. Show the route preview's position as a marker on the path list (which path is playing).

## Reliability and performance

5. The planner's turning search still takes about 2.5 s for 24 barriers. Possible fixes: lazy hub-to-hub edges, or cached segment checks per heading.
6. A rare renderer crash ("Target crashed") was seen once during Optimize in the E2E. It did not reproduce. Watch for it.

## UI polish

7. A pass over the Setup wizard and the Run & review layout for beginners.
