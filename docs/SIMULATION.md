# Simulation view

Open **⋮ → Simulation**. This is an offline **path-planning and driving-practice** workspace inside the driver station app on this computer. It does not contact a robot or any online service, and live robot controls stay isolated. Entering Simulation closes the connected robot through the existing disconnect/FTC STOP path, and robot auto-open is suppressed while the view is open.

Plan routes around physical barriers, add pauses/action labels, test autonomous through physics and export the result. Loose game pieces move and can be pushed. User-controlled intakes, shooters, scoring and full FTC game rules are not implemented.

## Using it

Three tabs span the workspace: **Setup → Path planning → Run & review**. Setup has its own page; the field appears in planning and run. **Saved setup** switches between independently saved robots, controller profiles, sensing, fields, routes, models and practice timings. New setups start with **FTC Control Hub / drive encoders + built-in IMU**. Rename with ✎ and remove with ×; at least one setup and one field always remain. Existing sensing choices are retained; legacy sensor-free choices migrate to IMU-only and encoder-only choices gain IMU.

### Setup

- **Field.** Choose a saved field: an empty field, DECODE or BIOBUZZ. Keep as many as you like (for example "Empty field 1", "Empty field 2", each with its own zones and pins). Use ✎ to rename a field and × to delete it.
  - Empty fields have editable width and depth in inches. Their dimensions affect drawing, placement, route planning and the physics walls. New empty fields can be named independently.
  - DECODE and BIOBUZZ have fixed game geometry. Add another instance to save another plan; its structures and size cannot be edited. Routes avoid floor obstacles (DECODE goals and ramps; BIOBUZZ hive legs and flower bases). **Physical game elements** is on by default for game fields. User barriers supplement the fixed structures.
- **Controller profile.** Choose **FTC Control Hub** or **MotionModule**. Each remembers its own odometry and IMU choices when switching. These are simulation profiles, not firmware deployment or hardware configuration.
- **Robot.** Choose a drivetrain family: mecanum, independent/coaxial/differential swerve, differential/tank with 2/4/6/8 wheels, tracks, X-drive, Kiwi, H/U-drive, or butterfly with its mecanum set lowered. Type the **front intake reach** (0 for a pushbot), chassis length and width. There is no 18-inch cap. The whole footprint must fit in the selected field.
  - Tank variants share skid-steer physics. Kiwi and H/U-drive use a generic omni-wheel approximation, and swerve variants share swerve physics. These are family models, not detailed models of every mechanism or motor arrangement. The UI identifies approximations.
  - Mecanum defaults to the actual **goBILDA Strafer 104 mm GripForce** CAD, with its default front reversed as requested. Swerve defaults to the full **NYC FIRST A301 Swechanum** CAD, inverted so its swerve wheels are below the mecanum frame. Both are grounded. Strafer's four mecanum wheels roll; A301's four lower swerve wheels roll and their holders steer, while its elevated mecanum wheels stay still. Geometry remains visual only; physics dimensions are explicit settings, including chassis height for BIOBUZZ.
- **Your robot.** Drop your robot's **STEP** file (or GLB, STL, OBJ) onto the box, or use **Choose file…**.
  - **One body.** Every part of the assembly is merged into one rigid body, with no joints or articulation. That keeps the app fast.
  - **Orientation.** Click a cube face, then assign that model side to front, back, left, right, top or bottom. Bundled models also support orientation assignment. The checkered floor is the bottom reference. The preview and field cubes both provide six face, twelve edge and eight corner views plus home; zoom is bounded.
  - **Size.** Importing never changes typed chassis length/width. The visual scales in X/Y to fit those dimensions, with its bottom on the floor. The red footprint follows the typed dimensions and intake reach.
  - **Where it shows.** Your model replaces the plain robot block in both 2D (seen from above) and 3D.
  - **Looks only.** The model is never used for collisions. Collisions and planning use the footprint settings, which you confirm.
