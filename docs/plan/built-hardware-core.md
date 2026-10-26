# Package hardware-core: report

## What I built

| File | Change |
|---|---|
| `ui/sim-hardware.js` (new, UMD `DeckHardware`, `require`-able) | Catalogue (HUBS, MODELS/MOTORS/SERVOS/CRSERVOS/LINEARS, SENSORS, ROLES), `settingKey`/`parseKey`, `sanitizeWiring`/`wiringOf`/`reindex`/`prune`, `rows`, `plan`, `placed`, `conflicts`, `wire`, `needs`, `explain`, `hubName`, `portLabel`. |
| `ui/sim-actuators.js` | Every model has `xmlType`. Motors have `feedback:'encoder'`. The six Axon servo/CR models have `feedback:'analog'`. L16-R is `legal:false`. New servos: `studica-multimode-fast`, `swyft-speed/balance/torque/slim/nano`, `plex-speed/torque` (these 7 carry `rangeAssumed:true`, 300°), `torctex-max/pro/micro`, `mata-torque`. New motors: `neverest-60`, `neverest-3-7` (the id has no dot because the sanitize regex forbids it). `device()` is unchanged. |
| `ui/sim-config.js` | `robot()` keeps `wiring` (via `DeckHardware.sanitizeWiring`, loaded lazily so node `require` works). The key is absent when nothing is set. `C.wiring` is exported. |
| `ui/ftc/robot-config.js` | See the "robot-config" section below. |
| `ui/index.html` | Adds `<script src="sim-hardware.js">` right after `sim-actuators.js`. |
| `tools/ftc-sim.cjs` | New exported fixture `SENSOR_CONFIG_XML`, in SDK order: sensors, a Servo Hub and a Limelight. `CONFIG_XML` and `CONFIGURATIONS` are unchanged. |
| `ui/sim-mechanisms.js` | `sanitize`: `shooters[n].hood` is a config name, present only when valid. Absent means a fixed hood: read it as `s.hood\|\|null`. Writing `hood:null` every time would break `sim-mechanism-hardware.test.cjs` deepEquals. |
| `tests/sim-hardware.test.cjs` (new, 6 tests) | New tests for `ui/sim-hardware.js`. |
| `tests/robot-link.test.cjs` | 1 expectation changed on purpose: `RevColorSensorV3` now has kind `color`, not `other`. 4 tests added: sensors/Servo Hub/Limelight, wired placement + conflict + missing hub + parity, check `moved`/`retype`, offline XML round trip. |

## Contract others must know

### `project.robot.wiring`

The shape follows the SPEC, with these deviations:

- **I2C devices** (`robot.imu/pinpoint/otos`) store `bus`, not `port`.
- **Hub addresses:** any integer 1–254 except 173 is accepted. The Expansion Hub defaults to 2 and the Servo Hub to 3. A Servo Hub on the same address as the Expansion Hub is moved up.
- **Placements on a hub the robot lacks are dropped.** This includes motor, analog and digital placements on a Servo Hub. The model is kept.
- **A port claimed twice goes to the first claimant.** Odometry pods are exempt, so a pod can share a drive motor's port.
- **`motor-encoder` sensors have no port.**
- **OctoQuad sensors** share an I2C bus and add `channel` 0–7.
- **Default `use`:** the model's first `measures` entry, or `velocity` on `shooters.N.motor*`.
- `sanitizeWiring` returns `null` when nothing is set, and never throws.
- `wiringOf(robot)` always returns the full shape.
- **Reindexing (UI package must call these):**
  - `reindex(wiring, 'intakes'|'shooters', removedIndex)` on intake or shooter removal;
  - `prune(wiring, key=>keep)` on kinematics joint or actuator removal and on Find again.

### `rows(project, needs?)`

- `needs` defaults to `DeckSimFtc.robotNeeds`.
- Each row is `{key, label, role, family:'motor'|'servo'|'i2c'|'analog'|'digital'|'encoder', kind, device, need, name, model, xmlType, setting, hub?, port?|bus?, wired, encoder, sensors:[{id,model,kind,use,hub?,port?}], joints?, parts?}`.
- **Highlighting:** `joints` holds kinematics joint ids and `parts` holds CAD assembly names. The SPEC asked for one mixed `parts` list; I kept the two apart.
- Hood rows are added from `mechanisms.shooters[n].hood` when `robotNeeds` lacks them.
- Kinematics actuators are added unless their joint is game-driven.
- Then comes one row per non-encoder sensor (`role:'sensor'`, `for`, `use`, `channels?`, `fast?`).
  - The sensor `name` is its config name. Defaults: `<device>Position`, `Home`, `Speed`, `Piece`, `<device>Encoder`, or `octoquad`.

### `plan(rows, wiring)`

