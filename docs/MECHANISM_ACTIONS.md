# Mechanism actions: from a path pin to a spinning motor

How Intake, Spin up, Aim and Shoot get from Path planning to the motors and servos on a real robot,
what could stop that from working, what other path planners do, and the plan for setting up a
Control Hub with one button. Written 24 October 2026.

## Short answer

- **The path planner decides when and where.** A pin or a path says "Shoot here" or "Intake while
  driving this path", and for how long. Every planner works this way: PathPlanner, Road Runner and
  Pedro Pathing all leave the mechanism code to the team.
- **Deck goes one step further for common mechanisms.** Setup → Mechanisms describes the hardware
  (which motors and servos, their names, which way they turn, servo positions, flywheel speed), and
  the export writes the mechanism code from that. No code is needed when the robot is built the way
  the settings describe.
- **Anything else is the team's code, in one known place.** Every action has a method in
  `RobotActions`. A team overrides just the action its settings cannot describe, and keeps Deck's
  code for the rest.
- **Before this change, the generated code assumed one robot design.** It worked for that design
  only: a motor intake, a single-motor flywheel with an encoder, a motor or continuous-servo feeder,
  and every mechanism motor turning forward. A robot built differently would crash at INIT or run
  something backwards. This change describes the common variants and adds a way to test each device
  on the robot.
- **One-button setup is possible.** The app is already an FTC Driver Station. The FTC SDK lets a
  Driver Station read the robot's configuration, and the Control Hub's OnBot Java server accepts
  uploads and builds over Wi-Fi. So the app can check the robot, fix up names, upload the code and
  build it. The parts the app cannot know (which port a motor is plugged into, which way it turns,
  servo positions, real flywheel speed) need the robot itself. A guided check finds them.

## How an action runs today

1. **Path planning.** A pin has a pause and an action ("Shoot", "Intake", "Spin up", "Aim" or your
   own name) with a time (0: until it finishes). A path can be an action path: its action runs while
   the robot drives it, for the whole path or a set time.
2. **The export's OpMode** drives the route leg by leg. While it drives an action path it calls that
   action every loop. At a pin it settles, pauses, then calls the pin's action every loop until it
   reports done or its time is up. The follower keeps running in every loop, so the robot holds its
   position at a pin and keeps following a path while an action runs.
3. **`RouteActions.run(name, step)`** sends the action to its method by name (`shoot`, `intake`,
   `spinUp`, `aim`, or a method for your own action).
4. **`Mechanisms.java`** does the hardware part. It never waits or sleeps, so the follower never
   stops. Each method below is called again on the next loop.

| Action | What the robot does |
| --- | --- |
| Intake | Every intake roller runs at its power. Kickers and ramps go to their down positions. When the action ends the rollers stop and the servos go back up. |
| Spin up | The flywheels start toward their speed, and the action finishes at once (the flywheels keep spinning). |
| Aim | Each turret turns toward the hive cell from the robot's current position, measured from the turret's own spot on the robot. |
| Shoot | Spin up and aim. Once every flywheel is at speed, the turret has arrived and the last intake's pieces have had the transfer time to move up, the feeder runs long enough for N shots. Then the feeder and flywheels stop. |

**How "at speed" is decided.** With an encoder, the flywheel runs with the motor controller's own
velocity control (`RUN_USING_ENCODER` and `setVelocity`). The SDK's control loop on the hub ramps
the power up and holds the speed. `ready()` is true once the measured speed is within the tolerance
(5%). If it never gets there, shooting starts anyway after the spin-up time plus half a second, so a
low battery cannot freeze the autonomous. Without an encoder the flywheel runs at a set power and
counts as ready after the spin-up time.

**How the number of shots is decided.** There is no piece sensor, so it is timed. The first piece
is already in the shooter and fires as soon as the flywheel and turret are ready. Each next piece
needs the indexing time to move up. "Shoot 3" feeds for 2 × indexing time plus a short margin.

The simulator runs the same rules with the same numbers, which is why a route's simulated time
matches the exported code's time.

## What stopped it from working on a real robot

The generated `Mechanisms.java` (before this change) had these limits:

