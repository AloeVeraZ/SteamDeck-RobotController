# Mechanism data model and the Setup → Mechanisms editor (research, read-only)

Repo: `/home/user/SteamDeck-RobotController`, branch `claude/zealous-galileo-brknjs`, read 26 Oct 2026.
Line numbers are from the working tree. `ui/sim-mechanisms.js`, `ui/sim-robot-model.js`, `ui/sim-discovery.js` and
`src/sim-model.cjs` have uncommitted edits by another agent (it splits CAD assemblies holding two turrets and keeps
`<n>` instance suffixes in shooter `parts`), so their line numbers may move. Nothing in the repo was modified.

---

## 0. The two models, in one paragraph

A project has **two separate mechanism descriptions**:

| | `project.mechanisms` (DeckMechanisms, `ui/sim-mechanisms.js`) | `project.kinematics` (DeckKinematics, `ui/sim-kinematics.js`) |
|---|---|---|
| What | The BIOBUZZ game's intakes (≤4) and shooters (≤2), timing, storage, and their FTC hardware (device names, reversed, kinds) | CAD joints, actuators (FTC motor/servo models), couplings, loops, sensors, actions, poses |
| Simulator | Game physics + `Mech.Model`/`Mech.Runner` (pickup, shoot timing). Only when field is `biobuzz` and `enabled` | `Kin.Driver` in `src/sim-engine.cjs` (`this.kin`): moves joints from game signals and route-action names; its joint values only drive drawing |
| Export | `F.mechanismDevices` (`ui/sim-ftc.js:562`) → `Mechanisms.java`, VirtualHub wiring (`mechanismHardware`, :581), robot check (`robotNeeds`, :54), guided check, MotionModule | **Not exported.** No exporter calls `DeckActuators.device()`. Custom route actions ("Lift up", "Arm to 40°") become stubs in `RobotActions` (`robotActions`, `ui/sim-ftc.js:496`) |
| UI | Game cards in `#mech-intakes`/`#mech-shooters` (built in `ui/simulation.js`) + global timing/flywheel/turret section | Mechanisms list cards in `#mech-parts` (`ui/sim-mechanism-list.js`) + Moving parts panel in `#mech-joints` (`ui/sim-joints.js`) |
| Link between them | A joint's `drive:{signal, of:'intake:n'|'shooter:n'|'any'}` binds it to a game mechanism (visual only). `Kin.reindex` (`sim-kinematics.js:630`) renumbers on removal (`simulation.js:2169`). | |

---

## 1. `ui/sim-kinematics.js` (DeckKinematics) — joints, actuators, couplings

### 1.1 Enumerations (lines 21–49)
- `TYPES` (21): `fixed, revolute, continuous, prismatic, cylindrical, screw, universal, ball, planar, floating, pinslot`, each `{name, dof:['deg'|'in',…]}`.
- `ACTUATORS` (33): `servo, crservo, dcmotor, bldc, stepper, linear, pneumatic, hydraulic, spring, none`. FTC four = `servo, crservo, dcmotor, linear` (`FTC_KINDS`, `sim-mechanism-list.js:24`).
- `MODES` (34): `position, velocity, effort, states`. `RESPONSES` (37): `ideal, motor, pneumatic`.
- `STAGES` (40): `gearbox{ratio}, belt{driver,driven}, spool{diameter}, rack{diameter}, screw{lead}`, each `reverse?`. `stagesRatio` (206) multiplies `stageFactor` (204).
- `SENSORS` (41): `encoder, limit, potentiometer, velocity`.
- `COUPLINGS` (44): gear, belt, rack, screw, cable, mimic, differential, planetary, tendon, cam, sequence, linkage.
- `SIGNALS` (47): `turret, hood, flywheel, roller, deploy, float, feeder, wheel, steer, action` (what drives a joint).
- `PROVENANCE` (102): `metadata | inferred | user | standin`.

### 1.2 Stored shapes (`sanitize`, 133–171; `sanitizeJoint`, 103–132)
```
kinematics = {version:1, model:'<32hex>.glb'|'builtin:x'|null, unit (inches per CAD unit),
  joints:[Joint], actuators:[Actuator], couplings:[Coupling], loops:[Loop], actions:[Action],
  sensors?:[Sensor], poses?:[{name, values:{moverId:number}}], discovered?:true, finder?:int}
Joint = {id (/^[A-Za-z][\w-]{0,31}$/), name, type, parent:id|null, parts:[ref] (assembly key "A/B/C" or "#leaf"),
  origin:[x,y,z] (CAD frame/units), axis:[unit], axis2?, lower?, upper?, home?:[..], lead? (screw), limits?:[[lo,hi]|null],
  states?:{name:value} (≤8), drive?:{signal, of?:'intake:0-3'|'shooter:0-3'|'any'}, kind? (DeckMechanismTypes id),
  speed?, rpm?, zero? (turret CAD heading, deg), launch? (hood CAD launch angle), radius?, roll?:'mecanum'|'omni',
  source, confidence?, note?, matched? (CAD assembly name), alternatives?:[{origin,axis,note}]}
Actuator = {id, name, kind (ACTUATORS), joint, index, mode, speed, accel, ratio (from transmission), home?, states?, effort?,
  transmission?:[Stage], response?:'motor'|'pneumatic', motor?:{free,stall,count?,load?,inertia?,p?,i?,d?,power?},
  ...hardwareOf(a)}
hardwareOf(a) (226–234) = {model? (/^[a-z0-9][a-z0-9-]{0,47}$/), device? (/^[A-Za-z][\w .-]{0,39}$/), reversed?:true,
  servo?:{min,max,center,range,pwm?:[lo,hi]µs,pulse?:[lo,hi]µs}, cpr?, power?}
Sensor (160–162) = {id, name, kind, actuator|joint, index?, cpr? (encoder, default 537.7), at?, band? (limit)}
Coupling (147–151) = {kind, from, to, ratio, offset, fromIndex?, toIndex?, plus?:[{from,ratio,fromIndex?}], curve?|poly?, period?}
Loop (156) = {a:{joint|null, point}, b:{joint|null, point}, along?}
```
**Any field not listed is dropped** by `sanitize`, and every UI commit goes through it (`simulation.js:2201`, `:2206`).

