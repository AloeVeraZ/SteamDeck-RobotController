# Simulation view

Open **⋮ → Simulation**. This is an offline **path-planning and driving-practice** workspace inside the driver station app on this computer. It does not contact a robot or any online service, and live robot controls stay isolated. Entering Simulation closes the connected robot through the existing disconnect/FTC STOP path, and robot auto-open is suppressed while the view is open.

It is not a game simulator. There are no game pieces, intakes or scoring. You plan a route around no-go zones and the field's structure, add pauses where your mechanisms will run, check the route by driving it with a real path follower through physics, and export it for your robot code.

## Using it

Three tabs span the workspace: **Setup → Path planning → Run & review**. Setup has its own page; the field appears in planning and run. **Saved setup** switches between independently saved robots, sensing, fields, routes, models and practice timings. New setups start with **no sensors**. Rename setups with ✎ and remove them with ×; at least one setup and one field always remain. Existing v1/v2 projects are retained as the first saved setup, including their prior sensor choice.

### Setup

- **Field.** Choose a saved field: an empty field, DECODE or BIOBUZZ. Keep as many as you like (for example "Empty field 1", "Empty field 2", each with its own zones and pins). Use ✎ to rename a field and × to delete it.
  - Empty fields have editable width and depth in inches. Their dimensions affect drawing, placement, route planning and the physics walls. New empty fields can be named independently.
  - DECODE and BIOBUZZ have fixed game geometry. Add another instance to save another plan; its structures and size cannot be edited. Routes automatically avoid floor obstacles (DECODE goals and ramps; BIOBUZZ hive legs and flower bases). User no-go zones are overlays; they do not change the game structures.
- **Starting pose.** X, Y and heading in inches and degrees. You can also use **Place on field** or **Start at edge**. A new field starts at the nearest clear spot to the left wall.
- **Robot.** Choose a drivetrain family: mecanum, independent/coaxial/differential swerve, differential/tank with 2/4/6/8 wheels, tracks, X-drive, Kiwi, H/U-drive, or butterfly with its mecanum set lowered. Type the **front intake reach** (0 for a pushbot), chassis length and width. There is no 18-inch cap. The whole footprint must fit in the selected field.
  - Tank variants share skid-steer physics. Kiwi and H/U-drive use a generic omni-wheel approximation, and swerve variants share swerve physics. These are family models, not detailed models of every mechanism or motor arrangement. The UI identifies approximations.
  - Mecanum defaults to the actual **goBILDA Strafer 104 mm GripForce** CAD. Swerve defaults to the full current **NYC FIRST A301 Swechanum** CAD, inverted as requested so its swerve wheels are below the mecanum frame. Both are grounded and have curated wheel animation; A301 wheel holders steer with the wheels. Their geometry remains visual only, and physics dimensions remain explicit settings.
- **Your robot.** Drop your robot's **STEP** file (or GLB, STL, OBJ) onto the box, or use **Choose file…**.
  - **One body.** Every part of the assembly is merged into one rigid body, with no joints or articulation. That keeps the app fast.
  - **Orientation.** Click a side of the view cube, then choose **This side is the front** or **This side is the top**. The model turns to match.
  - **Size.** **Use model size** copies its length and width into the robot settings.
  - **Where it shows.** Your model replaces the plain robot block in both 2D (seen from above) and 3D.
  - **Looks only.** The model is never used for collisions. Collisions and planning use the footprint settings, which you confirm.
- **Position sensing.** None by default. Available profiles include two pods + IMU, three pods without an IMU, drive encoders with/without IMU, optical odometry + IMU, fused odometry + IMU, vision pose + IMU, IMU only, and ideal simulation ground truth. These are seeded measurement-error models, not vendor SDK or camera simulations. None supplies no odometry or gyro data; IMU only supplies no position. Both allow planning/export and teleop, but refuse Pedro follower runs.
- **More settings.** Mass, wheel RPM, sensing noise/drift, path speed and correction strength. These describe the simulated robot only.
- **Open setup file… / Save setup file…** transfers one setup, including all its field layouts and its imported model, as JSON. Opening a file adds a saved setup rather than discarding the other saved setups.

### Path planning

Planning has two stages: **1 · Field obstacles**, then **2 · Route pins**. The corresponding tools appear only in their own stage. Use **Next: place route pins** after marking the field, or return to Field obstacles to revise it. Switch between **2D** (editing) and **3D** (inspection). The app draws the field itself: tile seams, perimeter rails, alliance markings, DECODE goals/ramps, BIOBUZZ supports, trays and flower rings. Dashed overhead projections in 2D are distinct from solid floor obstacles.