- Returns `{assign:{[key]:{hub,port|bus,channel?,wired,label,via?,conflict?}}, problems:[{level:'red'|'amber', keys, text}]}`.
- **`via`:** a Through Bore on an encoder input is read through the name of the motor on that port. It prefers its own motor's port when that port is 0 or 3. When no motor is on the port, the configuration gets a placeholder `Motor` entry under the sensor's name.
- `placed(rows, wiring)` merges the plan into the rows (`planned:true` marks ports Deck chose).
- `conflicts(rows, wiring)` returns all checks plus the plan's own problems. This is the list to show.

### Helpers for the export package

- `needs(placedRows)` gives `RobotConfig.check` needs, sensors included, with `wired` only where the team set the port.
- `wire(robotNeeds, wiring)` attaches `wired`, `model` and `xmlType` to the export's own rows.

### robot-config

- **New kinds:** `analog`, `digital`, `touch`, `color`, `distance`, `octoquad`, `huskylens`, `limelight` (EthernetDevice is no longer a container), `led`, plus NavX.
- **`fits` is strict for touch vs digital.** javap shows `RevTouchSensor` implements only `TouchSensor`, so it does not fit a digital need; research §5.3 said it should. A colour sensor V3 does fit a `distance` need.
- **Port families:** `PORTS` gains `analog:4` and `digital:8`. Servo Hub devices get `module.servoHub`. `modulesOf` and `modulesFromScan` (via `portal.servoHubs`) include Servo Hubs.
- **Tags:** `tagFor` uses the `motorType`, then the model's `xmlType`, then the default. A servo with `pwm` [500,2500] is written as `ServoFullRange`.
- **`planPorts`:**
  - places `add.wired` first;
  - reports a taken port, a missing hub or the wrong channel parity as a problem and leaves that device out;
  - follows the parity rules, fast-encoder order and Servo Hub order;
  - marks Setup-placed assignments `fixed:true`, and `portChoices` returns `[]` for them.
- **`check()` additions** (`ok` is unchanged):
  - `moved:{hub,port|bus,label}` when a device sits on another port than Setup's;
  - `retype` when Setup's motor model has another type;
  - `explain` covers both.
- **SDK element order:** `FAMILY_ORDER` follows motor, servo, analog, pwm, digital, i2c. I verified it by javap of `WriteXMLFileHandler$6`.
- **`configurationFor(rows, wiring, {imu})`** returns `{xml, assignments, problems}`. It writes a Control Hub at 173, plus the Expansion Hub as a `LynxModule` at its address, plus a `ServoHub`, all without a scan. `newConfiguration` writes `portal.servoHubs` after the hubs.
- New exports: `PORTS`, `portFamily`, `portsTaken`, `tagFor`, `hubFor`, `configurationFor`.

## Needed outside my files

1. **`tools/preview.cjs`:** add `'/sim-hardware.js':'sim-hardware.js'` to the `files` map on line 45. Without it `tests/preview-assets.test.cjs` fails ("/index.html missing sim-hardware.js"). This is the only failing test.
2. **`ui/simulation.js`:** call `DeckHardware.reindex` on intake or shooter removal, and `prune` on joint or actuator removal.
3. **`ui/sim-ftc.js`:**
   - `robotNeeds` should emit hood rows (`setting.field:'hood'`, need `servo`).
   - Send to robot should use `DeckHardware.needs(placed(...))` or `wire(robotNeeds, wiring)`, so that `planPorts` honours Setup and `check` reports moved devices.
   - The code must read a Through Bore through `via`.

## Tests

- `node --test tests/sim-hardware.test.cjs tests/robot-link.test.cjs tests/sim-actuators.test.cjs tests/sim-mechanisms.test.cjs tests/sim-mechanism-hardware.test.cjs tests/sim-guided-check.test.cjs tests/deck-sim.test.cjs`: 71 pass, 0 fail.
- Full `node --test tests/*.test.cjs`: 536 tests, 521 pass, 14 skipped, 1 fail. The failure is preview-assets, caused by my script tag; the fix is item 1 above.
- I also loaded the scripts in a vm context with no `require`, in index.html order, to check the browser path.

## Open issues

- **Assumed or inferred figures:**
  - SWYFT and PLEX travel is assumed to be 300°.
  - NeveRest 60 and 3.7 stall torque is scaled from the bare motor.
  - AM-5200 1.056 V is inferred (from research).
- **Hardware-only models:** `matrix-12v`, `gobilda-5201` and `other-motor` are in `DeckHardware.MODELS` only, not `DeckActuators`. The simulator has no numbers for them.
- **Servo Hub placement:** I put the `ServoHub` element after the `LynxModule`s, following the research example. The SDK writes its device list in list order, and I have not verified that against a real save.
- **Scans:** a scan does not report Servo Hubs, so `modulesOf` never marks one missing.
- **Fixing moved ports:** there is no `moveDevices` (rewriting the ports of existing lines). Moved devices are only reported.
