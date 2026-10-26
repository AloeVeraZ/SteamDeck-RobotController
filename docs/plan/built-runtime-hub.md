# runtime-hub: package report

## What I built

### 1. `ui/sim-kinematics.js` (DeckKinematics)
- **`Kin.resolveAction(model, name)`**, a pure function that the exporter can use. It returns one of:
  - `{kind:'steps', action, steps}` when `name` is an action (matched case-insensitively);
  - `{kind:'move', actuator|joint, value, state?}` when `name` is "<part> <named position>" (for example "Lift up") or "<part> to N[°|deg|in]". The value is held within the end stops. A part is either:
    - an actuator, named by its own name or by its joint's name;
    - a joint driven by route actions (`drive.signal==='action'`) that has one value and no actuator;
  - `null` otherwise.
- `Driver.start()` now calls `resolveAction`. Its behaviour is unchanged: the same lookup order, the same clamping and the same `busy()` keys.
- `Kin.moveSeconds` was already exported. A test now checks that it is exported.
- **Servo kicker swing.** A `feeder` joint swings or slides to its feed position while `s.feed` is set, then back to rest. This applies when the joint is `revolute` or `prismatic` and has a finite `states.feed`. It has its own axis, `'feeder:'+id`, at `j.speed` (default 720 °/s, or 30 in/s for a prismatic joint). Continuous feeders still spin as before.
- **Sensor readings for hub ports.** Each reading is taken from the simulated value, in degrees or inches, with the CAD pose as zero:
  - `Kin.VOLTS = 3.3`.
  - `Kin.volts(value, {zeroVolts, voltsPerUnit, unit})` gives 0 to 3.3 V. The defaults are 1.65 V at zero and 3.3/360 V per degree (0.1 V per inch).
  - `Kin.reading(kind, value, o)` works by kind:
    - `encoder`: `round(value·countsPerUnit)`, or `cpr/360` when `countsPerUnit` is missing;
    - `limit`, `touch`, `digital`: closed when `|value − at| ≤ band`. The defaults are at 0 and band 0.5, so a home switch sits at the CAD pose;
    - `analog`, `potentiometer`: volts;
    - anything else: the value.
  - `Driver.measure({actuator}|{joint,index})` returns `{value, velocity, unit}`.
  - `Driver.sense(src, {kind, ...})` returns the reading of one sensor.
  - `Driver.readings()` covers the model's own `sensors`: encoder → `{counts}`, limit → `{pressed}`, potentiometer → `{value, volts}`, velocity → `{value}`.
  - `Driver.unitOf(src)`.
  - `read(id)` is unchanged.

### 2. Virtual Control Hub (Java, `tools/simulation/java`)
**SDK stand-ins.** Each declares only real SDK 12.0 public members. I checked them with `javap` against the 12.0.0 jars, and `check-ftc-sdk.cjs` passes.
- In `com/qualcomm/robotcore/hardware/`:
  - `AnalogInput`: an abstract class with `getVoltage`, `getMaxVoltage`=3.3.
  - `DigitalChannel` with `Mode {INPUT, OUTPUT}`.
  - `TouchSensor`.
  - `DistanceSensor`, including `distanceOutOfRange`.
  - `NormalizedColorSensor` and `NormalizedRGBA` (`toColor`).
  - `ColorSensor`, without the I2cAddr methods.
  - `LightSensor`, `OpticalDistanceSensor`, `ColorRangeSensor`.
  - `PwmControl` and `PwmControl.PwmRange` (defaults 600–2400 µs, 20000 µs frame).
  - `ServoImpl`, `ServoImplEx`, `CRServoImpl`, `CRServoImplEx`.
  - `HardwareMap` gains these `DeviceMapping` fields: `servo`, `crservo`, `analogInput`, `digitalChannel`, `opticalDistanceSensor`, `touchSensor`, `colorSensor`, `lightSensor`.
- Vendor classes:
  - `com/qualcomm/hardware/lynx/LynxModule`: `BulkCachingMode {OFF, MANUAL, AUTO}`, `get/setBulkCachingMode`, `clearBulkCache`, `getModuleAddress`, `isParent`.
  - `com/qualcomm/hardware/rev/RevTouchSensor`, `Rev2mDistanceSensor` (which extends `stmicroelectronics/VL53L0X`), and `RevColorSensorV3` (implements ColorRangeSensor; `rawOptical`).
- **Every hub servo is now a `ServoImplEx`** (`SimServo`), and every CR servo is a `CRServoImplEx`:
  - `setPwmRange` changes the pulse width that is sent.
  - `setPwmDisable` makes the servo limp: `output()` returns NaN.
  - `setPulseWidth` and `getPulseWidth` are supported.
  - `SimServo.pulse()` returns the pulse in µs.
- `SimMotor.targetVelocity()` was added.