### 1.3 Behaviour
- `motion(j,q)` (79): q=0 is identity → **q=0 is the CAD pose**.
- `resolve` (264), `limitsOf`/`hold` (271–273), `applyCouplings` (288), `worlds` (290), `solveLoops` (300, homotopy from home = CAD pose), `pose(model,given)` (347).
- `Axis` (356–409): ideal trapezoid, DC-motor model (`stepMotor`), pneumatic ends.
- `Driver` (416–513): one per run. Constructor (419–431): one `Axis` per actuator (start `a.home ?? joint.home ?? 0`), `hood:<id>` and `joint:<id>` axes. `start(name)` (435): actions by name, or "<joint|actuator name> <state>" / "<name> to 40°|4 in". `tick(dt,signals)` (446–466) applies game signals (see §6). `read(sensorId)` (500–506). `values()` (496) gives only driven joints.
- `timeline`/`tickedTimeline`/`sampleTimeline` (521–585), `reach` IK (594), `rigging` (617), `planetary` (623), `reindex` (630), `forEngine` (633, strips parts).
- `partIndex(tree)` (243–258): `{expand(refs)→Set<leaf>, compress(Set)→refs, leavesUnder(node), byKey, name(leaf), key(leaf)}`. Keys are `parentKey + '/' + name`, same scheme as `DeckRobotModel.partTree` (`sim-robot-model.js:141`). Leaf index == the `_part` vertex attribute value == "mesh" index in `partTree`.

### 1.4 rig / retune (they live in `ui/sim-robot-model.js`)
- `rig(holder,{meta,mechanisms,kinematics,footprint,height})` (214–245): if `kinematics.model===meta.id`, splits the single CAD mesh into one `THREE.Group` per joint (`name:'DeckLink:'+id`, `userData.deckLink`), each with a mesh sharing the original attributes and an index subset. Each leaf goes to the **deepest** joint naming it (`owner`, 222). Adds per-link hitbox `LineSegments` (`HITBOX` colours, 213). Game turrets/ramps without CAD parts get stand-in joints (`standIn`, 265–279; ids `standin-turret1`, `standin-deploy1`). Result in `holder.userData.kin={model,P,standIns,boxes,turrets}`.
- `retune(holder,kinematics)` (282): swaps `kin.model` in place when only non-shape settings changed.
- `simulation.js rigOf(base,slot)` (1716–1722) caches by key `[base.uuid, model id, k.model, joints' (id,parent,parts,drive), game intakes (kind,sides,parts), shooters (type,mount,parts,sharesTurret), footprint, height]`; otherwise `retune`. `mechRig()` = full-resolution `model.holder` (1726); `fieldRig()` = light copy for the 3D field.

---

## 2. `ui/sim-actuators.js` (DeckActuators) — the catalogue

Constants: `PWM={standard:[600,2400], full:[500,2500]}` (18); `KINDS` (19) = `servo|crservo|dcmotor|linear` labels; `DEFAULT` (115) = `{servo:'gobilda-torque', crservo:'gobilda-speed-cr', dcmotor:'gobilda-5203-312', linear:'actuonix-l16-50'}`.

### 2.1 Servos (`kind:'servo'`, default `pulse:[500,2500]`; fields `id,name,short,range(°),speed(°/s),torque(N·m),cr?`)
| id | short | range | speed °/s | torque N·m | cr twin |
|---|---|---|---|---|---|
| gobilda-torque | goBILDA Torque servo | 300 | 300 (0.2 s/60°) | 2.118 | gobilda-torque-cr |
| gobilda-speed | goBILDA Speed servo | 300 | 666.7 | 0.912 | gobilda-speed-cr |
| gobilda-superspeed | goBILDA Super Speed servo | 300 | 1395.3 | 0.461 | gobilda-superspeed-cr |
| gobilda-5turn | goBILDA 5-Turn servo | 1800 | 666.7 | 0.912 | — |
| axon-max | Axon MAX | 350 | 521.7 | 3.334 | axon-max-cr |
| axon-mini | Axon MINI | 350 | 666.7 | 2.452 | axon-mini-cr |
| axon-micro | Axon MICRO | 350 | 800 | 0.765 | axon-micro-cr |
| rev-smart | REV Smart Robot Servo | 270 | 428.6 | 1.324 | rev-smart-cr |
| rev-smart-ultra | REV SRS UltraSpeed | 270 | 1395.3 | 0.549 | — |
| studica-multimode | Studica Multi-Mode servo | 300 | 300 | 2.118 | studica-multimode-cr |
| hitec-485 | Hitec HS-485HB (`pulse:[553,2425]`) | 190 | 333.3 | 0.588 | — |
| servo-180 | 180° servo | 180 | 300 | 0.981 | — |

### 2.2 Continuous servos (`kind:'crservo'`; `id,name,short,rpm,torque`)
`gobilda-torque-cr` 50 rpm, `gobilda-speed-cr` 111, `gobilda-superspeed-cr` 233, `axon-max-cr` 87, `axon-mini-cr` 111, `axon-micro-cr` 133, `rev-smart-cr` 71, `studica-multimode-cr` 50 (rpm = round(10/(s per 60°))).

### 2.3 Linear servos (`kind:'linear'`, default `pulse:[1000,2000]`; `range` in inches, `speed` in/s, `force` N)
`actuonix-l16-50` (1.969 in, 0.787 in/s, 100 N), `actuonix-l16-100` (3.937), `actuonix-l16-140` (5.512), `hitec-hls12` (1.181 in, `pulse:[1050,1950]`, 0.984 in/s, 49 N).

