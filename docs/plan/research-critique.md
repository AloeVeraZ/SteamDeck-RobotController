# Completeness critique of the research reports (mechanism-model, ftc-export, ftc-hardware, dsim-flower, visuals-defaults, release)

Repo: `/home/user/SteamDeck-RobotController`, branch `claude/zealous-galileo-brknjs` @ `b82e2c9`, 26 Oct 2026.
Read-only: no repo file was changed. My probes live in
`/tmp/claude-0/-home-user-SteamDeck-RobotController/64e054cf-3d7b-51d2-b4a0-eb77c1e0e167/scratchpad/critic/`
(`flower-reach.cjs`, `route-trace.cjs`, `ramp-trace.cjs`, `ts-f1*.json`).

The only user voice is "make sure that ... they're able to do the same actions". Items (a) to (e) come from the workflow script.

---

## 0. Ranked blockers (read first)

1. **The Test setup route does not meet (d) and its flower leg does not work.**
   - The route in `research/try/test-setup-candidate.json` visits the garden, the red loading zone and F1. It does **not** visit **F2** or any **blue-side floor pollen**.
   - Its F1 leg picks up **0** pollen, even though the runtime already contains the dsim-flower fix (`sim-runtime/dsim-host.cjs` was rebuilt at 17:33 and the route was tested at 17:46–17:53).
   - Root cause (my trace, `critic/ramp-trace.cjs`):
     - "Ramp down" at pin 5 (24, 48.6) runs while the robot is ~8 in from F1. The physics swing is blocked: at t=11.33, `bbRampOut` becomes false and `bbRampBlocked` becomes true.
     - Deck keeps `rampDown=true` (`src/sim-engine.cjs:253` only pushes on Deck-side changes), so the drawn ramp and the physics ramp disagree, and nothing is picked up.
     - **Fix verified:** pin 5 at (32, 48.6) "Ramp down", and pin 6 at (19.8, 48.6) "Intake 2.5 s then Ramp up". Result: 18.72 s, picked up 10, 14/14 shots, 2 tips, 40 pts.
   - F2 by teleop with the same robot (reach 5, `appearance:'custom'`): start (48.6, 110, 90°) → 4/4 pollen, robot stops at y≈124.2. **F2 has not been verified as a planned route.**
2. **The hood has no hardware anywhere in export.**
   - `F.mechanismDevices` (`ui/sim-ftc.js:562-578`) emits roller, kicker/ramp, flywheel, feeder and turret. There is no hood device. `shooter.hood` is just a fixed angle.
   - "Hood 1/2: choose actuator, sensor, port" in (a) therefore needs a new device role. No report flagged this.
3. **Kept `RobotActions.java` will silently override newly exported part actions.**
   - `robotActions()` (`ui/sim-ftc.js:496-542`) writes `@Override public boolean <slot>(Step){ return true; }` for every custom name ("Lift up"…).
   - The file is created once and kept on the robot (`send` skips `keep` files the robot has).
   - Once "Lift up" is implemented in RouteActions/Mechanisms, a robot that already has the old stub still runs `return true`, and the lift never moves. This contradicts "same actions on the robot".
   - The new export must either dispatch kinematics moves outside the overridable slot, or detect and offer to replace untouched generated stubs.
4. **Data-shape decision is unresolved, and file ownership is a blocker.**
   - mechanism-model and ftc-export propose **different** storage for hub/port (see §2).
   - Three files are being edited by the other agent and are uncommitted: `ui/sim-mechanisms.js` (+82/−38), `ui/sim-robot-model.js` and `ui/sim-discovery.js`, plus `src/sim-model.cjs`. The per-device fields that both reports put in `DeckMechanisms.sanitize` need the first of these.
   - The `tools/simulation/build.cjs` ramp-blade fix (dsim-flower) is also uncommitted. release.md and visuals-defaults both attribute it to "the other agent".
   - Nothing can be committed or released until ownership and sequencing are settled.
5. **Release (e) needs explicit user push authorization.** See §1(e).
   - `AGENTS.md`: "this release's push authorization does not carry forward".
   - The relayed request contains no release or push wording, and the computed task text carries no user authority.
   - So: prepare locally, then ask before `git push` or tagging.

