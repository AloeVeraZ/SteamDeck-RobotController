# Agent test results

All commands were run on this Windows laptop with the repo's Electron as Node:
`ELECTRON_RUN_AS_NODE=1 .cache/runtime-win32-x64-44.8.0/electron.exe …`

## Unit tests (`--test --test-concurrency=2 tests/*.test.cjs`)

| When | Result |
|---|---|
| Baseline (before changes) | 263/265 pass. Fails: planner time budget (already failing before this session); motor-ceiling test (run-folder collision bug). |
| After run-folder fix and Pedro export | 270/271 pass. Only the planner time budget fails (6.2 s against 5 s, under load). |
| After custom curves, planner/export subset (5 files, 38 tests) | 38/38 pass. The time-budget test passed when run with fewer files. |

## Real-library compile check (`tools/simulation/check-ftc-sdk.cjs`, needs network)

Downloads FTC SDK RobotCore and Hardware 12.0.0 and Pedro Pathing core and revhub 3.0.2 from Maven Central, verifies their SHA-1, compiles with `javac --release 8 -Xlint:all`, then deletes them.

The run on 24 October 2026 passed:
- Control Hub TeamCode export: 10 cases, 7 files each, no warnings.
- OnBot Java single file: 10 cases.
- Pedro Pathing 3.0.2 export: 7 holonomic cases plus 3 example setups, no warnings. Each compiles beside the Quickstart's own `pedro/Constants.java`.
- Example setups (biobuzz-dual-red, biobuzz-red-auto, lunala-red-auto): TeamCode (8 files, with Mechanisms.java), OnBot and Pedro all compile.
- Stand-ins: all 239 public members match the real SDK.

## Electron app probes (Playwright against the real app, temporary data folder)

- lunala-red-auto opens, plans and reports "Route checks passed · about 10.0 s in simulation".
- Run & review → Export shows the "Pedro Pathing 3…" button and the readiness checklist, with no page errors.
- Custom curve on path 4:
  - Handles and guides are drawn, and dragging updates the plan.
  - Undo restores the handles and keeps them draggable.
  - A handle dragged into the hive gives "1 route issue · Path 4" and a dashed red curve.
  - A gentle curve ran in physics: "Finished in 10.33 s. Ended 0.11 in from the last path’s end point. No zones touched."

## Pedro runtime (`tests/sim-pedro-runtime.test.cjs`, needs `tools/simulation/fetch-pedro.cjs`)

4/4 pass. Pedro Pathing 3.0.2's real Follower (`Mecanum`, `PinpointLocalizer`/`OTOSLocalizer`, `Foresight`) runs the exported OpMode on the virtual Control Hub:
- A pause and a turning path, ending within 1.5 in and 3°.
- OTOS localization.
- Stop mid-path zeroes the drive.
- A zero-power path stays stopped.
- The BIOBUZZ example with mechanisms parks within 2 in.

`deck-sim test examples/lunala-red-auto.json --code pedro` finished in 10.25 s with 40 points.

## Tangent headings, alliance switching, custom curves

- `tests/sim-tangent.test.cjs` 5/5 pass. In physics, the robot's heading stays within 12° of the tangent along a curve.
- `tests/sim-alliance.test.cjs` 3/3 pass. The blue copy of the BIOBUZZ example tips the hive as often as red.
- `tests/sim-custom-curve.test.cjs` 5/5 pass. The robot stays within 3 in of a drawn curve.
- The real-SDK check also compiles a tangent + custom-curve route in all three exports.
- An OnBot export with tangent and reverse paths runs on the virtual hub and ends at (110, 100.15), facing −90° as expected.
- `deck-sim alliance` on a copy of lunala, then `deck-sim test`: 9.98 s, 40 points, the same as red.

## Not verified

- The Pedro export has not been run against Pedro's real Follower. It is compiled only.
- No physical robot test of any export. No robot hardware was available.
- `tests/simulation-ui.cjs` (E2E) is still broken, as it was before this session.