### 2.4 DC motors (`kind:'dcmotor'`; `id,name,short,family,ratio,rpm,cpr,stall(N·m),part?`)
- goBILDA 5203 Yellow Jacket `gobilda-5203-<rpm>`: 6000 (1:1, 28 cpr, .144), 1620 (3.7, 103.8, .53), 1150 (5.2, 145.1, .77), 435 (13.7, 384.5, 1.83), 312 (19.2, 537.7, 2.38), 223 (26.9, 751.8, 3.73), 117 (50.9, 1425.1, 6.71), 84 (71.2, 1993.6, 9.18), 60 (99.5, 2786.2, 13.06), 43 (139, 3895.9, 18.14), 30 (188, 5281.1, 24.5).
- REV: `rev-hd-hex` (6000/28/.105), `rev-ultra-3` (2.897, 2071, 81.1), `rev-ultra-4` (3.619, 1658, 101.3), `rev-ultra-5` (5.231, 1147, 146.4), `rev-ultra-12` (10.48, 572, 293.6), `rev-ultra-15` (15.15, 396, 424.3), `rev-ultra-20` (18.93, 317, 530), `rev-ultra-60` (54.84, 109.5, 1535.3), `rev-hd-hex-20` (20, 300, 560), `rev-hd-hex-40` (40, 150, 1120), `rev-core-hex` (72, 125, 288, 3.2).
- `torquenado` (60, 100, 1440, 4.94), `studica-maverick` (61, 100, 1464, 5), `neverest-20` (19.2, 340, 537.6, 1.24), `neverest-40` (40, 160, 1120, 2.47).
- **No model carries any feedback/sensor metadata** (encoder = implied by `cpr`; servo analog feedback, external encoders, limit switches: none).

### 2.5 Functions
`of(kind)` (78), `servo(a)` (81: fills min/max/center/range/pulse/pwm), `perUnit(a)` (85), `position(a,value)`/`valueAt(a,pos)` (91–92), `limits(a)` (94), `countsPer`/`ticks` (97–98), `speedOf` (100), `withModel(a,id)` (105–113: sets kind, speed, cpr/response 'motor'/motor{free,stall} for dcmotor, servo range/pulse; linear new to model → center=retracted), `create({id,joint,name,spec,speed,travel,states})` (121–129), `travelOf(j)` (131), `device(a,states)` (134–139: `{type:'Servo'|'CRServo'|'DcMotorEx', name, positions|ticks, reversed, power, pwm?, countsPerTurn}` — the intended exporter view, **unused by any exporter**), `describe(a,unit)` (141), `camel(name)` (116).

---

## 3. `ui/sim-mechanism-types.js` (DeckMechanismTypes)
- `GROUPS` (19), `LIST` (27–241) of `T(id, group, name, joint, {axis, find, family, states, lower, upper, speed, rpm, signal, positive, piece, then, motor, words, blurb})` (24). `TYPES` (242) by id. 70+ types; relevant ones: `roller-intake` (signal roller, motor gobilda-5203-1150), `deploy-intake` (states up:0/down:90, positive 'lower', servo gobilda-torque), `turret` (states front/left/right, ±180, motor 5203-435 + belt 20:100), `mini-turret`, `flywheel` (signal flywheel, 5203-6000), `hood` (low 0/high 20, servo gobilda-speed), `feeder`, `conveyor`, `ramp` (down 0/up 30), `kicker`, `gate`, `spindexer`, custom-pivot/slide/spin.
- `motor` spec helpers (22–23): `{kind, model, transmission?}`; `motorFor(id)` (290) returns `{kind, model?, transmission?, response?}` (default `{kind:'dcmotor'}`).
- `of(j)` (264: `j.kind` else `BY_SIGNAL[drive.signal]`, 263), `settings(id,{bind})` (270), `joint(id,{...})` (278), `retype(j,id,{rows,bind})` (283), `detect(name)` (256), `likeness({kind,name},cadName)` (312), `short` (297), `says` (299), `grouped()` (291), `direction(t,rows)` (267).

---

## 4. `ui/sim-mechanism-list.js` (DeckMechanismList) — the per-mechanism card editor
- `create({host:#mech-parts, picker:#mech-picker, api})` (25). Api from `simulation.js:2205–2208`: `kinematics, commit, joints()→DeckJointsPanel instance, isMechanism, game(), cad(), addGame, rows, status, adding`.
- `listed()` (31–34): joints where `api.isMechanism(j)` (`sim-joints.js:111`: has a known `kind`, not a wheel, and `drive` absent or `action`) and not a coupling target, nested by `parent`. **Game-driven joints (turret/hood/flywheel/roller/deploy found on BIOBUZZ) are not listed here**; they appear only in Moving parts.
- `card(j,depth)` (72–79): `<section class="sim-mech-part sim-mech-moving" data-mech="<jointId>" data-depth>`; header, badge (38), "Show on model" (`data-m="show"`) and "Choose its parts" (`data-m="choose"`), Name (`data-m-f="name"`), Mechanism type select (`data-m-f="kind"`), `positions(j,a)` (41–48) and `actuator(j,a)` (50–71).
- `positions`: rows `[data-state]` with name (`data-m-state-name`), value in °/in (`data-m-state-value`), servo position (`data-m-state-pos`, via `A().position`) or motor counts (`A().ticks`), Show (`data-m="state-show"` → `api.joints().pose(id,v)`), remove.
- `actuator`: "Driven by" select `data-m-f="actuator"` (FTC optgroup `servo,crservo,dcmotor,linear`; Other robots; `none`). Then Model select `data-m-f="model"` (from `A().of(kind)`), "Name in the robot configuration" `data-m-f="device"`, reversed checkbox `data-m-f="reversed"`; servo/linear: `data-m-servo="min|center|max|range|pwm"`; dcmotor: `data-m-f="cpr"`, `data-m-f="power"`, "Edit gearing" (`data-m="gearing"` → opens Moving parts); crservo: power; others: speed.
- `render()` (90–97): rebuilds `host.innerHTML` only when `JSON.stringify([k.joints,k.actuators,k.couplings,cad,game])` changes and no input is focused; restores open `<details>`.
- Change handler (130–154): `change(fn)` = structuredClone → mutate → `api.commit`. `kind` (142–144) retypes and replaces the actuator if the usual kind differs (keeps only `device`). `actuator` (145–148) rebuilds the actuator with `A().create` (keeps `device`, `reversed`). `model` (149) → `A().withModel`. `device` (150) validates `/^[A-Za-z][\w .-]{0,39}$/`. `servoChange` (112–114) keeps code-positions when `center` moves; `fitLimits` (115–116) sets joint lower/upper from `A().limits`.
- Click handler (117–124): `remove`, `show`→`api.joints().open(id)`, `choose`/`gearing`→`api.joints().open(id,{choose})`, `state`, `unstate`, `state-show`.
- `add(id)` (104–109): `game:intake:<kind>`/`game:shooter:<type>` → `api.addGame`; on BIOBUZZ `AS_GAME` (22) maps `roller-intake, deploy-intake, flywheel, turret` to game parts; else `api.joints().add(typeId)`.
- Returns `{render, open, close, listed}` (155). **No focus/hover/scroll events exist.**