**New hub classes:**
- `SimAnalog`.
- `SimDigital`. Its `.Channel` is a DigitalChannel and its `.Touch` is a RevTouchSensor. Both are active-low: the pin reads low while a normally open switch is closed, and `inverted` flips it.
- `SimRange.Distance` (a Rev2mDistanceSensor) and `SimRange.Color` (a RevColorSensorV3).
- `SimModule`, which is both a LynxModule and a VoltageSensor (12.8 V). It replaces `SimSensors.Battery`, so `getAll(LynxModule.class)` and `get(VoltageSensor.class, "Control Hub")` both work.
- A part or sensor whose name is already used by the drive or a game mechanism is **not** registered. The existing device keeps the name.

**Game mechanisms:** `shooters[].hood` (a `{name}` or a string) is registered as a servo, with `devices()` reporting its position.

### 3. Engine (`src/sim-engine.cjs`)
- `run({kind:'opmode'})` adds `hub.kinematics`, `hub.sensors`, `hub.modules` and `hub.state` (the initial readings, so that `init()` can read them and zero encoders at the CAD pose).
- Each tick message carries:
  - `kin: {actuatorId: [value, velocity]}` for motor parts;
  - `sensors: {name: reading}`.
- The reply's `kin` drives the axes in `driveParts()`. A command identical to the part's previous one is not re-sent.
- Readings come from `Kin.Driver.measure`, from `mech.turrets[n]`, or from the game pieces in the hopper.
- `hubKinematics` and `hubSensors` are exported for tests.

## CONTRACT (the exporter can produce this; the engine has a built-in fallback)
**Engine hook.** If `DeckSimFtc.kinematicsHardware(kinematics, robot)` exists, it must return the `hub.kinematics` array. If `DeckSimFtc.sensorHardware(robot, kinematics, mechanisms)` exists, it must return the `hub.sensors` array. Otherwise the engine builds both itself.

**Fallback naming:**
- An actuator is named `a.device || DeckActuators.camel(a.name)`.
- A sensor is named `s.name || s.id`.
- Kinds that are skipped:
  - actuator kinds `bldc`, `stepper`, `pneumatic`, `hydraulic`, `spring` and `none`;
  - sensor model kinds `motorEncoder` (the motor's own encoder) and `octoquad`.

**`hub.kinematics[]`:**
```
{id, name, type:'servo'|'crservo'|'motor', reversed:bool, countsPerUnit, port?,
 servo:{center, perUnit, sign, ratio?, pwm?:[lo,hi], defaultPwm?:[lo,hi]}}
```
- **Servo.**
  - The joint value is `(p − center)·perUnit/(sign·ratio)`. This is the inverse of `DeckActuators.position`.
  - `p` is read from the pulse actually sent, measured against `pwm` (the pulses that `perUnit` assumes; default 600–2400). Code that omits a needed `setPwmRange` therefore misplaces the part, just as it would on the robot.
  - `defaultPwm` is what the configured servo type sends before any `setPwmRange`, for example ServoFullRange at 500–2500.
  - Fallback values: `sign = reversed ? −1 : 1`, `ratio = a.ratio`, `perUnit = DeckActuators.perUnit(a)`.
- **Motor.**
  - Raw ticks are `mount·value·countsPerUnit`, where `mount = reversed ? −1 : 1`. The code sets REVERSE when the motor is reversed.
  - RUN_TO_POSITION produces `{value, power}`; the speed is scaled by the power when the axis is ideal.
  - `setVelocity` produces `{velocity}` in units per second.
  - Otherwise the motor produces `{power}` (an effort).
  - The fallback `countsPerUnit` is `DeckActuators.countsPer(a)`.
- **CR servo:** `{power: mount·power}`.

**`hub.sensors[]`:**
```
{name, type:'analog'|'digital'|'touch'|'distance'|'color'|'encoder', port?, inverted?,
 source:{actuator}|{joint,index?}|{turret:n}|{piece:'intake'|'shooter', index, count?},
 zeroVolts?, voltsPerUnit?, countsPerUnit?, cpr?, at?, band?, near?, far?, zeroMm?, mmPerUnit?}
```
- Readings by type:
  - `analog`: volts (`Kin.volts`).
  - `digital` and `touch`: closed when within `band` (0.5) of `at` (0, the CAD pose). Java applies active-low and `inverted`.
  - `encoder`: `[counts, counts/s]`. If the name matches an existing motor, the reading feeds that motor's encoder input (for a Through Bore on the actuator's port).
  - `distance`: mm, or null when nothing is in range.
  - `color`: `{mm, r, g, b, a}` on a 0–1 scale.
- Piece sources:
  - A shooter sensor sees the next piece of its kind while one is held.
  - An intake sensor sees the last piece once the robot is full.
  - Colors: nectar is red or blue, pollen is green.
