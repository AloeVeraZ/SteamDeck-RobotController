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
- **Run with Pedro's real Follower.** `deck-sim test --code pedro` and `tests/sim-pedro-runtime.test.cjs` (9 tests) cover Pinpoint, OTOS (also mounted off centre and turned), two pods, three pods, Stop, zero power, tangent, speed limits and the BIOBUZZ example with mechanisms.
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

### Mechanism hardware and Send to robot (24 October, afternoon)

The user asked how Intake, Spin up and Shoot reach real motors and servos, whether that works for different mechanisms, and for one-button setup on a Control Hub. The report is `docs/MECHANISM_ACTIONS.md`.

- **Hardware settings** (Setup → Mechanisms → Robot hardware, `deck-sim mech` flags):
  - rollers on a motor or a continuous servo, with an optional second roller;
  - one or two flywheel motors, with velocity control (tolerance, optional PIDF) or a set power with no encoder;
  - feeders: motor, continuous servo, servo pusher or servo gate;
  - turrets on a motor or a servo;
  - "turns the other way" for every device.

  Stored only when not the default, so old saves load unchanged.
- **Drive and sensor names** and drive motor directions (Setup → Robot controller → Device names on the robot, `deck-sim robot --names/--reversed`), in every Control Hub export.
- **`Mechanisms.java` written device by device** from one list (`mechanismDevices`), which the virtual hub wiring, the check TeleOp and the robot check share. Rollers and roller feeders are `DcMotorSimple`, so a motor or a continuous servo both work. A servo turret is tracked to 2°. Before, it timed itself from the last change, and the pose noise kept pushing that time back, so it never fired.
- **The check TeleOp** (`<Class>Check.java`, TeamCode, OnBot and Pedro). It turns the drive wheels one at a time and runs the intake, flywheels and feeders. Y measures top speed and shows REV's PIDF; a servo finder reads positions; the turret jogs.
- **The virtual hub models mounting.** Each device is registered as its kind and mounted as set. Only a forward command intakes, feeds or spins, so code with a wrong direction fails in simulation as it would on the robot. The engine reads signed commands.
- **MotionModule:** the same settings, with the power negated for a reversed device; the bridge applies mounts.
- **Send to robot** (Run & review → Export):
  - `src/robot-link.cjs` reads the active configuration over Robocol, then uploads and builds through OnBot Java (`/java/file/save`, `/java/build/*`), backing up files that were edited on the robot.
  - `ui/ftc/robot-config.js` parses the configuration XML and checks every name the export uses: name suggestions (leftFront for front_left), fixes for a wrong kind, duplicates.
  - The protocol was taken from the FTC SDK 12.0 classes (javap).
  - `tools/ftc-sim.cjs` answers the configuration commands and `--onbot` serves OnBot Java.
- **Exports:** OnBot Java is now the autonomous plus its check file (app save, deck-sim and Send to robot). The examples were regenerated.

### One-button setup, phase 2 (24 October, evening)

The user's goal: plug into the Control Hub, press one button, and everything for the autonomous is set up. Phase 2 of `docs/MECHANISM_ACTIONS.md`:

