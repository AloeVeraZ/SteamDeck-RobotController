# Agent progress (overnight session, 24 October 2026)

Branch `testing`, local commits only. Nothing was pushed.

## Baseline found

- Electron desktop app (Deck Driver Station). The simulator lives in `ui/simulation.js` with `ui/sim-*.js` modules, and the physics and Java follower run in `src/sim-engine.cjs` plus `sim-runtime/`.
- Paths are planned by `ui/sim-planner.js`, which auto-routes around obstacles with a footprint clearance check. The app's own follower is `tools/simulation/java/deck/pathing/DeckFollower.java`.
- Exports: OnBot Java (single file), TeamCode folder, Deck route Java, `.pp`, timed JSON and MotionModule Python.
- Unit tests: 263 of 265 passed.
  - `24 barriers and many pins plan quickly` fails on a time budget under load. This was already failing before this session.
  - `native and exported FTC enforce each path motor ceiling…` was a real bug (see below).
- `tools/simulation/check-ftc-sdk.cjs` compiled 22 export cases against the real FTC SDK 12.0.0. All passed.

## Done

1. **Checkpoint commit** of the earlier uncommitted work (`3941555`).
2. **Bug fix: run-folder collision.** Every `SimEngine` numbered its temporary run folders from 1. A disposed engine's delayed cleanup, 2 s later, could delete the folder another engine was compiling in, which showed up as "error reading PlannedRoute.java". This affects the background test drive and Optimize. Run folders are now numbered per process (`src/sim-engine.cjs`).
3. **Pedro Pathing 3.0.2 export** (`ui/sim-pedro.js`, Export tab button, `deck-sim export --format pedro`).
   - Generates `<Class>Paths.java`, `<Class>Pedro.java` (`@Autonomous` LinearOpMode), `RouteActions.java`, `RobotActions.java` and, when mechanisms are set up, `Mechanisms.java`.
   - Uses the Quickstart's `pedro/Constants.create(hardwareMap)` and handles the `null` it returns before you fill it in.
   - Headings use constant, linear, `facingPoint`, or `Interpolator.geometric` where Pedro's short-way, distance-based `linear` would differ from the plan that was checked.
   - Per-path power becomes `maxPathSpeed.at(...)` on Foresight.
   - The OpMode runs its legs once, every loop checks `opModeIsActive()`, and `finally` stops the drive (`follower.stop()` + `drivetrain.stop()`) and the mechanisms.
4. **Real compile verification extended.** `check-ftc-sdk.cjs` now also downloads Pedro core and revhub 3.0.2 (SHA-1 verified) and compiles:
   - the Pedro export for every holonomic case;
   - every export of every `examples/*.json` setup.

   This is the first time the generated mechanism code has been compiled against the real SDK. All pass with no warnings.
5. **Robot-readiness checklist** in the Export tab, for both the Deck exports and the Pedro export. It separates what Deck verified from team setup, calibration and physical testing.
6. **Custom Bezier curves (Pedro-visualizer style).**
   - Set a path's Shape to "Custom curve" and drag its two handles. The handles start on the current shape.
   - The planner drives the curve exactly as drawn and reports a blocked curve as an issue instead of re-routing it.
   - A physics test confirms the simulated robot stays within 3 in of the drawn curve.
   - Undo now keeps the open path selected.

## Verified results

See AGENT_TEST_RESULTS.md.
