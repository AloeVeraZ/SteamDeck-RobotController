# FTC export and robot-configuration pipeline: research map

Read-only research of `/home/user/SteamDeck-RobotController` (branch `claude/zealous-galileo-brknjs`, HEAD `b82e2c9`). Nothing in the repo was modified.

- Line numbers are from the current working tree.
- `ui/sim-mechanisms.js`, `ui/sim-discovery.js`, `ui/sim-robot-model.js` and `src/sim-model.cjs` are being edited by another agent. For those, function names are the stable reference. The lines quoted for `sim-mechanisms.js` (`sanitize` 69, `action` 154, `FIRE_MARGIN` 273, `Runner` 285) still match HEAD.

## 0. The headline finding (what the user's "same actions" ask is about)

The simulator and the export do not run the same set of actions.

**The simulator** runs these action names:
- The BIOBUZZ built-ins: Intake, Ramp down/up, Spin up, Aim, Shoot [N], Turret [n] to DEG, Wait.
- Every moving-part (kinematics) action, all through `Kin.Driver.start(name)` (`ui/sim-kinematics.js:435-445`):
  - `model.actions` by name (multi-step actions);
  - `"<joint|actuator name> <named position>"`, such as "Lift up";
  - `"<name> to N°|in"`.

**The export only knows the built-ins.** `F.mechanismAction(name,mech)` (`ui/sim-ftc.js:545-557`) maps names through `DeckMechanisms.action()` (`ui/sim-mechanisms.js:154`). Every other name comes back as `{kind:'custom'}`, so the generated method gets `return notWritten("…")` (`ui/sim-ftc.js:409`, `489-492`). That method returns `true` at once.

Verified with a probe (scratch script, not in the repo):

```
"Lift up"     -> {"kind":"custom"} | ""   (no generated code)
"Lift to 30°" -> {"kind":"custom"} | ""
"Claw open"   -> {"kind":"custom"} | ""
```

The consequences:
- No kinematics actuator reaches any export. `F.files()` and `F.onBotJava()` never receive `project.kinematics`: `teamCode()` at `ui/simulation.js:1305` passes `mechanisms`, but not kinematics.
- `robotNeeds` lists no actuator, and neither do the virtual hub, the guided check or the deck-sim CLI's `exported()` (`tools/deck-sim.cjs:186`).
- `DeckActuators.device(a,states)` (`ui/sim-actuators.js:134-139`) is described as "what exporters should read". Only `tests/sim-actuators.test.cjs` calls it.
- In the simulator, a pin with "Lift up" waits for the lift (`routeJoints` → `kin.busy`, `src/sim-engine.cjs:261`). The exported OpMode leaves the pin right after its pause, and nothing moves.
- On the virtual hub, `RunBridge.tickHub` returns no `act`. `mechAct` is therefore null and the kinematics joints never move (`src/sim-engine.cjs:396`, `418`).
- The Pedro export (`ui/sim-pedro.js:404-407` reuses `ftc.routeActions`, `mechanismsSource` and `checkOpMode`) and MotionModule (`ui/sim-motionmodule.js:18-23`, `builtIn()`) both have the same gap.

---

## 1. `ui/sim-ftc.js` (`DeckSimFtc`, 1544 lines)

Exports (line 1543): `checklist`, `hardware`, `hardwareIfSupported`, `deviceSlots`, `robotNeeds`, `files`, `onBotJava`, `mechanismDevices`, `mechanismHardware`, `mechanismAction`, `routeActions`, `robotActions`, `mechanismsSource`, `checkOpMode`, `checkResults`, `applyCheck`, `SUPPORTED`, `MOTORS`, `TANK`, `ticksPerRev`.

### 1.1 `hardware(robot, localization)`, lines 21-37

- It throws unless `localization` is one of `encoders`, `odometry`, `odometry3`, `fused` or `optical`, and the drivetrain is `mecanum` or a TANK set (`tank`, `tank2`, `tank6`, `tank8`, `tracks`).
- It returns:

```js
{ localization, imu:<name>, hub:{logo,usb},            // RevHubOrientationOnRobot enums (sim-config hubMounting)
  drive:{kind:'tank'|'mecanum', ticksPerInch, ticksPerRev, halfLength, halfWidth,
         motors:{frontLeft:{name,mount},...} | {left,right} (tank2)},   // mount -1 = REVERSE (physical truth)
  pods:[{name,axis:'forward'|'strafe',x,y,key,ticksPerInch,reversed?}],   // PODS table, line 15
  pinpoint?, pinpointMount?{xOffset,yOffset,pods,xReversed,yReversed,ticksPerMm},
  otos?, otosMount?{x,y,heading,linearScalar,angularScalar},
  mechanisms?  // added by files() / sim-engine: mechanismHardware(m)
}
```

- Names come from `robot.devices[key].name`, with defaults in `MOTORS` (line 10) and `DIFF` (line 13). `devices` is sanitized in `ui/sim-config.js:46-51` (`DEVICE_KEYS`).
- Ticks per revolution: `ticksPerRev(rpm)=28*6000/rpm` (line 9). Pod ticks per inch: `POD_TICKS_PER_INCH = 2000/(π·32 mm)` (line 7).
- `deviceSlots()` (40-46) gives the drive and sensor slots `{key,label,name,kind:'motor'|'imu'|'pinpoint'|'otos',reversed?}`. Pods count as `kind:'motor'`, because a pod is read through a motor port's encoder.

### 1.2 `mechanismDevices(m, robot)`, lines 562-578: the single device list

- It reads the sanitized BIOBUZZ mechanisms (`DeckMechanisms.sanitize`). Kinematics are not included.
- Each entry has this shape:

```js
{ part:'intake'|'shooter', index:k, role:'roller'|'kicker'|'ramp'|'flywheel'|'feeder'|'turret',
  field:'intake1'|'intake1b'|'ramp1'|'flywheel1'|'feeder1'|'turret1'..., constant:'INTAKE_1'|...,
  name:<config name>, device:'motor'|'crservo'|'servo', reversed?, power?, down?, up?, feeder?:'motor'|'crservo'|'pusher'|'gate',
  feed?, rest?, offset?:[x,y], label, setting:{list:'intakes'|'shooters', index, field:'motor'|'motor2'|'servo'|'indexer'|'turretMotor'} }
```

Rules:
- **Rollers.** Every intake except a kicker gets one roller, plus `motor2` when set. The device is `crservo` when `i.device==='crservo'`, otherwise `motor`.
- **Kicker and ramp.** A servo (`Mech.deploys(kind)`) with `down`/`up` = `downPos`/`upPos`.
- **Flywheel.** `motor`, plus `motor2` when set.
- **Feeder.** The device is `motor` or `crservo`; `pusher` and `gate` are `servo` (`indexerKind`).
- **Turret.** Only when `type==='turret'` and not `sharesTurret`. It is a servo when `m.turret.kind==='servo'`, otherwise a motor. `offset = Mech.mountOffset(s.mount,robot)`.
- Consumers:
  - `mechanismsSource` (Mechanisms.java);
  - `mechanismHardware` (virtual hub);
  - `robotNeeds` (Send to robot);
  - `checkOpMode` (the guided check);
  - `applyCheck` (`deviceFor`).

### 1.3 `mechanismHardware(m)`, lines 581-590: the virtual hub's JSON

```js
{ intakes:[{name,kind:'motor'|'crservo',mount:±1,part}], kickers:[{name,down,up}], ramps:[{name,down,up}],
  shooters:[{flywheels:[{name,mount}], ticksPerSecond:rpm*ticksPerRev/60,
             indexer:{name,kind,mount,feed?,rest?},
             turret?:{name,kind:'servo',center,degrees,mount} | {name,kind:'motor',ticksPerDegree,mount}}] }
```

- `mount` is the physical truth (`-1` = turns the other way).
- `src/sim-engine.cjs:349` sets `hub.mechanisms=Ftc.mechanismHardware(this.config.mechanisms)` from the simulator's own setup. It does not come from the exported code.

