# Package test-robot: report

## What I built

| File | What |
|---|---|
| **new** `ui/sim-test-robot.js` | UMD `DeckTestRobot` (also `require`-able), no three.js. Generates the FTC-part robot as STEP-import mesh records, plus its joints, the "Test setup" template and the long red route. |
| `src/sim-bridge.cjs` | New action `simFile('test-robot')` (3 lines, after `builtin-model`). It returns `DeckTestRobot.result(require('./sim-model.cjs'))`, which is exactly the shape a STEP import returns. |
| **new** `tools/simulation/make-test-robot.mjs` | Dev tool. `node tools/simulation/make-test-robot.mjs <out.glb> [--inches] [--setup examples/test-setup.json]`. It writes a multi-node GLB: 42 named assemblies, 113 named parts, 19 materials, about 1.5 MB, in glTF metres with +Y up and front +Z. The joints go in the root's extras. `--setup` also writes the example setup and its `.pins.json`. It uses three.js from `.cache/simulation-deps` and a FileReader polyfill. |
| **new** `examples/test-setup.json` and `examples/test-setup.pins.json` | Written by the tool from `DeckTestRobot.setup()`. Regenerate with `--setup`. |
| **new** `tests/sim-test-robot.test.cjs` | 6 tests covering visuals-defaults §10 items 1–6. The three.js test is skipped when `.cache` is missing. |

### Robot
- Assemblies under `Deck test robot`:
  - **`Chassis`**:
    - goBILDA 1120 U-channels (432 mm side rails, 240 mm cross members) with hole-pattern decals;
    - a grid plate;
    - 4 × 104 mm mecanum wheels (10 barrel rollers at 45° in an X seen from above; yellow hubs);
    - 4 Yellow Jacket drive motors;
    - REV Control Hub (grey with an orange band) standing at the back left, battery at the back right;
    - Pinpoint and two 4-bar pods (35 mm omni wheels) at the `C.ODOMETRY` defaults (X pod y = +4, Y pod x = −3);
    - a transfer chute;
    - the turret motor with a 32T pinion.
  - **`Ramp intake`**:
    - side plates;
    - `Rollers/Lower roller` and `Rollers/Upper roller` (green compliant wheels on hex shafts, belt from the `Intake motor`);
    - `Ramp`: a 15 in polycarbonate blade on aluminium rails, folded up in the CAD pose;
    - `Ramp servo`.
  - **`Turret shooter (pollen + nectar)`**:
    - `Turntable bearing`, `Ring gear 120T`, `Turret plate`, `Side plates`;
    - `Flywheel`: two 96 mm wheels;
    - `Flywheel motor` (6000 rpm);
    - `Hood`: an arc behind the flywheel;
    - `Hood servo`, `Back guide`;
    - `Kicker`: an arm with an orange paddle;
    - `Kicker servo`.
- Size and budget:
  - 17.000 × 17.000 in. The chassis box is exactly ±8.5, so `place()` scale is 1.
  - 12.5 in tall, floor at z = 0.
  - 37,654 triangles and 40,902 vertices.
  - The stored GLB (`bodyFromImport` → `toGlb`) is 2.1 MB. Generation plus storing takes about 0.3 s.
  - The output is deterministic, so the model id is stable: `ebce000b2eddc63791ebee26813c33e5.glb` with three 0.186 in Node.
- Classification with the real functions (`SM.groups` → `partRole` → `Mech.fromCad`):
  - Chassis: 17 × 17.
  - Exactly **1 intake: ramp, front, 15 in wide** ("a deployable ramp because it holds “Ramp” beside its rollers").
  - Exactly **1 turret shooter: both pieces, mount back**.
  - `drivetrainFromNames` gives mecanum.
