# Simulation view

Open **⋮ → Simulation**. This is an offline **path-planning** tool that runs inside the driver station app on this computer. It does not contact a robot or any online service, and live robot controls stay isolated. Entering Simulation closes the connected robot through the existing disconnect/FTC STOP path, and robot auto-open is suppressed while the view is open.

It is not a game simulator. There are no game pieces, intakes or scoring. You plan a route around no-go zones and the field's structure, add pauses where your mechanisms will run, check the route by driving it with a real path follower through physics, and export it for your robot code.

## Using it

The right-hand panel has three tabs.

### Setup

- **Field.** Choose a saved field: an empty field, DECODE or BIOBUZZ. Keep as many as you like (for example "Empty field 1", "Empty field 2", each with its own zones and pins). Use ✎ to rename a field and × to delete it.
  - Empty fields contain only your own zones.
  - On DECODE and BIOBUZZ, routes automatically avoid the game's own structures, shown in grey (DECODE goals and ramps; BIOBUZZ hive legs and flower bases).
- **Starting pose.** X, Y and heading in inches and degrees. You can also use **Place on field** or **Start at edge**. A new field starts at the nearest clear spot to the left wall.
- **Robot.** Drivetrain (mecanum or swerve), front intake, length and width. The panel shows the exact collision footprint that every route keeps clear.
- **Your robot.** Drop your robot's **STEP** file (or GLB, STL, OBJ) onto the box, or use **Choose file…**.
  - **One body.** Every part of the assembly is merged into one rigid body, with no joints or articulation. That keeps the app fast.
  - **Orientation.** Click a side of the view cube, then choose **This side is the front** or **This side is the top**. The model turns to match.
  - **Size.** **Use model size** copies its length and width into the robot settings.
  - **Where it shows.** Your model replaces the plain robot block in both 2D (seen from above) and 3D.
  - **Looks only.** The model is never used for collisions. Collisions and planning use the footprint settings, which you confirm.
- **More settings.** Mass, wheel RPM, position sensing (odometry pods, drive encoders, perfect, or gyro only), odometry noise, gyro drift, path speed and correction strength. These describe the simulated robot only.
- **Open project… / Save project…** writes everything, including the model, to one JSON file.

### Plan

1. **Mark where not to go.**
   - **Box**: drag corner to corner.
   - **Circle**: drag from the centre outwards.
   - **Triangle**: press where the base goes and drag. The tip follows your cursor, so it turns, flips and stretches as you move.
   - **Shape**: click corners. Two points make a wall line, three a triangle, and more make any outline, even a concave one. Click the first corner, double-click or press Enter to finish; Backspace removes the last corner.
   - **Change a zone**: click it with **Select**, then drag it, or drag its handle (box corner, circle edge, triangle tip, shape corners). Delete or right-click removes it.
2. **Drop pins in order** with **Pin**. Drag a pin to move it. In the list, give a pin a pause in seconds and a name for what happens there (for example "Intake · 1.5 s"). The robot stops at that pin, holds still for the pause, then continues.
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

### Run

- **Planned route**: the built-in program follows the route leg by leg with Pedro Pathing and pauses at each stop.
- **Java program**: write or open your own program (see below).

**Run**, the speed menu, and **Play / Stop / Reset** above the field control the simulation:
- **Stop** ends the program and zeroes the drive; replies that arrive late are discarded.
- **Reset** returns to the starting pose.

**Drive** lets you drive by hand: W A S D or the arrow keys, Q and E to turn, Shift to go slow, F for field-centric. Controller 1 also drives, using its saved assignment and deadzone.

The readout under the field shows simulation time, the robot's true position and speed, how far the sensor estimate is off, the current leg or pause, and whether a zone is being touched.

## Coordinates

Inches, bottom-left origin, +X right, +Y up, heading counter-clockwise from +X (0° right, 90° up). This is Pedro's field frame, so exported coordinates need no conversion.

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
  - manual driving input;
  - file dialogs and exports.
- **`src/sim-host.cjs` → `src/sim-engine.cjs`** runs in that process:
  - DSIM physics at a fixed 60 Hz step: DECODE and empty fields are planar, BIOBUZZ is Rapier 3D;
  - simulated sensors;
  - the headless test drives;
  - the Pedro Java process, over NDJSON lines capped at 1 MiB. Each run has a sequence number, so replies from a stopped run are discarded, and Java exits when its input closes.
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

The native test is `tests/simulation-ui.cjs`. It needs `DECK_PLAYWRIGHT` and `DECK_ELECTRON`, and uses an isolated temporary data directory.

## Known limits

- **Planar physics:** DECODE and the empty field are planar; drawing them in 3D does not make their physics 3D.
- **BIOBUZZ planning:** it uses the floor-level obstacles (hive legs, flower bases). Overhead structures are drawn in 3D but not planned around.
- **Heading:** routes keep the starting heading; turning while driving is not planned (your own programs may turn).
- **Shapes:** a shape whose outline crosses itself is treated as its whole outer hull, to stay on the safe side.
- **Find fastest route:** it compares the shapes it generates. It is not a global time-optimal planner.
- **Platform:** the bundled runtime is for Windows x64. Linux and macOS packaging of the simulator has not been done.
- **Live robot overlay:** this still needs a robot-published pose contract. MotionModule's `GET /api/drive/telemetry` exposes IMU yaw/rate, not X/Y.
