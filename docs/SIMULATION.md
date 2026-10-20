# Simulation view

Open **⋮ → Simulation**. Everything runs offline inside the driver station app on this computer. No robot is contacted, nothing needs a subscription or an online service, and live robot controls stay isolated. Entering Simulation closes the connected robot through the existing disconnect/FTC STOP path, and robot auto-open is suppressed while the view is open.

## What it does

| Area | Implemented |
|---|---|
| Fields | Empty 144 in field, DECODE and BIOBUZZ, using DSIM's own field models, colliders and 2D renderers |
| Physics | DSIM's drive model and Rapier solver. DECODE and the empty field are **planar (2D)**. BIOBUZZ uses DSIM's **Rapier 3D** world |
| Start pose | Place by cursor, touch, keyboard or numbers. Default is against the left wall. Checked against the walls and DSIM field elements |
| Driving | **Drive** tool: W A S D or arrows to move, Q / E to turn, Shift for precision, F to toggle field-centric. Controller 1 also drives, with its saved assignment and deadzone |
| No-go zones | Draw, select, move, rotate, edit and delete rectangles, circles and triangles. Contact with a zone is reported live and in the run result |
| Waypoints | Ordered pins, with reorder and remove |
| Planning | Footprint-aware visibility-graph route (Clipper union + Dijkstra) in a Web Worker. Corners are rounded with collision-checked tangent Béziers, then the whole path is swept by the full footprint |
| Autonomous | **Pedro Pathing 3.0.2** (genuine `Follower`, `Foresight`, `Paths`) in a Java process, in lockstep with the physics clock: the planned route, or your own Java program |
| Controls | Play/Pause, Stop (kills the program, zeroes the drive, ignores late replies), Reset (fresh world at the start pose), 0.25×–4× speed |
| Telemetry | Simulation time, ground truth, the localizer estimate and its error, Pedro mode/path/remaining distance, drive command, zone contact, and program telemetry/output |
| Views | 2D (DSIM renderers plus an overlay). 3D Deck scene: on BIOBUZZ it uses DSIM's CAD field, elements and robot. 3D DSIM scene: DSIM's own BIOBUZZ renderer |
| Projects | Autosaved on this device; **Save/Open project…** writes a JSON file, with any imported model embedded |
| Robot model | Import `.glb`, `.gltf`, `.stl` or `.obj` with an explicit scale (inches per model unit), rotation and lift. **Visual only**: collisions and planning always use the footprint |

## Running a simulation

1. ⋮ → **Simulation**. Choose a field at the top right.
2. **Setup**: place the starting pose (click the field, or type X, Y, heading).
3. **Robot**: set drivetrain (mecanum or swerve), size, intake, mass and RPM. The panel shows the collision footprint DSIM applied, including the intake extension.
4. Draw zones with **Rect / Circle / Triangle**, then add pins with **Pin**.
5. **Plan** → **Plan route**.
6. **Run** → **Planned route** → **Run with Pedro Pathing**. Or choose **Java program**, edit or open a `.java` file, and run it.
7. Use **Pause**, **Stop**, **Reset** and the speed menu as needed. Switch **2D / 3D** at the top.

## Coordinates

Inches, bottom-left origin, +X right, +Y up, heading counter-clockwise from +X (0° right, 90° up). This matches Pedro's field frame. DSIM is centred, so `app = DSIM + 72` on both axes, and headings are identical. BIOBUZZ's walls are 70.674 in from the centre (CAD inner face), so its usable field is 141.35 in.

## Simulated robot vs. real robot

The Robot tab describes the **simulated** drivetrain and sensors only. It has no hardware ports, GPIO, encoder names, calibration or real localizer settings, and the driver station never writes those to a robot. REV Control Hub and MotionModule configuration and localization stay on the robot.

