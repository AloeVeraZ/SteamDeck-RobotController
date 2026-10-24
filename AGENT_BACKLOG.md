# Agent backlog (prioritized)

## Robot code correctness and safety
1. Run the Pedro export at runtime on the virtual Control Hub, with Pedro's real Follower driving the simulated robot. Today it is compiled but not executed.
2. Repair the Electron E2E suite `tests/simulation-ui.cjs`. It was broken by earlier Setup layout changes (hidden `#sim-appearance`, touch-keyboard default).
3. `.pp` export: write the current Pedro Visualizer schema (`kind: atomic`, `heading` object, `sequence`, `headingDeg`). Today a "face a target" heading loads in the official Visualizer as tangential.

## Path planning
4. Tangential and reverse-tangential headings (Pedro `.tangent()` / `.reverseTangent()`) for holonomic robots.
5. Zoom, pan and fit on the 2D field.
6. Exact X/Y entry for custom-curve handles, and an optional snap to a 1 in grid while dragging.
7. Duplicate a path, and a keyboard shortcut help overlay. Delete should remove the open path.
8. Robot footprint "onion" preview along the selected path.

## Reliability and performance
9. The planner time-budget test `24 barriers and many pins plan quickly` runs 5.4–6.2 s against a 5 s budget under concurrent load.

## Final task requested by the user
10. Optimize the **lunala red auto** setup (`examples/lunala-red-auto.json`). Keep its scoring intent, minimize simulated time, and verify in physics and with the exports.