- **Configurations for missing devices** (`ui/ftc/robot-config.js`, `src/robot-link.cjs`).
  - Send to robot scans the hubs (`CMD_SCAN`, `CMD_DISCOVER_LYNX_MODULES`, formats read from the SDK's `ScannedDevices$MapAdapter` and `LynxModuleMetaList`) and plans a port for each device the robot lacks. The plan is shown as a list where ports swap and motor types are picked.
  - The result is a copy of the active configuration with the lines added, or a whole new configuration from the scan.
  - It is saved with `CMD_SAVE_CONFIGURATION` under a new name, read back, and the robot restarts. A name the robot has is refused, because the SDK overwrites it.
- **One flow.** "Send to robot…" checks, scans and shows one summary. "Save and send" applies the picked names, saves the configuration, uploads and builds, and keeps the wiring list on screen.
- **Drive preselect.** After a build, `robot-link select` remembers the autonomous. `ftc-info` hands it to `ds.js` once, which selects it when the robot lists it.
- **The guided check** replaces the hold-a-button check TeleOp (`checkOpMode` in `ui/sim-ftc.js`).
  - Steps: the IMU, each drive wheel, each roller, each flywheel motor, top speed and PIDF, each feeder, turret direction and calibration, and servo positions.
  - Every answer is an absolute Deck setting on a "Deck results" telemetry line, which `checkResults` and `applyCheck` read back.
  - It runs from the Send panel (`runCheck`: INIT, START, button presses, STOP, and Controller 1 passed through), and from any Driver Station.
- **Virtual hub:** gamepad input for team code (`SimEngine.setGamepad`) and a per-device readout of what each device physically does (`hubDevices`), so a scripted operator can answer the check as a person would.
- **Simulated hub** (`tools/ftc-sim.cjs`): Scan, discovery, Save, Activate, op modes from what OnBot Java built (`listBuilt`), `--empty`, and `CheckScript`, a stand-in for the check TeleOp.

### One-button setup, phase 3: where the odometry sits (24 October, night)

- **Settings** (`robot.odometry` in `ui/sim-config.js`; only non-defaults are stored).
  - Pinpoint: X pod inches left of centre, Y pod inches forward, pod type, each pod's direction (goBILDA's `setOffsets` terms).
  - OTOS: chip position, X-axis heading (SparkFun's offset: degrees counterclockwise from the front, -90 = Y arrow forward), linear and angular scalars (0.872 to 1.127).
  - Pods: position and direction of each.
  - Edited in Setup → Robot controller → Where the odometry sits, or `deck-sim robot --odometry pinpoint.xOffset=-2.5,...`.
- **Exports.** RobotDrive configures the Pinpoint (offsets, resolution, directions, `resetPosAndIMU`) and the OTOS (`setOffset`, scalars, `calibrateImu`, `resetTracking`), and signs each pod. The OTOS pose is now plain SparkFun; the old +π/2 on its heading is gone. Pedro's starter constants map the OTOS offset to Pedro's frame: Pose(y, -x, h - 180°).
- **Guided check, last steps on the floor.** Push 48 in forward, push left, then a 30% spin on the spot for a full turn. Each pod reading is fit against the turn by least squares for the offsets. Applied with `applyCheck` (problems: swapped pods, no reading, a mirrored OTOS, a push that does not match either pod type). A drive wheel the check finds reversed is flipped right away, so the spin works.
- **Virtual hub chips** (`SimSensors.java`). The Pinpoint gets raw counts from its pods as mounted, and computes the pose with the configured offsets, directions and resolution. The OTOS measures in its own axes as mounted, and reports through the configured offset and scalars. Pods are mounted reversed when the setup says so.

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
- Lag during and after runs (25 October), measured with CPU profiles and Chrome traces of the real app at 1280×800:
  - `fitSettings` laid out the whole page after every change in the side panel (graphs, readouts and clock change many times a second). It now runs only for changes inside a paged section.
  - The 3D view rebuilt its overlay on every trail point, so the GPU recompiled shaders while the robot drove (840 ms per 6 s). The trail now has its own line with kept materials. 3D running: worst frame 100 ms → 33 ms, main thread idle 49% → 76%.
  - The 2D field no longer rebuilds zones, route and pins with every frame (`drawRun`), moves piece circles instead of recreating them, and sets attributes only when they change.
  - Frames that show the same picture (the practice clock keeps sending them after the robot stops) are not drawn; readouts update twice a second and graphs once a second while the robot stands still, and graphs off screen wait until they are seen.
  - After a run, main-thread work fell from about 50% to about 15%, and page updates from ~31 to ~3 a second.
- Smoothness and freezes, second pass (25 October). Measured on this laptop (Iris Xe, 3840×2400 at 300%) with the user's own setup: a 118 MB STEP robot of 2.18M triangles in 3D:
  - Runs looked choppy because frames reached the page 21–24 times a second, 45–50 ms apart: Windows wakes the engine's 4 ms pump only every ~15.6 ms, so the 32 ms frame spacing became every third wake. Frames now go every second wake (`FRAME_MS` 28, ~31 ms).
  - The robot, its mechanisms and the pieces glide: they are drawn at the display's rate, interpolated between the frames around a moment about one frame behind the newest (`glide` in `simulation.js`). Presented frames during a run: 2D 27 → 52 a second, 3D 28 → 55. Live recordings film the same picture. On a busy computer the delay grows with how late frames arrive and fades over a few seconds: with a quarter of the frames held back 120–220 ms the robot moves at most 1.1 in per display frame, where it jumped up to 10 in.
  - The 3D field view and run videos draw a lighter copy of a heavy CAD body (`DeckRobotModel.lighten`, vertex clustering by cell, part and facing): 2.18M → ~390k triangles, made once in ~0.35 s of 12 ms slices. GPU time per 3D frame 11.1 → 5.8 ms. The Setup previews keep every triangle for picking parts.
  - The view cube was redrawn (and the page laid out) every 3D frame because the orbit controls move the camera by rounding noise; it now redraws only when the camera turns. The sensor-estimate outline is one kept line, and 2D piece circles remember their attributes instead of reading them back.
  - On the 2D field the robot, pieces, estimate, follower target and trail have layers of their own (`will-change`), so moving them no longer re-rasters the field's tiles at 3× under them: the GPU process during a 2D run went from 50% to 28% busy.
  - Opening Simulate: the hidden 3D view no longer draws. Shaders compile in the background (`compileAsync`, with stand-ins for the shadow pass) and meshes upload when the page is idle. Shadows use `PCFShadowMap`: this three.js swaps `PCFSoftShadowMap` for it at the first shadow pass, which discarded every compiled shader and compiled 31 again while drawing (17 now, none while drawing). Worst frame on opening 867 → ~480 ms; the rest is DSIM's BIOBUZZ field build (~390 ms, once per session).
  - Changing the chassis size no longer redraws the CAD's top-down picture in a new WebGL context (190 ms): a new size stretches the picture there is.
  - Fixed: a frame arriving while the field reloads threw "Cannot read properties of null (reading 'trays')".

### Video editor (25 October)

- A **Video editor** tab beside Run & review, shown only while a recording exists; a finished recording opens it. Editing is optional: **Save video…** saves straight away.
- Built on the earlier `video-studio` foundations (`sim-cameras.js`, `sim-edit.js`, `sim-encode.js`), merged into `testing`; `ui/sim-studio.js` and `ui/sim-studio.css` are the tab. A top-down camera was added for 2D recordings.
- Kept simple for students: camera buttons, Pick cameras for me, Split / Delete / + Text, and Save video; the rest sits under More, More tools and the folds.
- The app's CSP blocks `style` attributes in markup, so the timeline sets positions through `data-css` and the style object.
- Verified in Electron: record → tab opens → auto cameras, a camera cut and a title → a 1280×720 H.264 MP4 of 11.5 s saved in about 7–10 s → Discard hides the tab.

### Video cameras keep clear of the field; the turret camera rides inside the turret (25 October)

The user's exported edit showed the intake camera inside the perimeter wall and in a flower's posts, the chase camera behind a hive leg, and the turret camera bobbing after every shot and losing the robot. Changes, all in `ui/sim-cameras.js` (plus `ui/sim-studio.js` passing the field):
- `field(info)` turns the engine's `structureParts` into boxes for the cameras: each hive part fitted along its own axes (Jacobi on the points' covariance, so a slanting leg gets a slim box), each flower one box round its posts and pollen. Walls stand on `bounds`, 12 in high.
- `clear()` runs after every camera's designed path. A pose is blocked inside or right against a wall, structure, flower or the robot (with its intakes' reach), or when one hides what the camera watches. A solid holding the watched point (the ramp in a flower) does not count as hiding it. Blocked stretches get one of 70 moves per picture by Viterbi: swing round what it watches, raise, lower under the trays, or come closer. Each glide between moves is timed and shaped (swing first, rise first, or both) to stay clear. A glide that still clips bars that change near there, and the sequence is solved again (three times at most). Unblocked poses are left exactly as designed.
- Turret camera, new default mode `pov` ("Inside the turret"): 4 in behind the pivot of the shooter that fires most (by the colours of pieces seen leaving) and 2 in over the robot's top. It turns only with the turret, tilts up to the goal while aiming (held 1.5 s), and its position is not smoothed. `follow` (behind the turret) and `fixed` stay; the old `projectile` mode is gone, and settings saved with it fall back to `pov`.
- The rig's intake point is now the intake's mouth (chassis edge plus `reach`), so the intake camera frames the whole intake.
- The editor works out a camera's path when it is first shown (`track`) and the rest when idle, again only when that camera's own settings change.
- Live Record now films with `mainLive` (sim-3d.js `chase`): `mainStep`, then the same rules picture by picture, without the rest of the run.
  - It looks half a second ahead from the robot's velocity and the follow camera's own (smoothed) velocity. The camera's velocity matters because the camera whips round the robot when it turns to the goal.
  - It keeps its move unless another stays 0.3/s cheaper for 0.4 s, and changes at once when blocked now or soon.
  - It glides with τ 0.08 s when blocked, 0.12 s when about to be, 0.2 s away from the design and 0.5 s back, the glide itself capped at 120 in/s.
  - On the lunala run: no picture inside anything, and one (at 22.3 s, under the hive) with a tray edge across the robot. The old live camera had 1 inside and 25 hidden.
