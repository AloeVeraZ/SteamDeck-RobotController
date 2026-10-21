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

Fields use DSIM's 2D field drawing and its BIOBUZZ renderer, including moving trays and live elements. Public releases contain no field or chassis CAD whose terms forbid redistribution: DECODE is shown as DSIM's drawing with its structures raised from the physics outlines, BIOBUZZ as DSIM's own constants-built field, and robots as their footprint (or your imported model). A personal local build can add the official FIRST DECODE field CAD, DSIM's BIOBUZZ CAD and the bundled chassis CAD; nothing else changes. The app keeps its own theme-aware controls.

1. **Mark where not to go.**
   - **Box**: drag corner to corner.
   - **Circle**: drag from the centre outwards.
   - **Triangle**: press where the base goes and drag. The tip follows your cursor, so it turns, flips and stretches as you move.
   - **Shape** (the default tool here): tap corners. The outline is drawn closed back to the first corner as you go, so three corners show a triangle, four a quadrilateral and so on. Two points make a wall line. Press **Enter** or **Finish shape** to confirm (tapping the first corner or double-clicking also works); **Undo corner**/Backspace removes the last corner and **Cancel**/Escape discards it.
   - **Change a zone**: click it with **Select**, then drag it, or drag its handle (box corner, circle edge, triangle tip, shape corners). Delete or right-click removes it. Zones are physical barriers as well as planning exclusions. Concave outlines are triangulated; wall lines are one inch thick; BIOBUZZ barriers are twelve inches tall.
2. **Drop pins in order** with **Pin**, or choose **Draw path** and drag the route on the field: the stroke is simplified into pins (starting near the end of the route extends it; elsewhere replaces it). The whole footprint must fit inside the field and outside physical structures/barriers; a pin tapped or drawn in a red area moves to the nearest clear spot, and a dragged pin slides along the edge instead of entering it. Give pins pauses and actions in the list, or open their settings (below).
3. **The route draws itself** whenever you change something. If a pin can't be reached safely, it turns red and the message says why.

#### Pins, paths and actions

The simulator plans and drives the **movement**. What the mechanisms do (intake, shooter, arm…) is your code; the simulator gives every action you name its own labeled slot in the exported code and shows where and when it runs.

**Right-click a pin or a path** (on a touchscreen, press and hold it), or press **⋯** in the pin list, to open its settings. Each path is named after the pin it leads to: *path to pin 2* runs from pin 1 to pin 2.

- **Regular path**: the robot only drives.
- **Action path** (dashed, in the action colour): the robot runs an action *while it drives*, such as intaking along the way or shooting while moving. Name the action and describe what the path does.
- **While driving** (holonomic drivetrains): **Keep heading**, **Turn to…** a heading by the end of the path, or **Spin** 1 to 10 full turns left or right. A turning or spinning path is planned for the robot's whole rotation circle, so it needs about the footprint's diagonal of clear width; the message says which pin's path has no room. ↻ and ↷ mark these paths on the field. Tank-style robots cannot rotate while driving; turn at a pin instead.
- **At a pin**: a **pause** (seconds), an **action** run there, a **turn in place** to a heading (the short line on the pin shows it), and a note. The robot stops at a pin with any of these: it turns first, then runs the action, and leaves once the action is done and the pause is over. Set the pause to how long the action takes on the real robot; in the simulator the pause stands in for it.

The same action name at several pins or paths runs the same code. The run readout shows the action path being driven and the pin action and pause.

**Route shape** can be **Smooth curves** (cubic splines through the waypoints, the default), **Rounded corners** or **Straight lines**. Curves never come closer than half of **Space around zones**; where a curve would, that corner tightens, down to a straight line if needed. Pins with a pause, and places where the route doubles back, are full stops.

Tank/differential/tracked robots use **Straight lines** with a stop and chassis turn at each corner. Planning checks the full rotation and translation sweeps against walls and obstacles. With odometry, Pedro holds the new heading until it stays within 1.5° for 0.15 s with an average rotation below 0.08 rad/s (averaged so sensor noise cannot stall the turn), then follows the next leg. IMU-only runs turn from measured heading, then drive by time. RPM, footprint, mass and current budget affect physical turn time, which counts toward autonomous time. Reverse travel avoids unnecessary 180° turns. Tank Java exports carry per-leg headings and instructions to turn before following; `.pp` adds `stopAndTurn`, which external consumers must handle explicitly.