- **Sensing & physics.** Every visible FTC choice includes an IMU. Choose its source separately: Control Hub built-in or external I²C IMU. Pinpoint and OTOS use their integrated IMU. No sensor-free, no-IMU, vision-pose or ground-truth setup appears in the UI. Internal legacy/deterministic profiles exist only for tests.
  - **IMU only:** zero tracking pods and no X/Y feedback. Timed power commands move the robot; IMU feedback corrects heading.
  - **Drive encoders + IMU:** encoders on the powered drive wheels, no passive tracking pods.
  - **2 odometry pods + IMU:** two perpendicular passive tracking wheels; IMU supplies heading.
  - **3 odometry pods + IMU:** two parallel passive wheels plus one perpendicular wheel, with IMU.
  - **goBILDA Pinpoint:** two tracking pods and the device's integrated IMU.
  - **SparkFun OTOS:** optical tracking and integrated IMU, with zero tracking pods.
  - **MotionModule:** onboard IMU by default, with optional two-pod, three-pod or SparkFun OTOS odometry. Drive motor encoders and Pinpoint are excluded. With external odometry the local simulator uses Pedro and simulated measurements; this adds no MotionModule firmware integration. With IMU only, translation uses timed power and heading correction without X/Y feedback. Power, forward/strafe speed at full power, start compensation and heading correction are editable. Slip, collisions and poor calibration can produce a large endpoint miss.
  - These are seeded measurement-error models, not vendor SDKs, I²C transactions or optical processing. Selecting IMU source records the intended setup; noise/drift settings determine simulated errors. Sources: [REV IMU](https://docs.revrobotics.com/duo-control/sensors/i2c/imu), [Pedro localization](https://pedropathing.com/docs/pathing/tuning/localization), [Pinpoint](https://www.gobilda.com/pinpoint-v2-odometry-computer-imu-sensor-fusion-for-2-wheel-odometry/) and [SparkFun FTC OTOS](https://docs.sparkfun.com/SparkFun_Optical_Tracking_Odometry_Sensor/hardware_assembly_FTC/).
- **Robot specs.** Length, width, height and mass are visible together. Wheel RPM is adjustable from **50 to 6,000**, with a matching slider. **Drive current budget** (1–40 A, default 20 A) scales acceleration and pushing torque relative to a 20 A reference. This is an approximation; it does not calculate battery voltage, wiring, motor count or actual electrical current draw.
- **Driving style.** Robot-centric follows the chassis. Field-centric stick up means field +Y regardless of heading. Tank robots turn toward the stick direction before moving. Right stick turns and left bumper reduces power in both modes.
- **Advanced settings** (always shown). Sensing noise/drift, path speed and correction strength. These describe the simulated robot only.
- **Open setup file… / Save setup file…** transfers one setup, including all its field layouts and its imported model, as JSON. Opening a file adds a saved setup rather than discarding the other saved setups.

### Path planning

Planning has three adjacent tabs: **1 · Starting pose → 2 · Field obstacles → 3 · Route pins**. Starting pose belongs here, outside Setup. The robot starts at a clear spot by the left wall. Drag it on the field to move it (it moves freely while dragged; letting go over an obstacle moves it to the nearest clear spot), set X/Y/heading with the boxes or sliders, or use **Start at edge**, then **Next**. The whole footprint must be inside the field and clear of structures/barriers. Switch between **2D** (editing) and **3D** (inspection). Red dotted outlines show physical floor boundaries; optional **Hitboxes** in 3D outline the robot, structures and loose pieces. The field cube reorients the camera and zoom-out is bounded.

This local build uses DSIM's actual 2D field drawing and BIOBUZZ CAD/renderer, including moving trays and live elements. DSIM has no corresponding DECODE 3D CAD renderer; that view uses locally prepared official FIRST DECODE field CAD aligned to the engine's coordinates. The app keeps its own theme-aware controls.

1. **Mark where not to go.**
   - **Box**: drag corner to corner.
   - **Circle**: drag from the centre outwards.
   - **Triangle**: press where the base goes and drag. The tip follows your cursor, so it turns, flips and stretches as you move.
   - **Shape** (the default tool here): tap corners. The outline is drawn closed back to the first corner as you go, so three corners show a triangle, four a quadrilateral and so on. Two points make a wall line. Press **Enter** or **Finish shape** to confirm (tapping the first corner or double-clicking also works); **Undo corner**/Backspace removes the last corner and **Cancel**/Escape discards it.
   - **Change a zone**: click it with **Select**, then drag it, or drag its handle (box corner, circle edge, triangle tip, shape corners). Delete or right-click removes it. Zones are physical barriers as well as planning exclusions. Concave outlines are triangulated; wall lines are one inch thick; BIOBUZZ barriers are twelve inches tall.
2. **Drop pins in order** with **Pin**, or choose **Draw path** and drag the route on the field: the stroke is simplified into pins (starting near the end of the route extends it; elsewhere replaces it). The whole footprint must fit inside the field and outside physical structures/barriers; a pin tapped or drawn in a red area moves to the nearest clear spot, and a dragged pin slides along the edge instead of entering it. Give pins pauses and action names in the list. Actions are labels for future mechanism work; the simulator does not execute an intake/shooter action.
3. **The route draws itself** whenever you change something. If a pin can't be reached safely, it turns red and the message says why.

**Route shape** can be **Smooth curves** (cubic splines through the waypoints, the default), **Rounded corners** or **Straight lines**. Curves never come closer than half of **Space around zones**; where a curve would, that corner tightens, down to a straight line if needed. Pins with a pause, and places where the route doubles back, are full stops.

Tank/differential/tracked robots use **Straight lines** with a stop and chassis turn at each corner. Planning checks the full rotation and translation sweeps against walls and obstacles. With odometry, Pedro holds the new heading until it stays within 1.5° for 0.15 s with an average rotation below 0.08 rad/s (averaged so sensor noise cannot stall the turn), then follows the next leg. IMU-only runs turn from measured heading, then drive by time. RPM, footprint, mass and current budget affect physical turn time, which counts toward autonomous time. Reverse travel avoids unnecessary 180° turns. Tank Java exports carry per-leg headings and instructions to turn before following; `.pp` adds `stopAndTurn`, which external consumers must handle explicitly.

**Turning** (holonomic drivetrains): with **Turn to fit** (the default) the planner may turn the robot in place to slip past an obstacle, for example sideways through a gap narrower than its length, or to put a short side against a wall. Each of eight headings (45° apart) gets its own map of obstacles grown by the footprint at that heading; turning-in-place links connect the maps at the start, the pins and a coarse grid of turning spots wherever the whole rotating footprint plus clearance clears every degree of the turn. One shortest-path search weighs driving distance against turning (the distance the footprint's farthest corner sweeps) and chooses which way around to go. It only runs when the fixed-heading route is missing or detours by more than 8%; otherwise the route keeps its heading and chosen shape. Turning routes use straight legs; dashed outlines mark turns. **Keep heading** restores the fixed-heading planner.

**Tank/differential/tracks** can only drive along their heading or turn in place. When the direct conversion has no room to turn, a lattice search over 2-inch drive and reverse moves and 22.5° turns finds where to back out and line up (each expansion also tries turning to face the pin and driving straight there), then the result is straightened into the fewest stop-and-turn legs.

**Stall recovery:** if Pedro's robot barely moves (under 1.5 in/s for 0.8 s) more than 3 in from the end of a leg, it backs out to where it was about a second earlier, straightens up and resumes the leg. After three tries on one leg the run stops with "stuck near (x, y)"; increase **Space around zones** or move the pins. This is runtime recovery only; it does not replan around unknown obstacles.

**Find fastest route** test-drives the generated shapes headlessly through physics using the selected controller: Pedro with odometry, timed power + IMU without position sensing. It keeps the fastest clean candidate that reaches the last pin and lists times. Poorly calibrated timed driving may have no qualifying candidate.

**Export the route**:
- **Pedro Java…**, for FTC with odometry, writes a class (default `PlannedRoute`) with:
  - `START` and `HEADING`;
  - `legs()`, the route split at each pause;
  - `WAIT_SECONDS` and `ACTIONS` for each stop;
  - `NO_GO_ZONES` as polygons.

  It uses the Pedro Pathing 3.x API and is checked by compiling it against Pedro's real classes.
- **Timed commands…**, for either controller with IMU-only sensing, writes JSON with powers, durations, pauses and heading settings. Tank schedules include IMU-settled turns with a 30-second failure timeout; total duration is null because turn completion depends on measured heading. There is no X/Y feedback. This is a simulation schedule, not a MotionModule firmware integration.
- **Path file (.pp)…** writes the start point, lines, Bézier control points, and `waitAfterMs`/`waitAfterName` on each stop. Zones are included as polygon `shapes`; that part has not been checked against Pedro's visualizer.
- **Keep the exported file updated** rewrites the file you picked every time this field's route changes. The app can only write to a file you chose in a save dialog.

### Run & review

Choose **Autonomous**, **Teleop**, or **Full match**. These share the selected setup and field; teleop is separate from the autonomous editor.

- **Autonomous** runs the planned route or Java program, with controller driving disabled.
- **Teleop** starts at the saved pose and enables Controller 1 for driving practice. It needs no localization sensors. Left stick moves, right stick turns, and left bumper slows down; the app's saved controller assignment, input source and deadzone apply.
- **Full match** runs autonomous, holds during transition, then enables teleop at the robot's ending pose. The defaults are **30 s autonomous, 8 s transition, 120 s teleop**, from the [FIRST competition manual](https://ftc-resources.firstinspires.org/ftc/archive/2026/game/cm-html/DECODE_Competition_Manual_TU32.htm). Each period can be customized (transition may be zero). Early autonomous completion holds until its period ends; expiry kills an overlong program. Timers use simulation time, so Pause and speed changes apply to the whole sequence.
- Controller input is rejected during autonomous and transition. On entering teleop, resuming, reconnecting or losing fresh input for 0.5 s, the sticks must return to neutral before driving. Stop/Reset and leaving Simulation cancel the whole sequence. The countdown shows the current phase and whether controls are locked.

- **Planned route**: follows with Pedro and odometry, or executes timed power + IMU without position sensing, including pauses.
- **Java program**: write or open your own program (see below). It requires an FTC odometry profile.

**Run**, the speed menu, and **Play / Stop / Reset** above the field control the simulation:
- **Stop** ends the program and zeroes the drive; replies that arrive late are discarded.
- **Reset** returns to the starting pose and restores game pieces.

There is no manual Drive tool in autonomous planning. Arrow keys there are for placement/editing. Driving becomes available only after explicitly starting a teleop practice phase; real robot outputs remain paused throughout Simulation.

The readout shows simulation time, true position/speed, the current leg/pause and zone contact. Odometry runs show sensor-estimate error. IMU-only runs show timed execution and final miss, without a position estimate. Loose pieces move through DSIM physics and can be pushed by the rectangular chassis.

## Coordinates

Inches, bottom-left origin, +X right, +Y up, heading counter-clockwise from +X (0° right, 90° up). Standard game layouts use Pedro's field frame. Custom fields keep their actual coordinates and dimensions; they are not rescaled to 0–144 for export.

## Simulated robot vs. real robot

Robot settings describe the **simulated** drivetrain and sensors only. There are no hardware ports, GPIO, encoder names or real localizer configuration, and nothing is written to a robot. Timed-driving calibration describes the simulation. REV Control Hub and MotionModule firmware configuration stays on the robot.

- **True position** is the physics state.
- **Estimate** is what a Pedro `Localizer` reports when fed simulated sensors. Noise, scale error and drift are configurable and seeded.
- **IMU only** cannot measure X/Y. Its planned route uses timed power with heading correction and no positional recovery; Java/Pedro follower programs are refused.

The follower's speed and braking constants are **measured from the physics drive model** each time the robot changes, the way Pedro's tuning OpModes measure a robot. The feedback gains (translational P 0.5, heading P 1.6, path speed 0.6) were chosen by sweeping runs in this simulator. They are not values for your robot. Pedro's 100 ms default hold timeout is not a settling test, so the simulated profile uses 2 s, and the route program also waits for the robot to settle.

## Your own Java program

Programs implement `deck.sim.DeckAutonomous` (`init` once, then `loop` every 1/60 s of simulation time) and use the real Pedro API. **Example** in the Run tab loads a program that follows the planned legs and pauses.

`SimRobot` provides:
- `follower()`, `foresight()`, `startPose()`
- `plannedRoute()`, `routeLegs()`, `stopWait(i)`, `stopAction(i)`, `pins()`
- `time()`, `telemetry(key, value)`, `near(...)`, `waiting(...)`, `finish()`

Errors are readable and contained:
- Compile errors show the file and line.
- Exceptions show your stack frames.
- A `loop()` that does not return within 0.75 s (5 s while warming up) is stopped and its Java process killed.
- Printed output appears under **Program output**.

**Transfers to a robot:** the route (via the Java export or `.pp`), and Pedro follower logic in the same field frame. **Does not transfer:** `deck.sim.*`. On a robot you need an OpMode that builds the `Follower` from your real drivetrain and localizer with tuned constants. MotionModule's Python runtime has no Pedro integration yet.

## Research behind these changes

Reviewed the pinned Pedro follower/Foresight/localizer source and DSIM drivetrain/motor model, then rebuilt both locally. Commands advance through physics at 60 Hz. The extended RPM range required longer free-speed/braking measurements and a guard against degenerate fits. Fitted linear braking terms keep a 1 ms floor: Foresight's braking quadratic divides 0/0 at a path end when that term is exactly zero. Calibration is cached per drivetrain, geometry, mass, RPM and current budget.

These are references, not additional execution engines:
- [Road Runner actions](https://rr.brott.dev/docs/v1-0/actions/): separate interruptible driving, turning and waiting stages informed the tank turn/drive sequence.
- [PathPlanner trajectory source](https://github.com/FTC-SigmaCorns-22377/pathplanner-ftc/blob/main/lib/services/generator/trajectory.dart): curvature limits, acceleration passes and accumulated time. Our optimizer measures physics time, including turns and pauses. Per-pin speed overrides are not implemented here.
- [Stampede](https://github.com/robovines6955/Stampede): target positions/orientations, sensor selection and heading correction reinforce separating IMU-only timing from odometry feedback. No AprilTag processing is added.
- [Virtual Robot](https://github.com/Beta8397/virtual_robot): robot/sensor configurations and physical versus simpler kinematic models. Our setup labels drivetrain-family and sensor-error approximations.

No performance or accuracy superiority over these projects has been established. Tests verify this app's behavior and regressions; real robots still need hardware-specific configuration and tuning.

## Execution adapters

- **Implemented:** Pedro Pathing 3.0.2 core, compiled from the pinned source (`cf4be31`). Its 12 `System.nanoTime()` reads are redirected to the simulation clock, so pause and speed changes cannot wind up integrals or expire timeouts; the build checks that count.
- **Not implemented:** Road Runner, the FTC SDK (`OpMode`, `hardwareMap`), MotionModule's Python runtime, and a live robot pose overlay.

## How it is built

The window uses SVG/canvas in 2D and three.js in 3D. At the user's request, this personal noncommercial build now uses DSIM's field visuals and BIOBUZZ CAD. DECODE 3D uses official FIRST CAD. Pedro remains the path-following engine. Third-party licenses/notices accompany the assets.

- **`ui/simulation.js`**: the view.
  - `sim-planner.js` and `simulation-worker.js`: route planning.
  - `sim-export.js`: route exports.
  - `sim-robot-model.js`: robot models and the view cube.
  - `sim-3d.js`: the 3D view.
- **`src/sim-bridge.cjs`** (main process) handles:
  - the simulation **utility process**: started when the view opens, ended when it closes, the window's page dies or the app quits;
  - phase-gated controller input for teleop practice;
  - file dialogs and exports.
- **`src/sim-host.cjs` → `src/sim-engine.cjs`** runs in that process:
  - DSIM physics at a fixed 60 Hz step: DECODE and empty fields are planar, BIOBUZZ is Rapier 3D;
  - simulated sensors;
  - the headless test drives;
  - the Pedro Java process, over NDJSON lines capped at 1 MiB. Each run has a sequence number, so replies from a stopped run are discarded, and Java exits when its input closes.
- **`src/sim-practice.cjs`**: simulation-time phase clock for autonomous, transition and teleop.
- **`ui/sim-config.js`**: shared robot/sensor families and dimensions. Checked adapters add rectangular pushbot/intake geometry, physical custom barriers and solid-chassis contact with loose pieces; the pinned upstream clone is unchanged. Offline dimensions replace competition clamps.
- **`ui/sim-timed.js`**: time/power compilation and execution using elapsed time and IMU, without X/Y feedback.
- **`ui/sim-field-art.js`**: DSIM 2D/BIOBUZZ 3D field adapters, official DECODE CAD and physical markers.
- **`src/sim-model.cjs`**: STEP import with OpenCascade (`occt-import-js`). It runs in the simulation process, so the window stays responsive.

The CSP adds `'wasm-unsafe-eval'` (three.js mesh decoding) and `blob:`/`data:` for model data. Nothing is fetched from the network.

## Building the simulator runtime

Generated files are git-ignored and rebuilt reproducibly from pinned inputs. First install the pinned dependencies from `tools/simulation/deps-package.json` (with its lockfile) into `.cache/simulation-deps`, then run:

```bash
node tools/simulation/build.cjs
```

Inputs (the build checks every one):
- **DSIM** `0df84143…` (clean clone)
- **Pedro** `cf4be314…` (clean clone)
- **npm packages:** esbuild 0.25.12, @dimforge/rapier2d-compat 0.19.3, @dimforge/rapier3d-deterministic-compat 0.20.0, three 0.186.0, clipper-lib 6.4.2, dijkstrajs 1.0.3, occt-import-js 0.0.23
- **Java:** Temurin JDK 21.0.12.1 reduced runtime (with `jdk.compiler`) and Gson 2.11.0

Outputs:
- `ui/vendor/` (`planning.js/.cjs`, `three-view.js`, field models and `licenses/`)
- `sim-runtime/` (`dsim-host.cjs`, `occt/`, `pedro/`, `java/`, `manifest.json` with SHA-256 hashes)

Prepared CAD is tracked as compressed GLBs under `ui/assets/robots/` and `ui/assets/fields/`; notices record sources and hashes. Installed operation needs no download/conversion. STEP originals stay in `.cache/simulation-cad/`. Optional preparation uses native Open CASCADE (`cadquery-ocp-novtk==7.9.3.1.1`) and `meshoptimizer@0.25.0`; `prepare-decode-field.mjs` removes static loose pieces so physics bodies replace them. Ordinary runtime builds need no Python; user STEP imports use bundled OpenCascade WASM and merge to one body. BIOBUZZ assets are copied from the verified pinned DSIM clone.

`tools/simulation/stubs/discordActivity.ts` keeps DSIM's online-only modules out of the physics bundle.

To install into this laptop's driver station (backs up first, closes only the verified installed main process, keeps settings/launcher/icon/shortcuts, verifies every copied file by SHA-256, then launches):

```bash
powershell -File tools/simulation/install-local.ps1
```

## Licenses

- **DSIM** is **PolyForm Noncommercial 1.0.0**, not open source. This personal noncommercial build uses its physics, field rendering and BIOBUZZ assets. Its `LICENSE` and `NOTICE` (Required Notice: Copyright 2026 Dohun Kim) are in `ui/vendor/licenses/`. Keep those notices; do not commercially redistribute or relicense its code/assets.
- **FIRST field CAD/assets** retain their owners' terms. Redistribution permission is not asserted; nothing is published. See `ui/assets/fields/NOTICES.md` and the copied upstream BIOBUZZ asset README.
- **Pedro Pathing** is BSD-3-Clause.
- **three.js** is MIT.
- **Rapier** is Apache-2.0.
- **Clipper** is Boost 1.0.
- **dijkstrajs** is MIT.
- **Gson** is Apache-2.0.
- **occt-import-js and Open CASCADE Technology** are LGPL-2.1; their notices are in `ui/vendor/licenses/`.
- **Temurin** is GPLv2 with Classpath Exception; its notices are in `sim-runtime/java/legal`.

## Tests

```bash
node --test tests/*.test.cjs
```

That command includes these simulator suites:
- `sim-planner.test.cjs`:
  - geometry, narrow passages and blocked routes, the asymmetric footprint;
  - splines, stops, reversals, walls and concave shapes;
  - the Clipper rounding regression and a grid-search completeness oracle;
  - export, including compiling the exported Java.
- `sim-engine.test.cjs`:
  - physics motion and Pedro runs, pauses and Stop;
  - user code errors and timeouts;
  - IMU-only Java refusal, test drives, DECODE and BIOBUZZ 3D;
  - STEP merging and the clock patch.
- `sim-robot-model.test.cjs`: model orientation, including every six-side assignment.
- `sim-practice.test.cjs`: phase timing, controller arming/stale input, IMU-only teleop, large-field walls and tank driving.
- `sim-drive-profiles.test.cjs`: sensor restrictions, external MotionModule odometry, driving frames, current-limited acceleration, RPM extremes, swept tank turns, export headings and physical turn duration.
- `sim-turning.test.cjs`: holonomic turn-to-fit through a narrow gap, unchanged open-field routes, taut turning routes that keep every pin, tank back-out from a corridor, Pedro execution of a turning route, timed/export turn legs and stall back-out.
- `sim-assets.test.cjs`: curated CAD hashes, drive-wheel groups and grounded swerve orientation.
- `sim-field-practice.test.cjs`: A301 BIOBUZZ route completion, moving/resettable pieces, solid pushbot/hive collisions, physical custom barriers and pushing balls.
- `sim-timed.test.cjs`: timed compilation, IMU-only execution without X/Y or Java, deliberate calibration error, FTC defaults and full transition-clock regression.

The native test is `tests/simulation-ui.cjs`. It needs `DECK_PLAYWRIGHT` and `DECK_ELECTRON`, and uses isolated temporary user data. It covers setup/profile persistence, editing stages, exports, actual Pedro/timed runs, controller practice/full match, CAD import dimensions/orientation/wheel animation, field assets/markers/cubes/zoom, themes, responsive sizes and FTC STOP/connection isolation. The separate pre-existing Wi-Fi-dependent `tests/ui.cjs` failure is outside these simulator checks.

## Known limits

- **Planar physics:** DECODE and the empty field are planar; drawing them in 3D does not make their physics 3D.
- **BIOBUZZ planning:** uses floor-level hive legs/flower bases. Overhead structures collide in 3D physics, but route planning does not yet account for robot-height clearance beneath them.
- **Heading:** holonomic routes keep the starting heading unless **Turn to fit** finds that turning in place (in 45° steps) is shorter; turning while driving is not planned (your own programs may turn).
- **Tank autonomous:** straight legs separated by stop-and-turn maneuvers, with full-footprint rotation checks. Planning retries with a conservative rotation envelope when needed; it can reject tight routes that a more sophisticated search might find. Continuous-curvature tank trajectories are not implemented. Holonomic routes retain constant heading.
- **Timed driving:** translation is open-loop. IMU supplies heading, not position; calibration error, collisions and slip can cause large misses, without positional recovery.
- **Practice scope:** driving, loose-piece contacts and autonomous timing. No user-controlled mechanisms, throwing/scoring controls, refereeing, opponents or full FTC match rules. The timer is configurable practice behavior, not an FTC SDK runtime.
- **Models:** bundled CAD is simplified for rendering. Wheel/pod animation is visual kinematics, not articulated contact physics. User CAD stays one rigid body; very large or unsupported STEP assemblies can exceed the runtime importer's limits.
- **Shapes:** a shape whose outline crosses itself is treated as its whole outer hull, to stay on the safe side.
- **Find fastest route:** it compares the shapes it generates. It is not a global time-optimal planner.
- **Platform:** the bundled runtime is for Windows x64. Linux and macOS packaging of the simulator has not been done.
- **Live robot overlay:** this still needs a robot-published pose contract. MotionModule's `GET /api/drive/telemetry` exposes IMU yaw/rate, not X/Y.
