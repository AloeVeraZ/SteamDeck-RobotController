# "Test setup" default: robot visuals, sample CAD, first-run seeding

Research for: on first open the simulator's saved setup is **"Test setup"**. It uses the BIOBUZZ field, the red alliance, an FTC Control Hub, a robot built from real FTC parts and a long autonomous route. The robot has:

- a goBILDA channel frame;
- 4 mecanum wheels;
- a deployable ramp intake at the front, with rollers;
- one turret carrying a flywheel and a hood, shooting both pollen and nectar;
- a servo kicker that feeds the flywheel.

The robot must also be able to do **the same actions** as any other Deck robot (the user's ask): Intake, Ramp down/up, Spin up, Aim, Shoot, Turret to °. They must work in the simulator, the visuals and the exported code.

Read-only research. Nothing in the repo was changed. Probe scripts and a headless draft setup live in the scratchpad folder `/tmp/claude-0/-home-user-SteamDeck-RobotController/64e054cf-3d7b-51d2-b4a0-eb77c1e0e167/scratchpad/research/`:

- `probe-pipeline.mjs`
- `try/test-setup-candidate.json`
- `try/route-candidate.pins.json`

Line numbers are from the working tree on 26 Oct 2026. Another agent is editing `src/sim-model.cjs`, `ui/sim-robot-model.js`, `ui/sim-mechanisms.js` and `ui/sim-discovery.js` right now, so lines in those files may shift.

---

## 1. TL;DR recommendation

1. **Generate the robot at runtime from code. Ship no binary asset.**
   - Add a UMD module, `ui/sim-test-robot.js` (`DeckTestRobot`). It produces the robot as STEP-import-style mesh records (named assemblies, plain typed arrays, no three.js), plus the setup template and the joints.
   - The main process turns the records into the exact result shape of a STEP import, `{kind:'step', ...merge, tree, groups, names}`, using the existing pure functions in `src/sim-model.cjs`. It does this through a new `simFile('test-robot')` action.
   - The renderer then follows the normal import path: `DeckRobotModel.bodyFromImport` → `toGlb` → `simFile('model-save')`. This gives a content-hashed model id, and the robot is literally "as if the user imported it".
   - The public build needs no packaging, `.gitignore` or licence changes, because the model is original MIT code.
   - I proved this pipeline end-to-end in Node (§5.3). The GLB comes out deterministic, the part roles are right, joints resolve to parts, and `rig()` splits the links with no stand-ins.
2. **Ship explicit kinematics joints and mechanisms with the setup.** Do not rely on CAD discovery at runtime.
   - The joints are bound to game signals: turret, flywheel, hood, deploy (ramp), roller, feeder (kicker) and wheel ×4.
   - Discovery still works later if the team presses *Configure from CAD*, because the assembly names follow the naming rules (§5.2).
3. **Seed on first run only. Add the setup once for existing users.** Never touch the active setup or other setups (§6).
   - `defaults()` stays the blank template for **New**.
4. **One engine gap must be fixed for the servo kicker to look right.** The `feeder` signal spins continuously. A revolute feeder joint with `states.feed` should swing (§7.1, `ui/sim-kinematics.js` line 462).
5. **The route is validated headlessly.** A draft long route (8 pins) gives:

   | Run | Time | Shots | Zone touches | Ended |
   |---|---|---|---|---|
   | Simulator follower | 17.5 s | 10/10, 100 % | 0 | 0.61 in from the last pin |
   | OnBot Java on the virtual Control Hub | 17.37 s | 11/11, 100 % | 0 | |

   The flower-F1 ramp leg picks up 0–1 pollen today. That is the other agent's in-progress ramp-blade change (`tools/simulation/build.cjs` diff), so re-check that leg after their work lands and `build.cjs` is re-run (§8).

---

## 2. How robots render today

### 2.1 `ui/sim-robot-model.js` (`DeckRobotModel`, UMD; exports at line 477)

| Function (line) | What it does / data shape |
|---|---|
| `meta(raw)` (35) | Model metadata, checked: `{id:/^[0-9a-f]{32}\.glb$/, name, units:in\|mm\|cm\|m, front:'+x'.., top:'+z'.., source:'step'\|'urdf'\|'sdf'\|'mjcf'\|'usd'\|'mesh', parts?:[{name, role:chassis\|intake\|shooter\|indexer\|other, pieces?, type?:turret\|fixed, kind?:sweeper\|siderollers\|ramp\|kicker, carries?, key?, chosen?, box:[x0,y0,z0,x1,y1,z1] (file frame)}], autoSize?, bodyChassis?, entered?:['mass','wheel','rpm']}`. `kicker` and `carries` were just added by the other agent. |
| `geometryFromArrays(m)` (44) | STEP result → BufferGeometry. `position`, `color` (0–255 → float), `_part` (leaf id per vertex), `index`, `normal`. Sets `userData.parts = m.tree` (`{nodes:[{name,parent}], leaf:[nodeIndex per leaf]}`). |
| `mergeObject(object)` (59) | GLB/OBJ/STL/URDF scene → one geometry. One leaf per mesh; a node per named Object3D (keys = names joined with `/`). |
| `bodyFromImport(result)` (71) | `kind:'step'` → `geometryFromArrays`, and also returns `groups`. URDF/SDF/MJCF/USD → kinematics too. Mesh (GLB/STL/OBJ) → `mergeObject` only: **no `groups`/`names`, so `project.model.parts` stays empty for GLB imports**. |
| `toGlb(geometry)` (85) | GLTFExporter, binary, one Mesh with `vertexColors`. `_part` survives as a custom attribute. `geometry.userData.parts` survives as primitive `extras` (GLTFExporter `serializeUserData(geometry, primitive)`; the loader restores it). |
| `fromGlb(bytes)` (89) | GLTFLoader, first mesh geometry (with `_part` and `userData.parts`). |
| `lighten` (96) | Vertex clustering above 400 k triangles (`LIGHT_TRIANGLES`, simulation.js line 1688) for the field views. |
| `partTree`, `meshesBox` (141, 156) | Click-to-pick part tree and per-part boxes. |
| `partBoxes(m)` (163) | `meta.parts` → robot-frame boxes. The `role:'chassis'` part (or "all except intakes" when `bodyChassis`) centres the model. |
| `place(geometry, meta, footprint)` (178) | Scale (units), orientation (front/top), bottom on the floor, centred on the chassis box. **Non-URDF models are stretched so the chassis box = robot length × width** (`sx = 2*f.rear/fit.length`). Make the chassis box equal `robot.length/width` to get scale 1. |
| `builtin(bytes, meta)` (192) | Strafer/Swechanum: wheels from `userData.deckWheel` extras. No `_part`, so no CAD joints. |
| `rig(holder, {meta, mechanisms, kinematics, footprint, height})` (214) | Splits the body into `DeckLink:<jointId>` groups. Uses only joints of `kinematics.model === meta.id`. Each part goes to the deepest joint naming it. Hitbox colours are `HITBOX` (213). A game turret, ramp or kicker without CAD parts or a bound joint gets `standIn()` (265). It is **drawn only when the holder has no `_part` mesh** (bundled chassis); on an imported CAD it is joint-only. |
| `standIn` (265) | Turret = cylinder base + box housing + barrel, colour `0x5b6472`. Ramp/kicker = a 0.7 in plate hinged at the chassis edge, `states {raised:0, lowered:80}`, colour `0x8a6d3b`. |
| `gameValues` (289), `pose` (296), `animate(holder, frame)` (303) | `frame.joints` (engine `kin.values()`) + `gameValues(frame.mechanisms)`. CAD `wheel` joints roll from chassis velocity (`roll:'mecanum'` adds the X-pattern side term). |
| `silhouette` (325) | Orthographic top-down PNG of the placed holder. This is the 2D field robot picture (`#sim-robot-image`, simulation.js line 499). |
| `preview(host)` (399) | Setup/Mechanisms 3D preview, with view cube, `highlight(meshes)`, `markers`, `gizmos`, `posed(values)` and `pick`. |

### 2.2 `ui/sim-3d.js` (`DeckSim3D`)

- `robotModel()` (45): with a body, it clones it into `robotGroup`. **With no body it draws a plain box chassis plus a cone "nose"** (`--text`/`--accent` colours).
- `setModel(holder)` (54): compiles shaders first, then swaps the body in.
- `prepare()` (111): positions `robotGroup` and calls `DeckRobotModel.animate(robotGroup, frame)`.
- The Path-planning ghost uses `blocks(holder)` (134), a voxelised copy of the model, or `pushbot(f)` (150) when there is no model.

### 2.3 Where `simulation.js` places the model

| Line | Code | What it does |
|---|---|---|
| 1689 | `three()` | Lazy-loads `vendor/three-view.js` (`DeckThree` = THREE, GLTFLoader/Exporter, STL/OBJ loaders, OrbitControls, MeshoptDecoder, mergeGeometries; `tools/simulation/view-entry.js`) and `sim-robot-model.js`. |
| 1691 | `placeModel()` | `identity = project.model?.id \|\| (builtins.has(robot.appearance) ? appearance : null)`. Reads `simFile('model-read', id)` or `simFile('builtin-model', id)` → `fromGlb`/`builtin` → `place` → `silhouette`. **Returns early with no model when `!native`**, so the web preview never shows CAD. |
| 1705 | `fieldBody()` | The lightened copy for the field views. |
| 1716 | `rigOf()` | Caches `rig()` per slot (`fieldRig` for 3D and videos, `mechRig` for the Mechanisms preview), keyed on joint shape and mechanisms. |
| 1727 | `modelUi()` | The Robot step's model box, credit, orientation, preview and parts panel. |
| 1814 | `importModel(get, {front, top, stay})` | The import flow. |

`importModel` runs in this order:

1. `bodyFromImport` → `toGlb` → `model-save`.
2. `parts` from `result.groups` with `MECH.partRole`.
3. `project.model = M().meta({... bodyChassis:true})`.
4. `setUpFromCad({merge:true})` (1803) sets the robot size and mechanisms from the parts. `drivetrainFromNames(result.names)` picks the drivetrain.
5. `save()` → `placeModel()`.

### 2.4 What a preset robot (`MECH.PRESETS`) looks like in 3D today

- The presets are in `ui/sim-mechanisms.js` line 506: sprinter, twinturret, swervedual, starterbot, pollinator, forager, skimmer, sniper.
- `usePreset(id)` (simulation.js 1560) sets `robotPreset`, `model=null`, `robot.appearance = chassisFor(drivetrain)` (1599). That is `strafer` (mecanum), `swechanum` (swerve) or `plain`, but only if that builtin is present in this build.

How it renders depends on the build:

- **Personal local build (bundled CAD present):**
  - The Strafer or Swechanum chassis GLB, with wheel animation.
  - Grey `standIn` turret shapes (base + box + barrel) and brown ramp/kicker plates, drawn by `rig()` because the builtin has no `_part` mesh.
  - Sweepers and side rollers have no shape at all.
- **Public build (`--public`, CI and released packages):**
  - `builtins` is empty, so the appearance falls back to `plain`, so `model=null`.
  - 3D shows the **plain box + cone** of `sim-3d.js` `robotModel()`. No turret or ramp is drawn, because `rig()` is never called without a holder.
  - 2D shows the red rectangle glyph with mechanism outlines (intake boxes, shooter circles; simulation.js line 499+).

So today a public-build user sees no robot model at all. The generated test robot fixes that for everyone.

### 2.5 Builtin chassis assets and why `--public` excludes them

- `ui/assets/robots/catalog.json` holds the Strafer and Swechanum entries (source URL, STEP sha, asset sha). `NOTICES.md` says the CAD rights stay with goBILDA and NYC FIRST, and that no redistribution permission is asserted.
- The pipeline:
  1. `tools/simulation/prepare-robot.py <STEP> <name>` (OCP 7.9.3.1.1) writes `.cache/simulation-cad/<name>-native.glb`.
  2. `tools/simulation/finish-robot.mjs <name>` (three from `.cache/simulation-deps`, meshoptimizer from `.cache/cad-build-deps`) groups wheels as `DeckWheel …` nodes with `extras.deckWheel`. It writes `ui/assets/robots/<id>.glb.gz` by hand (no GLTFExporter) and updates `assetSha256`.
- The exclusions are in four places:
  - `.gitignore`: `ui/assets/robots/*.glb` and `ui/assets/robots/*.glb.gz` ("Third-party CAD … never committed or packaged").
  - `tools/package.py` `restricted()` (line ~57): it drops `ui/vendor/models/`, `sim-runtime/java/`, the CAD NOTICES, and any `ui/assets/(fields|robots)/*.glb(.gz)`.
  - `tools/simulation/build.cjs` line 15, `--public`: it skips the field CAD copy (113–114) and the notices (123–124). `check()` (25) verifies the builtin hashes when the files are present.
  - `src/sim-bridge.cjs` line 90, action `assets`: it reports which builtins exist on disk. `builtin-model` (92) gunzips `ui/assets/robots/<id>.glb.gz`.
- The renderer reads that list at simulation.js line 1601 (`builtins = new Set(a.robots)`). `appearanceOptions()` (1600) disables missing ones.

### 2.6 Import pipeline (`src/sim-model.cjs`, `src/sim-model-host.cjs`, `src/sim-bridge.cjs`)

- **`sim-bridge.readModel(file)` (52):**
  - STEP goes to `convertStep` in a utility process (`sim-model-host.cjs`).
  - URDF, SDF, MJCF and USD go to `readUrdf`/`readDescription` with their mesh files.
  - GLB, GLTF, STL and OBJ come back as `{kind:'mesh', format, bytes}`.
- **`sim-model.cjs`** `convertStep(file, runtimeDir, {cacheDir, …})` (101): OCCT wasm workers produce the mesh records `{path:[assembly names…], name, position, normal, index, color:[0..1]}`. These pure, Node-only functions build the result (exported at line 122):
  - `merge(meshes)` (18) → `{positions, normals, colors(Uint8), index(Uint32), part(Float32), parts, triangles}`
  - `tree(meshes)` (66) → `{nodes, leaf}`
  - `groups(meshes)` (48) → top-level assemblies `[{name, key, inner:[names], box}]`. The other agent is now splitting assemblies that hold two mechanisms.
  - `names(meshes)` (72)

  The result is cached by content in `<userData>/simulation/cad-cache/<sha>-v3.bin`.
- **Persistence of model bytes:**
  - `model-save` (sim-bridge 116) writes `<userData>/simulation/models/<sha256(bytes)[0:32]>.glb` and returns `{id, name}`.
  - `model-read` (121) reads it back. **The id is a content hash**, so identical bytes give an identical id.
  - Electron's `userData` is overridable with `DECK_DATA_DIR` (main.cjs line 25). Nothing is stored in IndexedDB.
- **Setups reference models** only through `project.model.id` (metadata, `modelMeta()` simulation.js 114) and `project.kinematics.model` (the same id; joints are used only when they match).
  - Bytes travel inside a file only as base64 `modelData`: `#sim-save` (1889) for project files and `#sim-robot-save` (1567) for robot files.
  - On open they go to `model-save` (`openProject` 1904, robot-load 1571).
  - `examples/lunala-red-auto.json` references `4c16d882….glb`, which exists only in the user's own userData (AGENT_HANDOFF tells probes to copy it in).

---

## 3. Setups, defaults and first run (`ui/simulation.js`)

| Line | Item |
|---|---|
| 10 | `KEY='deck-simulation-project-v2'`, `OLD_KEY='…-v1'`: the whole project lives in **`localStorage`** of the app window. |
| 76 | `layout(game, name)` → `{id, name, field, alliance:'red', width:144, height:144, elements:true, start:null, zones:[], pins:[], clearance:2, style:'spline', rotate:true, route:null, tested:null}` |
| 77–78 | `defaults()` → `{version:2, setupId, setupName:'Setup 1', setups:[], controller:'ftc', imuSource:'hub', ftcSensors:null, motionSensors:null, timing, orientations:{}, hitboxes:false, robot:C.robot({},'ftc') (17.56×17.79, appearance 'strafer'), sensors:{localization:'encoders'}, tuning:{maxPathSpeed:.8}, practice, program:{kind:'route', source:EXAMPLE}, model:null, view:'2d', mechanisms:Mech.sanitize({}), kinematics:K.sanitize({}), layouts:[BIOBUZZ, Empty field 1], active, export:{…className:'PlannedRoute'}}` |
| 79 | `cleanLayout(raw)` (pins via `planner.pinEffects`, 32 max) |
| 91–112 | `sanitize(raw)`: `defaults()` as the base. `robot.appearance='custom'` if `raw.model`. `robotPreset` checked against `MECH.PRESETS`. `setups` = up to 20 `{id, name, data}`. **Unknown top-level keys are dropped.** |
| 114 | `modelMeta(raw)`: renderer-side copy of `meta()`. **Its `kind` list lacks `'kicker'` and `carries`**, which the other agent just added to `sim-robot-model.js` `meta()`; keep them in sync. `source` is collapsed to step/mesh. |
| 122 | `let project; try{project=sanitize(JSON.parse(localStorage.getItem(KEY)\|\|localStorage.getItem(OLD_KEY)));}catch{project=defaults();}`. **This is the only "first run" logic.** With nothing stored, `JSON.parse(null)` gives `null`, so the project is `defaults()`. |
| 139 | `snapshot()`: the project minus `setups` (what a bank entry stores). |
| 141 | `save()`: upserts `{id:setupId, name:setupName, data:snapshot()}` into `project.setups`, then `localStorage.setItem(KEY, …)`. |
| 1904 | `openProject(file)`: `sanitize(raw)`. Restores embedded `modelData` through `model-save`. Gives fresh layout ids and `setupId`. **The setup name is the file name** (`file.name.replace(/\.json$/i,'')`), not `raw.setupName`. Keeps the bank. **It does not remap `kinematics.model` to the re-stored id** (robot-load at 1575 does). |
| 1914 | `setupFacts(d)`: picker summary (Field, Robot, Mechanisms, Controller `CONTROLLERS={ftc:'FTC Control Hub', …}`, Route). |
| 1962–1976 | `switchSetup`, `cloneSetup` (max 20), `deleteSetup` (needs ≥ 2), **New** = `defaults()` named `Setup N`. |
| 2492 | Init: `save(); selectTab('setup'); refreshAll();`. On `activate(true)`: `load()`, then `placeModel()`. |
| 1601 | `api.simFile('assets')` → `builtins` → `placeModel()`. This is a good place to start async seeding. |

How `examples/*.json` reach the app:

1. **`deck-sim show <file> [--tab] [--run]`** (`tools/deck-sim.cjs` `show()` line 210):
   1. It launches Electron with `--deck-sim-open=<abs> --deck-sim-tab=… [--deck-sim-model=<cad> --deck-sim-front/top]`. The model arguments come only from `setup.deckCli.model`, written by `deck-sim new/robot --cad`.
   2. `main.cjs` (lines 29–44, 307) emits `sim-open`.
   3. The window's `api.onSimOpen` handler (simulation.js 1896) runs `openProject(request)`. If there is a model it runs `importConfirmed(model)`, which shows the "starting position?" dialog. Then `selectTab`, `plan()`, and the run if asked.
   4. The result is always a **new saved setup**.
2. **Open file…** (`project-open`) goes through `openProject` the same way.
3. **Tests and the CLI** read the JSON straight into `SimEngine` (for example `tests/sim-setups.test.cjs`, which uses `tests/fixtures/simulation-setups`).

---

## 4. deck-sim CLI (`tools/deck-sim.cjs`) for building and testing headlessly

The help text is at line 233; `main` is at line 312. Commands that matter here:

```
node tools/deck-sim.cjs new  S.json --field biobuzz --alliance red --name "BIOBUZZ red auto" --drivetrain mecanum \
     --length 17 --width 17 --height 14.5 --rpm 435 --sensors fused --power 1 --class TestSetupAuto --force
node tools/deck-sim.cjs mech S.json --on --intakes front:ramp --shooters turret@back:both --indexer pusher \
     --indexer-name kicker --pollen 4 --nectar 4 --preload 4 --rpm 3400 --spin-up 0.6 --index-seconds 0.3
node tools/deck-sim.cjs start S.json 9.85 26 -90
node tools/deck-sim.cjs pins  S.json pins.json        # or: pin S.json add x y --action "Ramp down; Intake for 1.5" …
node tools/deck-sim.cjs plan  S.json [--json]
node tools/deck-sim.cjs test  S.json [--json] [--code onbot|teamcode|pedro|motionmodule] [--log run.wpilog]
node tools/deck-sim.cjs optimize S.json
node tools/deck-sim.cjs export S.json --format onbot|teamcode|pedro|pp --out <dir>
node tools/deck-sim.cjs show S.json --tab plan        # opens it in the app as a new saved setup
```

- `new` sets `appearance:'strafer'` for mecanum (`newSetup()` 222). For a CAD robot set `robot.appearance:'custom'` yourself. **This matters:**
  - With `'custom'`, `C.chassisHitbox` makes the footprint the chassis alone, and the intake reach does not grow the collision box.
  - With `strafer` and an intake reach of 5 in, the garden pin at (9.85, 15) became "no room to turn".
- `mech` has no `--reach/--width` for intakes. Edit `mechanisms.intakes[0].reach/width/height` in the JSON.
- `robot --cad x.step` reads a STEP through `cadBox()` (87) → `setUpFromCad()` (106), the same `partRole`/`fromCad` as the app. `.glb` gives a bounding box only, with no groups.
- `test --code onbot` needs `sim-runtime/driver` (built). `--code pedro` needs `tools/simulation/fetch-pedro.cjs` first.
- Node is on PATH in this container (`/opt/node22/bin/node`, v22.22). On the Windows laptop use `ELECTRON_RUN_AS_NODE=1 .cache/runtime-win32-x64-44.8.0/electron.exe` (AGENT_HANDOFF).

Existing examples:

| File | Robot and mechanisms | Route |
|---|---|---|
| `examples/biobuzz-red-auto.json` (+ `.pins.json`, exports in `examples/biobuzz-red-auto/`) | 17×17 strafer, legacy single `intake`/`shooter` fields | 6 pins, ~13.3 s |
| `examples/biobuzz-dual-red.json` | sweeper front + side rollers right, two turrets | 4 pins |
| `examples/lunala-red-auto.json` | the user's CAD (model id only), front sweeper reach 6.5, two turrets | 4 pins, 9.77 s, 12/12 shots |
| `examples/simulation-setups/BIOBUZZ blue auto 15x15.json` | | |

---

## 5. A generated, redistributable robot model

### 5.1 Options compared

| | A. Runtime-generated (recommended) | B. Node script → committed `.glb.gz` |
|---|---|---|
| Source of truth | `ui/sim-test-robot.js` (UMD: mesh records + joints + setup) | same module, plus a generated binary |
| Binary in git | none | ~0.3–1 MB gz. Needs `.gitignore` negation if under `ui/assets/robots/`; better a new `ui/assets/samples/` folder, which the restricted regex does not match |
| Public build | automatic (code only) | automatic if outside `fields\|robots`. `build.cjs` manifest walk (line 155) only covers vendor, robots and fields |
| Model id | computed at seed time by `model-save` (sha of `toGlb` bytes) | baked into the shipped setup JSON; the main process copies the asset into `models/` |
| "As if imported" | yes: the same `bodyFromImport` → `toGlb` → `model-save` path as a STEP import | same if the asset is the stored-format GLB |
| Cost | ~0.2–0.5 s once at first run | none at run time; regenerate whenever the generator changes |

**Choose A.** B is only worth it if you want a downloadable `.glb` for people to inspect. Option A can still provide that through a dev tool (§9, `tools/simulation/make-test-robot.mjs`).

### 5.2 Naming rules, so the app's CAD logic recognises every assembly

The root node is `Deck test robot`. Its children are the top-level assemblies that `groups()` reports and `MECH.partRole(name, inner)` (`sim-mechanisms.js` line 359) classifies:

| Top-level assembly name | `partRole` result | Why |
|---|---|---|
| `Chassis` | `role:'chassis'` | `ROLE_WORDS` chassis. Its box (wheels included) **must equal robot length × width** so `place()` scale = 1. My probe got y-scale 1.043 because the box was 16.3 in wide against a 17 in footprint. |
| `Ramp intake` | `role:'intake', kind:'ramp'` | `ramp\|deploy\|flap` → ramp. `fromCad` then reports "a deployable ramp by its name". |
| `Turret shooter (pollen + nectar)` | `role:'shooter', type:'turret', pieces:'both'` | `turret` → turret; `pollen` + `nectar` → both. |

Rules inside the assemblies. These avoid the new `mechanismsIn()` split in `src/sim-model.cjs` `groups()`, and the `copies()` logic:

- Inside `Turret shooter …`, only **one** direct child may match `/turret|shoot|launch|fly ?wheel|cannon/`: call it `Flywheel`. Name the others `Turntable bearing`, `Turret plate`, `Hood`, `Kicker`, `Side plates`. `bearing` and `plate` are in `HARDWARE_WORDS` and are skipped.
- Inside `Ramp intake`, do **not** use sibling names with the same base (`Intake roller front` / `Intake roller back` count as copies, which splits the assembly into two intakes). Put the rollers under one sub-assembly `Rollers` (`Upper roller`, `Lower roller`) beside `Ramp`, `Side plates`, `Ramp servo` and `Intake motor`.
- Wheels go under `Chassis` as `Mecanum wheel FL/FR/BL/BR`, each holding `Hub`, `Side plate ×2` and `Roller ×10`. "Mecanum" is in the discovery `WORDS.wheel`/`roller`, `MECH.drivetrainFromNames` and the `drive-wheel` type words.
- A mesh `name` that differs from its last path element creates an extra tree node (`tree()` line 66+). That is harmless.
  - **Side bug:** the instance-number regex there is `/s*<d+>$/`. The backslashes are missing in HEAD too (HEAD line 49). It was meant as `/\s*<\d+>$/`. Mention it to the agent who owns `sim-model.cjs`.

### 5.3 Proven pipeline (scratch probe `probe-pipeline.mjs`)

The probe ran in Node 22 with three 0.186 from `.cache/simulation-deps`. It used `globalThis.DeckThree={THREE, GLTFExporter, GLTFLoader, mergeGeometries}` and a 2-line `FileReader` polyfill, which GLTFExporter needs in Node:

```js
globalThis.FileReader??=class{readAsArrayBuffer(b){b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}
  readAsDataURL(b){b.arrayBuffer().then(r=>{this.result='data:application/octet-stream;base64,'+Buffer.from(r).toString('base64');this.onloadend?.();});}};
const value={name:'Deck test robot',...SM.merge(meshes),tree:SM.tree(meshes),groups:SM.groups(meshes),names:SM.names(meshes)};
const body=await R.bodyFromImport({kind:'step',...value}),glb=await R.toGlb(body.geometry);   // id = sha256(glb)[0:32]+'.glb'
```

Results:

- 12-part robot: 128 KB GLB. Two `toGlb` calls gave **byte-identical** output.
- The groups came out as Chassis → chassis, Ramp intake → intake/ramp, Turret shooter (pollen + nectar) → shooter/turret/both.
- `fromCad` reports chassis 17 × 16.25, "Intake 'Ramp intake': front … a deployable ramp by its name" and "Turret … at the back, shoots pollen and nectar".
- `fromGlb` keeps `position, color, _part, normal` and `userData.parts` (26 nodes, 12 leaves). Part keys look like `Deck test robot/Turret shooter (pollen + nectar)/Flywheel`.
- `rig()` with explicit joints gave links `turret, flywheel, hood, ramp, roller, wheelFL`, **standIns: none**. `pose()` works and every joint's `parts` expands to ≥ 1 leaf.

Budget: GLB size grows with vertices: about 40 bytes per vertex (position, normal, float colour, `_part`) plus 12 bytes per triangle of index. Keep the full robot at **≤ 60 k triangles** (about 2–3 MB stored). The mecanum rollers are the main cost: 40 rollers × 16 segments is fine. Flat-shaded boxes need split vertices.

### 5.4 Suggested parametric geometry

Robot frame = CAD frame: inches, x forward, y left, z up, floor z = 0. Starting size within 17 × 17 × 14.5 in (FTC limit 18). The dimensions follow public goBILDA, REV and FTC specs and are **approximate**. Colours are linear RGB in 0–1.

**Chassis** (`Chassis`; box exactly x ±8.5, y ±8.5):

| Part | Spec |
|---|---|
| Side rails | 2 × `U-Channel 1120 432mm`: 48 × 48 mm profile (1.89 in), along x at y = ±5.9, z 1.1–3.0. Open side inward. Optional dark inset discs on an 8 mm/24 mm grid as hole "decals" instead of real holes (triangle budget). |
| Cross members | 2 × `U-Channel 1120 240mm` along y at x = ±6.6. |
| Deck plate | `Grid plate`, 0.1 in at z 3.0, 13 × 10.5. |
| Wheels | 4 × `Mecanum wheel FL/FR/BL/BR`: 104 mm (r 2.05 in), ~1.5 in wide, centres (±5.6, ±7.7, 2.05). Hub + 2 side plates + 10 rollers. Roller axes at 45° in an X pattern seen from above: FL/BR one hand, FR/BL the other, matching `animate()`'s `-Math.sign(x*y)` side term. |
| Drive motors | 4 × `Drive motor 5203`: goBILDA Yellow Jacket (yellow gearbox ~1.5 in square × 2 in, black can r 0.74 × 2.3), inboard of each wheel along y, axis y, z 2.05. |
| Electronics | `Control Hub` box 5.6 × 4.05 × 1.0 on the deck front-left (REV dark grey + orange edge). `Battery` 5.9 × 3.2 × 1.4 front-right (black). |
| Odometry | `Pinpoint` 1 × 1 × 0.3 under the deck centre. `Odometry pod X` at y = +4 (Pinpoint `xOffset` default 4) and `Odometry pod Y` at x = −3 (`yOffset` default −3), each a small swing-arm with a 35 mm omni wheel. These match `C.ODOMETRY` (`sim-config.js` line 57), so the guided check and exports agree with the model. |

**Ramp intake** (`Ramp intake`; front, x 4.5–8.5 stowed):

| Part | Spec |
|---|---|
| `Side plates` | 2 × 0.1 in plates, 5 in tall, at y = ±6.6. |
| `Rollers` | `Upper roller` (r 0.9, 12.6 long, axis y at x 7.2, z 5.2) and `Lower roller` (x 6.0, z 2.9). Green compliant wheels or black tubing. `Intake motor` (5203) on the left plate, with a belt. |
| `Ramp` | Blade plate 12.6 × 5.5 × 0.12 plus 2 rails, hinge axis +y at (8.2, 0, 0.9). The CAD (starting) pose is folded up (≤ 8.5 in), so it is inside the starting box. Lowered = +80…85° about +y: rotation about +y moves a point above the hinge toward +x, which is the same sign as `standIn` `axis:[-dy,dx,0]` for the front. The blade tip lands at x ≈ 13.5, matching the mechanism `reach: 5`. `Ramp servo` (goBILDA 2000-series, ~40 × 20 × 38 mm) at the hinge. |

**Turret shooter** (`Turret shooter (pollen + nectar)`; pivot (−4.7, 0) = `MECH.mountOffset('back', 17×17)`, so the CAD and the engine's `mount:'back'` agree):

| Part | Spec |
|---|---|
| `Turntable bearing` | Ring r 3.0 × 0.3 at z 3.1–3.4, plus `Ring gear 120T`. `Turret motor` + pinion stays under `Chassis`, so it does not rotate. |
| `Turret plate` | 7 × 6 × 0.25 at z 3.4. |
| `Side plates` | At y = ±1.15, x −8.2 to −1.5, up to z 11.5. |
| `Flywheel` | 96 mm (r 1.89), 1.5 in wide, axis y at (−3.5, 0, 9.0), plus `Flywheel motor` (5203 6000 rpm, coaxial on the right plate). |
| `Hood` | Arc band about the flywheel axis. Radius ≈ r + 3.0 (pollen Ø 2.8, nectar Ø 3.6), from ~100° to ~20°, 3 in wide, 0.12 thick, so its top is ≈ 14.0 in. `Hood servo` on the plate. |
| `Kicker` | Servo arm (2.5 in, with a paddle) pivoting about +y at (−6.8, 0, 5.0), pushing the piece up into the flywheel contact. `Kicker servo` (goBILDA 2000). `Transfer chute` (curved plate) from the turret centre to the kicker, fixed on the turret. |

---

## 6. First-run seeding and existing users

### 6.1 Where the code goes (`ui/simulation.js`)

1. **Detect the first run** at line 122:

   ```js
   const stored=localStorage.getItem(KEY)||localStorage.getItem(OLD_KEY),firstRun=!stored;
   let project;try{project=firstRun?testSetupProject():sanitize(JSON.parse(stored));}catch{project=defaults();}
   ```

   - `testSetupProject()` = `sanitize({...window.DeckTestRobot.setup(), setupName:'Test setup', setupId:newId(), setups:[]})`, with `model:null` and `robot.appearance:'plain'` until the CAD is attached.
   - Keep `defaults()` unchanged. **New** must still give a blank `Setup N`, and the E2E relies on it (§10).
2. **Attach the CAD asynchronously, once.** Do this next to line 1601, or right before `return {activate…}` (2493), only when `native`:

   ```js
   const SAMPLES='deck-simulation-samples';                    // localStorage flag, e.g. "test-setup:1"
   async function testRobot(){                                   // the model + joints, stored like an import
     await three();const result=await api.simFile('test-robot'),body=await M().bodyFromImport(result),glb=await M().toGlb(body.geometry);
     const stored=await api.simFile('model-save',{name:'Deck test robot.glb',bytes:glb}),T=window.DeckTestRobot;
     const parts=(result.groups||[]).map(g=>({name:g.name,key:g.key,...MECH.partRole(g.name,g.inner),box:g.box}));
     return {model:M().meta({...T.MODEL,id:stored.id,parts}),kinematics:window.DeckKinematics.sanitize({...T.kinematics(),model:stored.id}),geometry:body.geometry};}
   ```

   - `T.MODEL = {name:'Deck test robot', units:'in', front:'+x', top:'+z', source:'step', bodyChassis:true, autoSize:false, entered:['mass','wheel','rpm']}`. `entered` stops the amber "check your mass/RPM" reminders (`needsYou()`).
   - **First run:** if `project.setupId` is still the seeded one, set `project.model`, `project.kinematics` and `project.robot.appearance='custom'`. Seed `modelCache.set(id, {id, geometry})` to skip a re-read. Then `save(); refreshAll(); await placeModel();`.
   - **Existing users:** if the flag is unset, `project.setups.length < 20`, and no setup is named "Test setup", push `{id:newId(), name:'Test setup', data:sanitizedTemplateWithModel}` to the **end** of `project.setups`. Do not switch to it. Call `save(); setupPanel();` and show the status "Added “Test setup” to your saved setups."
   - **Always set the flag**, so a deleted Test setup never comes back. Wrap it in try/catch, as `save()` does for quota.
3. **Recover a missing model.** In `placeModel()` (1691): when `model-read` returns `null` and `project.model.name === 'Deck test robot'`, call `testRobot()` instead of throwing "The saved robot model is missing". If the new id differs, remap `project.model.id` and `project.kinematics.model`. This makes `deck-sim show examples/test-setup.json`, cloned setups and a cleared `models/` folder all work.
4. **Main process** (`src/sim-bridge.cjs` `file()`, beside `assets`, line ~90):

   ```js
   if(action==='test-robot'){const T=require('../ui/sim-test-robot.js'),SM=require('./sim-model.cjs'),m=T.meshes();
     return {kind:'step',name:'Deck test robot',...SM.merge(m),tree:SM.tree(m),groups:SM.groups(m),names:SM.names(m),parts:m.length};}
   ```

   Typed arrays survive IPC structured clone. `sim-model.cjs` loads only `./step-split.cjs` and `./step-hull.cjs` at require time (no wasm until `convertStep`). Also add `testRobot:true` to the `assets` reply if you want the UI to know about it.
5. **`ui/index.html`**: add `<script src="sim-test-robot.js"></script>` before `simulation.js`. `tests/preview-assets.test.cjs` checks every script tag resolves.
6. **Should existing users get it? Yes, once, appended, never activated.**
   - It is a ready-made working example: CAD, mechanisms, route and exports.
   - It never overwrites anything.
   - Respect the 20-setup cap and the flag.
   - Do not migrate or alter their current setup.

### 6.2 Test setup data (template returned by `DeckTestRobot.setup()`)

Values below were validated headlessly (§8). Device names follow `F.mechanismDevices` (`ui/sim-ftc.js` 562).

```js
{deckSimulation:2,version:2,setupName:'Test setup',controller:'ftc',imuSource:'device',
 robot:{drivetrain:'mecanum',length:17,width:17,heightIn:14.5,massLb:28,driveRpm:435,wheelDiameterMm:104,driveStyle:'robot',appearance:'custom'},
 sensors:{localization:'fused'},               // goBILDA Pinpoint + 2 pods (Pedro export needs fused/OTOS/pods)
 timing:{source:'robot',power:1},tuning:{maxPathSpeed:1,powerSet:true},
 practice:{mode:'autonomous',autoSeconds:30,transitionSeconds:8,teleopSeconds:120},program:{kind:'route',name:'',source:EXAMPLE},
 view:'2d',hitboxes:false,orientations:{},export:{packageName:'org.firstinspires.ftc.teamcode',className:'TestSetupAuto',keep:false},
 mechanisms:{enabled:true,
   intakes:[{kind:'ramp',sides:['front'],reach:5,width:13,height:5,motor:'intake',power:1,servo:'ramp',down:.3,up:.3,downPos:0,upPos:1,parts:['Ramp intake']}],
   shooters:[{type:'turret',pieces:'both',mount:'back',facing:'front',motor:'shooter',indexer:'kicker',indexerKind:'pusher',feedPos:1,restPos:0,
              turretMotor:'turret',at:{x:-4.7,y:0,z:11},parts:['Turret shooter (pollen + nectar)']}],
   capacity:{pollen:4,nectar:4},preload:{pollen:4},transfer:{seconds:1},indexer:{seconds:.3,pushSeconds:.15},
   shooter:{hood:75,rpm:3400,spinUp:.6,control:'velocity',tolerance:.05},
   turret:{speed:240,min:-170,max:170,kind:'motor',ticksPerDegree:6.41 /* 5203-435 384.5 cpr × 120T/20T ÷ 360 */},target:null},
 kinematics:{model:'<id>',unit:1,joints:[/* §7.2 */]},
 model:{/* filled at seed time */},
 layouts:[{name:'BIOBUZZ red auto',field:'biobuzz',alliance:'red',elements:true,start:{x:9.85,y:26,heading:-90},pins:[/* §8 */],clearance:2,style:'spline',rotate:true},
          {name:'Empty field 1',field:'empty'}]}
```

`setupFacts` will then read: *BIOBUZZ red auto · red alliance (+1 more) · Deck test robot · Mecanum · 17 × 17 in · 1 intake · 1 turret · FTC Control Hub · 8 pins*.

---

## 7. Making every action work and animate ("the same actions")

`Mech.actions(m)` (`sim-mechanisms.js` line 180) for this setup is **Intake, Ramp down, Ramp up, Spin up, Aim, Shoot**. The step catalogue (`ui/sim-steps.js` `catalog()` line 19) adds **Turret to °** (one turret) and **Wait**. These are the same game actions every BIOBUZZ robot with a ramp and a turret has.

| Action | Engine signal (`src/sim-engine.cjs` `jointTick()` line 263 → `Kin.Driver.tick`) | Joint that moves | Exported device (`F.mechanismDevices`) |
|---|---|---|---|
| Intake | `s.intake` → `roller` spins | `roller` (Rollers) | motor `intake` |
| Ramp down / Ramp up | `m.kick[0]` → `deploy` raised→lowered | `ramp` | servo `ramp` (downPos/upPos) |
| Spin up | `s.flywheel` → `flywheel` spins; `s.spin` → `hood` to the shoot angle | `flywheel`, `hood` | motor `shooter` (velocity) |
| Aim / Turret to ° | `s.turrets[0]` → `turret` | `turret` (+ flywheel, hood, kicker ride on it) | motor `turret` (encoder) |
| Shoot | spin + aim + `s.feed` pulses (pusher: `feedCycle`, `pushSeconds`; `sim-mechanisms.js` 276–312) | `kicker` (**needs §7.1**), `hood` | servo `kicker` (pusher feed/rest) |
| (driving) | chassis velocity | `wheelFL/FR/BL/BR` (`signal:'wheel'`, `roll:'mecanum'`) | drive motors (existing) |

Teleop practice uses the same mechanisms (Y = ramp, as AGENT_HANDOFF "Route steps" describes), so nothing extra is needed.

### 7.1 Engine/visual gap: a servo kicker as feeder

`ui/sim-kinematics.js` line 462:

```js
else if(d.signal==='feeder')this.q[j.id]=wrap360(this.q[j.id]+rate(s.feed?(j.rpm||200):0)*dt);
```

This always spins, so a revolute kicker would rotate endlessly. Extension, modelled on the hood axis (lines 429 and 450):

- In the constructor, for `j.drive?.signal==='feeder' && j.type==='revolute' && finite(j.states?.feed)`, add `this.axes.set('feeder:'+j.id, new Axis(j.states.rest??0, {speed:j.speed||720}))`.
- In `tick`, call `.to(s.feed ? j.states.feed : (j.states.rest??0))` and use its `q` instead of spinning.
- Keep the continuous behaviour for feeder wheels (`discovery.js` 628 creates those).
- Test it in `tests/sim-joints-engine.test.cjs` or a new test: with `s.feed` true for `pushSeconds`, q reaches `feed` and returns to `rest`.
- Optional: `gameValues()` in `sim-robot-model.js` 289 for old recordings. It is not needed, because frames carry `joints` (engine line 483).

### 7.2 Joints to ship

Origins and axes are in the CAD frame (= robot frame here). `source:'metadata'` means "From the file". Those joints are kept on re-discovery (`sim-joints.js` `discover()` keeps user and metadata joints).

```js
const R='Deck test robot',T=R+'/Turret shooter (pollen + nectar)',I=R+'/Ramp intake',C=R+'/Chassis';
[{id:'turret',name:'Turret',kind:'turret',type:'revolute',lower:-170,upper:170,zero:0,parts:[T],origin:[-4.7,0,3.4],axis:[0,0,1],drive:{signal:'turret',of:'shooter:0'}},
 {id:'flywheel',name:'Flywheel',kind:'flywheel',type:'continuous',parent:'turret',parts:[T+'/Flywheel'],origin:[-3.5,0,9],axis:[0,1,0],radius:1.89,rpm:3400,drive:{signal:'flywheel',of:'shooter:0'}},
 {id:'hood',name:'Hood',kind:'hood',type:'revolute',parent:'turret',parts:[T+'/Hood'],origin:[-3.5,0,9],axis:[0,1,0],lower:-8,upper:8,launch:75,states:{rest:0},drive:{signal:'hood',of:'shooter:0'}},
 {id:'kicker',name:'Kicker',kind:'kicker',type:'revolute',parent:'turret',parts:[T+'/Kicker'],origin:[-6.8,0,5],axis:[0,1,0],lower:-60,upper:5,states:{rest:0,feed:-40},speed:720,drive:{signal:'feeder',of:'shooter:0'}},
 {id:'ramp',name:'Ramp',kind:'deploy-intake',type:'revolute',parts:[I+'/Ramp'],origin:[8.2,0,.9],axis:[0,1,0],lower:0,upper:95,states:{raised:0,lowered:85},drive:{signal:'deploy',of:'intake:0'}},
 {id:'rollers',name:'Intake rollers',kind:'roller-intake',type:'continuous',parts:[I+'/Rollers'],origin:[6.6,0,4],axis:[0,1,0],radius:.9,drive:{signal:'roller',of:'intake:0'}},
 ...['FL',1,1,'FR',1,-1,'BL',-1,1,'BR',-1,-1].reduce(/* → */(a,v,i,s)=>i%3?a:[...a,{id:'wheel'+v,name:'Mecanum wheel '+v,kind:'drive-wheel',type:'continuous',
   parts:[C+'/Mecanum wheel '+v],origin:[5.6*s[i+1],7.7*s[i+2],2.05],axis:[0,1,0],radius:2.05,roll:'mecanum',drive:{signal:'wheel'}}],[])]
```

- Each roller can be its own `continuous` joint (one per axis) under `Rollers/Upper roller` and `Rollers/Lower roller`.
- To make the rollers ride on the ramp, give them `parent:'ramp'`.
- Joint ids must match `/^[A-Za-z][\w-]{0,31}$/` (`sim-kinematics.js` line 94).
- Check the hood `launch` sign against the CAD hood angle with the preview's `posed()`.

---

## 8. The long autonomous route (validated headlessly)

Draft setup: `try/test-setup-candidate.json`. Pins: `try/route-candidate.pins.json` (scratchpad). Start (9.85, 26, −90), touching the left wall, red half.

| # | Pin (x, y) | Path | At pin |
|---|---|---|---|
| 1 | 9.85, 21 | Spin up, spline | Shoot 4 preloads → south (up) cell; tips the hive |
| 2 | 9.85, 15 | Intake, sharp | Intake 0.3 s: red GARDEN pollen |
| 3 | 24, 106 | Spin up, custom curve [(25, 38), (20, 80)], turn to −180 | Shoot, other (north) cell, from behind the hive |
| 4 | 16.2, 107.3 | Intake, sharp (loading-zone pollen) | Shoot, other cell |
| 5 | 24, 48.6 | spline, turn to 180 | Ramp down |
| 6 | 22.5, 48.6 | Intake, sharp | steps: Intake 1.5 s → Ramp up (flower F1 bottom pollen) |
| 7 | 24, 106 | Spin up, spline, turn to −180 | Shoot, other cell |
| 8 | 20, 106 | sharp, turn to −180 | PARK (chassis partly in the red LOADING ZONE, x1 = 12.9) |

Results:

- `deck-sim test`: **8 pins, 17.5 s**, 0 zone touches, picked up 6, **10/10 shots** (100 %).
- `deck-sim test --code onbot` (virtual Control Hub, pusher feeder + ramp servo exported): **17.37 s, 11/11**.

Lessons from building it:

- After the first tip the north cell is up. You must shoot it from **behind the hive (y > 85)**. Every "other" shot from y < 60 missed (57 % accuracy).
- A path that keeps no heading falls back to the start heading. Set `path.rotate:'turn', heading` on each path, or the planner reports "no room to turn while driving".
- With the ramp reach at 5 in, pins against a wall need the chassis centre ≥ 8.5 + 5 + clearance from it. Parking at (11, 107) facing the wall jammed.
- **The flower leg (pins 5–6) collects nothing yet.** BIOBUZZ ramp-blade physics is being changed now (the uncommitted `tools/simulation/build.cjs` `deck-offline-pushbot` patch: "a deployed ramp keeps BIOBUZZ's blade and rails …"). After that lands:
  1. Rebuild with `node tools/simulation/build.cjs` (about 10 s with `--skip-java`).
  2. Re-run `deck-sim test`.
  3. Tune pin 6's x (21–22.5) so the ramp tip (x − 8.5 − 5) sits just at the flower base (x ≤ 6.34).
- Then run `deck-sim optimize` and the Pedro export (`fetch-pedro.cjs` first).
- Store the route in the template with `route:null`. The app plans it when the team opens Path planning or runs it.

---

## 9. File list (recommended implementation)

| File | Change |
|---|---|
| **new** `ui/sim-test-robot.js` | UMD `DeckTestRobot`: `meshes()` (parametric goBILDA/REV parts → `[{path, name, position, normal, index, color}]`), `kinematics()` (§7.2), `setup()` (§6.2 + pins §8), `MODEL`, `NAME`, `VERSION`. No three.js. Reuse the primitive helpers' ideas from `tests/fixtures/mechanism-shapes.cjs` (`cylinder`, `box`, `arcBand`). |
| `src/sim-bridge.cjs` | `action==='test-robot'` (§6.1.4); optional `assets.testRobot`. |
| `ui/simulation.js` | First-run branch at 122; `testRobot()` + seeding near 1601 / 2492; append-once for existing users (flag `deck-simulation-samples`); `placeModel()` missing-model fallback (1691); `modelMeta` `kind` list + `'kicker'` (119); optional: `openProject` remaps `kinematics.model` like robot-load (1575) and prefers `raw.setupName`. |
| `ui/sim-kinematics.js` | Servo-kicker feeder swing (§7.1). |
| `ui/index.html` | `<script src="sim-test-robot.js">` before `simulation.js`. |
| `tools/deck-sim.cjs` | `sample <setup.json> [--show]` (or `new --sample test`) writes `DeckTestRobot.setup()` with `model:null`/`kinematics.model:null`. The app's fallback attaches the CAD on `show`. Add it to HELP. |
| **new** `tools/simulation/make-test-robot.mjs` (dev only) | Writes a viewable multi-node GLB (named nodes, per-part materials) to a given path, for Blender, for screenshots and for re-import tests through *Import your robot* (checks that CAD discovery finds turret, hood, flywheel and ramp by name). Uses three from `.cache/simulation-deps` like `finish-robot.mjs`, plus the FileReader polyfill. |
| **new** `examples/test-setup.json` (+ `.pins.json`) | Made with `deck-sim sample`. Optional exports in `examples/test-setup/` (AGENT_HANDOFF: regenerate exports after generator changes). |
| **new** `tests/sim-test-robot.test.cjs` | See §10. |
| `tests/simulation-ui.cjs` | First-run assertions (§10). |
| `docs/SIMULATION.md`, `AGENT_HANDOFF.md`, `THIRD-PARTY-NOTICES.md` | Document the Test setup and the sample robot. It is original geometry under the MIT licence, modelled after published goBILDA/REV dimensions, and part names are descriptive only. The notices currently say public releases contain no third-party CAD (lines 72–73); that stays true. |

Coordinate with the other agent. They own `sim-model.cjs` (`groups()`), `sim-robot-model.js` (`meta`), `sim-mechanisms.js` and `sim-discovery.js`. This plan only **calls** those files. It edits `sim-bridge.cjs`, `simulation.js`, `sim-kinematics.js`, `index.html` and `deck-sim.cjs`, and adds new files. Stage only your own hunks (AGENT_HANDOFF).

---

## 10. Tests

**New `tests/sim-test-robot.test.cjs`** (Node, three from `.cache` when present, skip otherwise as `sim-rig.test.cjs` does):

1. `meshes()`:
   - Every vertex lies within x, y ∈ [−8.5, 8.5], z ∈ [0, 14.5] (starting size), and the floor is at 0.
   - The `Chassis` box equals robot length × width.
   - The triangle count is ≤ 60 k.
2. `SM.groups()` + `partRole` give exactly: chassis, intake/ramp, shooter/turret/both. `Mech.fromCad` finds 1 ramp intake on the front and 1 turret at the back taking both pieces.
3. Every joint's `parts` expands through `K.partIndex(SM.tree(meshes))`, and the turret's children are its riders.
4. With three:
   - `bodyFromImport` → `toGlb` twice gives equal bytes.
   - `fromGlb` keeps `_part` and the tree.
   - `place()` scale = 1.
   - `rig()` gives links = joint ids and no stand-ins.
   - `pose({turret:90})` moves the flywheel centre about the turret pivot.
5. `Mech.actions(setup.mechanisms)` deep-equals `['Intake','Ramp down','Ramp up','Spin up','Aim','Shoot']`. `F.mechanismDevices` lists intake (motor), ramp (servo), shooter (motor), kicker (servo, pusher) and turret (motor).
6. Engine (as in `tests/sim-setups.test.cjs`): load `setup()` → plan → run to the end. It must finish within 30 s with 0 violations and ≥ 8 shots, and frames must carry `joints` with `kicker` swinging (§7.1).
7. When `sim-runtime/driver` is built: the OnBot export runs on the virtual Control Hub (pattern: `tests/sim-mechanism-hardware.test.cjs`).

**E2E (`tests/simulation-ui.cjs`; runs on a fresh `DECK_DATA_DIR`, so it becomes a first run).** These lines assume today's defaults and will break:

- line 28: the waits for `/Strafer.*fitted/` and `#sim-localization === 'encoders'`, `#sim-imu-source === 'hub'`;
- lines 34–40: the rename of the initial setup, then `robot.length === 17.56`, `copy.setups.length === 3`.

Fix: add a first-run check that `#sim-setup strong` reads "Test setup" and `#sim-mesh-size` matches `/Deck test robot.*fitted/`. Then click **New** (blank `defaults()`), continue the old flow from there, and add 1 to the setup counts.

`tests/robot-setup-app.cjs` opens an example with `--deck-sim-open`. That only adds a setup, and its assertions read the current project, so it is likely unaffected. Run it anyway.

---

## 11. Side findings (not in scope, worth a ticket)

- `openProject()` (simulation.js 1904) restores `modelData` through `model-save` but never remaps `kinematics.model`. If the re-stored id differs from the saved one, a CAD's confirmed joints are dropped (`rig()` needs `kinematics.model === meta.id`) and discovery re-runs. `#sim-save` re-exports bytes with `toGlb(fromGlb geometry)`, so ids are likely to differ. Robot-load (1575) already does the remap.
- `src/sim-model.cjs` `tree()` regex `/s*<d+>$/` (missing `\s`, `\d`).
- `ui/simulation.js` `modelMeta()` and `sim-robot-model.js` `meta()` now disagree: the latter accepts `kind:'kicker'` and `carries`, the former does not.
- `placeModel()` never shows a model in the web preview (`!native`), so the Test setup will look like a plain box there.