---

## 1. Coverage per requirement

### (a) Setup → Mechanisms: actuator model + sensors + hub/port per mechanism, CAD highlight, CAD = zero

**What the reports deliver well:**
- The two-model split (`project.mechanisms` vs `project.kinematics`): mechanism-model §0, §9.
- The actuator catalogue: `ui/sim-actuators.js`, plus ftc-hardware §2.3/§8 `xmlType` and the Axon feedback.
- Highlight mechanics (mechanism-model §7, §11(3)).
- An inventory of where CAD-relative zero is used (mechanism-model §8).

**Gaps:**
- **No per-role "allowed actuator / allowed sensor" matrix.** The UI must restrict choices to what each role's export supports. Proposed, from code plus ftc-hardware:

  | Role (setting field) | Actuator kinds export supports today | To add | Sensible sensors |
  |---|---|---|---|
  | roller (`intakes.N.motor/motor2`) | motor, crservo | — | none (open loop), motor encoder optional |
  | ramp / kicker (`intakes.N.servo`) | servo | linear servo (as `Servo` tag) | none (timed), Axon analog, pot, limit |
  | flywheel (`shooters.N.motor/motor2`) | motor | — | **motor encoder only**. A Through Bore's `getVelocity()` saturates at ~240 rpm (ftc-hardware §1.1), so it cannot read a flywheel |
  | feeder (`shooters.N.indexer`) | motor, crservo, servo (pusher or gate) | — | none, piece sensor later |
  | turret (`shooters.N.turretMotor`) | motor or servo, **globally** (`m.turret.kind`) | **CR servo + analog (Axon CR turret)**: a new kind in `TURRETS` (`sim-mechanisms.js:39`), Runner, export and VirtualHub. Per-shooter kind | motor encoder; Through Bore on encoder port **0/3**; Axon analog; limit switch for homing. A REV pot covers only 270°, which is less than the turret's ±170° = 340° |
  | **hood (new)** | — | servo; device role `hood`, positions from joint `launch`/states | none, Axon analog |
  | kinematics actuator (`kin.<id>`) | servo, crservo, dcmotor, linear (`FTC_KINDS`) | export path (ftc-export §8.0) | encoder, limit, potentiometer, analog |