---

## 5. `ui/sim-joints.js` (DeckJointsPanel) — "Moving parts" (`#mech-joints`)
- `create({host,api})` (27). Api (`simulation.js:2199–2203`): `kinematics, mechanisms, model, meta, preview:()=>mechPreview, commit, setIntake, setShooting, footprint, hitboxes, setHitboxes, refreshPicker`.
- State: `open` (joint id), `mode` (picker: circle/points/loop/parts), `demo` (rAF id), `values` (preview joint values), `lastKey`.
- `ctx()` (37) = `DeckDiscovery.prepare(arrays)` cached per geometry; `ctx().parts` is `K.partIndex(tree)`. `leavesOf(j)` (42) = `ctx().parts.expand(j.parts)`.
- `render()` (327–338): rows `<li class="sim-joint" data-id><button class="sim-joint-row" data-j="toggle" aria-expanded>`; open row renders `body(j)` (161–220) with role bits (turret `zero`, deploy raised/lowered + floor + pickup box, hood launch/rest/shoot, float, flywheel, roller/feeder rpm, action states), Moves by, Driven by (`driveOptions`, 150–154), pivot pickers, motorBits (241–266), Try it slider (`data-try`), clearance (66–76), parts chooser, links (226–236), Exact pivot. Plus `actionsSection` (284), `posesSection` (309), `sensorsSection` (317). Ends with `highlight(); gizmos();`. Early return when the key `[k,open,mode,cadOk,mechanisms,hitboxes]` is unchanged → **only `gizmos()` runs, not `highlight()`**.
- `highlight()` (339): `p.highlight(j?leavesOf(j):null, j?colorOf(j):undefined)` for the open joint. Colours: `COLORS` by signal (11), `GROUP_COLORS` by type group (13), `colorOf` (14).
- `gizmos()` (341–348): axis/ring/turret arrow per joint (all dimmed, or only the open one).
- **Find again** (`data-j="find"`, 405) → `discover()` (77–108): worker `sim-discovery-worker.js` op `discover` with `{rows,unit,meta,mechanisms,want}`; merges via `adopt` (116) / `takeGeometry` (129); commits `{model, unit, discovered:true, finder:3, joints, couplings, loops, actuators, actions}`; may `api.setIntake(n,{kind})`.
- **Play** (`data-j="demo"`, 420) → `play()` (391–401): rAF loop setting every joint through its range (turret ±60° sine, deploy raised↔lowered, hood limits or rest↔shoot, spinning parts 240°/s, revolute/prismatic lower↔upper) → `showPose()` → `p.posed(values)`. `playAction(i)` (385) plays a saved action's timeline.
- Other: `check(j)` clearance sweep (60), `picker()` (351) for model clicks, `orient` (370), `pickupBox` (376), `add(typeId)` (511–518), `actuatorFor` (509).
- Public: `{render, picker, discover, add, isMechanism, found, pose(id,value), open(id,{choose}), shown(), hide()}` (521–530). `open()` sets `open=id`, re-renders (→ highlight), scrolls the row into view. `shown()` runs discovery when the CAD was not looked at, else `render()`.

---

## 6. `ui/sim-mechanisms.js` (DeckMechanisms) — BIOBUZZ game mechanisms

`DEFAULTS` (43–54) and `sanitize(raw)` (69–125):
```
mechanisms = {enabled, intakes:[Intake ≤4], shooters:[Shooter ≤2], capacity:{pollen,nectar}, preload:{pollen}, storage,
  transfer:{seconds}, indexer:{seconds, power, kind (=shooters[0].indexerKind), name, pushSeconds},
  shooter:{hood (70–85), rpm, ticksPerRev, spinUp, control:'velocity'|'power', power, tolerance, pidf?:{p,i,d,f}, type, mount, motor},
  turret:{speed, min, max, ticksPerDegree, kind:'motor'|'servo' (GLOBAL, both turrets), servoCenter, servoDegrees, motor},
  intake:{enabled, kind, sides, side, motor, power}  (summary of intakes[0]), target}
Intake = {kind:'sweeper'|'siderollers'|'ramp'|'kicker', sides:[edge], reach, width|null, height,
  motor (name, default 'intake'/'intake2'…), power,
  (not kicker) device?:'crservo' (absent = DC motor), reversed?, motor2?, reversed2?,       // roller() line 60
  at?:{x,y,z}, parts?:[CAD assembly NAMES ≤8],
  (ramp|kicker) down, up (s), servo (name 'ramp'/'kicker2'…), downPos, upPos (absolute servo 0–1)}
Shooter = {type:'turret'|'fixed', pieces:'pollen'|'nectar'|'both', mount (MOUNTS), facing,
  motor (flywheel), motor2?, reversed?, reversed2?, indexer (name), indexerKind:'motor'|'crservo'|'pusher'|'gate',
  (pusher|gate) feedPos, restPos  | (motor|crservo) indexerReversed?,
  turretMotor (name; motor or servo per turret.kind), turretReversed?, at?, parts?:[names], sharesTurret? (2nd only)}
```
- `INDEXERS` (34), `ROLLERS` (37), `FLYWHEELS` (38), `TURRETS` (39 `{motor:'Motor with encoder', servo:'Servo'}`).
- Optional hardware is stored only when set (`flag`, 58; `roller`, 60), so new fields need the same treatment.
- Flywheel speed/encoder/PIDF, turret kind/ticks/servo numbers are **global**, not per shooter; no motor **model** field exists for any game device.
- `parts` are CAD assembly **names** (match `project.model.parts[].name`; working tree keeps `<n>` suffixes), not keys.
- `fromCad(parts,…)` (381–450), `adoptCad(raw,out)` (458–479), `reoriented` (487), `engineSpec` (132), `Model`/`Runner` (sim), `PRESETS` (506).