**Turning** (holonomic drivetrains): with **Turn to fit** (the default) the planner may turn the robot in place to slip past an obstacle, for example sideways through a gap narrower than its length, or to put a short side against a wall. Each of eight headings (45° apart) gets its own map of obstacles grown by the footprint at that heading; turning-in-place links connect the maps at the start, the pins and a coarse grid of turning spots wherever the whole rotating footprint plus clearance clears every degree of the turn. One shortest-path search weighs driving distance against turning (the distance the footprint's farthest corner sweeps) and chooses which way around to go. It only runs when the fixed-heading route is missing or detours by more than 8%; otherwise the route keeps its heading and chosen shape. Turning routes use straight legs; dashed outlines mark turns. **Keep heading** restores the fixed-heading planner.

**Tank/differential/tracks** can only drive along their heading or turn in place. When the direct conversion has no room to turn, a lattice search over 2-inch drive and reverse moves and 22.5° turns finds where to back out and line up (each expansion also tries turning to face the pin and driving straight there), then the result is straightened into the fewest stop-and-turn legs.

**Stall recovery:** if Pedro's robot barely moves (under 1.5 in/s for 0.8 s) more than 3 in from the end of a leg, it backs out to where it was about a second earlier, straightens up and resumes the leg. After three tries on one leg the run stops with "stuck near (x, y)"; increase **Space around zones** or move the pins. This is runtime recovery only; it does not replan around unknown obstacles.

**Find fastest route** test-drives the generated shapes headlessly through physics using the selected controller: Pedro with odometry, timed power + IMU without position sensing. It keeps the fastest clean candidate that reaches the last pin and lists times. Poorly calibrated timed driving may have no qualifying candidate.

**Export the route**:
- **Pedro Java…**, for FTC with odometry, writes a class (default `PlannedRoute`) with:
  - `START` and `HEADING`;
  - `legs()`, the route split where the robot stops (pins with a pause, an action or a turn), where an action path starts or ends, and where a turning route turns in place. Paths the robot turns or spins along use a heading interpolator that may span whole turns;
  - per leg: `START_HEADING` (face it first), `MOVING_ACTIONS` (action paths), `TURN_AFTER` (turn at the pin, `NaN` for none), `ACTIONS` and `WAIT_SECONDS` (the pin's action and pause), `PATH` and `PIN`;
  - a comment describing every leg, with your notes;
  - `NO_GO_ZONES` as polygons.

  It uses the Pedro Pathing 3.x API and is checked by compiling it against Pedro's real classes.
- **Control Hub TeamCode…**, for an FTC mecanum or tank-style setup (tank, two-wheel differential, 6- and 8-wheel, tracks) with position sensing, writes everything a Control Hub needs under the folder you pick (normally `TeamCode/src/main/java`):
  - `PlannedRoute.java` (the route, as above);
  - `PlannedRouteAuto.java`, an `@Autonomous` `LinearOpMode` that, for each leg, turns in place first where the plan changes heading, follows the leg (calling the action path's action every loop while it drives), settles, turns if the pin asks, then runs the pin's action until it reports done and its pause is over;
  - `RouteActions.java`, the **action slots**: one method per action you named, documented with where it runs. Export rewrites this file;
  - `RobotActions.java`, **your mechanism code**: it extends `RouteActions` with a method stub per action. It is written only when it does not exist yet, so your code is never overwritten. Each method is called every loop with a `Step` (`elapsed`, `first`, `last`, `moving`, `pin`, `pose`) and returns `true` when finished; an action path's action gets a final call with `step.last` when the path ends. `init` and `stop` set up and stop the mechanisms. After adding or renaming an action, copy its method from `RouteActions.java`;
  - `pedro/Constants.java` with `Constants.create(hardwareMap)` in the form Pedro 3's AutoTune generates: `MecanumConfig` (motor names `front_left`, `front_right`, `back_left`, `back_right`; left side REVERSE) or, for tank-style robots, `LEFT_MOTORS`/`RIGHT_MOTORS` (the same four names, or `left_drive`/`right_drive` for a two-wheel differential), the localizer for the setup (`TwoWheelLocalizer`, `ThreeWheelIMULocalizer`, `PinpointLocalizer` or `OTOSLocalizer`) and a `ForesightConfig` measured on the simulated robot;
  - `pedro/TankDrive.java` for tank-style robots, because Pedro 3 ships only mecanum and swerve drivetrains: it mixes and saturates like Pedro's `Mecanum`, without strafe;
  - `pedro/DriveEncoderLocalizer.java` (mecanum) or `pedro/TankEncoderLocalizer.java` for drive-encoder setups, because Pedro 3 ships no drive-encoder localizer.

  Hardware names, pod offsets and Foresight numbers are the simulated robot's. Rename to your configuration and run Pedro AutoTune on the real robot before competing. Every export is compiled and run on the virtual Control Hub (below).
- **MotionModule autonomous.py…**, for a MotionModule setup, writes an `autonomous.py` for MotionModule's runtime: `create_autonomous(module, drive)` returning a routine with `run(stop)`, the route as a timed `PLAN` of `("drive", forward, strafe, seconds[, action])`, `("turn", degrees)`, `("hold", seconds)`, `("action", name, seconds)`, `("aim", degrees)` and `("glide", x, y, seconds, degrees[, action])` steps, MotionModule's own `TurnPID`/`Settle`/`HeadingController` with its example's approach and overshoot-correction turn, its confirmed `MecanumTestDrive` mixer and `IMU_TO_MIXER_SIGN = -1`, like its Mecanum autonomous example. Turning or spinning while driving uses `glide` steps: the robot holds a direction on the field from the IMU heading whatever way it faces, and each step lasts until its planned travel is done, because turning takes wheel power from driving. Your mechanism code goes in `robot_actions.py` beside it: the export creates that file once (never overwriting it) with a function per action; `autonomous.py` calls them with a `step` (`elapsed`, `first`, `last`, `moving`, `module`). It is run on MotionModule's real runtime by the virtual MotionModule.
- **Timed commands…**, for either controller with IMU-only sensing, writes JSON with powers, durations, pauses and heading settings. Tank schedules include IMU-settled turns with a 30-second failure timeout; total duration is null because turn completion depends on measured heading. There is no X/Y feedback.
- **Path file (.pp)…** writes the start point, lines, Bézier control points, `waitAfterMs`/`waitAfterName` on each stop, `turnAfterDegrees` for pin turns, `actionPath`/`actionName` on action-path lines and `linear` headings for paths the robot turns or spins along. Zones are included as polygon `shapes`; that part has not been checked against Pedro's visualizer.
- **Keep the exported file updated** rewrites the file you picked every time this field's route changes. The app can only write to a file you chose in a save dialog.

### Run & review

Choose **Autonomous**, **Teleop**, or **Full match**. These share the selected setup and field; teleop is separate from the autonomous editor.

- **Autonomous** runs the planned route or Java program, with controller driving disabled.
- **Teleop** starts at the saved pose and enables Controller 1 for driving practice. It needs no localization sensors. Left stick moves, right stick turns, and left bumper slows down; the app's saved controller assignment, input source and deadzone apply.
- **Full match** runs autonomous, holds during transition, then enables teleop at the robot's ending pose. The defaults are **30 s autonomous, 8 s transition, 120 s teleop**, from the [FIRST competition manual](https://ftc-resources.firstinspires.org/ftc/archive/2026/game/cm-html/DECODE_Competition_Manual_TU32.htm). Each period can be customized (transition may be zero). Early autonomous completion holds until its period ends; expiry kills an overlong program. Timers use simulation time, so Pause and speed changes apply to the whole sequence.
- Controller input is rejected during autonomous and transition. On entering teleop, resuming, reconnecting or losing fresh input for 0.5 s, the sticks must return to neutral before driving. Stop/Reset and leaving Simulation cancel the whole sequence. The countdown shows the current phase and whether controls are locked.

- **Planned route**: follows with Pedro and odometry, or executes timed power + IMU without position sensing, including pauses.
- **Control Hub export**: generates the Control Hub TeamCode for the planned route and runs it on the virtual Control Hub. The readout adds the OpMode's own telemetry, as a Driver Station shows it.
- **Java program**: write or open your own program (see below). It requires an FTC odometry profile.

**Run**, the speed menu, and **Play / Stop / Reset** above the field control the simulation:
- **Stop** ends the program and zeroes the drive; replies that arrive late are discarded.
- **Reset** returns to the starting pose and restores game pieces.

There is no manual Drive tool in autonomous planning. Arrow keys there are for placement/editing. Driving becomes available only after explicitly starting a teleop practice phase; real robot outputs remain paused throughout Simulation.

The readout shows simulation time, true position/speed, the current leg/pause and zone contact. Odometry runs show sensor-estimate error. IMU-only runs show timed execution and final miss, without a position estimate. Loose pieces move through DSIM physics and can be pushed by the rectangular chassis.

## Games and robots

**Every FTC season.** A custom field (**New field…**, any size) with your own obstacles drawn as boxes, circles, triangles, shapes and walls covers any game: draw that season's structures as no-go zones, place the start and plan. DECODE (2025–26) and BIOBUZZ (DSIM's 2026–27 game) also come with their structures and loose pieces as physics. Exports use the FTC SDK's Android Robot Controller API (`LinearOpMode`, `HardwareMap`, `DcMotorEx`, `IMU`), which teams have used since the 2015–16 season; the Control Hub files target SDK 12.0 and Pedro Pathing 3, and the route maths (inches, field frame, headings) is the same for any season. Seasons before 2015 ran LEGO NXT/Samantha with RobotC and are not a target.

**Robot types.** Mecanum, swerve (coaxial, differential), X-drive, Kiwi, H-drive, butterfly, tank (4, 6 and 8 wheels), two-wheel differential and tracks are simulated with their own kinematics, any size, mass, motor RPM (50–6000) and current budget. Holonomic robots can turn to fit, turn and spin while driving; tank-style robots drive straight legs and turn in place. Complete Control Hub TeamCode is exported for mecanum and tank-style robots; every drivetrain can export the route as Pedro Java (`PlannedRoute`) and `.pp` for its own drive code, and IMU-only robots export timed commands. MotionModule exports target its mecanum mixer.

## Coordinates

Inches, bottom-left origin, +X right, +Y up, heading counter-clockwise from +X (0° right, 90° up). Standard game layouts use Pedro's field frame. Custom fields keep their actual coordinates and dimensions; they are not rescaled to 0–144 for export.

## Simulated robot vs. real robot

Robot settings describe the **simulated** drivetrain and sensors only. There are no hardware ports, GPIO, encoder names or real localizer configuration, and nothing is written to a robot. Timed-driving calibration describes the simulation. REV Control Hub and MotionModule firmware configuration stays on the robot.

- **True position** is the physics state.
- **Estimate** is what a Pedro `Localizer` reports when fed simulated sensors. Noise, scale error and drift are configurable and seeded.
- **IMU only** cannot measure X/Y. Its planned route uses timed power with heading correction and no positional recovery; Java/Pedro follower programs are refused.

The follower's speed and braking constants are **measured from the physics drive model** each time the robot changes, with the procedures of Pedro's AutoTune (`ForesightTuner`): top speed; natural deceleration as a coast-down with the motors in FLOAT; braking distance against speed under near-zero driven power. The drive model matches a tuned DECODE mecanum robot's AutoTune results: it coasts at about 84 in/s² forward and 69 in/s² strafing, brakes from 60 in/s in about 12 in (real robot: 13), and a stopped chassis does not creep under less than about 4% power. Pedro's autonomous `drive(…, false)` runs FLOAT, so unpowered wheels coast; `stop()` brakes.

The feedback gains use the structure AutoTune generates: piecewise translational kP (0.39 beyond 2.5 in of error, 0.13 within), heading kP 6, scaled down for robots faster than the 312 RPM reference chassis they were tuned on (a 500 RPM robot gets 0.64× translational and 0.60× heading). A sweep of four routes chose them, and they are also that real robot's AutoTune values. Path speed defaults to 60% of top speed, capped near 45 in/s so fast robots track tight corners within about 2 in. None of these are values for your robot. Pedro's 100 ms default hold timeout is not a settling test, so the simulated profile uses 2 s, and the route program also waits for the robot to settle. Run results are recorded once the robot has come to rest.

**Timed driving calibration.** **Use simulated robot's values** drives the simulated robot for 1 s and 2 s at the drive power on an empty field, fits distance = speed × time + offset, and fills in speed at full power plus start or stop compensation (forward and strafe). It is the floor test a team runs on a real robot; repeat it there.

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

**Transfers to a robot:** the route (via the Java export or `.pp`), and Pedro follower logic in the same field frame. **Does not transfer:** `deck.sim.*`. For a complete Control Hub autonomous, use **Control Hub TeamCode…** instead; for MotionModule, **MotionModule autonomous.py…**.

## Virtual Control Hub and virtual MotionModule

These run the exported files themselves, not the simulator's own route program, so a mistake in an export shows up here first.

**Virtual Control Hub** (bundled). The TeamCode files are compiled in the simulator's Java runtime against:
- stand-ins for the FTC SDK 12.0 classes they use (`LinearOpMode`, `HardwareMap`, `DcMotorEx`, `IMU`, `RevHubOrientationOnRobot`, `GoBildaPinpointDriver`, `SparkFunOTOS`, `Telemetry`, `ElapsedTime`…), with the SDK's names and signatures;
- Pedro Pathing's real FTC adapter (`com.pedropathing.revhub`: `Mecanum`, the two-wheel, three-wheel and IMU localizers, Pinpoint and OTOS), compiled from the same pinned source with the same clock patch.

The OpMode runs in lockstep with physics: each `opModeIsActive()`, `idle()` or `sleep()` waits for the next 1/60 s tick. Drive motors (four mecanum, or two or four tank) report goBILDA-style encoder counts (28 per motor revolution × gearing, 104 mm wheels); left motors are mirrored, and REVERSE flips power and encoder as on the real SDK. Odometry pods, Pinpoint, OTOS and the Control Hub IMU are fed from the simulated sensors (with their noise and drift). Motor powers become chassis motion through mecanum or tank kinematics, coasting where the motors are in FLOAT. In the simulator the generated `RobotActions` stubs stand in for your mechanism code (each action finishes at once, so the pin's pause sets its time). A wrong motor direction, an `int` where Pedro wants a `Double`, or a missing class fails here as it would on a robot. Not emulated: OctoQuad, servo-steered swerve and `setVelocity`.

**Checked against the real FTC SDK.** `node tools/simulation/check-ftc-sdk.cjs` downloads FTC SDK 12.0.0 `RobotCore` and `Hardware` from Maven Central into a temporary folder, verifies their SHA-1, compiles Pedro's `revhub` and a Control Hub export for every localizer, a turning route, a route with action paths, spins and pin turns, and tank, differential and tracked robots against them with all lint warnings enabled, and checks that every public member the stand-ins declare exists in the real SDK. It then deletes the download; the SDK is a reference only and is never bundled. Last result (21 October 2026): all eleven exports compile with no warnings, and all 226 stand-in members match (5 are inherited from `OpModeInternal` in the real SDK).

**Virtual MotionModule** (development check). `tools/simulation/motionmodule-bridge.py` loads the exported `autonomous.py` with MotionModule's own `load_autonomous()` and runs it on MotionModule's real controller with `MockGPIO` (no hardware is opened) and its confirmed mixer. Only the clock (`time.monotonic`/`time.sleep` follow simulation time), the built-in IMU (degrees, counter-clockwise) and the chassis are simulated; channels 1–4 drive the chassis through the inverse of the confirmed mixer, including its clockwise-positive rotation. It needs Python 3 and the MotionModule source (`DECK_PYTHON`, `DECK_MOTIONMODULE_SOURCE`), so the installed app does not offer it; the tests run it.

**Example setups.** `examples/simulation-setups/` holds **Control Hub mecanum 17x17** (drive encoders + built-in IMU) and **MotionModule mecanum 17x17** (IMU only, timed driving calibrated on the simulated robot): mecanum, 17 × 17 × 5 in, 500 RPM, with a practice route. Open them with **Open setup file…**. On their practice route the exported code and the simulation agree:

| Setup | Simulation | Exported code on the virtual device |
|---|---|---|
| Control Hub (target 110, 110) | 108.53, 109.18 in 6.83 s | virtual Control Hub: 108.50, 109.02 in 6.90 s |
| MotionModule (target 110, 110) | 109.42, 110.15 in 5.17 s | virtual MotionModule: 110.13, 109.69 in 5.20 s |

## Research behind these changes

Reviewed the pinned Pedro follower/Foresight/localizer source and DSIM drivetrain/motor model, then rebuilt both locally. Commands advance through physics at 60 Hz. The extended RPM range required longer free-speed/braking measurements and a guard against degenerate fits. Fitted linear braking terms keep a 1 ms floor: Foresight's braking quadratic divides 0/0 at a path end when that term is exactly zero. Calibration is cached per drivetrain, geometry, mass, RPM and current budget.

These are references, not additional execution engines:
- [Road Runner actions](https://rr.brott.dev/docs/v1-0/actions/): separate interruptible driving, turning and waiting stages informed the tank turn/drive sequence.
- [PathPlanner trajectory source](https://github.com/FTC-SigmaCorns-22377/pathplanner-ftc/blob/main/lib/services/generator/trajectory.dart): curvature limits, acceleration passes and accumulated time. Our optimizer measures physics time, including turns and pauses. Per-pin speed overrides are not implemented here.
- [Stampede](https://github.com/robovines6955/Stampede): target positions/orientations, sensor selection and heading correction reinforce separating IMU-only timing from odometry feedback. No AprilTag processing is added.
- [Virtual Robot](https://github.com/Beta8397/virtual_robot): robot/sensor configurations and physical versus simpler kinematic models. Our setup labels drivetrain-family and sensor-error approximations.

No performance or accuracy superiority over these projects has been established. Tests verify this app's behavior and regressions; real robots still need hardware-specific configuration and tuning.

### Comparison with real team code (October 2026)

Sources: the [Pedro 3 quickstart](https://github.com/Pedro-Pathing/Quickstart) (FTC SDK 12.0.0, `pedropathing:revhub` 3.0.1) and its AutoTune procedures (`ForesightTuner`, `MecanumTuner`, `TwoWheelTuner`); a DECODE team's Pedro 3 project with tuned constants ([TechonVS/pedro3testing](https://github.com/TechonVS/pedro3testing)); the [Road Runner quickstart](https://github.com/acmerobotics/road-runner-quickstart) `MecanumDrive`; [Virtual Robot](https://github.com/Beta8397/virtual_robot), which runs team OpModes on an SDK approximation with Pedro 3 and Road Runner 1.0; and MotionModule's own Mecanum autonomous example. Teams build the follower in `Constants.create(hardwareMap)`, write autonomous as a `LinearOpMode` that calls `follower.update()` every loop, and replace the starting constants with AutoTune results.

Discrepancies found by running the simulator against those sources, and what changed:

| Found | Change |
|---|---|
| Zero power always braked (DSIM's driver-friendly brake): natural deceleration measured 460–1,935 in/s² against a real robot's 84 | FLOAT coasting at the measured rate; natural deceleration is now measured as a FLOAT coast-down, as AutoTune does |
| Powered braking about 12× stronger than the real robot's | Speed-dependent braking derived from the real robot's braking-distance fit |
| No static friction: a holding robot crept under every 1% correction | Breakaway at about 4% power |
| Single PID gain and coast proportional to the target, unlike AutoTune's generated config | AutoTune's controller structure; the sweep's best gains equal the real robot's |
| Linear braking term fitted to exactly 0 made Foresight divide 0/0 | 1 ms floor (earlier fix) |
| The simulator ran only its own route program; Virtual Robot runs real OpModes | Virtual Control Hub running the exported TeamCode with Pedro's real `revhub` |
| Pedro 3 has no drive-encoder localizer, yet "drive encoders + IMU" is the FTC default here | Exports include a `DriveEncoderLocalizer` |
| The MotionModule export was a JSON schedule its runtime cannot load | A real `autonomous.py`, run on MotionModule's runtime |
| Results were recorded while a timed robot was still rolling | Results are recorded at rest; timed driving gained stop compensation and floor-style calibration |
| A pause at a pin counted from the end of the path, not from the robot stopping | Counted from the stop (bounded at 3 s) |

Not adopted: Road Runner's motion profiles and kS/kV/kA feedforward (Pedro remains the follower) and PathPlanner per-point speed overrides. Pedro 3's `revhub` has no tank/differential drivetrain, so tank exports bring their own `TankDrive`; they run on the virtual Control Hub like mecanum exports.

## Execution adapters

- **Implemented:** Pedro Pathing 3.0.2 core, compiled from the pinned source (`cf4be31`). Its 12 `System.nanoTime()` reads are redirected to the simulation clock, so pause and speed changes cannot wind up integrals or expire timeouts; the build checks that count. Pedro's `revhub` FTC adapter (17 files) on the virtual Control Hub's FTC SDK stand-ins. MotionModule's runtime on the virtual MotionModule (development check).
- **Not implemented:** Road Runner, the full FTC SDK (only the subset exports use), OctoQuad and servo-steered swerve hardware, and a live robot pose overlay.

## How it is built

The window uses SVG/canvas in 2D and three.js in 3D, with DSIM's field visuals (and, in personal local builds, the field and chassis CAD described above). Pedro remains the path-following engine. Third-party licenses and notices accompany the code.

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

Generated files are git-ignored and rebuilt reproducibly from pinned inputs. Fetch them (clones, npm packages from the lockfile, Temurin JDKs and Gson, each checked against a pinned SHA-256; `--targets` adds a reduced Java runtime for each release platform), then build:

```bash
node tools/simulation/fetch.cjs --targets win32-x64,linux-x64,darwin-arm64
```

```bash
node tools/simulation/build.cjs --public
```

`--public` leaves out every asset whose terms forbid redistribution (FIRST field CAD, DSIM's BIOBUZZ CAD, the chassis CAD and their notices); without it a personal local build includes them when present. Releases are built this way by the GitHub workflows, and `tools/package.py` refuses to package those files in any case. Each release carries the simulator inside `app/` and its platform's Java runtime beside Electron (`runtime/java`, or `Contents/Resources/runtime-java` on macOS), so users download only the app.

Inputs (the build checks every one):
- **DSIM** `0df84143…` (clean clone)
- **Pedro** `cf4be314…` (clean clone)
- **npm packages:** esbuild 0.25.12, @dimforge/rapier2d-compat 0.19.3, @dimforge/rapier3d-deterministic-compat 0.20.0, three 0.186.0, clipper-lib 6.4.2, dijkstrajs 1.0.3, occt-import-js 0.0.23
- **Java:** Temurin JDK 21.0.12.1 reduced runtime (with `jdk.compiler`) and Gson 2.11.0

Outputs:
- `ui/vendor/` (`planning.js/.cjs`, `three-view.js`, field models and `licenses/`)
- `sim-runtime/` (`dsim-host.cjs`, `occt/`, `pedro/`, `java/`, `manifest.json` with SHA-256 hashes)

Prepared CAD for personal local builds lives as compressed GLBs under `ui/assets/robots/` and `ui/assets/fields/` (git-ignored, never committed or packaged); notices record sources and hashes. Installed operation needs no download/conversion. STEP originals stay in `.cache/simulation-cad/`. Optional preparation uses native Open CASCADE (`cadquery-ocp-novtk==7.9.3.1.1`) and `meshoptimizer@0.25.0`; `prepare-decode-field.mjs` removes static loose pieces so physics bodies replace them. Ordinary runtime builds need no Python; user STEP imports use bundled OpenCascade WASM and merge to one body. BIOBUZZ assets are copied from the verified pinned DSIM clone.

`tools/simulation/stubs/discordActivity.ts` keeps DSIM's online-only modules out of the physics bundle.

To install into this laptop's driver station (backs up first, closes only the verified installed main process, keeps settings/launcher/icon/shortcuts, verifies every copied file by SHA-256, then launches):

```bash
powershell -File tools/simulation/install-local.ps1
```

## Licenses

The app's own code is MIT (`LICENSE`); credits and every third-party notice are in `THIRD-PARTY-NOTICES.md` and in Settings → Preferences → **Licenses and credits**.
- **DSIM** is **PolyForm Noncommercial 1.0.0**, not open source: it may be used, changed and shared for noncommercial purposes such as team practice. Its `LICENSE` and `NOTICE` (Required Notice: Copyright 2026 Dohun Kim) are in `ui/vendor/licenses/`. Keep those notices; do not sell or relicense its code.
- **FIRST field CAD, DSIM's BIOBUZZ CAD and the chassis CAD** keep their owners' terms, which do not permit redistribution. They are never committed or packaged; only personal local builds use them (see `ui/assets/fields/NOTICES.md` and `ui/assets/robots/NOTICES.md`).
- **Pedro Pathing** is BSD-3-Clause.
- **three.js** is MIT.
- **Rapier** is Apache-2.0.
- **Clipper** is Boost 1.0.
- **dijkstrajs** is MIT.
- **Gson** is Apache-2.0.
- **occt-import-js and Open CASCADE Technology** are LGPL-2.1; their notices are in `ui/vendor/licenses/`.
- **Temurin** is GPLv2 with Classpath Exception; its notices travel with the runtime (`legal/`), and its source is at https://github.com/adoptium/jdk21u.

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
- `sim-control-hub.test.cjs`: exported Control Hub TeamCode on the virtual Control Hub with every localizer, agreement with the simulated follower, caught wiring/compile mistakes, and tank, differential and tracked robots.
- `sim-actions.test.cjs`: action paths, spins, turns while driving and pin turns, planned, exported (Java, `.pp`, TeamCode action slots, MotionModule, timed) and run through physics, on the virtual Control Hub and on the virtual MotionModule.
- `sim-motionmodule.test.cjs`: the MotionModule `autonomous.py` export, timed calibration, and the export on MotionModule's real runtime (skipped without Python and the MotionModule source).
- `sim-setups.test.cjs`: both example setups, exported and run on their virtual devices, against the simulation.
- `sim-assets.test.cjs`: curated CAD hashes, drive-wheel groups and grounded swerve orientation.
- `sim-field-practice.test.cjs`: A301 BIOBUZZ route completion, moving/resettable pieces, solid pushbot/hive collisions, physical custom barriers and pushing balls.
- `sim-timed.test.cjs`: timed compilation, IMU-only execution without X/Y or Java, deliberate calibration error, FTC defaults and full transition-clock regression.

The native test is `tests/simulation-ui.cjs`. It needs `DECK_PLAYWRIGHT` and `DECK_ELECTRON`, and uses isolated temporary user data. It covers setup/profile persistence, editing stages, exports, actual Pedro/timed runs, controller practice/full match, CAD import dimensions/orientation/wheel animation, field assets/markers/cubes/zoom, themes, responsive sizes and FTC STOP/connection isolation. The separate pre-existing Wi-Fi-dependent `tests/ui.cjs` failure is outside these simulator checks.

## Known limits

- **Planar physics:** DECODE and the empty field are planar; drawing them in 3D does not make their physics 3D.
- **BIOBUZZ planning:** uses floor-level hive legs/flower bases. Overhead structures collide in 3D physics, but route planning does not yet account for robot-height clearance beneath them.
- **Heading:** holonomic routes keep the starting heading unless **Turn to fit** finds that turning in place (in 45° steps) is shorter, a pin turns the robot, or a path turns or spins it while driving (planned for the whole rotation circle, which needs more room than the footprint).
- **Actions:** the simulator does not model mechanisms; a pin's pause stands in for its action's time, and an action path's action is assumed to fit in the drive. Your `RobotActions`/`robot_actions.py` code runs only on the robot.
- **MotionModule turns:** the export uses MotionModule's own turn routine. On some simulated robot sizes it settles slowly within ±4° in its overshoot-correction phase; spinning while driving with IMU-only timing lands a few inches off, as any open-loop drive can.
- **Tank autonomous:** straight legs separated by stop-and-turn maneuvers, with full-footprint rotation checks. Planning retries with a conservative rotation envelope when needed; it can reject tight routes that a more sophisticated search might find. Continuous-curvature tank trajectories are not implemented.
- **Timed driving:** translation is open-loop. IMU supplies heading, not position; calibration error, collisions and slip can cause large misses, without positional recovery.
- **Practice scope:** driving, loose-piece contacts and autonomous timing. No user-controlled mechanisms, throwing/scoring controls, refereeing, opponents or full FTC match rules. The timer is configurable practice behavior, not an FTC SDK runtime.
- **Models:** bundled CAD is simplified for rendering. Wheel/pod animation is visual kinematics, not articulated contact physics. User CAD stays one rigid body; very large or unsupported STEP assemblies can exceed the runtime importer's limits.
- **Shapes:** a shape whose outline crosses itself is treated as its whole outer hull, to stay on the safe side.
- **Find fastest route:** it compares the shapes it generates. It is not a global time-optimal planner.
- **Platform:** the bundled runtime is for Windows x64. Linux and macOS packaging of the simulator has not been done.
- **Live robot overlay:** this still needs a robot-published pose contract. MotionModule's `GET /api/drive/telemetry` exposes IMU yaw/rate, not X/Y.