- Renders from my software rasterizer, in the scratchpad `render/` folder:
  - `/tmp/claude-0/-home-user-SteamDeck-RobotController/64e054cf-3d7b-51d2-b4a0-eb77c1e0e167/scratchpad/render/final-front.png`
  - `/tmp/claude-0/-home-user-SteamDeck-RobotController/64e054cf-3d7b-51d2-b4a0-eb77c1e0e167/scratchpad/render/final-back.png`
  - `/tmp/claude-0/-home-user-SteamDeck-RobotController/64e054cf-3d7b-51d2-b4a0-eb77c1e0e167/scratchpad/render/final-action.png` (ramp down, turret −40°, hood and kicker out)
  - `/tmp/claude-0/-home-user-SteamDeck-RobotController/64e054cf-3d7b-51d2-b4a0-eb77c1e0e167/scratchpad/render/final-section.png`
  - The viewable GLB is `/tmp/claude-0/-home-user-SteamDeck-RobotController/64e054cf-3d7b-51d2-b4a0-eb77c1e0e167/scratchpad/render/deck-test-robot.glb`.

## API / contract

`DeckTestRobot` exports: `{NAME, VERSION, MODEL, KEY, meshes, result, metaParts, kinematics, pins, setup, RAMP_DOWN}`.

- **`NAME`**: `'Deck test robot'`.
- **`MODEL`**: `{name, units:'in', front:'+x', top:'+z', source:'step', bodyChassis:true, entered:['mass','wheel','rpm']}`.
- **`meshes()`**: `[{path:[NAME,…], name, position:Float32Array, normal:Float32Array, index:Uint32Array, color:[r,g,b] linear 0–1}]`.
- **`result(SM)`**: `{kind:'step', name, positions, normals, colors, index, part, parts, triangles, tree, groups, names}`. This is the same object the bridge action returns.
- **`metaParts(groups, DeckMechanisms)`**: the `meta.parts` entries the app stores (name, key, `partRole(...)`, box).
- **`kinematics()`**: `{model:null, unit:1, joints:[…]}`. Every joint has `source:'metadata'`, so re-discovery keeps it.

  | Joint | Type | Origin | Axis | Drive signal | Other |
  |---|---|---|---|---|---|
  | `turret` | revolute ±170 | (−4.7, 0, 3.39) | z | turret | Origin = `mountOffset('back')`. `zero:0`. |
  | `flywheel` | continuous, parent turret | (−2.9, 0, 9) | +y | flywheel | The back of the wheel moves up. |
  | `hood` | revolute, parent turret | (−2.9, 0, 9) | −y | hood | `launch:60` (CAD), `states.rest 0`, limits −5..20. Game hood 75 gives a 15° tilt. The axis sign matches what Configure from CAD infers. |
  | `kicker` | revolute, parent turret | (−3.4, 0, 4.2) | +y | feeder | `states {rest:0, feed:45}`, `speed 720`. It swings with the runtime-hub Driver change. |
  | `ramp` | revolute | (8.05, 0, 3.5) | +y | deploy intake:0 | `states {raised:0, lowered:118.75}`. The blade tip meets the floor 5.06 in past the frame. |
  | `rollerLower`, `rollerUpper` | continuous | — | +y | roller intake:0 | |
  | `wheelFL/FR/BL/BR` | continuous | (±5.6, ±7.74, 2.047) | +y | wheel | `roll:'mecanum'` |