- **Ground truth** is DSIM's physics state.
- **Estimate** is what a Pedro `Localizer` reports when fed simulated sensors: odometry pods + IMU, drive encoders + IMU, or ideal. Odometry noise, scale error and gyro drift are configurable and seeded, and the estimate is shown separately from the truth.
- **Gyro only** cannot measure X/Y. The simulator refuses path following with that choice.

The Pedro profile (max speeds, braking and coasting constants) is **measured from DSIM's drive model** when the robot loads: free-speed and brake tests at two speeds per axis, like Pedro's tuning OpModes. The feedback gains (translational P 0.5, heading P 1.6, path speed 0.6) were chosen by sweeping runs on that model, giving ~1 in tracking deviation. They are **not** values for your robot. Pedro's 100 ms default hold timeout is not a settling test, so the simulated profile uses 2 s, and the built-in route program also waits for the estimate to settle.

## Your own autonomous code

Programs implement `deck.sim.DeckAutonomous` (`init` once, `loop` every 1/60 s of simulation time, like an iterative OpMode) and use the real Pedro API:

```java
import com.pedropathing.api.Paths;
import com.pedropathing.math.Pose;
import deck.sim.DeckAutonomous;
import deck.sim.SimRobot;

public class MyAuto implements DeckAutonomous {
    public void init(SimRobot robot) {
        robot.follower().setPose(robot.startPose());
        robot.follower().follow(Paths.line(robot.startPose(), new Pose(72, 72, 0)).constant(0));
    }
    public void loop(SimRobot robot) {
        robot.follower().update();
        if (!robot.follower().isBusy()) robot.finish();
    }
}
```

`SimRobot` provides `follower()`, `foresight()`, `startPose()`, `plannedRoute()` (the planner's route as a Pedro path), `pins()`, `time()`, `telemetry(key, value)`, `near(...)` and `finish()`.

Errors stay readable and contained:
- Compile errors show file and line.
- Exceptions in `init`/`loop` show the stack frames from your class.
- A `loop()` that does not return within 0.75 s (5 s during warm-up) is stopped, and its Java process is killed.
- `System.out`/`System.err` go to **Program output** and cannot corrupt the bridge protocol.

**What transfers to a robot:** the Pedro path and follower logic (`Paths`, `follow`, `update`, `isBusy`, poses in the same frame). **What does not:** `deck.sim.*` itself. On a robot you need an OpMode adapter that builds the `Follower` from the robot's real drivetrain (e.g. Pedro's revhub `Mecanum`) and localizer (e.g. Pinpoint), with tuned constants. MotionModule's Python runtime has no Pedro integration yet.

## Execution adapters

- **Implemented:** Pedro Pathing 3.0.2 core, compiled from the pinned source (`cf4be31`). Its 12 `System.nanoTime()` reads (PID timing, Foresight hold timeout, `Follower.update()`, `FusionLocalizer`) are redirected to a simulation clock, so pause and speed changes cannot wind up integrals or expire timeouts. The build verifies that count and that no wall-clock read remains.
- **Not implemented:** Road Runner, the FTC SDK (`OpMode`, `hardwareMap`), MotionModule's Python runtime, and live robot pose overlay. DSIM's own path feature is not used: it teleports the chassis, and BIOBUZZ does not run it.

## Architecture

- `ui/simulation.js`: the view. `ui/sim-planner.js` + `ui/simulation-worker.js`: planning. `ui/sim-3d.js`: 3D.
- `src/sim-bridge.cjs` (main process):
  - starts the simulation **utility process** when Simulation opens, and kills it when the view closes, the window's renderer dies, or the app quits;
  - relays messages;
  - merges keyboard and controller-1 driving;
  - serves only `ui/vendor/dsim/**` on the read-only `deck-asset://dsim/` scheme;
  - runs the file dialogs.
- `src/sim-host.cjs` → `src/sim-engine.cjs`: DSIM physics at a fixed 60 Hz step, simulated sensors, and the Pedro Java process. Messages are NDJSON, one line each, capped at 1 MiB per line. Each run has a sequence number, so replies from a stopped run are discarded. The Java process exits when its stdin closes, so it cannot outlive the host.
- CSP adds `'wasm-unsafe-eval'` (meshopt decoder), `worker-src 'self'`, `blob:`/`data:` for model textures, and `deck-asset:` for DSIM models. Nothing else is fetched; DSIM's online HDRIs are disabled (see below).

