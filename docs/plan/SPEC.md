# Deck: robot wiring, sensors, closed-loop export, highlight, Test setup — shared spec

Repo `/home/user/SteamDeck-RobotController`. Research reports (read the ones your package names):
`/tmp/claude-0/-home-user-SteamDeck-RobotController/64e054cf-3d7b-51d2-b4a0-eb77c1e0e167/scratchpad/research/`
`mechanism-model.md`, `ftc-export.md`, `ftc-hardware.md`, `visuals-defaults.md`, `release.md`, `critique.md`.

## What the user asked for (their words, condensed)

1. Setup is a linear path: Field → Robot → Robot controller → Mechanisms → Path planning (done, committed).
   Red = a value that breaks the simulation and blocks the next step; amber = please check (done).
2. Imported CAD is the robot in its **zero position**; after import you set each part's degrees of freedom.
3. For every mechanism part (Turret 1, Flywheel 1, Hood 1, Turret 2, Flywheel 2, Hood 2, intake rollers, ramp,
   kicker, lifts…): pick **what drives it** from every FTC-legal motor/servo (goBILDA, REV, Axon incl. the Axon
   analog position-feedback wire, CR servos, linear servos…), **which sensors track it** (motor encoder,
   REV Through Bore, analog absolute encoder / Axon feedback, potentiometer, limit/touch/magnetic switch, color /
   distance for pieces…) and **which hub + port** the actuator and each sensor are plugged into — so position comes
   from sensors instead of timing.
4. While editing a mechanism (click, focus, expand, or scroll a row into view) its CAD parts are **highlighted** on the
   model preview on the right, so the user sees what is what.
5. Robot step: drivetrain detected from the CAD (or chosen manually), and a popup "what is connected to what on the
   Control Hub" — set up the robot configuration in Deck exactly as on the hub (motor model per port, odometry,
   IMU…), when the robot controller is the Control Hub.
6. Export: from those choices Deck generates the robot configuration + Mechanisms + the autonomous of the planned
   path, uploads/builds it with the existing **Send to robot**, cross-checks against the robot's configuration when
   connected, and it just runs the planned path on the real robot. **The same route actions must work in the
   simulator and on the robot** (Intake, Ramp down/up, Spin up, Aim, Shoot, Turret to °, and named positions such
   as "Lift up").
7. Default setup "Test setup" (generated FTC-part robot, Control Hub, BIOBUZZ red, long auto).
8. Testing release 2.4.23, Windows download only. (User explicitly authorized pushing to `testing` for this.)

## Shared data model (everyone builds against THIS)

### Setting keys
One string per physical device, identical to the setting rows `F.robotNeeds` already carries:
- drivetrain / sensors: `robot.<key>` with key in `C.DEVICE_KEYS` (`frontLeft, frontRight, backLeft, backRight,
  left, right, imu, pinpoint, otos, par, perp, par_left, par_right`)
- game mechanisms: `<list>.<index>.<field>`: `intakes.N.motor`, `intakes.N.motor2`, `intakes.N.servo`,
  `shooters.N.motor`, `shooters.N.motor2`, `shooters.N.indexer`, `shooters.N.turretMotor`, `shooters.N.hood`
  (new role, see below)
- kinematics actuators: `kin.<actuatorId>`
- sensors: `sensor.<sensorId>`
Helper `DeckHardware.settingKey(setting)`: `{robot:k}`→`robot.k`; `{list,index,field}`→`list.index.field`;
`{kin:id}`→`kin.id`; `{sensor:id}`→`sensor.id`.

### `project.robot.wiring` (sanitized in `ui/sim-config.js` `robot()`, so robot files, setups, CLI carry it)
```js
wiring = {
  hubs: { expansion: null | {address: 2..254}, servoHub: null | {address} },     // Control Hub always present
  devices: { [settingKey]: { model?: <DeckActuators/DeckHardware model id>, hub: 'control'|'expansion'|'servoHub',
                             port: int } },
  sensors: [ { id: /^[A-Za-z][\w-]{0,31}$/, model: <sensor model id>, for: <settingKey of the device it measures,
               or 'kin.<jointId>'>, use: 'position'|'home'|'velocity'|'piece',
               hub, port?: int (analog 0-3, digital 0-7, motor-encoder 0-3), bus?: int (i2c 1-3),
               name?: config name, inverted?: bool, zeroVolts?: number, voltsPerUnit?: number, countsPerUnit?: number } ]
}
```
Only what the user set is stored; missing entries mean "Deck plans it". Unknown keys/models dropped, ports clamped
to the hub's range, duplicates resolved (first wins), sensors capped at 32. Reindex on intake/shooter/joint removal
(follow the existing `Kin.reindex` / intake removal code paths).
Default device names stay where they are today (`robot.devices` names, mechanism `motor`/`servo` fields,
`kinematics.actuators[].device`).