### 6.1 How simulation.js draws the game cards
- `intakeCard(intake,n,used)` (`simulation.js:2044–2054`): `<section class="sim-mech-part" data-part="intake:N">`, kind cards, size, sides chips, Place on model, swing timing, `deviceLine` (2038), `<details class="sim-mech-code">Actuators · motors and servos` with `data-field="device|power|motor|reversed|motor2|reversed2|servo|downPos|upPos"`.
- `shooterCard(s,n,m)` (2061–2078): `data-part="shooter:N"`, type, pieces, shared turret, mount grid, facing, details with `data-field="motor|reversed|motor2|reversed2|indexerKind|indexer|feedPos|restPos|indexerReversed|turretMotor|turretReversed"`.
- Handlers (2166–2180): click → `setMech` for chips/remove/place; change → `part[el.dataset.field]=value` then `MECH.sanitize`. Global fields: `mechNumber` (2182–2188), `#mech-fly-control`, `#mech-turret-kind` (2189), PIDF (2191).
- `mechanismsPanel()` (2079–2101) rebuilds both hosts (keeps open `<details>`), sets globals, `mechList.render()`, `mechCount` (2104–2112, R503 count incl. `kinematics.actuators`), then `mechModel()`.
- `setMech(change)` (2158), `addGame(what,kind)` (2161), Configure from CAD (2144–2156), Escape cancels placing (2181).

---

## 7. 3D highlighting today

### 7.1 The preview widget: `DeckRobotModel.preview(host,{onSide})` (`sim-robot-model.js:399–476`)
Returns `{update(holder,footprint), look, pick(fn), highlight(meshes,color), markers(list), gizmos(list), posed(values), body(), resize, select, dispose}`.
- `update` (421, wrapped at 475): **clones** the holder into the scene and resets `glowKey=null; glow=[]` → **every update drops the highlight** (the overlay meshes were children of the old clone).
- `highlight(meshes:Set<leafIndex>|null, color=0xffb224)` (442–449): collects every `Mesh` in `body` with a `_part` attribute and an index (the per-link meshes after `rig`), early-outs on an identical key, removes old overlays, and for each link mesh builds an index of the triangles whose first vertex's `_part` is in the set. It adds a `MeshBasicMaterial` overlay (opacity .55, polygonOffset −2, renderOrder 5) **as a child of that link mesh**, so the glow moves with posed joints. One colour per call. It cannot glow stand-ins (no `_part`). The cost is O(all triangles) per change.
- `pick(fn)` (439): pointerup without drag → `{x,y,z (robot in), part:leaf, local, face, shift}`.
- `markers(list)` (467): dots `{x,y,z,color,radius}` or see-through boxes `{size:[..]}`. `gizmos(list)` (453). `posed(values)` (466) → `pose(body,values)` (296).

### 7.2 Who calls `highlight`
1. **Robot step** (`#sim-model-preview`, `modelPreview`): `partsPanel()` (`simulation.js:1756–1768`) → `modelPreview.highlight(partSel?tree.under(partSel):null)`. `partSel` set by `selectPart` (1769) from the part list buttons, `pickPart(point)` (1787, the model click → `tree.at(point.part, inside)`), Up/Clear, outside click/Escape (1784–1786). `tree` = `partsOf()` (1752) = `M().partTree(model.geometry)` (`byKey`, `under(node)→Set<leaf>`, `at(leaf,inside)`).
2. **Mechanisms step** (`#mech-model-preview`, `mechPreview`): only `sim-joints.js highlight()` (339) for the **open Moving-parts joint**, and the clearance "Show" (`data-j="hit"`, 452: red `0xe5484d` on the colliding leaves). A Mechanisms-list card highlights only indirectly: "Show on model"/"Choose its parts"/"Edit gearing" → `api.joints().open(id)`.

### 7.3 How `#mech-model-box` is built: `mechModel()` (`simulation.js:2114–2138`)
1. `show = !!model?.holder && setupStep==='mechanisms'`; `#mech-model-box.hidden=!show`; hidden → `mechPreview.pick(null); joints.hide()`.
2. Lazily `mechPreview = M().preview($('#mech-model-preview'))` (no `onSide`).
3. `mechPreview.update(mechRig(), chassisFootprint())` (clone of the rigged full-res body; **clears glow**).
4. Markers: intakes as green see-through boxes (`0x49cbb3`), shooters as dots coloured by pieces (`{pollen:0xf2d14b,nectar:0xe5484d,both:0xf2994a}`), placed at `s.at` or the mount cell; legend `#mech-model-key`.
5. `mechPreview.pick(mechPlacing ? placeHandler : joints.picker())`.
6. `joints.render()` → `highlight()` only if its key changed (see §5). **Today an unrelated refresh (e.g. "Place on model" toggling `mechPlacing` → `mechanismsPanel()` → `mechModel()`) clears an open joint's glow and pose without re-applying it.**
- Called from `mechanismsPanel()` (2100), `modelUi()` (1731), `setupStepPanel()` (2218; also `joints.shown()`), `refreshPicker` (2203).
- Layout: `.sim-mech-layout` grid with `.sim-mech-aside` sticky at ≥1100 px (`simulation.css:198–203`); below 1100 px the aside comes first (not sticky). Markup at `simulation.js:222–253`; list hosts `#mech-intakes`, `#mech-shooters`, `#mech-parts` inside `.sim-mech-main` (224, 229).

