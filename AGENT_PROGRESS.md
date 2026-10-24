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
  - Long turns, spins and turns along curves are written so the Visualizer shows the turn the robot makes. Before, it turned them the wrong way.
  - This was checked by running the Visualizer's own code.
  - The file sets the Visualizer's robot size to Deck's collision footprint, so its robot outline matches.
  - BIOBUZZ `.pp` files were drawn 1.33 in away from the walls. Deck's frame includes the wall, but the Visualizer's 141.5 in field starts at the inner wall. Game-field files are now shifted (`deckOrigin` records it).
- **Generated OpModes stop the drive first** when they end: an error in a mechanism's stop code can no longer leave the wheels turning. This applies to OnBot, TeamCode and Pedro.
- **Names cannot break the Java.** A setup or action name containing a Java unicode escape for `*/` (a backslash, `u002a`, then `/`) used to end a generated comment early, because javac decodes unicode escapes before comments.
- **Control Hub mounting.** Setup → Robot controller has "Control Hub logo faces" and "Its USB ports face". OnBot, TeamCode and the Pedro starter constants for pods write them into `RevHubOrientationOnRobot`. Before, every export assumed logo up, USB forward, so a hub mounted any other way would have turned wrongly. Also `deck-sim robot --hub-logo/--hub-usb`.
- **No NaN in exports.**
  - Without a route default power or measured tuning, the Control Hub exports wrote `NaN.0` into `MOTOR_POWER` and `Constants.java`, which does not compile.
  - Power now falls back to 0.8, and missing tuning to the Deck controller's own defaults.
  - A random-route fuzz test guards every generator.
- **MotionModule names.** A setup or action name with a backslash (for example a Windows path) made `autonomous.py` and `robot_actions.py` invalid Python. This was checked with Python's own parser.
- **Action names in any language.**
  - An action named only in Chinese, Cyrillic, emoji and so on got no code slot.
  - Names differing only in case (Shoot, shoot) shared a slot, but only the first was dispatched.
  - In both cases the action silently did nothing. Every name now has a slot that runs, and existing Latin slot names are unchanged.
- **Pedro export for swerve robots.** The docs promised it but the app hid the button. Swerve robots now get the Pedro files without starter constants. The checklist no longer claims a Follower run that only covered mecanum. The real-SDK check compiles a swerve case.
- The example exports in `examples/` were regenerated. The BIOBUZZ ones were already out of date before this session.

### Path planning

- **Custom Bezier curves.**
  - Draggable handles and exact X/Y boxes.
  - The robot drives the curve as drawn. A blocked curve is reported as an issue, never re-routed.
- **Tangent and reverse-tangent headings.** Includes a turning-footprint check and works in every runtime.
- **Alliance switching** moves the route: a 180° turn about the field centre for BIOBUZZ, a mirror for empty fields.
- **Zoom and pan.** Markers shrink as you zoom so they stay grabbable.
  - Drag empty floor to move around a zoomed field (anywhere in Run & review). A press that does not move is still a click, so Click to add still adds a path.
  - Two fingers pinch to zoom on the Steam Deck touchscreen; one finger drags.
  - While zoomed, a small map of the whole field in the corner outlines the view. Click or drag it to jump elsewhere without zooming out. It fades 2 s after the last zoom or pan, and stays while the left button is held or the pointer is on it.
  - Path labels (such as "90°") shrink with zoom like the pins.
- **Simpler Paths panel.** Two views, Paths and Route options, instead of Paths / Route / Diagnostics / Help.
  - Clicking the route status line opens the route checks under it, in any planning step.
  - The editing help and keys open over the list from a **?** beside + Add path (Escape or Close shuts it).
- **Editing aids.**
  - Onion robot outlines along the open path.
  - Duplicate path.
  - Delete removes the open path.
  - **Route preview:** a scrubber and a Preview button move a robot outline along the whole planned route, with no physics. The path card it is on is marked.
  - Shift snaps a dragged curve handle to a 0.5 in grid.
  - Lines stay thin when zoomed in.
  - A Keys line in the **?** help.
  - The right-click editor matches the path card.
- **`deck-sim pin --tangent/--reverse/--curve`** from the terminal.
- **Import a path file (.pp).**
  - From the Pedro Visualizer or Deck, via a Paths button or `deck-sim import-pp`. One Ctrl+Z undoes it.
  - Deck's own unedited files come back exactly (embedded pins plus a fingerprint of the lines).
  - Visualizer files become pins, curves, headings, waits and actions, with approximations listed.
  - From their lines alone, the three examples re-plan identical routes.

### Run & review

- **Compare with a robot log.** WPILOG Pose2d or CSV, drawn beside the plan, with average and worst deviation and the stop error.
- **Run videos.** Record (under Run) asks 2D or 3D, then films the next run and asks where to save it when the run ends. Export → Run video replays the last run's autonomous, teleop or whole run in 2D or 3D at real speed and saves that. A run-video camera of its own (`DeckSim3D.create(host,{video:true})`, with an unshared field copy) renders each picture: 2D is an orthographic top-down view; 3D is a follow camera that swings towards the goal while shooting, with aim beams and a top-down inset. 1280×720 MP4 with the period/clock/points and a speed/pieces/shooter line drawn over it. No window capture any more (the display-media handler was removed). Checked in the app on lunala red auto: a live 3D and a replayed 2D 30 s autonomous both saved and decode at full length.
  - CSV files exported from spreadsheets work: byte-order mark, quoted cells, decimal commas, and `pose_x` or `Robot X (in)` column names.
  - The worst point is named by its path ("on path 6").
  - The same comparison runs from the terminal: `deck-sim compare <setup> <log>`.
  - Checked on the app's own AdvantageScope log.

### Bugs fixed

- Run-folder collision between engines (compile errors in tests and in background test drives).
- Typing the start heading overwrote the X/Y just typed.
- A huge spin count hung the planner.
- NaN onion outlines on simple routes.
- Undo closed the open path.
- At 390 px, the header menu overflowed and the Run button was crushed.
- The touch Done button covered the Next button.
- In narrow windows (700 px or less):
  - The Run tab squeezed the field to 109 px.
  - The Plan tab's toolbar covered the top of the field.
  - Both tabs now scroll as one page with a full-width field (312 px at 390 px wide).
  - Steam Deck sizes are unchanged.
- The selected sub-tab looked unselected.
- The README claimed Pedro ships in the app.
- "Plan a route first." was shown even when a route existed but had an issue.
- The selected planning or setup step became unreadable under the mouse (light text on a light hover background).
- The E2E suite expected a timed-driving Calibrate button that no longer exists. That is now worked out automatically.

### Performance

- About 40% faster planning: a cached bounding-box check before point-in-polygon tests.
- Then about 3.4× faster on a 24-barrier field (2.45 s to 0.72 s): the visibility graph only tests corner pairs whose line leaves both corners along a tangent (a reduced visibility graph).
  - Real setups plan identically and 20–35% faster.
  - On 133 random fields that planned, 130 routes are identical. The other 3 are ties between equal-length routes: one with the same length, two spline routes 0.008–0.024 in shorter.

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