### Catalog module `ui/sim-hardware.js` (UMD global `DeckHardware`, also `require`-able), loaded in `ui/index.html`
before `simulation.js` (keep `tests/preview-assets.test.cjs` green). It owns:
- `HUBS`: `control` (Control Hub: motor 0-3 each with an encoder input, servo 0-5, analog 0-3, digital 0-7,
  i2c 0-3 with the internal IMU on bus 0), `expansion` (same ports, address), `servoHub` (servo 0-5, 6 V).
  Facts from `ftc-hardware.md` §1 (touch sensors only on odd digital channels, REV potentiometer on even analog
  channels, high-rate encoders on motor ports 0/3, analog reads 0-3.3 V).
- `MOTORS` (re-export / extend `DeckActuators.MOTORS` with `xmlType`, `cpr` at the output, `rpm`), servos with
  `xmlType` (`Servo` | `ServoFullRange`?) and `feedback:'analog'` for Axon MAX+/MINI+/MICRO+ etc., linear servos,
  CR servos. Add the season-legal ones the report lists as missing.
- `SENSORS`: `[{id, name, kind:'motorEncoder'|'throughBore'|'analogAbs'|'axonFeedback'|'potentiometer'|'touch'|
  'magnetic'|'limit'|'color'|'distance'|'octoquad', family:'encoder'|'analog'|'digital'|'i2c', xmlType, javaType,
  measures:['position'|'velocity'|'home'|'piece'], cpr?, degrees?, voltage?}]` (from `ftc-hardware.md` §4/§8).
- `ROLES`: per device role (`drive`, `roller`, `ramp`, `kicker`, `flywheel`, `feeder`, `turret`, `hood`,
  `kin-servo`, `kin-crservo`, `kin-motor`, `kin-linear`, `pod`, `imu`, `pinpoint`, `otos`) → allowed actuator
  kinds/models, allowed sensor kinds, family (motor|servo|i2c), and a one-line plain-English explanation.
  Respect the critic's matrix (`critique.md` §1(a)): flywheel velocity only from the motor encoder (Through Bore
  saturates); turret may be motor (+encoder/through-bore/limit) or servo / CR servo + Axon analog; hood = servo.
- `settingKey`, `sanitizeWiring(raw)`, `rows(project)` → every device the robot needs
  `{key, label, role, family, name, model, hub, port, parts?: [CAD part keys / joint ids for highlighting]}`
  built from `F.robotNeeds` rows + kinematics actuators + sensors (sim-ftc stays the source of the device list;
  `rows` may take the robotNeeds output as an argument to avoid a circular dependency),
  `plan(rows, wiring)` → deterministic offline port plan for un-wired rows (drive motors Control Hub 0-3, other
  motors Expansion Hub first, servos Control Hub first, I2C sensors from bus 1) returning `{assign, problems}`,
  `conflicts(rows, wiring)` → problems like "Control Hub motor port 2 is used by Turret 1 and Flywheel 2".
- Plain-English `explain(row)` strings for the UI ("Axon MAX+ on Control Hub servo port 2; its feedback wire on
  analog port 0 tells the turret angle").

### CAD = zero
The imported CAD pose is joint value 0 for every part: encoder counts are 0 there, a servo's `center` is the
servo position that holds the CAD pose, named positions are joint values. Exports derive servo positions/encoder
targets through `DeckActuators.position()/ticks()` from joint values. The INIT instruction becomes "start the
robot with every mechanism as in your CAD". Turret `zero` (CAD heading of the turret) is honoured as an offset.

### Hood
New device role `shooters.N.hood` (servo). Sanitize: `shooters[n].hood` = config name string or null (null = fixed
hood, today's behaviour). Export sets the hood to its shoot position on Spin up/Shoot (`HOOD_n_SHOOT/REST` from the
joint `launch`/`states`). Virtual hub registers it as a servo.

## Rules for every package
- Code style: match the surrounding code (dense one-line JS, short comments that say what/why, British-ish
  plain wording in UI text like existing strings). No new dependencies.
- Keep old saves loading unchanged: new fields optional; sanitize never throws.
- Run the tests touching your files: `node --test tests/<file>.test.cjs` (node 22 is on PATH; the simulator runtime
  is built in ui/vendor + sim-runtime; after editing `tools/simulation/java/**` run
  `node tools/simulation/build.cjs --public` (~10-60 s) before Java/runtime tests). Report pass/fail counts honestly.
- Don't commit, push or touch git state (no stash/checkout/reset) unless your instructions say so; the lead commits.
- Don't edit files outside your package's list; if you need a change elsewhere, describe it exactly in your report.