### 7.4 Mapping a list row to CAD leaves (what exists)
- Moving mechanism card `[data-mech=id]` → `leavesOf(joint)` (only its own `parts`; descendants via `parent` and coupled gears are separate joints).
- Game intake `intake:N` / shooter `shooter:N`: (a) joints with `drive.of==='intake:N'|'shooter:N'` (discovery names them `Turret · shooter 1`, `Flywheel · shooter 1`, `Hood · shooter 1`, `Ramp · intake 1`, `Roller · intake 1`, `Roller arm · …`; `sim-discovery.js:275–426`; feeders are `of:'any'`, 628; gears follow by coupling, 650); (b) `mechanisms.intakes[N].parts` / `shooters[N].parts` names → `project.model.parts.find(p=>p.name===name).key` → `partTree.byKey.get(key)` → `tree.under(node)`.
- Joint `parts` are valid only while `project.kinematics.model === project.model.id` (as `rig` checks, `sim-robot-model.js:217`).

---

## 8. How the CAD pose is treated (every place)

**Rule:** for kinematics, the imported CAD pose is value 0 of every joint (the "rest pose"). Every position, limit, home, servo center and encoder count is measured from it. The game mechanisms' hardware numbers are not CAD-relative; `zero` and `launch` bridge the two.

| Where | What is CAD-relative |
|---|---|
| `sim-kinematics.js:16–18`, `motion` 79 | Origins and axes in the CAD frame at export pose; q=0 → identity. |
| `sanitizeJoint` 106–124 | `states`, `lower/upper`, `limits`, `home` in joint units from CAD pose; `zero` = turret heading in CAD (° CCW from front); `launch` = hood launch angle in CAD. |
| `resolve` 264, `mover` 238, `Driver` ctor 422–424 | Default value / start = `home ?? 0` (CAD pose); limits from `limitsOf`. |
| `solveLoops` 300–338 | Homotopy starts from the rest pose (the CAD's closed loop). |
| `Driver.tick` 450–462 | Turret: `q = s.turrets[n] − zero` (game angle is from robot front). Hood: to `s.hood − launch` (clamped) when `launch` known, else `states.shoot/rest`. Deploy: `raised + (lowered−raised)·f`. Float: `rest→up`. |
| `Driver.read` 503–505 | Encoder = `value·ratio/360·cpr` → **0 at CAD pose**; limit switch `at` and potentiometer value are CAD-relative. |
| `sim-actuators.js` 12–13, 89–94 | `servo.center` = position that holds the part where the CAD has it; `position(a,v)=center+sign·ratio·v/perUnit`; `limits` from min/max around center. |
| `sim-actuators.js` 97–98, 138 | `ticks(a,v)=round(v·countsPer)` → RUN_TO_POSITION targets assume **encoder reset at the CAD pose** (no offset field exists). |
| `sim-actuators.js` 110–111, 127–128 | A linear servo new to its model is retracted at the CAD pose (center=position of pulse[0]); `create` centers a servo so the named positions sit mid-sweep, CAD pose at `center`. |
| `sim-mechanism-list.js` 44, 48, 62, 64, 112–116 | UI says "degrees/inches from where the CAD has it", center labelled "Where your CAD has it"; moving `center` re-expresses states; `fitLimits` sets joint limits from servo min/max. |
| `sim-mechanism-types.js` 15, states | `positive` = direction from CAD pose; most types' first state is 0 (the CAD pose = that state, e.g. deploy-intake `up:0`). |
| `sim-joints.js` 25, 164, 193/208, 391–401, 426–428, 445–447, 376–381 | `shootTilt`; turret "Faces in your CAD" and ±90/180 buttons; Try-it range; Play; Flip negates axis and shifts `zero`; Down to the floor (`swingToFloor` angle from CAD); pickup box measured at `states.lowered`. |
| `sim-robot-model.js` 252, 270, 275, 289–294 | `turretShapes` un-rotates by `zero`; stand-in turret `zero:0`, stand-in ramp `raised:0, lowered:80`; `gameValues` turret `−zero`. |
| `sim-discovery.js` 275/327/329, 338, 355/410 | Finder sets `zero`, `launch`, and deploy `raised:0, lowered:60–80` relative to the CAD. |
| **Not CAD-relative** (game) | `turret.servoCenter` = servo position facing the robot front; a motor turret's encoder counts from where it is at INIT ("Start the robot with each turret facing forward", `simulation.js:245`); intake `downPos/upPos` and feeder `feedPos/restPos` are absolute servo positions; flywheel `rpm`. These are not tied to the joint states, so the drawn ramp angle and the exported servo positions are two independent descriptions. |

Gap: there is no per-actuator "encoder zero / INIT pose" or "CAD pose ≠ home" field in the Mechanisms list. `joint.home` and `actuator.home` exist in sanitize but have no UI there (URDF imports set them).

---

## 9. Which drives the sim and which drives export
- **Sim, BIOBUZZ physics:** `project.mechanisms` → `Mech.sanitize` in `src/sim-engine.cjs:78` (forced off unless the field is biobuzz) → `Mech.Model`/`Runner` (121). The Runner forwards non-game action names to `this.kin.start/busy`.
- **Sim, drawing and custom actions:** `Kin.forEngine(raw.kinematics)` (`sim-engine.cjs:80`) → `this.kin` (a Driver) ticked with game signals (264–265); `routeJoints` (261) starts route-action names. Frames carry joint values; `DeckRobotModel.animate` (303) poses rigs (plus `gameValues` for stand-ins).
- **Export:** only `project.mechanisms` (via `mechanismDevices`) and `project.robot.devices`/odometry (`deviceSlots`). Kinematics actuators (Mechanisms list motors/servos, their device names, servo positions, encoder ticks) are **not written to any robot code or configuration plan**. `mechCount` alone counts them. To make "they're able to do the same actions" true on the robot, a kinematics-device path into `mechanismDevices`/`robotNeeds`/`Mechanisms.java` is needed (see Extension points).

---

## 10. Where per-device hardware is stored, and save/load sanitizing

| Device set | Stored in | Sanitizer (whitelist) |
|---|---|---|
| Drive motors, IMU, Pinpoint, OTOS, pods | `project.robot.devices[key]={name?, reversed? (drive keys only)}`, `key ∈ DEVICE_KEYS` | `sim-config.js devices()` 49–51 (via `robot()` 78). Odometry in `robot.odometry` (`odometry()` 63). |
| Game intakes/shooters | fields on `project.mechanisms.intakes[n]` / `shooters[n]` (§6) + globals | `DeckMechanisms.sanitize` 69–125 (intakes 74–82, shooters 85–92) |
| Mechanisms-list actuators | `project.kinematics.actuators[i]` + `hardwareOf` | `DeckKinematics.sanitize` 140–145 + `hardwareOf` 226–234 |
| Kinematics sensors | `project.kinematics.sensors[i]` | `sanitize` 160–162 (no device name/hub/port) |
| Send-to-robot choices | `namePicks`, `portPicks` Maps (`simulation.js:1318`), keyed `host|name`, **in memory only**; `usePicks` (1360–1365) writes chosen **names** back through `row.setting` (`{robot:key}` or `{list,index,field}`); port picks are never saved | — |

Save/load paths (all re-sanitize, so **a new field survives only if each sanitizer keeps it**):
1. `save()` (`simulation.js:141`) → localStorage `KEY` with `setups[].data=snapshot()` (raw). Load → `sanitize(raw)` (91–112): `C.robot` (96), `DeckMechanisms.sanitize` and `DeckKinematics.sanitize` (105), `modelMeta` (114–121).
2. Every edit: `setMech` → `MECH.sanitize` (2158); joints/list `commit` → `DeckKinematics.sanitize` (2201, 2206); `usePicks` → both (1365).
3. Robot file export/import (1568–1575: `{deckRobot:1, robot, sensors, mechanisms, kinematics, model}` → `sanitize`).
4. CLI `tools/deck-sim.cjs` `mech` (328–371) → `Mech.sanitize`; `readSetup` (25) does not sanitize; the engine does (`sim-engine.cjs:78–80`).
5. Guided check `applyCheck` (`sim-ftc.js:1436`) writes `list.index.field` keys; `deviceSlots`/`robotNeeds` (54).
- Discrepancy: `simulation.js modelMeta` (119) drops part `kind:'kicker'` and `carries`, and keeps `source` only `step|mesh`, while `DeckRobotModel.meta` (`sim-robot-model.js:35–40`) keeps them. The reload path loses them.

Existing hub/port logic (Send to robot only): `ui/ftc/robot-config.js` — `PORTS={motor:4,servo:6,i2c:4}` (91), `portFamily` (103), `portKey(module,family,port,bus)` = `"<portal>#<address>:<family>:<bus.>port"` (105), `planPorts(adds,{modules,devices})` (122–136: drive motors on the parent hub first, other motors on the other hubs first, servos/sensors on the parent first, I2C from bus 1), `portChoices` (141), `movePort` (149), `MOTOR_TYPES` (93), `addDevices` (160), `newConfiguration` (181). `simulation.js makePlan()` (1372–1380) seeds from `portPicks`. Module identity (portal serial) is robot-specific, so a saved preference must be role-based (`control`/`expansion`) and resolved against `hubOrder(modules)` (116).

---

## 11. Extension points

### (1) Per-actuator model selection, including sensor feedback
1. **Catalogue** `ui/sim-actuators.js`:
   - Add feedback metadata per model in `SERVOS/CRSERVOS/LINEARS/MOTORS` (22–76), e.g. `feedback:['motor-encoder']` for DC motors (cpr already there) and `feedback:['analog']` for servos with a position-feedback wire. Check each vendor sheet first; nothing in the repo records this today.
   - Add a small `ENCODERS`/`SENSORS` catalogue (external encoders, limit switches, potentiometers) with `cpr` and port family, and export it in the return (145).
   - Make `withModel` (105) set a default `feedback`, and `device()` (134) emit it.
2. **Data and sanitize**, `ui/sim-kinematics.js`. Either:
   - add `feedback:{kind:'none'|'motor-encoder'|'external-encoder'|'analog'|'limit', model?, device?, cpr?}` in `hardwareOf` (226–234), or
   - reuse `sensors[]` (160–162) by adding optional `model`, `device` and port fields. This is preferred because `Driver.read` (500) and action `wait` steps (186) already consume sensors.
   - Remember `structuredClone` and `api.commit` re-sanitize.
3. **UI** `ui/sim-mechanism-list.js actuator()` (50–71): a "Position feedback" select after Model, and a device name for an external sensor. Handle a new `data-m-f="feedback"` branch in the change handler (130–154). Carry the new fields across `kind` (142–144) and `actuator` (145–148) rebuilds, which today keep only `device`/`reversed`.
4. **Game devices** (`project.mechanisms`): there is no `model` today.
   - Add optional `model` per device in `sanitize` (78–82, 85–92), for example `modelMotor`, `modelMotor2`, `modelServo`, `modelIndexer`, `modelTurret`. A `models:{<field>:id}` map keyed by the same field names `mechanismDevices` uses in `setting.field` would also work.
   - Turret `kind` and the flywheel encoder/PIDF settings are global (`turret`, `shooter`). For per-turret choices, move them into `shooters[n]` with a fallback to the global value.
   - UI: `intakeCard`/`shooterCard` details (`simulation.js:2051–2053`, `2072–2077`) and `deviceLine` (2038–2043). Count in `mechCount` (2104).
5. **Export**:
   - `sim-ftc.js mechanismDevices` (562–578) is the single list. Add the kinematics actuators there (from `DeckActuators.device(a, statesOf)`), or add a parallel `kinematicsDevices` merged into `robotNeeds` (54–58), `mechanismHardware` (581) and `mechanismsSource` (591).
   - Rebuild the Java with `tools/simulation/build.cjs`.
   - Tests: `tests/sim-actuators.test.cjs`, `tests/sim-mechanism-hardware.test.cjs`, `tests/sim-mechanism-configure.test.cjs`.

### (2) Per-device hub + port selection
1. **Shape:** a role-based preference, not a portal key: `{hub:'control'|'expansion'|'expansion2'|'servohub', port:int, bus?:int}`. Validate with `PORTS` from `robot-config.js:91`.
2. **Where to store it:**
   - Drive and sensors: `sim-config.js devices()` (49–51). Add `hub`, `port` and `bus` to `entry`, allowed for every `DEVICE_KEYS` key.
   - Game devices: `sim-mechanisms.js sanitize`, intakes 78–82 and shooters 85–92. Use `ports:{motor?,motor2?,servo?}` on an intake and `ports:{motor?,motor2?,indexer?,turretMotor?}` on a shooter, keyed by the `setting.field` names of `mechanismDevices`. Keep only the ports that are set (like `flag`, 58).
   - Mechanisms-list actuators: `sim-kinematics.js hardwareOf` (226–234), with `hub`/`port`. For external sensors, put them on the sensor entry.
3. **UI:**
   - Hub and port selects next to each name: in the game cards' details (`simulation.js:2051–2053`, `2072–2077`); in the change handler (2178–2179) write `part.ports[field]`; in `sim-mechanism-list.js actuator()` (59–60) with the handler at 130–154.
   - The drive/sensor names live in the Robot controller step (find `devices` in `robotPanel`).
   - Show port clashes (the same hub, family and port twice) beside `#mech-count` (`mechCount`, 2104–2112).
4. **Send to robot:**
   - `mechanismDevices`/`robotNeeds` (`sim-ftc.js:562`, 54) carry `hub/port` on each need.
   - `RobotConfig.planPorts` (`robot-config.js:122–136`) places preferred ports first, resolving `control` to `hubOrder(modules)[0]` (the parent) and `expansion` to the next one.
   - `makePlan` (`simulation.js:1372–1380`) seeds from the setup before `portPicks`.
   - When the user moves a port (1392–1393), also persist it through `row.setting`, the same path `usePicks` (1360–1365) uses for names.
   - Optional: when the robot's configuration is read, offer to import its actual `module/port` (the devices from `parse`, 38) into the setup.
5. **Survival:** all of `devices()`, `DeckMechanisms.sanitize`, `hardwareOf` and the sensors sanitize must keep the fields, along with any `deck-sim` flags (`tools/deck-sim.cjs:328–371`). Add round-trip tests: `sanitize(sanitize(x))` keeps `hub/port`.

### (3) Highlight on focus, click, expand or scroll (Mechanisms page preview)
1. **A focus state in `simulation.js`** near `let mechPreview` (2028): `let mechFocus=null` (`{joint:id}` or `{part:'intake:N'|'shooter:N'}`).
2. **Leaves resolver** (new helper, next to `mechModel`):
   - Build `idx = K.partIndex(model.geometry.userData.parts)`, cached on `model`. Use it only when `!model.geometry.isObject3D` and `project.kinematics.model===project.model?.id`.
   - For a joint: `idx.expand(j.parts)` plus its descendants (joints whose `parent` chain reaches it) and coupling followers (`couplings.from===id`).
   - For a game part: union the joints with `drive.of===part` and the named assemblies (`mechanisms[kind+'s'][N].parts` → `project.model.parts` name→`key` → `idx.expand([key])`).
   - Shared turret: shooter 2 also takes the `shooter:0` turret joint.
   - Feeders are `of:'any'`.
3. **Events:**
   - **Mechanisms list (kinematics cards):** in `sim-mechanism-list.js create()`, add `focusin` and `pointerdown` listeners on `host` (next to 117) that call `api.focus?.(closest('[data-mech]').dataset.mech)`. Pass `focus` in the api at `simulation.js:2205–2208`.
   - **Game cards:** on `#mech-intakes` and `#mech-shooters` (loop at 2166), listen for `focusin`, `pointerdown` and **`toggle` with capture `true`** (`<details>` toggle does not bubble), reading `closest('[data-part]').dataset.part`.
   - **Moving-parts rows** (`li.sim-joint[data-id]`): `sim-joints.js` already highlights the open joint. For hover or focus without opening, add `focusin`/`mouseover` on `host` near 403.
   - **Scroll:** an `IntersectionObserver` over `.sim-mech-main [data-part], .sim-mech-main [data-mech]`. Use a band such as `rootMargin:'-25% 0px -55% 0px'` and pick the top intersecting card. Re-observe after each rebuild: call `observeMechCards()` at the end of `mechanismsPanel()` (2098–2100), because `innerHTML` replaces cards at 2086 and in the list's `render` (94). Throttle with rAF, and only on wide layouts where the aside is sticky (`matchMedia('(min-width:1100px)')`).
4. **Apply it:**
   - `mechPreview.highlight(leaves, color)`. Colours: `GROUP_COLORS`/`COLORS` (`sim-joints.js:11–14`; expose `colorOf` from `DeckJointsPanel`), intake `0x49cbb3`, shooter by pieces (`simulation.js:2122`).
   - **Re-apply at the end of `mechModel()`** (after `joints.render()`, 2137), because `update()` drops the glow.
   - Do not fight the Moving-parts panel. Expose `opened:()=>open` from `sim-joints.js` (return at 521). Change its `highlight()` (339) to fall back to `api.focus?.()` leaves when no joint is open, because today it calls `p.highlight(null)` and would erase the focus glow.
5. **Optional, needs the owner of `sim-robot-model.js` (being edited):**
   - Let `highlight` take `[{meshes,color}]` for multi-colour groups (turret purple, flywheel green, hood orange): change lines 442–449 and the key.
   - Keep the last highlight request in `preview()` and re-apply it inside the `update` wrapper (475), which removes the need for step 4's re-apply.
   - Stand-ins (no `_part`) can be marked instead by brightening their marker in `mechModel`'s `marks` (2121–2129).
6. **Reverse direction (optional):** in `mechModel`, when nothing is being placed or picked, set a pick handler that maps `point.part` (a leaf) to the deepest joint owning it, or to a game part, then scrolls to and focuses its card (`[data-mech]`/`[data-part]`).
7. **Tests:** there is no unit harness for DOM highlight. Add the leaves resolver as a pure function, for example in `sim-kinematics.js` or a new `ui/sim-mech-focus.js` taking `(kinematics, mechanisms, modelParts, tree)`, and test it with node. Check the app E2E with Playwright as in `AGENT_HANDOFF.md` ("Probes", `#mech-model-preview`).