| Problem | What happens on the robot |
| --- | --- |
| No motor directions for mechanisms | Every mechanism motor ran FORWARD. A roller mounted the other way spits pieces out, and a flywheel spins backwards. |
| Intake rollers had to be DC motors | An intake on a continuous servo (common in FTC) crashed at INIT: `hardwareMap.get(DcMotorEx.class, ...)` finds no motor with that name. |
| One flywheel motor per shooter | The second motor of a two-motor flywheel was never driven. |
| The flywheel needed an encoder | With no encoder cable, velocity control drives full power and "at speed" is never reached, so it fell back to the timeout. |
| Feeders had to be a motor or a continuous servo | A servo pusher that flicks each piece in, or a servo gate, crashed at INIT. |
| Turrets had to be motors with encoders | A servo turret crashed at INIT. |
| Velocity control used the SDK's untuned defaults | REV notes the hub's preset PIDF assumes a freely spinning motor. A heavy flywheel recovers slowly between shots. |
| Device names were fixed, and drive motor names could not be changed at all | Any name that differs from the robot's configuration crashes at INIT with "Unable to find a hardware device". The Pedro and Road Runner quickstarts use `leftFront`, `leftRear` and so on, while Deck used `front_left`. |
| Nothing to test on the robot | Directions, servo positions and flywheel speed could only be found by running the whole autonomous. |

The virtual Control Hub could not catch any of this. It builds its devices from the export's own
list, so the code and the virtual robot always agreed even when the real robot would not.

## What other planners do

| Planner | Where it puts mechanism actions | Who writes the mechanism code |
| --- | --- | --- |
| PathPlanner (FRC) | Event markers along a path (zoned markers have a start and an end) and commands in autos. | The team. Robot code registers each name with `NamedCommands.registerCommand` before the autos are built. When a path ends, its marker commands are ended. |
| Road Runner 1.0 (FTC) | Actions in a `SequentialAction` or `ParallelAction`, plus markers on a trajectory. | The team. An `Action` is a class whose `run(packet)` returns `true` while it is still running (for example, a shooter spin-up that returns true until the velocity is reached). |
| Pedro Pathing (FTC) | A state machine in the OpMode that starts the next path when `follower.isBusy()` turns false, or path callbacks. | The team. |
| Deck (before) | Pin actions and action paths. | Deck for one built-in design, the team for anything else. |

None of them writes mechanism code. They cannot know the hardware. Deck can, because Setup →
Mechanisms already describes the robot for the simulator. The contract Deck uses (an action is
called every loop and returns true when finished) is the same contract as Road Runner's actions
and PathPlanner's commands, and it is the right one: it never blocks the path follower.

## Decision: settings first, code only where settings cannot reach

Three options were weighed:

1. **Placeholders only.** Every action is an empty method with a comment saying "put your shooter
   code here". It works for any robot, but beginners get no working code. The simulator's timing
   would no longer match the robot. Hand-written mechanism code also tends to use `sleep()`, which
   freezes the path follower while it waits.
2. **Settings only.** Deck writes everything. That cannot cover every design, and a robot outside
   the template fails with no way out.
3. **Both (chosen).** The settings describe the hardware of the common designs, and the export
   writes readable code from them. Each action can be replaced in `RobotActions` without touching
   the rest. A generated check OpMode tests every device on the robot.

What the settings now describe:

| Part | Hardware options |
| --- | --- |
| Intake rollers | DC motor or continuous servo. An optional second roller (side rollers usually have two). Each can turn the other way. Power. |
| Kicker, ramp | Servo name and its positions down and up. |
| Flywheel | One or two motors, each able to turn the other way. Velocity control with an encoder (speed, ticks per revolution, at-speed tolerance, optional PIDF) or a set power with no encoder. |
| Feeder (indexer) | Motor, continuous servo, servo pusher (swings to its feed position for each shot, then back), or servo gate (open while shooting). |
| Turret | Motor with an encoder (ticks per degree), or a servo (position facing forward, degrees across its range). Either can turn the other way. |
| Drive and sensors | The motor, IMU, odometry, Pinpoint and OTOS names can be renamed to match the robot. |

What stays the team's job, and where it goes:

- **Anything the settings cannot describe**, such as an arm, a lift, a sorter, or a color sensor
  that stops the intake when the robot is full. Override that action's method in `RobotActions`.
  The generated code shows the built-in version as a starting point.
- **Physical facts**: which way each motor turns, servo positions and the real flywheel speed. The
  check OpMode finds them on the robot.

## One-button setup on a Control Hub

Goal: join the robot's Wi-Fi, press one button, and the autonomous is ready to INIT.

### What the robot already allows

Checked in FIRST's own FTC SDK 12.0 libraries (RobotCore, FtcCommon, OnBotJava and RobotServer
12.0.0 from Maven Central, SHA-1 verified, inspected with `javap`):