- **Flywheel and turret settings are global.**
  - `m.shooter.ticksPerRev/rpm/pidf` and `m.turret.kind/ticksPerDegree/servoCenter` are shared by both shooters (mechanism-model §6).
  - If Flywheel 1 and Flywheel 2 use different motor models, or Turret 1 is a motor and Turret 2 an Axon, the data model breaks.
  - Each must move into `shooters[n]` with a global fallback. That lives in `sim-mechanisms.js` (other agent's file).
- **CAD = zero for game devices is not reconciled with export.**
  - Today the motor turret's encoder zero is "facing forward at INIT" (`ui/simulation.js` ~245: "Start the robot with each turret facing forward").
  - `turret.servoCenter` is "faces robot front", while the joint `zero` is the turret heading in the CAD. Ramp `downPos/upPos` and feeder `feedPos/restPos` are absolute servo numbers, unrelated to joint states.
  - For "CAD is the zero of every joint", the export must:
    - add a `TURRET_n_ZERO_DEGREES = joint.zero` offset;
    - derive servo positions from joint values through `DeckActuators.position(a, value)`, with `center` = the servo position at the CAD pose;
    - change the INIT instruction to "start with every mechanism as in the CAD".
  - The guided check should then calibrate `center` (the position at the CAD pose) and the sign, not raw down/up numbers.
  - The Test setup template already shows the inconsistency: ramp joint 0→85° but `downPos:0, upPos:1` (300° on a goBILDA servo), and kicker joint 0→−40° but `feedPos:1, restPos:0`.
- **The CAD pose may not be a legal start pose** (for example a ramp drawn deployed, outside 18 in).
  - `joint.home`/`actuator.home` exist in sanitize but have no UI (mechanism-model §8).
  - Decide whether "zero" means the CAD pose or a home pose, and expose `home` if needed.
- **Servo speed figures are 6 V; hub servo ports are 5 V** (ftc-hardware §3.2: use the 4.8 V column). The REV Servo Hub defaults to 6 V.
  - If the timed fallback or sim swing time is derived from the model, the choice of hub must pick the speed column. Otherwise the sim runs ~20 % faster than the robot.
- **Highlight cost.** `preview.highlight` is O(all triangles) per call (mechanism-model §7.1), and `mechRig()` is full resolution. Scroll-driven highlight on large CAD will stutter.
  - Throttle it (rAF), and cache per-leaf triangle lists once per geometry.
  - Below 1100 px the aside is not sticky (`simulation.css:198-203`), so scroll-highlight is invisible there. Make it sticky, or highlight only on focus/click there.
- **Game-driven joints** (turret, hood, flywheel, roller, deploy) are hidden from the Mechanisms list (`isMechanism`, `sim-joints.js:111`).
  - The new per-device rows must live in the game cards (`intakeCard`/`shooterCard`, `simulation.js:2044-2078`) or a new per-device table, and the highlight must resolve `shooter:N` → `drive.of` joints + `parts` names.
  - The other agent now keeps `<n>` suffixes in shooter `parts` and splits two-turret assemblies. Re-check the resolver after their commit.
- **Kinematics ids may change** when "Find again" re-runs discovery (`sim-joints.js` `discover()`/`adopt`). Wiring keyed by `kin.<actuatorId>` can orphan. Game keys `intakes.N.*` shift on removal. Any wiring map needs the same reindexing as `Kin.reindex` (`simulation.js:2169`).

### (b) Setup → Robot: drivetrain from CAD or manual, plus a Control Hub wiring editor (drive motors, odometry, IMU)

**No report studied this step.** Facts:
- The **Robot** page (`ui/simulation.js:188-213`) has the drivetrain select (`#sim-drivetrain`, line 208), "Motors & power" with a single **Wheel RPM** (209), and CAD import.
  - CAD detection already exists: `MECH.drivetrainFromNames(result.names)` at `simulation.js:1827`. GLB imports have no names, so no detection.
- **Device names, sensors (odometry), IMU source and hub mounting live on the "Robot controller" page** (`simulation.js:214-215`; `deviceNamesPanel` 1639, `setDevice` 1644, hub logo/USB 1611).
  - The user says "Setup → Robot". Decide: move these into Robot, or put the wiring editor in Robot and link to them. Do not duplicate state.
  - `AGENTS.md`: robot connection setup stays in Settings, so the editor must not take an IP.
- **Drivetrains that cannot be exported:**
  - `C.drives` (`ui/sim-config.js:5-16`) offers swerve, xdrive, kiwi, hdrive and diffSwerve.
  - `F.hardware` (`ui/sim-ftc.js:21-37`) throws for anything but mecanum and the TANK set (`:13`).
  - The wiring editor needs a per-drivetrain slot set. Show "not exportable" for the others, or scope to mecanum/tank.
- **Drive ticks come from RPM, assuming a 28 cpr × 6000 rpm motor** (`ticksPerRev(rpm)=28*6000/rpm`, `sim-ftc.js:9`, used at 25/34).
  - This is wrong for Core Hex (288 cpr @125), NeveRest 20 (537.6 @340) and others.
  - A per-port motor model must feed CPR from the catalogue and derive or replace `robot.driveRpm`. Warn when the four drive motors differ.
- **Pods get their own names (`par`, `perp`; `PODS`, `sim-ftc.js:15`) and so their own motor ports in `planPorts`.**
  - Physically a pod plugs into a drive motor's encoder port and shares that motor's configuration entry.
  - The editor needs "pod on encoder port N of hub H", resolved to the motor name on that port (`planPorts` already lets a name listed twice share one port).
  - The same applies to a **Through Bore on a mechanism**: the code must read it through the DcMotorEx configured on that port, keep that motor in `RUN_WITHOUT_ENCODER`, and never `STOP_AND_RESET_ENCODER` it unintentionally. Prefer ports 0/3 for 8192 cpr.
- **Setup has no model of which hubs exist** (Control Hub only, plus an Expansion Hub at address N, plus a Servo Hub).
  - The editor needs one to offer ports. It also enables offline configuration XML: a Control Hub portal `(embedded)`/173, with an RS485 Expansion Hub as `<LynxModule port="2">` inside the same portal, needs no serial.
  - `newConfiguration` today requires a scan (`ui/ftc/robot-config.js:181`).
- The IMU is fixed on I2C bus 0 of the parent hub. The Pinpoint and OTOS take bus 1–3. `imuSource` is `hub|external|module|device` (`simulation.js` sanitize).

### (c) Export: auto + Mechanisms.java + configuration, closed loop, Send to robot, cross-check; same actions in sim and on robot

ftc-export is thorough on the pipeline. Still missing:
- **Hood device** (§0.2) and the **RobotActions override trap** (§0.3).
- **Authority on mismatch.**
  - When the robot's configuration has `frontLeft` on port 1 but Setup says 0, `addDevices` never changes existing lines, and `check()` only compares name and kind (`robot-config.js:63-77`).
  - Decide: update Setup from the robot (import), or write a new configuration copy with moved ports (ftc-export §8.1 `moveDevices`). Also compare the motor **type tag** with the chosen model's `xmlType`, and `Servo` vs `ServoFullRange` with the model's PWM.
- **"When connected" is undefined.** Today the configuration is read only on "Send to robot" (`#sim-send-go`, `simulation.js:1417`). Specify when the cross-check runs, for example when the Export/Send panel opens with a saved robot from Settings.
- **SDK version of the robot is unknown.**
  - `check-ftc-sdk.cjs` validates against 12.0.0 only, and `robot-link.cjs` does not read the robot's SDK version.
  - Avoid 12.0-only APIs (`PwmControl.setPulseWidth`). `ServoFullRange` and `goBILDAPinpoint` need ≥10.3 (ftc-hardware §1.4, §4).
- **Bulk caching.** The generated code never sets `LynxModule.BulkCachingMode`; grep finds 0 hits in `ui/sim-ftc.js` and `ui/sim-follower-source.js`. Adding analog/digital/I2C reads per loop without it costs ~3 ms per read (ftc-hardware §1.1).
- **Closed loop vs sim parity.**
  - Both reports say to add the same rule to `Mech.Runner`/`Kin.Driver` and feed sensors in VirtualHub.
  - Neither says what the **sim** sensor reading is for game devices: the ramp angle, the turret angle and the Axon voltage. Specify a `Kin.Driver.raw(id)`, or a game-side reading from `mechanismState`.
  - Use timeouts equal to the old timed values plus a margin, so a missing or unplugged sensor degrades to today's behaviour.
- **Name collisions.** A kinematics part named "Ramp" with state "down" collides with the game action "Ramp down". `Mech.action` resolves first in both sim (`sim-steps.js kindOf`) and export. Also, `catalog().parts` lists only joints with `drive.signal==='action'`, while `Kin.Driver.start` accepts any joint or actuator name. The export resolver must use one rule.
- **Pedro and MotionModule.** These reuse `ftc.routeActions`/`builtIn` (ftc-export §0). Choose: implement them, or explicitly out of scope with a checklist note.
- **The deck-sim CLI** (`tools/deck-sim.cjs` `mech`, `exported()` 186) and the robot-file export (`simulation.js:1568`: `{deckRobot:1, robot, sensors, mechanisms, kinematics, model}`) must carry the new fields.
  - Storing the wiring under `project.robot` makes both automatic, because `C.robot` sanitizes it everywhere.

### (d) Default Test setup

- **Route content is short of the brief** (§0.1). Facts for the implementer, from `node tools/deck-sim.cjs field biobuzz`:
  - F1 is at (3.96, 48.61) on the left wall, and F2 at (48.61, 140.04) on the rear wall.
  - The red loading zone is x 1.33–12.9, y 95.91–118.6. The red garden is x 1.33–24.59, y 1.33–3.9. The blue garden is x 119.41–142.67, y 140.1–142.67.
  - Red half is x<72.
  - **"Blue-side floor pollen" is ambiguous.** The only floor pollen at the start is in the gardens, and the blue garden is in the far rear-right corner. Confirm the meaning, or pick the blue garden line.
  - Real-match risk: G402 (crossing in AUTO) is a major foul only on contact with an opponent (upstream `penalties.ts:555-650`). Deck simulates no opponent, so the sim will not flag it.
- **Measured standoffs** (Test setup robot, reach 5, `appearance:'custom'`, teleop push): F1 centre x≈19.8 (heading 180°), F2 centre y≈124.2 (heading 90°).
  - Lower the ramp ≥ ~12 in before the standoff. Within ~8 in, the swing is blocked (§0.1).
  - Intake ≥2.5 s. The pollen release is paced: the first pickup happens 1–2.5 s after contact.
- **visuals-defaults contradicts itself** on F1:
  - "Tune pin 6's x (21–22.5)" vs its own formula "x − 8.5 − 5 ≤ 6.34", which gives x ≤ 19.84.
  - "custom → footprint is the chassis alone" vs "pins against a wall need centre ≥ 8.5 + 5 + clearance".
- **Time and capacity.**
  - Storage is 4 pollen, so each pickup leg needs a shooting stop.
  - The fixed route with garden, loading zone and F1 already takes 18.7 s. Adding F2 (~+5 s est.) and a blue-garden trip (~70 in each way, est. +6–8 s) likely exceeds 30 s.
  - PARK (5 pts) needs the red loading zone at the end of AUTO.
  - Decide: allow a route longer than 30 s, which `deck-sim test` reports as not fitting, or reorder or drop legs.
- **The validated draft is not the shipped design.**
  - It ran with `model:null`, no kinematics and indexer name `indexer`. §6.2 says `kicker`.
  - It has no hardware models, ports or sensors, so it does not exercise (a), (b) or (c).
  - The template needs the chosen per-device records. Test robot wiring proposal: Control Hub motors 0–3 = drive, I2C0 IMU, I2C1 Pinpoint, servos 0–2 = ramp, kicker, hood. Expansion Hub 2 motors 0–2 = flywheel, turret, intake.
  - Any analog/digital sensor in the template makes `deck-sim test --code onbot` fail until the VirtualHub stand-ins (`AnalogInput`, `DigitalChannel`, `TouchSensor`) exist.
- **Servo-kicker swing.** The `feeder` signal spins forever (`ui/sim-kinematics.js:462`, visuals §7.1); this needs a fix for the visuals. "Named positions" are not exercised by the route. Optionally add a "Turret to N°" step.
- **E2E breaks.** On a fresh `DECK_DATA_DIR`, `tests/simulation-ui.cjs` asserts the old defaults:
  - line 29: `#sim-localization`=='encoders' and `#sim-imu-source`=='hub';
  - lines 37/39: `robot.length===17.56` and `setups.length===3`.
  - check.yml runs this file on the Windows `install-update` leg and the Linux desktop leg, so (d) must update it before (e).
- **Fragility.** The Test robot's naming rules depend on the other agent's in-flight `groups()`/`fromCad` changes. Re-run the visuals probe (`research/probe-pipeline.mjs`) after they commit.

### (e) Testing release 2.4.23, Windows-only

release.md is solid: drive the matrix from `testingReleaseTargets`, never ship the App package, and Linux/Mac 2.4.22 clients see "no … download yet". Missing points:
- **Authorization.** Push and tag need the user's own explicit OK in the current prompt (`AGENTS.md`).
- **Branch.** `AGENTS.md` says to commit on `testing`, but the work is on `claude/zealous-galileo-brknjs`, which is 1 ahead of `testing`/`origin/testing` `23c2bfe`. The release tag must be reachable from `origin/testing` (release.yml L44).
- **Uncommitted work must land first:** the other agent's 7 files, plus the `build.cjs` ramp fix, whose behaviour changes need a user decision (dsim-flower §7: the ramp is solid and stops 5.24 in from walls; the jam guard is live).
- **CI constraints for new tests.**
  - The `validate` job builds `--public` and runs `node --test tests/*.test.cjs` on Ubuntu.
  - New three-dependent tests must skip when `.cache/simulation-deps` is absent.
  - New Java stand-ins must pass the build and `check-ftc-sdk.cjs`, which needs network.
- **Unverified claim** (release §3.1): gh's ordering of `--notes` with `--generate-notes` (self-flagged). The `fromJSON(needs.validate.outputs.targets)` matrix form is a documented GitHub pattern.

---

## 2. Contradictions between reports

| Topic | Report A | Report B | Resolution |
|---|---|---|---|
| Where hub/port lives | mechanism-model §11(2): fields on `devices()` entries, `ports:{}` on intakes/shooters (`sim-mechanisms.js` sanitize), `hub/port` in `hardwareOf` | ftc-export §8.1: one `project.robot.wiring` map keyed by `settingKey` (`robot.k`, `list.index.field`, `kin.id`, `sensor.id`) | Prefer **one map under `project.robot`** for model + hub/port + sensors per settingKey. It is sanitized once in `sim-config.js robot()`, rides robot files, setups and the CLI, and avoids `sim-mechanisms.js` (other agent). It needs reindexing on intake/shooter/joint removal. |
| Catalogue location | mechanism-model: extend `sim-actuators.js` + a sensors catalogue | ftc-hardware §7.1: new `ui/ftc/hardware-catalog.js` **or** extend `sim-actuators.js` | Pick one. Extending `sim-actuators.js` keeps `withModel`/`device()` in one place. Add a `<script>` in `ui/index.html` if new (checked by `tests/preview-assets.test.cjs`). |
| Axon volts → angle | ftc-export §8.2: `deg=(v−v0)/3.3·360` | ftc-hardware §3.2: `(1−V/3.3)·360 − offset` (inverted), wrap at 0/3.3 V, readings shift under load | Use ftc-hardware's form with a **calibrated sign and offset** (guided check). Axon publishes no table. |
| Limit-switch channel | ftc-export: "odd channel n+1; verify" | ftc-hardware: REV Touch odd only; REV magnetic either; pot even only | ftc-hardware (sourced). |
| XML family order | ftc-export: "verify" | ftc-hardware: verified `motor, servo, analog, pwm, digital, i2c` (javap `WriteXMLFileHandler$6`) | ftc-hardware. |
| Ramp-blade fix status | dsim-flower: fixed and runtime rebuilt; 36/36 drive-ins pass | visuals-defaults and release: "other agent's in-progress change"; F1 leg 0–1 pollen | Fix **is** in the runtime (`kB(...)&&FI(g)!=="ramp"` in `sim-runtime/dsim-host.cjs`). dsim-flower tested a reach-0 Strafer robot by teleop only. The route failure is ramp-swing blocking (§0.1). The fix is uncommitted. |
| Test setup indexer name | §6.2 template `indexer:'kicker'` | validated draft `indexer:'indexer'` | Cosmetic, but the export names and the guided-check keys follow it. |

---

## 3. Unverified or weak claims

| Claim | Where | Status |
|---|---|---|
| Ramp fix makes all flowers work | dsim-flower §6 | Only for a reach-0 Strafer robot driven by teleop. **Confirmed by me** for reach 5/custom at F1 and F2 by teleop. **Fails as a planned route** unless the ramp is lowered ≥ ~12 in away. |
| Route 17.5 s, 10/10 shots | visuals §8 | True, but the F1 leg contributes 0. Fixed variant: 18.72 s, 14/14. |
| GLB deterministic, rig without stand-ins | visuals §5.3 | Node probe with three 0.186. Not run inside Electron. The id may differ across Chromium/three versions; the visuals §6.1.3 fallback covers that. |
| REV-11-1144 SPM part number | ftc-hardware §1.3 | "from memory". |
| AM-5200 analog 0–1.056 V | ftc-hardware §8 | Inferred. |
| Through Bore V2 part numbers | ftc-hardware §4 | Mixed sources. |
| gh `--notes` + `--generate-notes` order | release §3.1 | Self-flagged. |
| `RevTouchSensor`/`DigitalDevice` XML in Deck written order | ftc-export, ftc-hardware | `newConfiguration` is asserted line-for-line against `tools/ftc-sim.cjs CONFIG_XML`. Extend the fixture when adding families. |
| Line numbers in `sim-mechanisms.js`, `sim-robot-model.js`, `sim-discovery.js`, `sim-model.cjs` | all | Moving under the other agent. Use function names. |

---

## 4. Decisions the implementer must make (recommendations in **bold**)

1. **Storage:** **`project.robot.hardware` (or `wiring`)** = `{hubs:{expansion:[{address:2}], servoHub?}, devices:{[settingKey]:{model, hub:'control'|'expansion'|<addr>, port, bus?}}, sensors:[{id, model, for:settingKey|'kin.'+jointId, hub, port|bus, encoderPort?, volts?, zero?, inverted?}]}`.
   - Keep `device` names where they are today.
   - Reindex on removal.
2. **CAD = zero semantics:** **the CAD pose is encoder zero and servo `center`**. Named positions are joint values. Servo positions are derived (`DeckActuators.position`). `TURRET_ZERO` = `joint.zero`. Change the INIT instruction. The guided check calibrates `center` and the sign.
3. **Hood:** **add role `hood`**: a servo with `HOOD_n_SHOOT/REST` from the joint (`launch`, states). Set it at Spin up and Shoot. Add a VirtualHub `SimServo`.
4. **CR-servo turret** (Axon CR + analog): a new turret kind. Per-shooter turret/flywheel settings with a global fallback.
5. **Where the wiring editor lives:** the Robot page (user's words). **Move the device names and sensors there, or embed them**, without duplicating state.
6. **Robot vs Setup mismatch policy** on Send: **show a diff and offer "Use the robot's wiring" (import) or "Write a new configuration with Deck's wiring"**.
7. **The Test setup route** within 30 s vs "long": confirm with the user, or order the legs as garden → F1 → loading zone → F2 → (blue garden) and accept >30 s only if the user agrees.
8. **The RobotActions trap:** generate kinematics moves in RouteActions/Mechanisms, called **before** the overridable slot, or detect unchanged generated stubs on the robot (exact text match) and replace them with a backup.

---

## 5. Sequencing and ownership

1. Wait for the other agent to commit `sim-mechanisms.js`, `sim-robot-model.js`, `sim-discovery.js`, `sim-model.cjs` and their tests. Get a decision on, and commit, the `build.cjs` ramp fix.
2. Catalogue: `xmlType`, feedback, sensors (`ui/sim-actuators.js`).
3. Storage plus sanitize (`ui/sim-config.js`). Round-trip tests.
4. Robot-page wiring editor; drive CPR from the model.
5. Mechanisms rows: per-device model, ports and sensors; highlight resolver (pure function plus a node test).
6. Export:
   - `robotNeeds`/`mechanismDevices` with `hood`, kinematics and sensors;
   - `robot-config.js` analog/digital families and parity rules;
   - closed loop with timeouts;
   - the kinematics action resolver;
   - the RobotActions fix.
7. VirtualHub stand-ins plus engine sensor feed. Rebuild with `node tools/simulation/build.cjs`, then run `check-ftc-sdk.cjs`.
8. Test setup:
   - generator, seeding, kicker swing;
   - fixed route (§0.1 numbers), plus F2 and blue-side legs;
   - update `tests/simulation-ui.cjs`.
9. Release prep: `package.json` 2.4.23 plus `testingReleaseTargets:["windows"]`, `release.yml` matrix, `docs/UPDATES.md`. **Stop and ask before push and tag.**

Key tests to extend:
- `tests/sim-actuators.test.cjs`
- `tests/robot-link.test.cjs` (:58, :73-74, :86)
- `tests/sim-mechanism-hardware.test.cjs` (:129 virtual-hub parity)
- `tests/sim-guided-check.test.cjs`
- `tests/sim-mechanisms.test.cjs` (:88, :185 timing parity)
- `tests/sim-joints-engine.test.cjs` (kicker swing)
- new `tests/sim-test-robot.test.cjs`
- `tests/simulation-ui.cjs`, `tests/robot-setup-app.cjs`