1. **Mark where not to go.**
   - **Box**: drag corner to corner.
   - **Circle**: drag from the centre outwards.
   - **Triangle**: press where the base goes and drag. The tip follows your cursor, so it turns, flips and stretches as you move.
   - **Shape**: click corners. Two points make a wall line, three a triangle, and more make any outline, even a concave one. Click the first corner, double-click or press Enter to finish; Backspace removes the last corner.
   - **Change a zone**: click it with **Select**, then drag it, or drag its handle (box corner, circle edge, triangle tip, shape corners). Delete or right-click removes it.
2. **Drop pins in order** with **Pin**. A pin cannot be added outside the field or so close to an edge that the robot overhangs; dragging and keyboard nudges stay within the footprint-safe bounds. Drag a pin to move it. In the list, give a pin a pause in seconds and a name for what happens there (for example "Intake · 1.5 s"). The robot stops at that pin, holds still for the pause, then continues.
3. **The route draws itself** whenever you change something. If a pin can't be reached safely, it turns red and the message says why.

**Route shape** can be **Smooth curves** (cubic splines through the waypoints, the default), **Rounded corners** or **Straight lines**. Curves never come closer than half of **Space around zones**; where a curve would, that corner tightens, down to a straight line if needed. Pins with a pause, and places where the route doubles back, are full stops.

**Find fastest route** plans every shape, then *test-drives each one* through the physics with the real path follower. That happens in the background, so the robot on screen doesn't move. It keeps the fastest route that touched no zone and ended on the last pin, and lists every time.

**Export the route**:
- **Pedro Java…** writes a class (default `PlannedRoute`) with:
  - `START` and `HEADING`;
  - `legs()`, the route split at each pause;
  - `WAIT_SECONDS` and `ACTIONS` for each stop;
  - `NO_GO_ZONES` as polygons.

  It uses the Pedro Pathing 3.x API and is checked by compiling it against Pedro's real classes.
- **Path file (.pp)…** writes the start point, lines, Bézier control points, and `waitAfterMs`/`waitAfterName` on each stop, in Pedro's 0–144 field frame. Zones are included as polygon `shapes`; that part has not been checked against Pedro's visualizer.
- **Keep the exported file updated** rewrites the file you picked every time this field's route changes. The app can only write to a file you chose in a save dialog.

### Run & review

Choose **Autonomous**, **Teleop**, or **Full match**. These share the selected setup and field; teleop is separate from the autonomous editor.

- **Autonomous** runs the planned route or Java program, with controller driving disabled.
- **Teleop** starts at the saved pose and enables Controller 1 for driving practice. It needs no localization sensors. Left stick moves, right stick turns, and left bumper slows down; the app's saved controller assignment, input source and deadzone apply.
- **Full match** runs autonomous, holds during transition, then enables teleop at the robot's ending pose. The defaults are **30 s autonomous, 8 s transition, 120 s teleop**, from the [FIRST competition manual](https://ftc-resources.firstinspires.org/ftc/archive/2026/game/cm-html/DECODE_Competition_Manual_TU32.htm). Each period can be customized (transition may be zero). Early autonomous completion holds until its period ends; expiry kills an overlong program. Timers use simulation time, so Pause and speed changes apply to the whole sequence.
- Controller input is rejected during autonomous and transition. On entering teleop, resuming, reconnecting or losing fresh input for 0.5 s, the sticks must return to neutral before driving. Stop/Reset and leaving Simulation cancel the whole sequence. The countdown shows the current phase and whether controls are locked.

- **Planned route**: the built-in program follows the route leg by leg with Pedro Pathing and pauses at each stop.
- **Java program**: write or open your own program (see below).

**Run**, the speed menu, and **Play / Stop / Reset** above the field control the simulation:
- **Stop** ends the program and zeroes the drive; replies that arrive late are discarded.
- **Reset** returns to the starting pose.

There is no manual Drive tool in autonomous planning. Arrow keys there are for placement/editing. Driving becomes available only after explicitly starting a teleop practice phase; real robot outputs remain paused throughout Simulation.

The readout under the field shows simulation time, the robot's true position and speed, how far the sensor estimate is off, the current leg or pause, and whether a zone is being touched.

## Coordinates

Inches, bottom-left origin, +X right, +Y up, heading counter-clockwise from +X (0° right, 90° up). Standard game layouts use Pedro's field frame. Custom fields keep their actual coordinates and dimensions; they are not rescaled to 0–144 for export.

## Simulated robot vs. real robot

Robot settings describe the **simulated** drivetrain and sensors only. There are no hardware ports, GPIO, encoder names, calibration or real localizer settings, and nothing is ever written to a robot. REV Control Hub and MotionModule configuration and localization stay on the robot.

