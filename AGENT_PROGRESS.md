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

7. **The Pedro export now runs with Pedro's real Follower.**
   - `tools/simulation/fetch-pedro.cjs` caches Pedro core and revhub 3.0.2 from Maven Central, SHA-1 verified.
   - The engine accepts those jars, and only those, on the virtual Control Hub's classpath.
   - `DeckSimPedro.starterConstants` builds a real Pedro `Follower` from Pedro's own `Mecanum` drivetrain, its `PinpointLocalizer` or `OTOSLocalizer`, and `Foresight`. Foresight is configured from the simulated robot's measured values, the same ones Pedro's Foresight tuner produces.
   - The Pedro export writes this as `pedro/DeckStarterConstants.java`, clearly marked as estimates.
   - `deck-sim test --code pedro` and `tests/sim-pedro-runtime.test.cjs` run the export end to end. The four runtime tests pass: pause and turn, OTOS, Stop mid-path, zero-power path, and the BIOBUZZ example with mechanisms.
   - lunala red auto takes 10.25 s under Pedro, against 9.98 s with the Deck follower and 10.22 s for the OnBot export. All three score 40 points.
8. **E2E suite repair (in progress)** (`tests/simulation-ui.cjs`).
   - Updated it for intentional UI changes:
     - the keyboard toggle moved to the menu;
     - the robot model and localization selects are now hidden model fields;
     - intake reach moved to Mechanisms;
     - BIOBUZZ is now the default field;
     - obstacles can be dragged from any tab;
     - Route, Export and pager sub-views;
     - new status wording.
   - **Real bug found and fixed:** typing the start heading overwrote the X and Y the user had just typed, and the submit treated typed X/Y as a heading-only turn. Typed coordinates now win.

9. **Tangent headings**: "Face along the path" and "Face backwards along the path" (Pedro's `.tangent()` and `.reverseTangent()`).
   - Supported across the planner (with a turning-footprint check), the simulator's follower, and the Deck/OnBot, Pedro and `.pp` exports.
   - Available in the UI and from `deck-sim pin --tangent|--reverse`.
10. **Alliance switching moves the route.** BIOBUZZ is point-symmetric, so the start, pins, handles, targets and obstacles are turned 180° about the field centre. Empty fields are mirrored instead.
    - Works in the app and in `deck-sim alliance` (`--keep` leaves the route where it is).
    - Physics check: blue lunala gives an identical result.
11. **`deck-sim pin --curve x1,y1,x2,y2`** sets custom curves from the terminal.
12. **Robot log comparison** (`ui/sim-robot-log.js`, tested).
    - Reads WPILOG Pose2d (FTC frame, the same as Deck's own logs) or CSV.
    - Reports average and worst deviation from the plan, plus the stop error.
    - UI wiring is pending.

## Verified results

See AGENT_TEST_RESULTS.md.
