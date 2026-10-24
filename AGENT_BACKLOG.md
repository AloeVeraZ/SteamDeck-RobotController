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
2. Open a generated `.pp` in the hosted Pedro Visualizer website. Its loader and animation code already run against Deck's files under Node.

## Path planning UX

3. Snap the curve handles to a 0.5 in grid while Shift is held.
4. Show the route preview's position as a marker on the path list (which path is playing).

## Reliability and performance

5. The planner's turning search takes about 2.5 s on a 24-barrier stress field. Real setups plan in 3–210 ms, so this is low priority. Possible fixes: lazy hub-to-hub edges, or cached segment checks per heading.
6. A rare renderer crash ("Target crashed") was seen once during Optimize in the E2E. It has not happened in the two E2E runs since that went through Optimize. Watch for it.

## UI polish

7. A pass over the Setup wizard and the Run & review layout for beginners.
8. Narrow windows (700 px wide or less):
   - On the Plan tab the field toolbar floats over the top of the field and can cover pins near the top edge.
   - On the Run tab the timing card leaves the field only about 110 px tall at 390×844.
   - Steam Deck sizes are not affected.