- **True position** is the physics state.
- **Estimate** is what a Pedro `Localizer` reports when fed simulated sensors. Noise, scale error and drift are configurable and seeded.
- **Gyro only** cannot measure X/Y, so path following is refused with that choice.

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

## Execution adapters

- **Implemented:** Pedro Pathing 3.0.2 core, compiled from the pinned source (`cf4be31`). Its 12 `System.nanoTime()` reads are redirected to the simulation clock, so pause and speed changes cannot wind up integrals or expire timeouts; the build checks that count.
- **Not implemented:** Road Runner, the FTC SDK (`OpMode`, `hardwareMap`), MotionModule's Python runtime, and a live robot pose overlay.

## How it is built

The window draws everything itself, with SVG in 2D and three.js in 3D, in the app's own style. Pedro Pathing and DSIM are used as engines, not as visuals.

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
- **`ui/sim-config.js`**: shared robot/sensor families and dimensions. The build applies a checked footprint adapter to DSIM for numeric intake reach; the pinned upstream clone is unchanged. Offline dimensions replace game competition clamps before physics starts.
- **`ui/sim-field-art.js`**: original 2D/3D field drawing from measured physics geometry; no upstream scene, texture or UI is copied.
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
- `ui/vendor/` (`planning.js/.cjs`, `three-view.js`, `licenses/`)
- `sim-runtime/` (`dsim-host.cjs`, `occt/`, `pedro/`, `java/`, `manifest.json` with SHA-256 hashes)

The two prepared CAD assets are tracked as compressed GLBs in `ui/assets/robots/` so installed operation needs no download or CAD conversion. `catalog.json` and `NOTICES.md` record their sources, orientation and hashes. Original STEP files stay in `.cache/simulation-cad/`. The optional local preparation tools use native Open CASCADE through `cadquery-ocp-novtk==7.9.3.1.1` to handle these large assemblies, followed by `finish-robot.mjs` with `meshoptimizer@0.25.0`. The ordinary runtime build does not require Python or those preparation dependencies. User STEP imports still use the bundled OpenCascade WASM reader and merge to one body.

`tools/simulation/stubs/discordActivity.ts` keeps DSIM's online-only modules out of the physics bundle.

To install into this laptop's driver station (it backs up first, closes only this app, and keeps user data):

```bash
powershell -File tools/simulation/install-local.ps1
```

## Licenses

- **DSIM** is **PolyForm Noncommercial 1.0.0**, not open source. It is used here for personal, noncommercial physics only. Its `LICENSE` and `NOTICE` (Required Notice: Copyright 2026 Dohun Kim) are in `ui/vendor/licenses/`. Do not redistribute these bundles commercially or relicense them.
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
  - gyro-only refusal, test drives, DECODE and BIOBUZZ 3D;
  - STEP merging and the clock patch.
- `sim-robot-model.test.cjs`: model orientation.
- `sim-practice.test.cjs`: phase timing, controller arming and stale input, sensor-free teleop, large-field walls and tank limits.
- `sim-assets.test.cjs`: curated CAD hashes, drive-wheel groups and grounded swerve orientation.

The native test is `tests/simulation-ui.cjs`. It needs `DECK_PLAYWRIGHT` and `DECK_ELECTRON`, and uses an isolated temporary data directory.

## Known limits

- **Planar physics:** DECODE and the empty field are planar; drawing them in 3D does not make their physics 3D.
- **BIOBUZZ planning:** it uses the floor-level obstacles (hive legs, flower bases). Overhead structures are drawn in 3D but not planned around.
- **Heading:** routes keep the starting heading; turning while driving is not planned (your own programs may turn).
- **Tank autonomous:** fixed-heading routes must run straight along the robot's heading; lateral or turning routes are refused. Tank teleop supports forward/reverse and turning. Holonomic families support the existing full route planner.
- **Practice scope:** driving and autonomous timing only. No game elements, mechanisms, scoring, refereeing, opponent robots or complete FTC match logic. The timer is configurable practice behavior, not an FTC SDK runtime.
- **Models:** bundled CAD is simplified for rendering. Wheel/pod animation is visual kinematics, not articulated contact physics. User CAD stays one rigid body; very large or unsupported STEP assemblies can exceed the runtime importer's limits.
- **Shapes:** a shape whose outline crosses itself is treated as its whole outer hull, to stay on the safe side.
- **Find fastest route:** it compares the shapes it generates. It is not a global time-optimal planner.
- **Platform:** the bundled runtime is for Windows x64. Linux and macOS packaging of the simulator has not been done.
- **Live robot overlay:** this still needs a robot-published pose contract. MotionModule's `GET /api/drive/telemetry` exposes IMU yaw/rate, not X/Y.