### 1.4 `robotNeeds(robot, localization, mechanisms)`, lines 54-58

- It returns one row per device:

```js
{name, need, device, label, setting}
```

  - `need` is one of `motor`, `servo`, `crservo`, `motorOrCr`, `imu`, `pinpoint`, `otos`.
  - `device` is the kind used when the device is added to a configuration.
  - `setting` is `{robot:key}` or `{list,index,field}`.
- Mechanism rows: a servo device needs `servo`; a flywheel or a motor turret needs `motor`; everything else needs `motorOrCr`, because the code uses `DcMotorSimple` there.
- Callers: `ui/simulation.js:1320`, and the tests `robot-link.test.cjs` and `robot-setup-app.cjs`.

### 1.5 `mechanismsSource(options, m, target, robot)`, lines 591-870: Mechanisms.java

The generated file has these parts:

1. **Constants** (`C[]`, 610-646): per-part names, `_REVERSED`, `_POWER`, `_DOWN/_UP`, `_FEED/_REST`, `_X/_Y`, followed by the shared timing.
2. **Fields** (`type()` 649): `Servo`; `DcMotorEx` for a flywheel or turret; `DcMotorSimple` for rollers and motor or CR feeders.
3. **`init`** (651-658): sets directions; rollers FLOAT; kickers and ramps `setPosition(UP)`; servo feeders `setPosition(REST)`; a servo turret goes to `TURRET_SERVO_CENTER`.
4. **Helpers:**
   - `flywheel()` (721): `RUN_USING_ENCODER` or `RUN_WITHOUT_ENCODER`, plus `setVelocityPIDFCoefficients` when a PIDF is set.
   - `turretMotor()` (732): `STOP_AND_RESET_ENCODER`, then `RUN_TO_POSITION`, with BRAKE.
5. **Methods:** `intake(on)` 744, `ramp(down)` 750, `spin(on)` 755, `ready()` 762, `atSpeed()`, `aim(pose,cell)` 775, `turnTurrets(deg)` 781, `turnTurret(n,deg)`, `bearing()`, `turn<Field>(deg)` (servo or motor variants, 661-675), `trackServoTurrets()` 800, `aimed()` 807, `feed(on)`, `feeders(feeding,t)` 818, `shoot(count,step)` 824, `flywheelSpeeds()`, `flywheels()`, `servos()`, `SERVO_NAMES`, `stop()`.

### 1.6 How route actions become Java (`mechanismAction`, 545-557), and open-loop or closed-loop for each

Shared mechanics:
- The OpMode (`opMode()` 176-348) calls `actions.run(name, step)` every loop (`act()` 318-327). The call sits inside the pin loop (268-286) or the action-path loop (234-247).
- `step.duration` is the route's `ACTION_SECONDS` (pin) or `MOVING_SECONDS` (path), i.e. the per-step time from Path planning.
- `last=true` is sent once that time is up.
- `RouteActions.run()` (417-421) is a switch over `exporter.actions(route)` plus `Steps` sequences (425-487).
- Unknown names count as finished: `default: return true`.