- **Reading the configuration.** A Driver Station sends `CMD_REQUEST_CONFIGURATIONS`. The robot
  answers `CMD_REQUEST_CONFIGURATIONS_RESP` with a JSON list such as
  `{"name":"competition","resourceId":0,"location":"LOCAL_STORAGE","isDirty":false}`. Sending
  `CMD_REQUEST_PARTICULAR_CONFIGURATION` with one of those entries returns its XML (every hub, port,
  device type and name). `CMD_REQUEST_ACTIVE_CONFIG` names the active one.
- **Writing a configuration.** `CMD_SAVE_CONFIGURATION` carries `<that JSON>;<XML>`. The robot
  writes `<name>.xml` and makes it the active configuration. `CMD_ACTIVATE_CONFIGURATION` switches
  configurations. `CMD_SCAN` lists the connected hubs.
- **Uploading code.** The Control Hub's OnBot Java server (port 8080) saves a file with
  `POST /java/file/save?f=/src/org/firstinspires/ftc/teamcode/Name.java` and a form field `data`.
  It reads one back with `/java/file/get`.
- **Building.** `/java/build/start` starts a build, `/java/build/status` reports it as JSON
  (`completed`, `successful`, `startTimestamp`), and `/java/build/wait` and `/java/build/log` return
  the compiler output. After a successful build the robot registers the new OpModes and sends the
  Driver Station its new list (`checkForChangedOpModes`). No sign-in is needed: the web console is
  open to anyone on the robot's network.
- **Selecting and running.** The app already sends INIT and START. Selecting the new autonomous is
  safe to automate. Starting it is not: INIT and START stay with the driver.

### The button, step by step

1. **Connect.** Join the robot's Wi-Fi (Settings already saves it). The Control Hub is at
   `192.168.43.1`.
2. **Read the robot.** Read the active configuration and list every device: name, kind (motor,
   servo, continuous servo, IMU, Pinpoint, OTOS...), hub and port.
3. **Check the export against it.** Every name the code uses must exist on the robot as the right
   kind. A missing name gets a list of the robot's devices of that kind to pick from. The choice
   becomes the name in the setup, so the code uses the robot's own names.
4. **Upload and build.** Save the files with OnBot Java and build. Compiler errors are shown with
   their file and line. Before replacing a file, the app reads the robot's copy. If someone edited
   it there, a copy is kept on this computer. OnBot Java also keeps its own copy on every build.
5. **Test on the robot.** Run the generated mechanism check: each device runs while a button is
   held, servos can be moved to find their positions, and a flywheel can measure its top speed.
   Telemetry prints the numbers to enter, including REV's PIDF values from that top speed.
6. **Drive.** The autonomous is listed on the Driver Station. INIT, START.

### What one button cannot do, and how to close each gap

| Gap | Why the app cannot know | How to close it |
| --- | --- | --- |
| A robot with no configuration yet | The app cannot see which port each motor is plugged into. | Phase 2: generate the XML from the setup plus a port list the team fills in, then save it as a new configuration (never over an existing one). The hub layout comes from `CMD_SCAN`. |
| Motor directions | Depends on how each motor is mounted. | The check OpMode runs each device. A wrong direction is one checkbox in Deck. Phase 2: the app asks "did the intake pull in?" and flips it itself. |
| Servo positions, flywheel speed, turret ticks per degree | Physical measurements. | The check OpMode shows them live. Phase 2: the check prints them as telemetry, which this app receives as the Driver Station, so they can be filled in without typing. |
| Shot speed for a distance | Needs real shots. | Test shots on the field. |
| Firmware, Wi-Fi channel | Outside the autonomous. | The REV Hardware Client. |

### Phases

- **Phase 1 (this change):**
  - The hardware settings above, with the generated code and the simulator using them.
  - The mechanism check OpMode.
  - Robot names for drive motors and sensors.
  - Reading the robot's configuration and checking the export against it.
  - Upload and build through OnBot Java.
- **Phase 2:**
  - Writing a configuration for a new robot.
  - Directions answered with yes or no.
  - Measured values coming back from telemetry.
  - Selecting the new autonomous on the Driver Station after the build.
- **Later:**
  - Piece sensors (stop intaking when full, shoot until empty).
  - An adjustable hood.
  - TeamCode upload with ADB for Android Studio teams.

## What was built (phase 1)