- **`setup()`**: the full project template.
  - Identity: `deckSimulation:2`, `setupName:'Test setup'`, `controller:'ftc'`, `imuSource:'device'` (Pinpoint IMU), `sensors.localization:'fused'`.
  - `robot`: mecanum, 17 × 17 × 14 in, 24 lb, 435 rpm, 104 mm wheels, `appearance:'custom'`, Pinpoint odometry at its defaults, and **`wiring`**:
    - Control Hub motors 0–3: drive.
    - Control Hub I2C 0: IMU. I2C 1: Pinpoint.
    - Control Hub servos 0, 1, 2: ramp (`gobilda-torque`), kicker (`gobilda-speed`), hood (`gobilda-torque`).
    - Expansion Hub 2 motors 0, 1, 2: flywheel (5203-6000), turret (5203-435), intake (5203-1150).
    - Flywheel and turret read their motors' own encoders.
    - `DeckHardware.sanitizeWiring` keeps all of it, and `conflicts` is empty.
  - `mechanisms`:
    - front ramp intake: reach 5, **width 15**, motor `intake`, servo `ramp`, `parts:['Ramp intake']`;
    - one turret shooter: pieces both, mount back, motor `shooter`, indexer `kicker` (pusher), `hood:'hood'`, `turretMotor:'turret'`, `at` set;
    - capacity 4/4, preload 4 pollen, hood 75, 3400 rpm, `turret.ticksPerDegree` 4.005.
  - `kinematics`: `kinematics()` with `model:null`.
  - `layouts`:
    - "BIOBUZZ red auto": start (9.83, 27, 0), `clearance:.25`, `rotate:false`, 21 pins;
    - "Empty field 1".
  - `export.className:'TestSetupAuto'`.
  - `model:null`. **The app must fill `model` and `kinematics.model`.**
- **`pins()`**: the 21 route pins. They are already in `deck-sim clean()` canonical form.

### What the UI and seeding owner needs (not my files)
1. `ui/index.html`: add `<script src="sim-test-robot.js"></script>` before `simulation.js`. Also add `'/sim-test-robot.js':'sim-test-robot.js'` to the `files` map in `tools/preview.cjs`. Without that entry, `tests/preview-assets.test.cjs` will fail.
2. Seeding in `simulation.js`, following visuals-defaults §6.1:
   1. `result = await api.simFile('test-robot')`
   2. `body = await M().bodyFromImport(result)`
   3. `glb = await M().toGlb(body.geometry)`
   4. `stored = await api.simFile('model-save', {name:'Deck test robot.glb', bytes:glb})`
   5. `project.model = M().meta({...T.MODEL, id:stored.id, parts:T.metaParts(result.groups, MECH)})`
   6. `project.kinematics = Kin.sanitize({...setup.kinematics, model:stored.id})`
   7. Keep `robot.appearance:'custom'`.
3. `src/sim-bridge.cjs` `assets` reply: I did not add `testRobot:true`; my ownership is the new action only. Add it if the UI wants it.

## Route and validation (headless, the real deck-sim CLI)

`node tools/deck-sim.cjs test examples/test-setup.json`:
- **21 pins in 50.35 s.** It is longer than 30 s, which is accepted; it is under the CLI's 60 s guard.
- 0 zone touches. It ends 0.23 in from the last pin.
- **Picked up 24, shot 28, 28 landed (100 %), 3 tips, 60 points.**

`--code onbot` (exported OnBot Java on the virtual Control Hub):
- 51.35 s, picked 24, shot 28, 28 landed, 3 tips.

The same result holds with `kinematics` loaded into the engine (as the app runs it). Frames carry joints:
- kicker swings 0 → 45 → 0 for every shot;
- hood 0 → 15;
- ramp 0 → 118.75 → 0;
- turret, flywheel and rollers move.

Per leg (route follower): every pickup takes 4 and every shot set lands 4/4.

| Leg | Pins | What happens | Picked | Shots |
|---|---|---|---|---|
| Preload | (24, 30) | Shoot into the south cell. It tips the hive, so north is up. | — | 4/4 |
| Garden | (14, 24) turn −90 → (10, 15.5) Intake | | **4** | |
| | (28, 104) | Shoot into the north cell (`other`). | | 4/4 |
| F2 | (48.5, 108) | Ramp down, 16 in from the flower. | | |
| | (48.5, 124.0) | Intake 4 s. | **4** | |
| | (48.5, 116) | Ramp up. | | |
| | (40, 112) | Shoot into north. The hive tips back, so south is up. | | 4/4 |
| Loading zone | (22, 107.3) turn −180 → (15.5, 107.3) Intake | | **4** | |
| | (30, 38) | Shoot into south. | | 4/4 |
| F1 | (32, 48.6) | Ramp down. | | |
| | (19.3, 48.6) | Intake 3.5 s. | **4** | |
| | (28, 48.6) | Ramp up. | | |
| | (30, 38) | Shoot into south. It tips, so north is up. | | 4/4 |
| Floor group 1 | (116, 31.15) turn 0 → (128.5, 31.15) Intake | | **4** | |
| | (62, 106) | Shoot into north, from the red side behind the hive. | | 4/4 |
| Floor group 2 | (116, 42.35) → (128.5, 42.35) Intake | | **4** | |
| | (62, 106) | Shoot into north. | | 4/4 |