- Run video (after the run) films 3D with the editor's camera 1 path over the replayed part: `videoShow.pose` hands each picture its pose to `shoot()`.
- The shared pieces in sim-cameras.js are `sceneAt` (what can block a picture), `placeIn` and `blockedIn`.

Measured on the user's lunala setup and robot CAD (a 28 s autonomous, 848 frames), counting frames inside a solid / inside the wall / with the watched point hidden:

| Camera | Before | After |
|---|---|---|
| Main | 1 / 0 / 25 | 0 / 0 / 0 |
| Front-right | 3 / 241 / 183 | 0 / 0 / 0 |
| Turret | 6 / 0 / 1 | 0 / 0 / 0 |
| Rear chase | 5 / 0 / 0 | 0 / 0 / 0 |
| Intake | 64 / 255 / 305 | 0 / 0 / 0 |

While feeding, the turret camera moved 9.6 in/s and turned 40.7°/s before; now 0.2 in/s and 11°/s (only the turret's own turning). Paths take 5–110 ms per camera (best of five runs), about 0.4 s for all five, worked out in quiet moments once the editor opens. In the app: record → Pick cameras for me (4 cameras, 11 cuts) → Save video gave an 18.9 MB MP4 in 11 s with no page errors, and its frames show no camera inside a wall, flower or the hive.

### Moving parts: articulated CAD mechanisms (25 October)

The user asked for the CAD's mechanisms to move in the simulator (turrets turning on their gears, hoods tilting, rollers and flywheels spinning, ramps and kickers folding between two set positions in set times), for pivots to be found automatically from the CAD and picked on the model (circles, as a slicer measures them), and for the text-only folds on the Mechanisms page to go. Then a brief for a general mechanism engine (joints, actuators, transmissions, actions; discovery with confidence; not FTC-only). Design, sources and limits: `docs/MECHANISM_ENGINE.md`.
- `ui/sim-kinematics.js`: joints (fixed, revolute, continuous, prismatic, cylindrical, screw, universal, ball, planar, floating, pin-slot) in the CAD's rest frame; couplings (`q = ratio·q + offset`); closed loops solved by damped least squares from the rest pose (four-bar and slider-crank match their formulas); inverse kinematics; trapezoid actuators; action timelines; a `Driver` the engine ticks.
- `ui/sim-discovery.js` (+ `sim-discovery-worker.js`): finds turrets, flywheels, hoods, ramp/kicker hinges (with the floor-contact angle), rollers, feeder wheels and drive wheels from round parts, coaxial lines, names and contact; each with a confidence and a reason. Pick-a-circle and two-point pivots.
- `DeckRobotModel.rig/pose/animate`: the body split into link meshes by index subsets over the shared vertex buffers (the lite field copy too); stand-ins for mechanisms with no CAD parts.
- Engine: joint values every tick in `frame.joints` (and `mechanisms.deploy`); `between()` interpolates them; route actions naming a part and a position ("Lift up") move it, and a pin waits for it on any field.
- Setup → Mechanisms: **Moving parts** panel under the preview (`ui/sim-joints.js`), found automatically the first time a CAD is shown; the four text-only folds are gone.
- On the user's lunala CAD: 14 moving parts in ~0.5 s (Node) / ~2 s in the worker; renders of each posed (ramp down to the floor at 71°, turrets on their gears, hoods on the flywheel axles) and a 3D run whose frames carry the joint values.

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