| Action | Generated call (line 547-555) | Hardware command | Loop type | Completion and timing source |
|---|---|---|---|---|
| Wait | `return step.last \|\| step.duration <= 0;` | none | timed | the route's step time |
| Intake | `done = step.last \|\| (!step.moving && step.duration<=0); mech.intake(!done); return done;` | rollers `setPower(INTAKE_n_POWER)`; kicker `setPosition(DOWN/UP)` | **open loop**: power, plus an unmonitored servo position | Runs for the route's time, or the whole path. At a pin with a time of 0 it finishes at once and nothing runs. Power comes from `intakes[i].power`. |
| Ramp down / Ramp up | `mech.ramp(true\|false); return step.moving \|\| step.elapsed >= Mechanisms.RAMP_DOWN/UP_SECONDS;` | ramp servo `setPosition(RAMP_n_DOWN/UP)` | **open loop, timed** (no feedback) | `RAMP_DOWN_SECONDS` / `RAMP_UP_SECONDS` = the largest `intakes[i].down` / `.up` over the ramps (sanitize: 0-3 s, ramp default 0.3), line 621 |
| Spin up | `mech.spin(true); return true;` | `velocity`: `setVelocity(FLYWHEEL_TICKS_PER_SECOND)` with `RUN_USING_ENCODER`; `power`: `setPower(FLYWHEEL_POWER)` | velocity mode: **closed loop on the motor encoder** (the hub's own PID). Power mode: open loop. | returns at once |
| Aim | `mech.aim(step.pose, step.cell); return step.moving ? step.last : mech.aimed();` | bearing from the **follower's pose** (localization, closed loop); a motor turret uses `setTargetPosition(deg*TURRET_TICKS_PER_DEGREE)` + `RUN_TO_POSITION` at `TURRET_POWER=1`; a servo turret uses `setPosition(CENTER ± deg/TURRET_SERVO_DEGREES)` | Motor turret: **closed loop** (`!isBusy()`). Servo turret: **open-loop position plus a timed estimate**. `trackServoTurrets()` advances its belief at `TURRET_DEGREES_PER_SECOND`, and the turret counts as aimed within `AIMED_DEGREES=2`. | Motor zero is wherever the turret was at INIT, so it is relative. `m.turret.ticksPerDegree` (default 4.6), `m.turret.speed` (default 240°/s), `servoCenter`, `servoDegrees`, `min`/`max`. |
| Turret [n] to DEG | `mech.turnTurrets(D)` or `mech.turnTurret(n-1, D); return step.moving \|\| mech.aimed();` | same as Aim | same as Aim | same as Aim |
| Shoot [N] | `return mech.shoot(N, step);` (824-841) | spin and aim; starts feeding once `ready() && aimed() && now-lastIntake >= TRANSFER_SECONDS + KICKER_UP_SECONDS`; the feed runs for `(N-1)*FEED_CYCLE_SECONDS + LAST_SHOT_SECONDS`, or until `last` when `duration>0`; a pusher is `t % FEED_CYCLE < PUSH_SECONDS`; then the feeders and flywheels stop | Readiness: velocity is closed loop (`atSpeed`: \|v-target\| < `AT_SPEED_TOLERANCE`·target, with a fallback after `SPIN_UP_SECONDS+0.5`); power mode is timed. **Feeding is open loop and timed** (no piece sensor). | `m.transfer.seconds` (default 1), `Mech.liftSeconds(m)` (largest kicker `up`), `m.indexer.seconds` (0.35), `m.indexer.pushSeconds` (0.15), `Mech.feedCycle(m)`, `Mech.shootSeconds(m,1)` (uses `FIRE_MARGIN=.15`, `sim-mechanisms.js:273-281`), `m.shooter.spinUp` (0.8), `m.shooter.tolerance` (0.05), `m.storage` |
| "Lift up", "Arm to 30°", saved part actions | `notWritten()` → `true` | **nothing** | n/a | n/a |

- Every timing value is set in Setup → Mechanisms (`mechanismsPanel`, `ui/simulation.js:2079`; inputs `#mech-spinup`, `#mech-transfer`, `#mech-index`, `#mech-push`, `#mech-turret-speed` and so on). Each is stored in `project.mechanisms`.
- The simulator's `Mech.Runner` (`sim-mechanisms.js:285`) uses the same numbers, which is why simulated and exported timing match.

### 1.7 `checkOpMode(options, h, m, mechType)`, lines 879-1425: the guided check TeleOp

Steps are pushed in this order:
1. IMU: level, then a quarter turn.
2. Each drive motor: `turn()` → `direction("robot.<key>.reversed")`.
3. Rollers: `intakes.N.reversed` or `reversed2`.
4. Kicker and ramp servos: the D-pad `position()` step gives `intakes.N.downPos` and `upPos`.
5. Flywheels: direction, then the top speed, which gives `shooter.topSpeed` and `shooter.pidf`.
6. Feeders: `restPos`/`feedPos` for a servo, or the direction for a motor.
7. Turret:
   - servo: `turret.servoCenter`, `turret.servoDegrees` and the direction;
   - motor: the direction, then `turret.ticksPerDegree` from two D-pad `aim()` points.
8. Odometry on the floor (`fused`, `optical`, `odometry`, `odometry3`).

More details:
- Results are in the `v1 key=value` protocol. A key is `<list>.<index>.<field>`, with direction fields taken from `REVERSED_FIELD` (878).
- Devices are fetched with `hardwareMap.tryGet`, so a missing device reports `?missing` instead of crashing.
- After the last step, controller 1 drives the mechanisms: right bumper intake, left trigger flywheels, right trigger feed.
- `checkResults(line)` (1428) parses the results line.
- `applyCheck(values, {robot, mechanisms, localization})` (1436-1494) returns `{robot, mechanisms, changes[], problems[]}`. It:
  - ignores keys for devices the setup lacks;
  - takes servo positions only within 0..1;
  - takes `turret.*` only when greater than 0.
- Answer UI pattern strings (`TURNED`, `"D-pad up/down: move …"`, `"D-pad left/right: turn 1 degree …"`) are parsed by `answerButtons()` (`ui/simulation.js:1446`), the test operator (`tests/sim-guided-check.test.cjs:23-61`) and `tools/ftc-sim.cjs` `CheckScript`. Keep them in sync.

### 1.8 `files(...)`, lines 1497-1511, and `onBotJava(options)`, 1513-1531

- `files()` returns:

```js
{files:{'<pkg>/PlannedRoute.java', '<pkg>/PlannedRouteAuto.java', RouteActions, RobotActions, drive/Constants, drive/RobotDrive, deck/pathing/DeckFollower, Mechanisms?, PlannedRouteCheck}, keep:[RobotActions], opMode, check:{path,opMode}, hardware:h, actions}
```

  `h.mechanisms` is set when mechanisms are enabled.
- `onBotJava()` folds everything except the check into one file with nested classes. The check is a second file that uses `<Name>.Mechanisms`. Send to robot always uses `onBotJava` (`teamCode(route,true)`).
- `robotActions()` (496-542) is created once and never overwritten. It drops actions that `mechanismAction` handles.

---

## 2. `ui/ftc/robot-config.js` (`DeckRobotConfig`, 211 lines)

### 2.1 Every XML element and type string it knows

| Set | Strings | Line |
|---|---|---|
| MOTORS (kind `motor`; any tag ending in `Motor` or `Gearmotor` also counts) | `Motor`, `goBILDA5201SeriesMotor`, `goBILDA5202SeriesMotor`, `Matrix12vMotor`, `NeveRest20Gearmotor`, `NeveRest3.7v1Gearmotor`, `NeveRest40Gearmotor`, `NeveRest60Gearmotor`, `RevRobotics20HDHexMotor`, `RevRobotics40HDHexMotor`, `RevRoboticsCoreHexMotor`, `RevRoboticsHDHexMotor`, `RevRoboticsUltraplanetaryHDHexMotor`, `StudicaMaverick`, `TetrixMotor` | 9-10 |
| SERVOS (kind `servo`) | `Servo`, `ServoFullRange` | 11 |
| CRSERVOS (kind `crservo`) | `ContinuousRotationServo`, `RevSPARKMini` | 11 |
| IMUS (kind `imu`) | `ControlHubImuBHI260AP`, `LynxEmbeddedIMU`, `RevExternalImu`, `AdafruitBNO055IMU`, `AndyMarkIMU` | 12 |
| other kinds in `kindOf` | `goBILDAPinpoint` → `pinpoint`, `SparkFunOTOS` → `otos`, `Webcam` → `webcam`; anything else → `other` | 15-18 |
| HUBS (device holders) | `LynxModule`, `ServoHub` | 14 |
| CONTAINERS (not devices) | `Robot`, `LynxUsbDevice`, `LynxModule`, `ServoHub`, `EthernetDevice` | 14 |
| PORTAL | `LynxUsbDevice` (`serialNumber`; `"(embedded)"` = the Control Hub's own board; `parentModuleAddress`) | 35 |
| SERVO_PORT (take a servo port) | SERVOS, CRSERVOS, `RevBlinkinLedDriver` | 99 |
| OTHER_PORT (take **no** port in Deck's model) | `DigitalDevice`, `RevTouchSensor`, `Led`, `AnalogInput`, `OpticalDistanceSensor`, `ModernRoboticsAnalogTouchSensor` | 99 |
| MOTOR_TYPES offered for new motors | `goBILDA5202SeriesMotor`, `RevRoboticsUltraplanetaryHDHexMotor`, `RevRobotics20HDHexMotor`, `RevRobotics40HDHexMotor`, `RevRoboticsCoreHexMotor`, `Motor` | 93 |
| IMU_TAGS (from the scan's imuType) | `BHI260` → `ControlHubImuBHI260AP`, `BNO055` → `LynxEmbeddedIMU` | 96 |
| `tagFor(add)` (written tags) | servo → `Servo`, crservo → `ContinuousRotationServo`, pinpoint → `goBILDAPinpoint`, otos → `SparkFunOTOS`, else `add.motorType \|\| 'goBILDA5202SeriesMotor'` | 114 |
| Written roots | `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>`, `<Robot type="FirstInspires-FTC">`, `<LynxUsbDevice name="Control Hub Portal"\|"Expansion Hub Portal N" serialNumber parentModuleAddress>`, `<LynxModule name="Control Hub"\|"Expansion Hub <addr>" port="<addr>">` | 181-191 |

There is no color sensor, distance sensor, `AnalogInput` port family or digital port family. Analog and digital tags are parsed (`kind:'other'`), but they take no port, and Deck can neither plan nor write them.

### 2.2 Parse and write

- **`parse(xml)` (38-47)** returns:
  - `{devices:[{name,tag,kind,hub,port?,bus?,module?:{portal,address}}], hubs:[{name,address,tag,portal,parent}]}`;
  - `elements()` (25-33) is a small streaming tokenizer that preserves source offsets, so that `addDevices` can splice text in.
- **`check(needs, config)` (63-77)** returns `{rows:[...need, status:'ok'|'kind'|'missing', fix?, found?, candidates[], suggestion?, duplicate?], ok, unused}`:
  - names are matched by `tokens()` and `likeness()` (52-56: abbreviations and synonyms);
  - `FIXES` (78) holds the hint for a wrong kind;
  - `explain(row)` (81-86) gives the sentence.
- **`missingDevices(rows)`** (113) returns `[{name,label,device,setting}]`.
- **`addDevices(xml, assignments)`** (160-175) inserts `<Tag name port [bus] />` lines inside the matching `LynxModule`. It never changes existing lines, re-parses to verify, and passes the result through `sendable()`, which rejects any `;`.
- **`newConfiguration(portals, assignments)`** (181-191) writes every portal and module from the scan. Each module's devices are sorted by `written` (180: motor, then servo, then I2C, each by port).
- **`deviceXml`** (155), **`configurationName`** (201), **`validName`** (205).
- **Scan helpers:** `lynxSerials(scanJson)` (208) and `lynxModules(json)` (209) return `{serial, modules:[{address,parent,imu}]}`.
- **Module helpers:**
  - `modulesFromScan(portals)` (194): a hub is named "Control Hub" when the serial is `(embedded)` and it is the parent, otherwise "Expansion Hub `<addr>`";
  - `modulesOf(config, portals)` (196): the configuration's `LynxModule` hubs plus the scan's IMU (or `missing`).

### 2.3 The hub and port model

- `PORTS={motor:4, servo:6, i2c:4}` (91): motor ports 0-3, servo ports 0-5, I2C buses 0-3 (always device `port="0"` on its bus).
- `portFamily(device)` (103): servo or crservo → `servo`; imu, pinpoint or otos → `i2c`; else `motor`.
- `portKey(module,family,port,bus)` (105) = `"<portal>#<address>:<family>:[bus.]<port>"`. A hub is identified by its portal serial plus its address.
- `portsTaken(d)` (107-112):
  - a `bus` attribute means I2C;
  - a motor kind takes a motor port, and a SERVO_PORT tag a servo port;
  - OTHER_PORT takes none;
  - an unknown tag blocks **both** a motor and a servo port.
- `hubOrder(modules)` (116) puts the parent (Control Hub) first, then sorts by address.
- **`planPorts(adds, {modules, devices})`** (122-135) is the rule set for adding devices:
  1. An IMU goes on the parent hub's I2C bus 0. Its tag comes from the scan's IMU type, and it is a problem when the type is unknown or the bus is taken.
  2. Drive motors (`setting.robot` in the DRIVE set, 100) take the parent hub first. Other motors take the non-parent hubs first, then the parent.
  3. Servos and sensors take the parent hub first. I2C sensors start at bus 1.
  4. A name listed twice gets one port (a pod read through its drive motor's port).
  5. When no port is free, it records a problem (for a motor: "Add an Expansion Hub, or run a roller on a continuous servo.").
  6. It returns `{assignments:[{...add, tag, module, port, bus?}], problems}`.
- `portChoices(assignments, i, ctx)` (141-147) returns each candidate port as `{module,port,bus?,key,label,taken?,swap?}`. I2C choices are buses 1-3.
- `movePort(assignments, i, key, ctx)` (149-153) moves a device and swaps it with any planned device already there. It throws for a configured device.
- `withType` (154) and `portLabel` (138) give strings such as "Control Hub motor port 0" or "Expansion Hub 2 I2C bus 1".
- Limits:
  - Servo Hubs and unconfigured Expansion Hubs are never used.
  - There are no analog (0-3) or digital (0-7) port families, although both hubs have them.

---

## 3. `src/robot-link.cjs` and the Send to robot UI

### 3.1 `src/robot-link.cjs` (195 lines)

- **`session(host, task, {timeout, socket})` (24-43):**
  - opens `FtcSocket` and creates a Robocol `DriverStation`;
  - `ask(cmd, extra)` waits for `<cmd>_RESP`, `until(test)` waits for a station state, and `sent(command)` waits for the robot's acknowledgement;
  - errors on `rejected` (another Driver Station) and `incompatible`.
- **`configurations()` (45-50):** `CMD_REQUEST_CONFIGURATIONS`, plus the active configuration from `ds.state.activeConfig`.
- **`scanHubs(ask)` (52-56):** `CMD_SCAN`, then `CMD_DISCOVER_LYNX_MODULES` for each serial.
- **`readRobot(host, {scan})` (61-69):** returns `{robot, configurations:[names], active:{name,dirty}|null, xml, devices, hubs, opModes, portals?}`. It reads the XML with `CMD_REQUEST_PARTICULAR_CONFIGURATION` and parses it with `RobotConfig.parse`.
- **`writeConfiguration(host, {name, xml}, {restart=true})` (72-87):**
  - checks `validName`, a size of 60 KB or less, and no `;`;
  - refuses an existing name, ignoring case;
  - sends `CMD_SAVE_CONFIGURATION` as `"<RobotConfigFile JSON>;<xml>"` and waits until the configuration is active;
  - reads it back and compares name, tag, port and bus;
  - restarts the robot (`ds.restartRobot()`).
- **`runCheck(host, opMode, {onUpdate, limit})` (95-126):**
  - runs INIT, then START, and streams telemetry lines;
  - `press(button)` presses for 200 ms, `pad(gamepad)` passes controller 1 through (the `PAD` map, 127), and `stop()` ends it;
  - `ended` resolves `stopped`, `ended`, `time` or `lost`.
- **`OnBotJava`** (144-169): `available()`, `read()`, `save()`, `status()`, `build()` and `waitIdle()`, over HTTP on port 8080:
  - `/java/file/get|save?f=/src/<path>`;
  - `/java/build/start|status|log`.
- **`send(host, files, {keep, backupDir, onProgress})` (177-193):**
  - retries `available()` up to 8 times (the robot restarts after saving a configuration);
  - backs up a file that differs on the robot to `userData/robot-backups/<host>/`;
  - skips `keep` files the robot already has;
  - builds, and returns `{built, seconds, log, errors[], written, kept, backups}`.
- **`buildErrors(log)`** (171) parses `File.java:12: error: …`.

### 3.2 IPC bridge

`src/main.cjs:336-352` (`handle('robot-link', …)`) maps these actions:

| Action | Calls |
|---|---|
| `robots` | saved FTC robots |
| `select` | Drive preselects the op mode |
| `check-press`, `check-stop`, `check-start` | `runCheck` |
| `read` | `readRobot` |
| `configure` | `writeConfiguration` |
| `send` | `send`, with the backup directory |

- It refuses while the guided check runs, or while Drive holds the FTC socket.
- Preload: `src/preload.cjs:10`, `robotLink(action,data)`, `onRobotLink` and `onRobotCheck`.

### 3.3 Send to robot UI: `ui/simulation.js` 1307-1493

The markup is at lines 272-277: `#sim-send`, `#sim-send-robot`, `#sim-send-check`, `#sim-send-go`, `#sim-send-plan`, `#sim-send-ports`.

**State:**
- `sendState={host,label,robot,result,plan?,fileNames?}`.
- `namePicks` and `portPicks` are Maps keyed by `"<host>|<export name>"`. A `portPicks` value is `{key, motorType}`.

**Functions:**
- `robotNeeds()` (1320): `DeckSimFtc.robotNeeds(info?.robot||project.robot, localization, info?info.mechanisms:project.mechanisms)`.
- `readRobot(scan)` (1349): `api.robotLink('read')`, then `RobotConfig.check(robotNeeds(), robot)`, `showCheck()` and `showPlan()`.
- `showCheck()` (1334): one row per need, with a `<select>` of usable candidates.
- `usePicks(chosen)` (1360): writes the robot's names into `project.robot.devices[key].name` or `project.mechanisms[list][index][field]`. It **only understands `setting.robot` and `setting.list`**.
- `makePlan()` (1372-1381):
  1. `missingDevices` (minus picked names);
  2. if there are no portals yet, returns `{scan:true}`;
  3. the context is `modulesFromScan` (no configuration) or `modulesOf(robot, portals)`;
  4. `planPorts` applies `portPicks` motor types;
  5. the planned ports are replaced by `portPicks.key` through `movePort`;
  6. `configurationName`.
- `showPlan(done)` (1383-1397): a port `<select>` per device (`portChoices`) and a motor-type `<select>`. A change writes into `portPicks`.
- `#sim-send-go` (1417-1421):
  1. `readRobot()`, then `teamCode(route,true)` (onBotJava);
  2. if a scan is needed, `readRobot(true)`;
  3. `makePlan()`, `summary()`, then the confirmation box.
- `#sim-send-yes` (1423-1437):
  1. `usePicks`, then `ready()`;
  2. `robotLink('configure', {name, xml: fresh ? newConfiguration(portals, assignments) : addDevices(robot.xml, assignments)})`;
  3. a new `teamCode`, then `robotLink('send', {host, files})`, then `robotLink('select', …)`.
- Guided check (1440-1493):
  - `checkOpModeName()` 1443, `answerButtons()` 1446, `checkChanges()` (`applyCheck`) 1452, `checkLines()` 1461;
  - `#sim-check-go` 1474 starts it;
  - `#sim-check-apply` 1488 writes `a.robot` and `a.mechanisms` into the project, reloads, then clicks `#sim-send-go` again.

**Ports are never taken from Setup.** They come only from `planPorts`, or from a pick in the Send panel. Those picks are session memory in `portPicks`, cleared after a successful save (line 1428).

### 3.4 `tools/ftc-sim.cjs`: simulated Control Hub (165 lines)

- **`SimController` (61-121)** implements:
  - discovery and heartbeats;
  - `CMD_REQUEST_OP_MODE_LIST`, `CMD_REQUEST_ACTIVE_CONFIG`, `CMD_REQUEST_CONFIGURATIONS`, `CMD_REQUEST_PARTICULAR_CONFIGURATION`;
  - `CMD_SCAN`, then `CMD_DISCOVER_LYNX_MODULES` (`HUBS` at line 60: an embedded hub at 173 with BHI260, plus address 2 with BNO055);
  - `CMD_SAVE_CONFIGURATION`, splitting at `;` as the SDK does;
  - `CMD_ACTIVATE_CONFIGURATION`, `CMD_INIT_OP_MODE`, `CMD_RUN_OP_MODE`, `CMD_RESTART_ROBOT`, camera frames, about info;
  - gamepads.
- **`CheckScript` (37-58)** is a 2-step stand-in for any op mode named `"… check (Deck)"`.
- **`CONFIG_XML` (14-32)** is the fixture: 4 Expansion Hub motors (shooter, indexer, turret, intake), 4 Control Hub drive motors, a `ControlHubImuBHI260AP` on bus 0 and a `goBILDAPinpoint` on bus 1.
- **`startUdpRobot`, `startOnBotJava({compile, built})` (141-156), `opModesIn`, `listBuilt`.**
- CLI: `node tools/ftc-sim.cjs 127.0.0.2 [--empty] [--onbot]`.

---

## 4. Virtual Control Hub: the device kinds it supports

**Built from JSON** in `src/sim-engine.cjs:349`:

```js
hub={...Ftc.hardware(...), files, opmode, mechanisms?: Ftc.mechanismHardware(...)}
```

It is sent in the bridge `init`. `RunBridge.initHub` and `tickHub` live in `tools/simulation/java/deck/sim/RunBridge.java:346-386`.

**`VirtualHub.java` (453 lines), constructor lines 114-225.** It registers:
- drive motors → `SimMotor(port++, mount)`;
- pods → `SimMotor` used as an encoder only;
- the IMU → `SimSensors.Imu`;
- `SimSensors.Pinpoint` and `SimSensors.Otos`;
- `"Control Hub"` → `SimSensors.Battery`;
- mechanisms:

| Mechanism | Device |
|---|---|
| roller | `SimMotor` or `SimCRServo` |
| kickers, ramps | `SimServo` |
| flywheels | `SimMotor` |
| feeder | `SimMotor`, `SimCRServo`, or `SimServo` (pusher or gate) |
| turret | `SimMotor` with `ticksPerDegree`, or `SimServo` with `center`/`degrees` |

- Port numbers are plain counters (`port++`, `servoPort++`), unrelated to any configuration.
- **Outputs** (`mechanismOutputs()` 379-419): `intake` (the weakest roller per intake, or a kicker near down), `ramp`, `indexer`, `flywheel`, `turretDeg`, `turretDegs[]`.
- **Inputs** (`mechanismState()` 364-374): the flywheel encoder velocity, and the turret encoder from the simulator's turret angle.
- **`devices()`** (445-449) returns each name's effect. The engine keeps it as `e.hubDevices` (`sim-engine.cjs:418`), and the guided-check test reads it.

Device classes:

| Stand-in class | Implements | Behavior |
|---|---|---|
| `SimMotor` | `DcMotorEx` | power, direction, BRAKE/FLOAT, RUN_WITHOUT/USING_ENCODER, RUN_TO_POSITION (`targetTicks()`; `isBusy` against the simulator-fed encoder, tolerance 5), STOP_AND_RESET, `setVelocity`/`getVelocity`, PIDF is a no-op, `getCurrent` is fake |
| `SimServo` | `Servo` | `setPosition`, direction, `scaleRange`; `output()` |
| `SimCRServo` | `CRServo` | power and direction |
| `SimSensors.Imu` | `IMU` | yaw and yaw rate |
| `SimSensors.Pinpoint` | `GoBildaPinpointDriver` | the mount from `pinpointMount` |
| `SimSensors.Otos` | `SparkFunOTOS` | the mount from `otosMount` |
| `SimSensors.Battery` | `VoltageSensor` | 12.8 V |

**Not supported anywhere:**
- There is no stand-in for `AnalogInput`, `DigitalChannel`, `TouchSensor`, `ColorSensor`, `NormalizedColorSensor`, `DistanceSensor`, `RevColorSensorV3`, `Rev2mDistanceSensor`, `ServoImplEx`/`PwmControl`, `LED` or a webcam.
- The stand-ins are listed under `tools/simulation/java/com/qualcomm/robotcore/hardware/` (`CRServo`, `DcMotor`, `DcMotorEx`, `DcMotorSimple`, `Gamepad`, `HardwareDevice`, `HardwareMap`, `IMU`, `ImuOrientationOnRobot`, `Servo`, `ServoController`, `VoltageSensor`). The hardware vendors (`com/qualcomm/hardware/…`) are `GoBildaPinpointDriver`, `RevHubOrientationOnRobot` and `SparkFunOTOS`.
- `HardwareMap` stand-in: `get`/`tryGet` by class and name; `dcMotor` and `voltageSensor` mappings only.
- `tools/simulation/check-ftc-sdk.cjs:122-133` checks that every public member a stand-in declares exists in the real SDK 12.0 (`javap`). A new stand-in must declare only real signatures.

**Engine side** (`src/sim-engine.cjs`):
- `programTick()` (394-421), for `bridge.kind==='opmode'`, turns `reply.mech` into `mechCmd` (`intake`/`spin`/`feed` when the value is above 0.2, the turret degrees, the ramp).
- `setGamepad(user, state)` (424).
- `hubDevices` holds `reply.devices`.
- The tick message (412) carries `mech: this.mechanismState()`, which is built at lines 274-276: `flywheelTicksPerSecond`, `turretTicks` and so on.
- Kinematics: `this.kin = new Kin.Driver(c.kinematics)` (121). `routeJoints(act)` (261) starts kinematics actions by name, **only when a route reports `act`**, and the opmode bridge never does.
- Rebuild after any Java change with `node tools/simulation/build.cjs`. It compiles every `.java` file under `tools/simulation/java` (walk) into `sim-runtime/driver/classes`.

---

## 5. `ui/sim-motionmodule.js` (744 lines; exports `plan`, `autonomous`, `actionsFile`, `mechanismHardware`, `motorsOver`)

- It writes `autonomous.py` for the MotionModule runtime (`create_autonomous(module, drive)`): a timed PLAN of drive steps by power and time, with IMU heading hold (`plan()` 24, `autonomous()` 43).
- **`builtIn(name, mech)` (18-23)** is the Python equivalent of `mechanismAction`:
  - `MECHANISMS.run("intake"|"spin"|"aim"|"shoot", n, step)`, `"ramp"` and `"turret"`;
  - `''` for custom names, which go to `robot_actions.py` (`actionsFile` 485).
- **`mechanismHardware(m)` (528-541)** assigns channels: drive motors 1-4, mechanism motors 5-8 (`MM_MOTORS`), servos from 0, CR servos from 6. `mount` is a power sign. Motors have no encoders, so:
  - flywheels are open loop (`SPIN_UP_SECONDS`);
  - a turret is a positional servo, aimed from the **planned** pose (`aimer`, 547), because there is no X/Y sensing.
- `mechanismsPython(m)` (556+) writes the `Mechanisms` Python class with the same timing constants.
- No kinematics. Tests: `tests/sim-motionmodule.test.cjs`, `sim-mechanisms.test.cjs:76`, `sim-mechanism-hardware.test.cjs:115`.

---

## 6. Kinematics (non-game) mechanisms: exported or not?

**Not exported, in any format and with any device.** The data needed already exists:

- **The actuator shape** (`ui/sim-kinematics.js:140-145`, `hardwareOf` 227-235):

```js
{ id, name, kind:'servo'|'crservo'|'dcmotor'|'bldc'|'stepper'|'linear'|'pneumatic'|..., joint, index,
  mode:'position'|'velocity'|'effort'|'states', speed, accel, ratio, home?, states?{name:value},
  transmission?, response?, motor?,
  // hardware for robot code:
  model?, device?:<config name>, reversed?, servo?{min,max,center,range,pwm?,pulse?}, cpr?, power? }
```

- **Joints** have `states` (named positions: degrees or inches) and `drive:{signal:'action'}` for joints moved by route actions with no actuator.
- **Sensors** (`ui/sim-kinematics.js:160-162`) already exist:

```js
{ id, name, kind:'encoder'|'limit'|'potentiometer'|'velocity', actuator|joint, index?, cpr?, at?, band? }
```

  - `Driver.read(id)` (500-506) returns encoder counts, a limit switch's boolean, a value, or a speed.
  - An action step can `wait` on a sensor (`sanitizeAction` 177-194; `Driver.met` 508).
  - **These sensors have no hardware binding:** no device name, port or electrical type.
- **Actions** have this shape:

```js
{ name, steps:[{actuator,command:{state|target|velocity|effort},after,delay,seconds?} | {action} | {pose} | {reach} | {wait:{sensor|actuator|joint, above?,below?,is?}, timeout?}], repeat? }
```

  Plus `poses[]`.
- **`DeckActuators.device(a, states)`** (`ui/sim-actuators.js:134-139`) already converts an actuator into what Java needs:
  - `{type:'Servo', name, positions:{state:pos0..1}, pwm?}`;
  - `{type:'CRServo', name, reversed, power}`;
  - `{type:'DcMotorEx', name, reversed, countsPerTurn, ticks:{state:counts}, power}`.

  Helpers: `position(a,value)`, `valueAt(a,pos)`, `ticks(a,value)`, `countsPer(a)`, `limits(a)`, `speedOf(a)`.
- The Setup UI already edits `device`, `reversed`, `cpr` and `power` per actuator (`ui/sim-mechanism-list.js:59-66` markup, `143-152` handlers).
- The model reaches the engine as `project.kinematics` → `raw.kinematics` → `Kin.forEngine` (`sim-engine.cjs:80`). It is never passed to `teamCode()` (1305), `pedroCode()` (1495), `exportText` or the CLI's `exported()`.

---

## 7. Existing tests by piece

Run any of them with `node --test tests/<f>.test.cjs`. Node 22 is at `/opt/node22/bin/node` here.

| Piece | Tests |
|---|---|
| `mechanismDevices`, `mechanismHardware`, `mechanismsSource`, `checkOpMode` (text), robot names, MotionModule variants, BIOBUZZ on the virtual hub per variant | `tests/sim-mechanism-hardware.test.cjs` (tests at lines 24, 46, 57, 78, 101, 115, 129) |
| `mechanismAction`, RobotActions pruning, OnBot parity with the simulator, two shooters, ramp, kicker | `tests/sim-mechanisms.test.cjs` (55, 76, 88, 185, 295, 327) |
| Guided check on the virtual hub: `checkResults`, `applyCheck`, `hubDevices`, the `operate()` scripted person | `tests/sim-guided-check.test.cjs` (81, 99, 118, 156, 171) |
| `robot-config` parse, check, planPorts, portChoices, movePort, addDevices, newConfiguration; `robot-link` readRobot, writeConfiguration, runCheck, send; OnBot Java; buildErrors | `tests/robot-link.test.cjs` (15, 28, 49, 58, 86, 109, 127, 147, 154, 177) |
| Send to robot and the Guided check in the real app (Playwright, Windows Electron) | `tests/robot-setup-app.cjs` (robot 127.0.0.6, station .7, CDP 9337) |
| Exported OpMode matches the follower; compile and wiring errors | `tests/sim-control-hub.test.cjs`, `sim-hub-mounting.test.cjs`, `sim-export-fuzz.test.cjs` |
| Route steps, sequences in RouteActions | `tests/sim-route-steps.test.cjs`, `sim-action-names.test.cjs`, `sim-actions.test.cjs` |
| Robocol and `SimController` | `tests/ftc.test.cjs` |
| `DeckActuators` (`device`, `position`, `ticks`) | `tests/sim-actuators.test.cjs` (9, 19, 30, 43, 56) |
| `Kin.Driver` ("Lift up", sensors, waits) | `tests/sim-kinematics.test.cjs`, `sim-joints-engine.test.cjs`, `sim-mechanism-universal.test.cjs` (294) |
| MotionModule | `tests/sim-motionmodule.test.cjs` |
| Real SDK compile and stand-in signatures (network) | `tools/simulation/check-ftc-sdk.cjs` |

---

## 8. Extension points

### 8.0 Prerequisite: export kinematics actions at all (the "same actions" gap)

**1. Shared name resolver.** Factor the name parsing in `Kin.Driver.start` (`ui/sim-kinematics.js:435-445`) into a pure function:

```js
Kin.resolveAction(model, name) → {kind:'action', action} | {kind:'move', actuator|joint, value} | null
```

- `Driver.start` keeps calling it.
- The exporter calls it at export time for each name in `exporter.actions(route)` and in the step lists.

**2. A device list for kinematics in `sim-ftc.js`.** Add `kinematicsDevices(kin, robot)` and fold its rows into `robotNeeds` and the virtual-hub JSON, with this row shape:

```js
{part:'kin', id, role:'actuator', field:'kin_<camel>', constant:'KIN_<NAME>', name:a.device||A.camel(a.name),
 device:'servo'|'crservo'|'motor', reversed, setting:{kin:a.id, field:'device'}, ...A.device(a, statesOf(model,a))}
```

- Actuators of kind `bldc`, `stepper`, `pneumatic` or `none` (FTC-illegal or passive) and action-only joints with no actuator: list them as "needs an actuator / not exportable" in `checklist()`.

**3. Generate the Java.** Either a `Parts.java` or a section of `Mechanisms.java` (then generate `Mechanisms` whenever there are kinematics actuators, even when `mechanisms.enabled` is false):
- per actuator: `Servo`, `CRServo` (`DcMotorSimple`) or `DcMotorEx` fields;
- `init` with direction, `STOP_AND_RESET_ENCODER` + `RUN_TO_POSITION` for motors, and the PWM range when `servo.pwm` is not standard (needs `ServoImplEx`; see 8.2);
- `move<Name>(value)` and a `<name>Done()`.

**4. Wire the actions.** In `mechanismAction()` (545), before `return ''`, add a branch that uses the resolver:
- a move becomes `mech.moveLift(LIFT_UP); return step.moving || mech.liftDone();`;
- a multi-step kinematics action becomes a small state machine, or a `Steps`-like helper (as in RouteActions 428-487) with `after`, `delay` and `wait` support.
- Also pass `kinematics` through:
  - `files()` / `onBotJava()` options (1497, 1513);
  - `teamCode()` (`ui/simulation.js:1305`), `pedroCode()` (1495) and `ui/sim-pedro.js` `files`;
  - `robotNeeds` (`ui/simulation.js:1320`);
  - `tools/deck-sim.cjs` `exported()` (186).
- Mirror it in `ui/sim-motionmodule.js` `builtIn()` (18) when MotionModule should get it.

**5. Send to robot.**
- `usePicks()` (`ui/simulation.js:1360`) must write `setting.kin` names into `project.kinematics.actuators[i].device`.
- `RobotConfig.FIXES` may gain `device:<kind>` hints.

**6. Virtual hub.**
- In `src/sim-engine.cjs:349`, add `hub.kinematics=[{id,name,type,reversed,countsPerUnit,servo:{center,perUnit,sign,ratio},...}]`.
- In the `VirtualHub` constructor (114-225), register `SimServo`, `SimCRServo` or `SimMotor` per actuator. Add `kinematicsOutputs()` returning, per actuator, `{target value | power}`:
  - a servo's value = `A.valueAt(a, servo.output())`;
  - a motor in RUN_TO_POSITION gives `targetTicks()/countsPer`; otherwise `commanded(1)` power.
- `RunBridge.tickHub` (360-386) adds `cmd.add("kin", hub.kinematicsOutputs())`.
- `programTick` (`sim-engine.cjs:394-421`): when `bridge.kind==='opmode'`, call `this.kin.axes.get(id).to(value)` or `.push(power)` from `reply.kin`. The motor's encoder is fed back in the tick message (`mech.kin={id: axis.q}`), then `SimMotor.encoder(q*countsPer, v*countsPer)` in a new `hub.kinematicsState()`.

**7. Tests.**
- A new test in the style of `tests/sim-mechanism-hardware.test.cjs:129`: a route with "Lift up" at a pin.
- Simulated route and exported OpMode on the virtual hub must reach the same joint value. The pin must hold until the lift arrives (compare the `e.snapshot().joints` timing).
- Add a compile case to `check-ftc-sdk.cjs`.

### 8.1 (1) Pick hub and port per device in Setup; Send to robot honours it

**Data shape.** Recommended: one sanitized map on the robot, keyed by the same setting key that `robotNeeds` rows already carry:

```js
project.robot.wiring = { "robot.frontLeft": {hub:"control"|"expansion"|<address int>, port:0..3}, // motor family
                         "intakes.0.servo": {hub:"control", port:2},                               // servo family 0-5
                         "kin.<actuatorId>": {...}, "sensor.<id>": {hub, port|bus} }              // analog 0-3, digital 0-7, i2c bus 1-3
```

- Sanitize it in `ui/sim-config.js` `robot()` (78), next to `devices()` (49).
- Add a helper `settingKey(setting)`: `{robot:k}` → `robot.k`; `{list,index,field}` → `list.index.field`; `{kin:id}` → `kin.id`.
- Setup cannot know portal serials. `"control"` resolves to the parent module (`hubOrder(modules)[0]`), `"expansion"` to the first non-parent, and a number to the module with that address.

**Setup UI.**
- Drive and sensors: `deviceNamesPanel()` (`ui/simulation.js:1639-1643`). Add hub and port `<select>`s per slot, saved via `setDevice()` (1644), or a new `setWiring()` (1644-1650).
- BIOBUZZ parts: `intakeCard()` (2044) and `shooterCard()` (2061).
- Kinematics actuators: `ui/sim-mechanism-list.js` (59-66 markup, 150-152 handlers).
- Port options per family come from `RobotConfig.PORTS` and `portFamily` (export both).
- Validate Setup-side conflicts: the same hub, family and port used twice.

**Export side.** In `sim-ftc.js` `robotNeeds()` (54-57), attach `wired: robot.wiring?.[settingKey(row.setting)]` to each row. `missingDevices()` (`robot-config.js:113`) must carry `wired` through.

**Planning.** In `RobotConfig.planPorts(adds, {modules, devices})` (`robot-config.js:122`):
1. Before the free-port loop, place each `add.wired` first: resolve the module; if `portKey` is in `used`, add the problem `"<label>: <port label> has "<other>"."`.
2. Then plan the rest around them, as now.
3. `portChoices` should mark `wired` rows (e.g. `fixed:true`).

**Mismatch on existing devices.** Today `check()` gives `status:'ok'` for a name of the right kind on any port.
- Add `port:'moved'` information when `found.hub`/`found.port` disagree with `wired`, and explain it in `explain()`.
- Writing a moved port needs a new `moveDevices(xml, moves)` that rewrites the `port` (or `bus`) attribute, and possibly moves the line to another `LynxModule`, in the **copy** that `writeConfiguration` saves under a new name. The current rule "nothing already there is changed" is in `addDevices`; keep it for unrelated lines.

**UI flow.**
- In `makePlan()` (`ui/simulation.js:1372-1381`), stop relying on session `portPicks` for wired devices.
- In `showPlan()` (1383-1397), show wired devices as fixed ("from Setup").
- Optionally, write a manual port change back to `project.robot.wiring` so Setup and Send agree, instead of the session-only `portPicks` that is cleared at 1428.

**Virtual hub (optional realism).**
- Add `port`/`hub` to `hardware()` motors and `mechanismHardware()` entries.
- `VirtualHub` uses them for `SimMotor(port…)` in place of `port++`, so `getPortNumber()` matches.

**Tests.**
- Extend `tests/robot-link.test.cjs:58` and `:86`: a wired device lands exactly there, a conflict gives a problem, and others plan around it.
- Extend `tests/robot-setup-app.cjs`.
- Add a sim-config sanitize test (bounds, unknown keys dropped).

### 8.2 (2) Add sensors: configuration XML, Mechanisms.java, virtual hub, guided check

**Sensor catalogue.** New `SENSOR_MODELS`, beside `ui/sim-actuators.js` or in a new `ui/sim-sensors.js`.

| Sensor | Electrical | Configuration XML tag (verify every `xmlTag` against SDK 12.0 with `javap -v` on the `@DeviceProperties`/`@AnalogSensorType`/`@DigitalIoDeviceType`/`@I2cDeviceType` annotations, using the jars `check-ftc-sdk.cjs` downloads) | Java type | Reading |
|---|---|---|---|---|
| Motor encoder (built in) | the motor port's encoder input | none of its own: it **is** the motor's entry | `DcMotorEx.getCurrentPosition()` | counts; `countsPer(a)` |
| REV Through Bore (quadrature) on a motor port | motor port encoder input | a motor tag on that port, as pods use today (`deviceSlots` "plugged into a motor port's encoder"; `planPorts` handles a name listed twice) | `DcMotorEx` | 8192 counts/rev |
| Axon analog feedback, absolute | analog port 0-3 | `AnalogInput` | `AnalogInput.getVoltage()`/`getMaxVoltage()` | `deg = (v - v0)/3.3*360` (calibrated) |
| Potentiometer (REV 270°) | analog | `AnalogInput` | `AnalogInput` | voltage → angle (REV's curve, or calibrated) |
| Touch or magnetic limit switch | digital 0-7 (REV: configure on the odd channel n+1 of an n/n+1 connector; verify) | `RevTouchSensor` or `DigitalDevice` | `TouchSensor.isPressed()` / `DigitalChannel.getState()` (REV parts are active low) | boolean |
| REV Color Sensor V3 | I2C bus 1-3 | `RevColorSensorV3` | `NormalizedColorSensor` + `DistanceSensor` | rgba, mm |
| REV 2m Distance | I2C | `REV_VL53L0X_RANGE_SENSOR` | `DistanceSensor` / `Rev2mDistanceSensor` | mm |

**Data shape.**
- Extend kinematics sensors (`ui/sim-kinematics.js:160-162`) with:

```js
{device, type:'motorEncoder'|'throughBore'|'analog'|'potentiometer'|'touch'|'magnetic'|'color'|'distance', motor?:<actuatorId or config name for encoder-only>, volts?:[v0,v1], degrees?, inverted?}
```

  Keep `kind` for simulation semantics (encoder, limit, potentiometer, velocity). Possibly add a `distance` kind.
- For BIOBUZZ piece sensors (docs' "Later: piece sensors"), add `intakes[k].sensor` and `shooters[k].sensor` in `DeckMechanisms.sanitize` (`ui/sim-mechanisms.js:69`), once the other agent's edit lands.

**`ui/ftc/robot-config.js`:**
- `kindOf` (15): add `analog` (`AnalogInput`), `digital` (`DigitalDevice`, `RevTouchSensor`), `color` (`RevColorSensorV3`) and `distance` (`REV_VL53L0X_RANGE_SENSOR`).
- Update `KINDS` (19), `fits` (20) and `FIXES` (78).
- `PORTS` (91): add `analog:4`, `digital:8`.
- `portFamily` (103): `analog`/`digital`; color and distance → `i2c`.
- `portsTaken` (107): give OTHER_PORT tags their analog or digital keys instead of `[]`. This changes `tests/robot-link.test.cjs:73-74`, which expects digital devices to take no motor or servo port; keep that expectation, but now count them in their own family.
- `tagFor` (114), `portLabel` (138) ("Control Hub analog port 0" / "digital port 1"), `planPorts` (digital: the odd channel first for REV switches), `portChoices` (bus/port ranges).
- `FAMILY_ORDER`/`written` (180): verify the SDK's element order for digital and analog against a real Configure Robot save, since `newConfiguration` is asserted "line for line" against `CONFIG_XML`.
- `check().unused` (75) should list sensors too.

**`ui/sim-ftc.js`:**
- `robotNeeds()` (54): add rows with `need:'analog'|'digital'|'color'|'distance'|'motor'`. An encoder-only port needs a `motor` entry; reuse the actuator's motor name when the encoder is that motor's own.
- `deviceSlots` (40) if drive-level sensors are added.
- `mechanismsSource` / the kinematics generator: fields `AnalogInput`, `TouchSensor`/`DigitalChannel` (`setMode(INPUT)`), `NormalizedColorSensor`, `DistanceSensor`, with helpers `<name>Degrees()` (volts → angle with `_ZERO_VOLTS`/`_VOLTS_PER_DEGREE` constants), `<name>Pressed()` (with `_INVERTED`) and `<name>Millimetres()`.
- `checkOpMode` (879): new steps:
  - an analog angle: move the part to two named positions with the D-pad or its actuator, then A; this records `sensor.<id>.zeroVolts` and `voltsPerUnit`;
  - a limit switch: "press it, then A" detects the polarity, giving `sensor.<id>.inverted`; `?none` if it never changes;
  - color or distance: "hold a piece in front, then A" records the threshold;
  - a Through Bore: turn the part between two states and read counts per unit, giving `kin.<id>.cpr`.
  - Results keys must be parseable by `applyCheck` (1436): add `sensor.<id>.*` and `kin.<id>.*` branches beside the `intakes|shooters` branch (1484-1487).
- Keep the answer-text patterns compatible with `answerButtons()` (`ui/simulation.js:1446`) and `operate()` (`tests/sim-guided-check.test.cjs:23-61`), or extend both.

**Virtual hub (Java):**
- New SDK stand-ins in `tools/simulation/java/com/qualcomm/robotcore/hardware/`:
  - `AnalogInput` (a class in the real SDK: declare only real public members, e.g. `getVoltage()`, `getMaxVoltage()`);
  - `DigitalChannel` (+ `DigitalChannel.Mode`; `getState`, `setState`, `getMode`, `setMode`);
  - `TouchSensor` (`getValue`, `isPressed`);
  - `DistanceSensor` (`getDistance(DistanceUnit)`);
  - `NormalizedColorSensor` / `NormalizedRGBA`, `ColorSensor`.
- Vendor classes as needed: `com/qualcomm/hardware/rev/RevColorSensorV3`, `Rev2mDistanceSensor`, `RevTouchSensor`, and `ServoImplEx`/`PwmControl` for a non-standard PWM range.
- `HardwareMap` (`tools/simulation/java/com/qualcomm/robotcore/hardware/HardwareMap.java`) may need `analogInput`, `digitalChannel` and `touchSensor` `DeviceMapping` fields if generated code uses them; prefer `get(Class,name)`.
- `tools/simulation/check-ftc-sdk.cjs` verifies the signatures (network).
- New `deck/sim/hub/SimAnalog`, `SimDigital` and `SimRange` classes, plus sensor entries in the `VirtualHub` constructor from a new `hub.sensors=[{name, type, source:{sensor:<kin sensor id>}|{actuator}, volts, inverted, ...}]`.
- Feed readings each tick: `programTick` (`src/sim-engine.cjs:412`) adds `mech.sensors={id: this.kin.read(id)}`, or the raw `axis.q`, to the tick message. `RunBridge.tickHub` (363) passes it to a new `hub.sensorState(json)`.
- An encoder on a motor port is `SimMotor.encoder(ticks, tps)`.
- `devices()` (445) should include the sensor readings, so tests can script the person.
- Rebuild: `node tools/simulation/build.cjs`.

**Simulation truth.**
- `Kin.Driver.read()` (`ui/sim-kinematics.js:500-506`) already computes encoder, limit and potentiometer readings from simulated motion.
- Color and distance need a new reading, e.g. a piece in the intake or hopper from `this.world.robots[0].hopper` and the BIOBUZZ ball states in `src/sim-engine.cjs`.

**Tests.**
- `tests/robot-link.test.cjs`: parse, plan and write the new tags and families.
- `tests/sim-guided-check.test.cjs`: a new truth-versus-believed case for an analog zero and switch polarity.
- `tests/sim-mechanism-hardware.test.cjs`: generated fields and init.
- `tools/ftc-sim.cjs` `CONFIG_XML` may gain sensor lines for app tests.

### 8.3 (3) Closed-loop position holding on those sensors instead of timing

**What is timed today, and what replaces it** (all in `mechanismsSource`, `ui/sim-ftc.js:591-870`):

| Mechanism | Today | Closed-loop replacement |
|---|---|---|
| Ramp servo | `RAMP_*_SECONDS` | With analog feedback (an Axon): `done = \|feedbackDeg - targetDeg\| < TOL` or a timeout (keep the old seconds + margin as the fallback). Change `ramp()` (750), and `mechanismAction` 554 to `return step.moving \|\| mech.rampsAt(down);`. |
| Kicker | `KICKER_UP_SECONDS` inside `shoot()` (828) | Same: `shoot()` waits for `kickersUp()`, not for `now-lastIntake >= TRANSFER + KICKER_UP`. |
| Servo turret | `trackServoTurrets()` (800-805) estimate | Read `AnalogInput` → turret degrees in `aimed()` (807). Keep tracking when no sensor is set. |
| Motor turret | `RUN_TO_POSITION`, zero at INIT | Closed loop already. Add homing (a limit switch and/or an absolute analog) in `turretMotor()` (732) or `init`: drive slowly to the switch, `STOP_AND_RESET_ENCODER`, then offset. |
| Feeding / Shoot count | `FEED_CYCLE_SECONDS` × N + `LAST_SHOT_SECONDS` | A piece sensor (color or distance at the shooter): count beam-break edges until N or empty, with a timeout. The docs list this under "Later". |
| Intake at a pin with time 0 | finishes at once | A piece sensor: run until `pieces >= STORAGE` or the time is up. |
| Kinematics servo (new) | — | Feedback within tolerance. Without a sensor: timed by `Kin.moveSeconds(d, speed, accel)` (exported from `ui/sim-kinematics.js:634`), which matches `Axis.done` in the simulator. |
| Kinematics motor (new) | — | `RUN_TO_POSITION` with `A.ticks(a,value)`, done when `!isBusy()`, as the simulator's `Axis.done` (`ui/sim-kinematics.js:369-371`). For an external encoder (a Through Bore on another port), run a PIDF in Java on that encoder's counts with `setPower`, using the actuator's `motor.p/i/d` (`sanitizeMotor` 219-221) as starting gains. A `limit` sensor gives homing. A potentiometer or analog sensor gives an absolute zero. |

**Simulation parity.**
- The simulator's own `Mech.Runner` (`ui/sim-mechanisms.js:285+`) uses the same timed rules, and the docs promise that simulated time matches export time. When a sensor-based rule is added to Java, add the same rule to `Runner` (and `Kin.Driver` for parts). Otherwise the export-versus-simulator comparison tests break:
  - `tests/sim-mechanisms.test.cjs:88`, `185`;
  - `tests/sim-mechanism-hardware.test.cjs:129`;
  - `tests/sim-guided-check.test.cjs` `autonomous()`.
- The virtual hub must feed the sensors (8.2) so that the closed loop actually closes in simulation.

**Settings.**
- Per part: `feedback:{sensor:<id>, tolerance}` (on intakes, turret and kinematics actuators).
- Constants in Java: `<PART>_TOLERANCE_DEGREES` and `<PART>_TIMEOUT_SECONDS`, the timeout being the old timing plus a margin.
- The guided check finds the calibration (8.2). `applyCheck` writes it back.

**Tests.**
- New virtual-hub runs where the true servo is slower than the setting says:
  - the timed export leaves early (and misses);
  - the closed-loop export waits and scores like the simulator.
- Homing: the turret starts off-zero, and the limit-switch homing corrects it.