### Changes from the draft and the critic's numbers
- **Why each change:**
  - **Intake width 15, not 13.** At 13 the garden's corner pollen (2.73, 2.73) was never taken (3/4).
  - **Garden pin (10, 15.5).** The reach-5 ramp needs the chassis centre about 13.5 in from the wall.
  - **A separate "Ramp up" pin 8 in back from each flower.** Folding the ramp up while its blade is in the flower mouth leaves the physics ramp `bbRampOut:true, bbRampBlocked:true`, while Deck's `rampDown` is false. The blade stays out for the rest of the run and jammed the robot at the loading zone ("stuck near (18, 107)").
  - **F1 at x 19.3 with 3.5 s, not 19.8 with 2.5 s.** At 19.8 the follower stops at 20.01 and picks 0.
  - **F2 at (48.5, 124.0) with 4 s.**
  - **Shoot spots.** Loading-zone pollen goes into south from (30, 38), because F2's shots tip the hive back. Floor pollen goes into north from (62, 106).
- **Engine bug to fix (not mine), `src/sim-engine.cjs` `mechanismTick`.** It only pushes Deck-side ramp changes, so the physics can refuse a fold and the two never resync. Suggested fix: re-assert `bbRampOut=false` once the blade is clear, or mirror `bbRampOut` back into `rampDown`.
- **Flower retrieval is chaotic in the physics.** Moving a pin ±0.05–0.15 in can change a flower pickup from 4 to 0. I chose values whose neighbours also give 4/4, checked in both the follower and the OnBot export:
  - F1: x 19.25–19.4;
  - F2: y 124.0–124.05.

  `tests/sim-test-robot.test.cjs` therefore asserts at least 3 per pickup, at least 22 picked and at least 22 landed. It logs the exact counts.

## Tests run

| Run | Result |
|---|---|
| `node --test tests/sim-test-robot.test.cjs` | **6/6 pass**, about 9 s. The three.js test ran. |
| `tests/deck-sim.test.cjs`, `sim-alliance`, `sim-setups` | 14 pass, 1 skipped (pre-existing), 0 fail. |
| `tests/sim-robot-formats.test.cjs`, `tests/sim-urdf.test.cjs` (they use `sim-bridge`) | Pass. |
| `tests/preview-assets.test.cjs` | **1 fail**, not caused by me: "/index.html missing sim-hardware.js". The other engineer's new `ui/sim-hardware.js` is in `index.html` but not in the `tools/preview.cjs` `files` map. |

## Open issues
- **Configure from CAD on this model** (`sim-discovery`):
  - It finds turret, flywheel and hood with the same pivots, axes and launch 60 as the shipped joints.
  - It finds no hinge for `deploy1`; it finds "Ramp" by name instead.
  - It adds a swing arm for the upper roller and a "Transfer chute" action joint (matched by name).
  - The shipped joints are `metadata`, so they are kept.
- **`fromCad` reports reach 0 and height 12.5**, because the ramp is stowed. The setup ships reach 5 and `heightIn` 14, as asked.
- **The `F.mechanismDevices` hood row does not exist yet.** The test accepts it either way.
- **`examples/test-setup.json` has `model:null`.** `deck-sim show` needs the app's missing-model fallback (visuals §6.1.3) to attach the CAD.
- **`src/sim-model.cjs` `tree()` regex `/s*<d+>$/`** is still unfixed. That file is not mine.
