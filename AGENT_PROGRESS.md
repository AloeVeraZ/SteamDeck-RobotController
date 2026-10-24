# Agent progress (overnight session, 24 October 2026)

Branch `testing`, local commits only (see `git log 4c1c039..HEAD`). Nothing was pushed.

## Baseline found

- Electron desktop app (Deck Driver Station). The offline simulator lives in `ui/simulation.js` with `ui/sim-*.js`.
- Physics and the Java follower run in `src/sim-engine.cjs` and `sim-runtime/`.
- The planner (`ui/sim-planner.js`) auto-routes around obstacles with a footprint clearance check. The app's own follower is `DeckFollower.java`.
- Unit tests: 263/265.
  - The planner time-budget test failed, and was already failing before this session.
  - One failure was a real run-folder bug (fixed, see below).
- The E2E suite `tests/simulation-ui.cjs` was broken at its first check.

## What changed

### Robot code (release-blocking)

- **Pedro Pathing 3.0.2 export.** Paths, an `@Autonomous` OpMode, action slots and Mechanisms, for the Pedro Quickstart.
  - Headings use constant, linear, facingPoint, tangent/reverseTangent, or a geometric turn where Pedro's linear would differ from the checked plan.
  - Per-path power becomes Foresight `maxPathSpeed`.
  - The OpMode runs its legs once, checks `opModeIsActive()` in every loop, and stops in `finally`.
- **Compiled against the real libraries.** `tools/simulation/check-ftc-sdk.cjs` downloads FTC SDK 12.0.0 and Pedro core/revhub 3.0.2 (SHA-1 verified) and compiles every export. That includes the examples' mechanism code, which had never been compiled against the real SDK before.
- **Run with Pedro's real Follower.** `deck-sim test --code pedro` and `tests/sim-pedro-runtime.test.cjs` (8 tests) cover Pinpoint, OTOS, two pods, three pods, Stop, zero power, tangent, speed limits and the BIOBUZZ example with mechanisms.
- **`DeckStarterConstants.java`.** Pedro's Mecanum plus Pinpoint, OTOS, TwoWheel or ThreeWheelIMU, with Foresight filled from the simulated robot. Clearly labelled as estimates.
- **Readiness checklist** in the Export tab: verified items versus team setup, calibration and physical testing.
- **`.pp` files** now use the current Pedro Visualizer schema.
- **Generated OpModes stop the drive first** when they end: an error in a mechanism's stop code can no longer leave the wheels turning. This applies to OnBot, TeamCode and Pedro.
- **Names cannot break the Java.** A setup or action name containing a Java unicode escape for `*/` (a backslash, `u002a`, then `/`) used to end a generated comment early, because javac decodes unicode escapes before comments.
- The example exports in `examples/` were regenerated. The BIOBUZZ ones were already out of date before this session.

### Path planning

- **Custom Bezier curves.**
  - Draggable handles and exact X/Y boxes.
  - The robot drives the curve as drawn. A blocked curve is reported as an issue, never re-routed.
- **Tangent and reverse-tangent headings.** Includes a turning-footprint check and works in every runtime.
- **Alliance switching** moves the route: a 180° turn about the field centre for BIOBUZZ, a mirror for empty fields.
- **Zoom and pan.** Markers shrink as you zoom so they stay grabbable.
- **Editing aids.**
  - Onion robot outlines along the open path.
  - Duplicate path.
  - Delete removes the open path.
  - **Route preview:** a scrubber and a Preview button move a robot outline along the whole planned route, with no physics.
  - Lines stay thin when zoomed in.
  - A Keys line in Help.
  - The right-click editor matches the path card.
- **`deck-sim pin --tangent/--reverse/--curve`** from the terminal.

### Run & review

- **Compare with a robot log.** WPILOG Pose2d or CSV, drawn beside the plan, with average and worst deviation and the stop error.

### Bugs fixed

- Run-folder collision between engines (compile errors in tests and in background test drives).
- Typing the start heading overwrote the X/Y just typed.
- A huge spin count hung the planner.
- NaN onion outlines on simple routes.
- Undo closed the open path.
- At 390 px, the header menu overflowed and the Run button was crushed.
- The touch Done button covered the Next button.
- The selected sub-tab looked unselected.
- The README claimed Pedro ships in the app.
- "Plan a route first." was shown even when a route existed but had an issue.
- The selected planning or setup step became unreadable under the mouse (light text on a light hover background).
- The E2E suite expected a timed-driving Calibrate button that no longer exists. That is now worked out automatically.

### Performance

- About 40% faster planning: a cached bounding-box check before point-in-polygon tests.

### lunala red auto (the user's request)

- One custom curve replaces the back-off pin.
- Same 40 points.

| Runtime | Before | After |
|---|---|---|
| Simulator follower | 9.98 s | 9.77 s |
| OnBot Java | 10.22 s | 9.83 s |
| Pedro export | 10.25 s | 10.0 s |

- The exported code is in `examples/lunala-red-auto/`.

## Verified results

See AGENT_TEST_RESULTS.md.