- Fallback mapping from `robot.wiring.sensors`:
  - `for:'kin.<id>'` maps to an actuator or a joint.
  - `use:'piece'` on `intakes.N.*` or `shooters.N.*` maps to the piece at that intake or shooter.
  - `shooters.N.turretMotor` maps to `{turret:N}`.
  - `shooters.N.hood` maps to the hood joint.
  - The type comes from the DeckHardware catalog (`kind`, `family`, `xmlType`).
  - An uncalibrated analog sensor gets `zeroVolts = voltage/2` and `voltsPerUnit = voltage/degrees` from its catalog model.

**`hub.modules`:** `[{name:'Control Hub', address:173, parent:true}, {name:'Expansion Hub <addr>', address}]`. The second entry is present when `wiring.hubs.expansion` is set.

**`hub.state`:** `{kin, sensors}`, in the same format as the tick message.

**Mechanisms:** `hub.mechanisms.shooters[k].hood = {name}` registers a servo.

## Tests (all after `node tools/simulation/build.cjs --public`)
- **New `tests/sim-hub-sensors.test.cjs`: 4/4 pass.**
  1. A servo arm plus Axon-style analog feedback plus a touch sensor, through the virtual hub. The volts track the simulated joint every tick (to within 1 mV) while the arm swings at 90°/s. The touch sensor opens and closes with the joint. The code reads the feedback to turn round at the top and ends when the home switch closes. The same test runs a motor lift with RUN_TO_POSITION and checks its encoder counts. It also checks that `getAll(LynxModule)` returns one module.
  2. Unit checks of `Kin.reading`, `volts`, `measure`, `sense` and `readings`.
  3. A contract test on `hubKinematics` and `hubSensors`. Servo value equals the inverse of `DeckActuators.position`; sensor types and sources are checked.
  4. A motor lift on power homes onto a DigitalChannel switch while a Rev2m distance sensor follows it. Two LynxModules are present with MANUAL caching and `clearBulkCache`, and `devices()` shows the readings.
- **`tests/sim-joints-engine.test.cjs`: 6/6 pass.** Two tests were added: resolver equivalence plus `Driver.start`, and the servo kicker swing versus a feeder wheel.
- **Broad runtime set: 160 tests, 149 pass, 0 fail, 11 skipped.** The set was `sim-mechanism-hardware`, `sim-guided-check`, `sim-joints-engine`, `sim-engine`, `sim-control-hub`, `sim-hub-sensors`, `sim-kinematics`, `sim-actions`, `sim-editor-onbot`, `sim-pedro-runtime`, `sim-mechanisms`, `sim-route-steps`, `sim-route-modifiers`, `sim-setups`, `sim-unified-planning`, `sim-action-names`, `sim-kinematics-robots` and `deck-sim`. The skips are pre-existing environment skips: the Pedro jars were not fetched, and there is no MotionModule source. The baseline before my changes on the core six files was 61 tests, 60 pass, 1 skip.
- **`node tools/simulation/check-ftc-sdk.cjs` (network): exit 0.** Every export compiles against the real SDK 12.0 and Pedro 3.0.2. "Stand-ins: 311 public members match the real SDK."
- I also compiled a sample with every new sensor, PWM and LynxModule call against both the real 12.0 jars and the stand-ins: no errors or warnings.

## Open issues / notes for others
- **sim-config** sanitizes `wiring.sensors` without `at` or `band`, so every wired switch is a home switch at the CAD pose (band 0.5 unit). If an end-of-travel limit is wanted, keep `at` and `band`; the hub already honours them.
- Bulk caching is stored but reads are always fresh. A missing `clearBulkCache()` in MANUAL mode is therefore not caught.
- The REV potentiometer is modelled as linear (`zeroVolts + voltsPerUnit·value`). Volts are clamped to 0–3.3 V, not to a sensor's own lower maximum (for example 1.056 V for the AndyMark HexBore).
- Not stood in:
  - `AndyMarkTOF` (a 'distance' type is registered as Rev2mDistanceSensor; `get(DistanceSensor.class)` works);
  - the `ColorSensor` I2C address methods;
  - `LynxModule.getInputVoltage` and `BulkData`;
  - OctoQuad.
- **Exporter:** for a non-standard `servo.pwm`, generate `ServoImplEx.setPwmRange(new PwmControl.PwmRange(lo, hi))`. The hub models the pulse, so leaving it out moves the part elsewhere.
- **`tools/simulation/check-ftc-sdk.cjs`** (not mine) could gain a compile case for the new kinematics and sensor code once the exporter generates it.
- **sim-actuators** (other package) is unchanged by me. I use `DeckActuators.servo`, `perUnit`, `countsPer`, `camel`, `position` and `ticks`.