| Piece | Where |
| --- | --- |
| Hardware settings for every part, stored only when they differ from the plain setup, so older saves load unchanged | `ui/sim-mechanisms.js`, Setup → Mechanisms → Robot hardware, `deck-sim mech` flags |
| Device names and directions for the drive motors and sensors | `ui/sim-config.js`, Setup → Robot controller → Device names on the robot, `deck-sim robot --names --reversed` |
| `Mechanisms.java` written device by device, with every direction set in `init`, PIDF when set, power control without an encoder, pushers that push once per feed cycle, gates, and servo turrets tracked to 2° | `ui/sim-ftc.js` (`mechanismDevices`, `mechanismsSource`) |
| The check TeleOp for TeamCode, OnBot Java and Pedro | `ui/sim-ftc.js` (`checkOpMode`) |
| `RobotActions` shows how to replace a built-in action | `ui/sim-ftc.js` (`robotActions`) |
| MotionModule: continuous-servo rollers, second motors, servo feeders, directions as signed power | `ui/sim-motionmodule.js`, `tools/simulation/motionmodule-bridge.py` |
| The virtual Control Hub registers each device as what it is, mounted as the settings say, and only a forward command takes pieces in, feeds or spins a flywheel | `tools/simulation/java/deck/sim/hub/VirtualHub.java`, `src/sim-engine.cjs` |
| Reading a robot configuration and checking the export against it, with suggested names and fixes | `ui/ftc/robot-config.js` |
| Reading the configuration over Robocol, uploading and building with OnBot Java, backups | `src/robot-link.cjs` |
| Send to robot in Run & review → Export | `ui/simulation.js` |
| A simulated Control Hub that answers the configuration commands and serves OnBot Java | `tools/ftc-sim.cjs` |

### How it was checked

- **The virtual Control Hub, with BIOBUZZ physics.** Three hardware variants each shoot exactly what
  the simulator planned (same shots, pickups and points):
  - continuous-servo side rollers with a reversed second roller, a two-motor flywheel with PIDF, a
    reversed feeder and turret;
  - a set-power flywheel, a servo pusher and a servo turret;
  - a kicker and a servo gate.

  The same code with the second roller's direction flipped picks up nothing, as a real robot would.
- **MotionModule** shows the same in its own runtime: it picks up and shoots with the directions as
  set, and picks up nothing with one roller flipped.
- **The real FTC SDK 12.0 and Pedro Pathing 3.0.2.** Every export compiles with no warnings: TeamCode,
  OnBot Java with its check TeleOp, and Pedro, for these variants plus a two-shooter case, every
  localizer case and every example. The SDK stand-ins still match the real SDK (240 members).
- **Send to robot, against the simulated Control Hub.** Unit tests and a run in the real app cover:
  - reading the configuration;
  - five Pedro-style names found and applied with one button;
  - uploading and building both files;
  - backing up a file edited on the robot;
  - files kept on the robot;
  - compile errors;
  - a robot already in use by another Driver Station;
  - a robot with no active configuration.

## Limits

- No physical robot was available. The protocol details come from FIRST's own SDK classes, and the
  app's client is tested against a simulated Control Hub built from them, not against a real hub.
- Generated mechanism code is a starting point. It is compiled against the real FTC SDK 12.0 and
  run on the virtual Control Hub, but the first real run should be with the robot on blocks.
- Shooting is timed. With no piece sensor the code cannot tell a jam from a shot.
- The flywheel's at-speed check trusts the encoder. A flywheel with no encoder cable plugged in reads 0
  in velocity mode, so it shoots after the timeout. Use "Set power (no encoder)" for that robot.

## Sources

- [PathPlanner named commands](https://pathplanner.dev/pplib-named-commands.html) and
  [event markers](https://pathplanner.dev/gui-editing-paths-and-autos.html).
- [Road Runner 1.0 actions](https://rr.brott.dev/docs/v1-0/actions/).
- [REV PIDF tuning for hub motors](https://docs.revrobotics.com/first-global/fgc-pid) (F = 32767 ÷
  top speed, P = 0.1 × F, I = 0.1 × P, D = 0, set with `setVelocityPIDFCoefficients`).
- [REV DECODE flywheel tips](https://docs.revrobotics.com/ftc-kickoff-concepts/decode-2025-26/programming-tips-and-tricks).
- FTC SDK 12.0.0 libraries on Maven Central: `org.firstinspires.ftc` RobotCore, FtcCommon,
  OnBotJava and RobotServer (classes `FtcEventLoopBase`, `RobotConfigFile`,
  `OnBotJavaProgrammingMode`, `SaveFile`, `BuildMonitor`).