## Building the simulator runtime

Generated files are git-ignored and rebuilt reproducibly from pinned inputs under `.cache`:

```bash
node tools/simulation/build.cjs
```

Inputs (the build checks every one):
- **DSIM** `0df84143…` (clean clone)
- **Pedro** `cf4be314…` (clean clone)
- **npm packages:** esbuild 0.25.12, @dimforge/rapier2d-compat 0.19.3, @dimforge/rapier3d-deterministic-compat 0.20.0, three 0.186.0, clipper-lib 6.4.2, dijkstrajs 1.0.3
- **Java:** Temurin JDK 21.0.12.1 reduced runtime (with `jdk.compiler`) and Gson 2.11.0

Outputs:
- `ui/vendor/` (`planning.js/.cjs`, `dsim-view.js`, DSIM BIOBUZZ models, `licenses/`)
- `sim-runtime/` (`dsim-host.cjs`, `pedro/classes`, `gson.jar`, `java/`, `manifest.json` with SHA-256 of every bundle)

`tools/simulation/stubs/discordActivity.ts` replaces one DSIM module so DSIM's environment code takes its offline fallback. Without it, the bundle would pull in DSIM's Discord, authentication and multiplayer code.

## Licenses

- **DSIM** is **PolyForm Noncommercial 1.0.0**, not open source. It is used here for personal, noncommercial use only. Its `LICENSE`, `NOTICE` (Required Notice: Copyright 2026 Dohun Kim) and field-model README are copied to `ui/vendor/licenses/`. DSIM's BIOBUZZ CAD meshes derive from FIRST's field STEP; see `DSIM-FIELD-MODELS.md` for their terms. Do not redistribute these bundles commercially or relicense them.
- **Pedro Pathing** is BSD-3-Clause (`PEDRO-LICENSE`).
- **three.js** is MIT.
- **Rapier** is Apache-2.0.
- **Clipper** is Boost 1.0.
- **dijkstrajs** is MIT.
- **Gson** is Apache-2.0.
- **Temurin** is GPLv2 with Classpath Exception; its notices are in `sim-runtime/java/legal`.

## Tests

```bash
node --test tests/*.test.cjs
```

That command includes `sim-planner.test.cjs` and `sim-engine.test.cjs`. `sim-planner.test.cjs` covers:
- geometry, narrow passages and blocked routes
- the asymmetric footprint at walls
- smoothing safety
- a regression for Clipper-rounded boundary vertices
- a grid-search completeness oracle

`sim-engine.test.cjs` covers:
- physics motion, and a Pedro run around a zone
- Stop with stale replies discarded
- user programs, compile and runtime errors, and infinite-loop timeouts
- gyro-only refusal, pause and reset
- DECODE and BIOBUZZ 3D
- the clock patch

The native app test is `tests/simulation-ui.cjs`. It needs `DECK_PLAYWRIGHT` and `DECK_ELECTRON`, and uses an isolated temporary data directory.

## Known limits

- DECODE and the empty field are planar. Perspective drawing does not make them 3D.
- BIOBUZZ planning uses DSIM's planar robot obstacles (walls, A-frame legs, flower feet). Taller 3D structures the robot drives under are not planning obstacles.
- The route keeps the starting heading. Turning-in-place routes are not planned, though user programs may turn.
- Game mechanisms (intakes, launchers, scoring) are not driven by the simulator's programs.
- The bundled Java runtime and build are for Windows x64. Linux and macOS packaging of the simulator runtime has not been done.
- The live robot pose overlay still needs a robot-published pose contract. MotionModule's `GET /api/drive/telemetry` currently exposes IMU yaw/rate, not X/Y.
