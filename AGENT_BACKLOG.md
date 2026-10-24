# Agent backlog (prioritized)

## Done this session

- Pedro 3 export, now compiled and run with Pedro's real Follower.
- Mechanism code compile check.
- Custom curves, tangent headings and alliance switching.
- Zoom and pan, onion outlines and handle coordinate boxes.
- Robot-log comparison.
- Planner made about 40% faster.
- Lunala optimized.
- Start-pose typing bug and run-folder collision bug fixed.

## Robot code correctness and safety

1. Finish repairing the Electron E2E suite `tests/simulation-ui.cjs`. 9+ of its sections pass. The remaining steps were written for older editors and layouts.
2. `.pp` export: write the current Pedro Visualizer schema (`kind: atomic`, `heading` object, `sequence`, `headingDeg`). Today, target tracking loads in the official Visualizer as tangential.
3. Pedro starter constants for two- and three-pod odometry (TwoWheel/ThreeWheel configs need the `Encoder` and `CustomIMU` stand-ins checked).
4. An optional Pedro export with Ivy commands, if `com.pedropathing:ivy` is published and stable.

## Path planning UX

5. Duplicate a path. A keyboard shortcut help overlay. Delete should remove the open path.
6. Snap the curve handles to a 0.5 in grid while Shift is held.
7. A geometric preview (scrub along the planned path without physics) for an instant look before running.

## Reliability and performance

8. The planner's turning search still takes about 2.5 s for 24 barriers. Possible fixes: lazy hub-to-hub edges, or cached segment checks per heading.
9. A rare renderer crash ("Target crashed") was seen once during Optimize in the E2E. It did not reproduce. Watch for it.

## UI polish

10. Path strokes thicken when zoomed (they are in SVG units). Consider `vector-effect` with tuned widths.
11. A pass over the Setup wizard and the Run & review layout for beginners.
