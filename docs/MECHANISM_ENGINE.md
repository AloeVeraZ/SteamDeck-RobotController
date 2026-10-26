# Moving parts: the mechanism engine

How the simulator represents, finds, edits and animates what moves on a robot. The user guide is in `SIMULATION.md` (Mechanisms → Moving parts); this is the design, its sources and its limits. The research behind it is in `MECHANISM_RESEARCH.md`: the robots studied, what each needs, the source of each decision, the test coverage.

## Five separate ideas

| Idea | Where | What it is |
|---|---|---|
| Geometry | the imported CAD body | parts (leaves of the assembly tree), named by refs: an assembly key (every part under it) or `#n` (one part instance) |
| Joints | `sim-kinematics.js` | how a link (some parts) moves relative to its parent link |
| Actuators | `sim-kinematics.js` (`Axis`, `Driver`) | what commands a joint (position, speed, effort or named states) through a transmission, moving ideally, as a DC motor against a load, or as a pneumatic cylinder; sensors read how it actually moved |
| Couplings and loops | `sim-kinematics.js` | motion passed on (gears, belts, racks, screws, cables, mimic, differentials, planetary sets, tendons, cams, stages one after another) and closed chains (points that meet, pins in slots) |
| Actions | `sim-kinematics.js` (`timeline`, `Driver.start`) and route actions | named, timed steps: move a part, go to a pose, reach a point, wait for a sensor, run another action; they can repeat |
| Robot files | `sim-urdf.js`, `sim-robot-formats.js` | URDF, SDFormat, MJCF and text USD read into links, joints, couplings, loops and actuators, confirmed |

A joint does not know what it is for. A turret, a ramp, an elbow and an intake roller are all revolute or continuous joints; a game binds one to its own signals with `drive` (`turret`, `hood`, `flywheel`, `roller`, `deploy`, `feeder`, `wheel`, or `action` for route actions). This is the split URDF makes between `<joint>` and `<transmission>`, and Onshape between mates and mate relations.

### Joint types

The set covers what URDF, SDFormat, MuJoCo and Onshape model:

| Deck | Values | URDF | SDFormat | MuJoCo | Onshape mate |
|---|---|---|---|---|---|
| fixed | none | fixed | fixed | (no joint) | fastened |
| revolute | angle, limited | revolute | revolute | hinge with range | revolute |
| continuous | angle | continuous | continuous | hinge | revolute |
| prismatic | distance | prismatic | prismatic | slide | slider |
| cylindrical | angle, distance | (two joints) | (two joints) | hinge + slide | cylindrical |
| screw | angle (distance = lead × turns) | (mimic) | screw | equality | cylindrical + screw relation |
| universal | two angles | (two joints) | universal / revolute2 | two hinges | (two revolutes) |
| ball | three angles | (floating) | ball | ball | ball |
| planar | two distances, angle | planar | (two prismatic + revolute) | (slides + hinge) | planar |
| floating | three distances, three angles | floating | (free body) | free | (none) |
| pin-slot | angle, distance in the slot | (two joints) | (two joints) | hinge + slide | pin slot |

### Frames

Every joint's origin and axes are in the CAD file's own frame, at the pose the CAD was exported in (the rest pose), the way assembly mates are defined in assembly context. A link's motion is

    W(child) = W(parent) · M(joint, q)

with every `M` expressed in that one frame (`M` for a revolute joint is translate(origin) · rotate(axis, q) · translate(−origin)). Nested joints therefore compose without per-link local frames, and the CAD's pose is q = 0 for every joint. The drawn robot is `P · W · x`, where `P` carries the CAD frame to the robot frame (scale to inches, which side is the front and top, centred on the chassis). Storing joints in the CAD frame means a new front or top, or a new chassis size, never invalidates them. Angles are degrees and distances inches; `unit` (inches per CAD unit) converts distances.

### Couplings

`q_to = offset + f(q_from) + Σ ratioᵢ · q_plusᵢ`, where f is `ratio · x` (plus optional x², x³, x⁴ terms) or a table of points.

- **Linear, one input.** URDF's mimic joint (`multiplier`, `offset`) and Drake's coupler constraint. Onshape's gear, rack and pinion and screw relations are particular ratios.
- **Several inputs (`plus`).** ros2_control's differential and four-bar transmissions, CoreXY belts, a planetary set (`planetary()`, Willis), and a MuJoCo fixed tendon held at a length.
- **Polynomial (`poly`).** MuJoCo's joint equality (`polycoef`).
- **Table (`curve`).** Cams, linkages, and the stages of a continuously rigged slide (`rigging()`, gm0: the top stage first). With a `period`, the table repeats every turn and each turn adds the table's rise (a Geneva wheel).

Couplings are resolved in dependency order (a differential after both its inputs), and a joint is set by at most one coupling. A motor that drives a spool that pulls a cable that lifts a slide is a motor joint (with or without geometry), a `cable` coupling and a prismatic joint; an actuator's `transmission` stages say the same more simply when the motor itself is not drawn.

### Closed loops

URDF describes only trees; mimic joints and simulators' constraints cover loops (MuJoCo's `connect` equality, Onshape's closed mate loops). Here a loop says a point on one link and a point on another are the same point, or with `along`, that a point stays on a line through the other (a pin in a slot). The joints along either chain that nothing else sets are solved by damped least squares (Levenberg–Marquardt with a numerical Jacobian, residuals in inches whatever the CAD unit) so the points meet. Couplings are re-applied inside the solve, so a geared five-bar closes too.

To stay on the branch the CAD was assembled in, the driven joints move from the rest pose to their values in steps of at most 10° (or 0.5 in). Only the inputs that reach the loops' chains step it, and only those chains are posed while solving. When every input has moved less than one step since the last pose of the same model (a run, an animation), it continues from that pose, as the real linkage would; a jump (a scrub) starts from the rest pose again, and unchanged inputs return the last answer. A moving four-bar costs about 0.1 ms a pose.

The driver sends only the joints it drives, and `pose()` solves the rest; sending every joint used to hold loops open in runs. Tested against Freudenstein's four-bar, the slider-crank formula, a delta robot, a Stewart platform's inverse kinematics, a Scotch yoke and a slotted lever.

### Actuators and actions

An actuator's targets, named positions and speeds are in its joint's units ("lift to 20 in at 15 in/s"). Its `transmission` stages (gearbox, belt or gear pair, spool, rack, lead screw) give `ratio`, the actuator's turn per unit of joint motion. An actuator without named positions uses its joint's, and a route action may name the joint or the motor. It moves in one of three ways (`response`):

- **ideal:** a trapezoid at its top speed and acceleration, followed exactly within each tick (a phase may end inside one), so ticking ends on the first tick at or after the planned time;
- **motor:** WPILib's DC motor model, with torque falling from stall to nothing at free speed, in proportion to voltage. The datasheet's free speed and stall torque come through the transmission, and the team enters the load and inertia at the joint. The speed over each sub-step is the exact solution of J·dω/dt = τs(u − ω/ωf) − τL. The default position gain makes the loop critically damped. A speed command is held with load feed-forward; an effort is open loop. Under its load it slows, and past stall it is back-driven;
- **pneumatic:** rests only at its two ends.

The driver reports each actuator's command beside its response (`state()`). Sensors (encoders counting motor turns, limit switches, angle and speed sensors) read the response.

An action's steps start together, in sequence or after a delay. A step can:

- move a part;
- go to a named pose (every mover's trapezoid time-scaled to the slowest so all arrive together);
- reach a point (inverse kinematics over the chain's movers, optionally aiming the tool);
- wait for a sensor, joint or actuator reading (with a timeout);
- run another action as a preset (an action cannot run itself).

An action can repeat. `timeline()` works out each step ahead for ideal actuators; an action that waits or uses a motor model is timed by running the driver every 1/240 s and recording a track, so either way a preview can scrub it and the ticking driver finishes when the timeline says. A route action named after a part and one of its named positions ("Lift up") moves that part there; a pin waits until it arrives.

### What is simulated, and how

Three levels, kept apart:

1. **Visual-only:** spinning parts (flywheels, rollers, feeders, wheels) are drawn turning, slower than real above 540°/s so they do not strobe. Drive wheels roll with the chassis speed at the floor.
2. **Kinematically constrained:** joint values come from the game's mechanism model (turret angles, how far a ramp is down, flywheel speed) or from actuators with speed and acceleration limits, then couplings and loops. The engine works these out every physics tick and sends them in each frame, so the 3D view, recordings and run videos show the same motion.
3. **Physics:** the game physics (DSIM) simulates the chassis and the pieces with its own mechanism model: a turret launches along its angle, a ramp reaches into a flower once settled, the hood angle is the launch angle. The joints add no rigid-body dynamics, and runs do not stop a CAD arm passing through the frame.

**Clearance (kinematic).** `sim-collide.js` sweeps one joint through its range and reports the first new contact each way. Each part is wrapped in two boxes, one along the CAD's axes and one along its principal axes; two parts can touch only where every box of one meets every box of the other (separating axis test). Contacts already present in the CAD's pose are assembly, not collision. A part round about its own joint's axis is skipped, since it fills the same space as it turns while its box would sweep its corners. Reported contacts are possible, not certain. With `points`, a contact also needs one of the moving part's own surface points (triangle corners and centres) inside the other part's boxes, which removes the moving part's box slack (a curved hood's boxes reach far past the hood); the finder uses it for hood limits.

**Hitboxes.** Each moving CAD link carries a box round its own parts (CAD frame, so it moves with them), drawn in its link's colour while hitboxes are on (`DeckRobotModel.hitboxes`, sharing materials so every clone of the rig follows). The boxes are kept in `kin.boxes`; `kin.turrets` holds each turret's shape at a turret angle of 0 (pivot, height, front and back, half-width) for the run-video cameras. A game mechanism with no CAD parts keeps a joint (so the software still turns it) but is drawn only on a bundled chassis, never on an imported CAD.

## Finding the joints in a CAD

A STEP export from Onshape, SolidWorks or Fusion keeps the assembly tree and part names but not mates (the OpenCascade reader gives names and tessellated geometry only). So joints from a STEP file are inferred, never presented as confirmed. `sim-discovery.js` uses:

- **Round parts.** A part whose surface turns about an axis spreads equally in the two directions across it, so the principal axes of its area distribution give candidates (only an axis whose other two spreads match within 15%). The outline around a candidate is checked: the farthest point in each of 24 directions, including triangle edge midpoints so a coarse outer polygon reaches every direction, a circle fitted to those, and nearest/farthest ≥ 0.8. Gears, bearings, hex shafts, hubs and wheels pass; plates and cubes do not.
- **Coaxial parts.** Round parts whose axes line up turn together (a flywheel with its hub, pulley and shaft) or mark a hinge line.
- **Names.** "Rhino wheel", "Gecko wheel", "Servo Hub Shaft", "Hood", "Turntable gear" and similar.
- **Contact.** Clusters of parts whose boxes touch tell a swinging arm from the plates that hold its rollers.
- **The floor.** How far a ramp folds before its lowest point touches the floor.

Which CAD assemblies a game mechanism is: the names the setup gives it; else the assemblies the import classified (role `shooter` with the same pieces, then the nearest to its mount; role `intake` on its side; a turret-only assembly goes to every turret shooter); else, with no classified assemblies, the biggest round part with a level axle in the upper part of the robot nearest the shooter's mount (its flywheel), with the largest assembly holding it that is under 35% of the robot, the turntable searched among every part (under the shooter, its axis within its radius + 1.5 in of the shooter's centre); and for a ramp, the parts on its side of the robot (a hinge needs hinge hardware or a servo there, and is marked for checking). A turret or ramp still not found is listed as `standin` with no parts.

| Mechanism | How its joint is found |
|---|---|
| Turret | The large round part with an upright axis under the shooter, ranked by size, name and how near its axis is to the shooter. It carries the shooter's parts and the turret-assembly parts within 85% of its radius above it. Which way it fires: across the flywheel, from the hood over the wheel. |
| Flywheel | The largest round part with a level axle (named like a wheel when one is), with the parts on its axle. It spins so the side facing the hood moves up. |
| Hood | Parts named hood, the parts inside their box, and spacers, bearings and collars on their shafts. If their outline is an arc centred on the flywheel axle (RANSAC circle fit), it pivots there (the usual adjustable hood); otherwise on a shaft at its end. A gear coaxial with a servo or motor drives it and stays with the frame. Launch angle: the hood's points seen along the axle cover the circle but for one gap; going the way the flywheel spins, the hood ends where the gap begins, and the shot leaves along the arc there (`launch`, degrees above level). The axis is set so a positive tilt raises the shot, and the hood tilts by the game's launch angle minus `launch`, within the limits a points sweep finds (±45°, 1.5° steps). |
| Gears | From a turret, hood, ramp or action joint: a round part named as a gear (or with a tooth count) on a parallel axis, not moving yet, whose circle the joint's own gear-like parts (named as a gear, sector or rack, or round about the joint's axis) reach into on the side facing the joint's axis (≥ 4 surface points between 0.5 and 1.02 of its radius, within its width plus theirs). A part standing along the axis is no gear. Ratio: tooth counts from both names ("Spur gear (20 teeth)", "100t", "24 Pinion Gear", "(24T)", "108 Tooth"), else pitch radii (centre distance minus this gear's pitch radius, a pitch radius being N/(N+2) or 0.94 of the outside). Breadth first, three meshes deep, six gears at most; each mesh is a `gear` coupling. |
| Ramp, kicker | Lines of round parts along the intake's edge, scored by hinge words (servo hub, hub shaft, horn, spline, hinge, pivot, axle), a servo whose output sits on the line, an arm or ramp the line passes through; pulleys, gears and rollers mark a drive axle instead. What swings: parts beyond the hinge, or arms on it that reach much further out than back, in clusters that do not touch the plates holding the hinge. Down is where it touches the floor. Looked for in every intake's own assemblies, whatever it is set up as: on an intake that is not a ramp or kicker the line must score over 3 (hinge hardware or a servo on it), and `intakes` then says what the CAD shows it to be (a ramp with rollers behind it, else a kicker) for the page to set. |
| Roller arm | A roller whose axle sits snugly in plates (swung about a candidate axle, the axle stops within 4°) that also sit on a parallel axle 1–10 in away, inside frame plates that let the axle travel round it (each part flattened along the axle into its triangles; the roller's axle, with what sits in each plate, is turned in half degrees until it meets one). The frame plates' free travel is its range, and only one axle may join the arm plates to the frame. With it swing the arm plates, parts fixed to them that do not reach the frame (a crossbar) and a belt round both axles. Its signal `float` rests it where the CAD has it and lifts it over each piece taken in (`lift`, 0.45 s). |
| Rollers, feeders | Round parts on one axle with a roller or wheel among them, and the star or flex wheels centred on that axle (not round, but the same shape every way across it, reaching at least 0.4 in and filling under 55% of that circle: a flex wheel fills about 40%, a square block 64%). A shaft carrying such wheels is an axle of its own. Rollers turn so their underside sweeps pieces in. |
| Drive wheels | Round parts named like wheels whose bottom touches the floor. |

Each proposal carries `source` (`metadata`, `inferred`, `user`, `standin`), a confidence and a note saying why. The interface shows three levels: **From the file** (none yet: see limits), **Found · likely right** (confidence ≥ 0.7) and **Found · please check**, plus **Set by you** once changed and **Not in your CAD yet** for a `standin`. Settings it cannot know (a hood's shooting tilt when it does not pivot on the flywheel axle) are left for the team and say so. The stored model records `finder` (2 now); a finding from an older finder is made again when the Mechanisms page opens, keeping the team's joints.

On the team's own robot (a 118 MB, 2.18 M-triangle Onshape STEP) the finder takes about half a second in Node and runs in a worker in the app. It finds both turrets on their turntable gears (each facing the robot's right in the CAD), both flywheels with 10 parts on each axle, both hoods pivoting on their flywheel axles (the hood arc is concentric with the wheel), the deployable bump plate hinged on the servo hub shaft (down at 71°), the gecko intake roller, two feeder axles and the four mecanum wheels. These were checked against renders of the CAD.

### Mechanism types and names

`sim-mechanism-types.js` lists what a moving part can be (57 types in ten groups, from the FTC, FRC and general robotics research in `MECHANISM_RESEARCH.md`). A type is defaults for a joint, never a requirement: its joint type, the robot direction of its axis (side, up, forward), named positions and speed, limits, the game signal a spinning part can follow, which way positive turns (raise an arm, lower a drop-down intake), the motor and gearing it usually has, and the words a CAD names it with. A joint keeps its type in `kind`; the finder's game joints take the type their signal stands for.

Reading a name (`detect`): the match that ends last wins (English puts the head noun last: "Intake slides" is a slide), then the longer match ("Intake arm" is a drop-down intake, not an arm). A match followed by a hardware word ("Arm motor mount", "4BAR HEX", "Hook pivot") or after "servo"/"motor" ("Servo arm") is a piece of a mechanism, as is any vendor catalogue name (part numbers, "(GB)", bores, durometers). Names are tidied first (instance numbers, camelCase, underscores).

The finder walks the whole assembly tree. A node named for a type becomes a joint; a node inside another of the same family (a "Viper slide" in a "Lift", a "Finger" in a "Claw") is part of it; one of another family rides on it (`parent`). A single part counts only for one-piece types (a gate, a hood, an arm plate), and same-named parts that do not touch are copies, skipped. Its parts are those under it that no other mechanism took (what it rides on still counts as the robot to it), and what the game's finder found inside it rides on it too. Where it moves: `hingeOf` (a line of round parts joining it to what holds it; a pin named for the mechanism scores highest), `slideOf` (rails), `spinOf` (its biggest axle), `yawOf` (its biggest upright round part) or `clawOf` (fingers named finger, jaw or pincer, each on its own hinge, oriented to close toward the others, the rest following the first). A pivoting slide also looks for its slides inside it; a swerve module puts its wheel on itself. With no pivot found, an assembly is still listed at the middle of its parts with the type's direction (20%). While the game's mechanisms are on, the game's own types (turret, hood, flywheel, roller and drop-down intakes, feeders) and the indexers are left to the game.

The panel's **+ Add** lists the types (grouped, searchable) and makes a joint of one; **Mechanism** retypes a joint, keeping its parts and pivot (`retype`); **+ Motor** uses the type's motor (`motorFor`).

### Picking a pivot on the model

**Pick a circle** measures the circle under the click, as a slicer does: a round part gives its own axis; on a flat face the edge loop nearest the click (a hole, or the face's rim) is fitted as a circle, accepted only when it is many short edges (any four corners of a rectangle also lie on a circle); a curved patch is fitted as a cylinder whose axis is the direction its normals avoid. **Two points** sets an axis through two clicks.

## Robot files with joints

URDF (`sim-urdf.js`), SDFormat, MJCF and text USD (`sim-robot-formats.js`) carry joints as data, so nothing is guessed: their joints are **From the file**. Each format is read with its own frame rules:

- SDFormat's `relative_to` and frames;
- MJCF's default classes, angle units and Euler sequence;
- USD's transform ops, `metersPerUnit` and up axis.

The file's couplings, loops and actuators come with the joints:

- mimic tags, MuJoCo joint and tendon equalities, PhysX mimic joints and SDFormat gearboxes become couplings;
- connect and weld equalities, and a joint whose child is already reached, become loops;
- MJCF actuators and USD drives become actuators.

What a file holds that is not read is reported in the import message, not guessed. These robots are drawn at their true size, never stretched to the footprint (which would shear every turning link).

## Limits

- **No mates from STEP.** Joints come from geometry and names. AP242 can carry kinematic structure (`KINEMATIC_JOINT`, `REVOLUTE_PAIR`), but the exporters teams use do not write it and the reader does not expose it.
- **URDF, SDFormat, MJCF and text USD import with their joints (From the file).**
  - Collada (.dae) meshes are not read (no loader is bundled): their links show their collision shapes, and the import says which were not drawn.
  - Xacro must be expanded to URDF first.
  - Binary USD must be saved as .usda.
  - Includes, references, spatial tendons, muscles, flex, and USD distance and D6 joints are reported, not read.
- **Discovery is strongest on FTC mechanisms.** Turrets, hoods, flywheels, ramps, rollers, feeders and drive wheels are found from geometry; the other mechanism types only from assemblies (or one-piece parts) named for them, and always marked for checking. A name covering several separate copies, or a mechanism whose motion is not one rigid joint (a four-bar's coupler, a DR4B, a differential wrist's roll), is found as its main motion or not at all; the rest is added with + Add, Follows and Pin it to.
- **The panel edits couplings with one input (Follows) and point loops (Pin it to).** Multi-input couplings, tables, pins in slots and reach steps come from files or code; the panel shows them.
- **Motors, poses, sensors and action steps (pose, wait, pause, run another action, repeat) are edited in the panel.**
- **No rigid-body dynamics for CAD links.** The motor model is a one-DOF model at the actuator, with the load the team enters; the CAD's mass is not known.
- **No collision of CAD parts.** See the three levels above.

## Sources

- URDF joints and mimic (`multiplier · other + offset`; types fixed, prismatic, revolute, continuous, planar, floating; URDF describes trees, with mimic for coupled joints): [urdfpy JointMimic](https://urdfpy.readthedocs.io/en/stable/generated/urdfpy.JointMimic.html), [urdfgenpy joint](https://urdfgenpy.readthedocs.io/en/latest/api/joint.html), [ros2_control joint kinematics](https://docs.ros.org/en/iron/p/hardware_interface/doc/joints_userdoc.html)
- SDFormat joint types (revolute, continuous, revolute2, prismatic, screw, universal, gearbox, ball, fixed): [sdformat Joint.hh](https://gazebosim.org/api/sdformat/14/Joint_8hh_source.html), [Specifying model kinematics in SDFormat](https://sdformat.org/tutorials/specification/spec_model_kinematics/)
- MuJoCo equality constraints (connect, weld, joint with `polycoef`, tendon) and tendons: [MuJoCo XML reference](https://mujoco.readthedocs.io/en/2.2.0/XMLreference.html), [onshape-to-robot MuJoCo exporter](https://onshape-to-robot.readthedocs.io/en/latest/exporter_mujoco.html) (closed loops as connect constraints)
- Onshape mates (fastened, revolute, slider, cylindrical, pin slot, planar, ball, parallel) and relations (gear, rack and pinion, screw): [Onshape blog: kinematics, assemblies, mates](https://www.onshape.com/en/blog/kinematics-assemblies-mates-simulation), [Mate connectors](https://cad.onshape.com/help/Content/mateconnector.htm)
- Drake multibody joints: [Joint](https://drake.mit.edu/doxygen_cxx/classdrake_1_1multibody_1_1_joint.html), [UniversalJoint](https://drake.mit.edu/doxygen_cxx/classdrake_1_1multibody_1_1_universal_joint.html)
- Four-bar position analysis (Freudenstein) and the slider-crank are standard results used as test references.

## Iteration log

**Iteration 1 (25 October).** Robotics concept: articulated CAD mechanisms for FTC (turret yaw, hood pitch, flywheel and roller spin, deploying ramps and kickers), on a general joint model. Built the joint, actuator, coupling, loop and action model with forward kinematics, a loop solver and inverse kinematics; CAD discovery; the rig that splits the body into links without copying vertices; engine joint values in every frame; the Moving parts panel; route actions that move a part to a named position. Tested: 15 kinematics tests (four-bar against Freudenstein, slider-crank formula, two-link IK, trapezoid timing, action timelines), 6 discovery tests on a synthetic FTC robot (floor-contact angle checked exactly), 5 rig tests with Three.js, 4 engine tests, the full suite, and the team's own CAD in the app (renders of each joint posed, and a 3D run). Found and fixed on the way: hinge hardware without a round outline (a Sonic Hub) holding the arm still; an arm wrapping round its own pivot counted as frame; four rectangle corners passing as a circle; a tube's inner ring lowering its roundness; the hood lagging one tick; the turret drawn in its CAD pose before the first tick; discovery blocking the page for 2.5 s (moved to a worker). Next objective: moving parts on any field, then editing couplings, loops and actions in the panel, then generic discovery and URDF import.

**Iteration 2.** Concept: mechanisms are part of the robot, not of a game. Gap: the panel sat under Mechanisms, a BIOBUZZ-only step, and without the game's mechanisms nothing was found or movable. Changes: step 3 is Moving parts on other fields; without the game, intakes and shooters come from the part names and their ramps, hoods and turrets get named positions moved by route actions; hinged assemblies (a hinge line bridging the assembly and the robot, a servo on it) and slides (rail direction, the frame-bolted stage stays) are proposed; names stay unique for route actions; mecanum wheels roll sideways. Tests: an arm-and-slide robot, the FTC robot without the game, strafing wheels; the user's CAD on an empty field (the ramp found again after a fix: its assembly is labelled a sweeper, so every intake is now searched for a hinge without the game).

**Iteration 3.** Concept: robots beyond FTC (industrial arms, SCARA, gantries, delta robots, humanoid arms, legs, grippers, lifts, screws, spools, swerve). Gap: claims rested on FTC alone, and actions could only name actuators. Changes: ten robots checked against independent answers (UR5 against Denavit–Hartenberg; SCARA and quadruped legs against planar two-link geometry; a delta robot's loops against forearm lengths; a cascade lift, a mirrored gripper, a lead screw and a spool against their ratios; humanoid IK against the law of cosines); action steps may name parts directly; the panel edits couplings, loops and actions, and path and pin editors offer the parts' actions. Next objective: URDF import (the one format that carries joints as data), then the hood's tilt in the exported robot code.

**Iteration 4.** Concept: structured robot formats carry joints as data, so nothing has to be guessed. Gap: every joint was inferred. Changes: `sim-urdf.js` reads URDF (a small XML reader; links, visuals, collisions, materials, joints, limits, mimic), works out each link's frame at zero (rpy as fixed-axis roll, pitch, yaw), builds the body with links nested as the joints nest them, and turns the joints into confirmed moving parts with limits in degrees and inches and mimic tags as couplings; the bridge finds `package://` meshes in the folders above the URDF. Tests: an arm with a turning base, a shoulder, a mirrored two-finger gripper and a fixed camera checked against hand-worked poses; a ROS package folder on disk; the import in the app (5 joints, the coupling, an STL forearm posed at −45°). Fixed on the way: a default pivot ring of 1 CAD unit drew a URDF's as 1 m across. Next objective: the hood's tilt and the named positions in the exported robot code.

**Iteration 5 (review).** Checked the field view from a real run: in the frame where the intake runs, the ramp is down on the floor; while feeding, both turrets turned to the hive. Found and fixed: every edit re-split the 2-million-triangle body (now only a change of which parts move does; the rest retunes the rig in place); turret stand-ins on a bundled chassis floated at the robot height setting. Added clearance checking (above): sweeps take 0.3–2 s in the worker on the lunala CAD. Its first results were false (a slanted plate's principal-axes box reached the indexer below it; a turntable gear's box swept its corners), fixed by intersecting the two boxes and skipping parts round about their own joint's axis; what remains is a real near-miss (turret 2's hood servo and turret 1's pulley at 114°) and the hood's narrow free range (its bottom edge sits 0.1 in above the turntable gear).

**Iteration 6 (25 October, evening): the CAD is the robot.** Gap, from the team: on their own setup the Mechanisms preview drew made-up turret boxes with barrels and a brown ramp plate over the CAD, while the real shooters (a turntable gear under each, turned by two Axon servos through a 20-tooth gear and a 24-tooth pinion on one shaft and two 100-tooth gears; a hood whose gear racks on both sides mesh with a pinion on a SWYFT servo) and the LUNALA bump-plate ramp on its servo hub never moved. Cause: that setup's shooters and intake named no CAD assemblies (only one older setup did), so the finder skipped them and the rig drew stand-ins. Changes: game mechanisms are linked to CAD assemblies by role, pieces and place, or by geometry when the CAD names nothing; stand-ins are joints only on an imported CAD; mechanisms still not found are listed for the team to set up; meshing gears become joints coupled by tooth ratio (branches included); each hood knows its CAD launch angle and tilts to the game's, within limits found by a points sweep; spacers on a hood's shafts go with it; hitboxes per moving link; turret shapes for the cameras; older findings are made again once. On the team's CAD (their current setup, untouched): both turrets on their gears with 3 gears each, both hoods (launch 53° and 57°; free 18° and 21° flatter, 0° steeper, since each hood's lower edge sits just over its own turntable gear), the ramp down at 71°, 22 moving parts in about 1.3 s in Node and 3 s in the app's worker. Renders checked: the turret turned 40° and 45°, the hood at its flattest (its racks along the servo pinion), the ramp down, and a 3D run with hitboxes on (turrets 0–150° from forward, the ramp 0–71°, the hood held at its steepest because the game's 70–85° launch angle is steeper than it can reach). Tests: linking without names (the same joints as with names), shapes alone, placeholders, the launch angle and its limit, a three-gear train with tooth ratios, invisible stand-ins on a CAD, hitboxes moving with the ramp, turret shapes.

**Iterations 7–13** (transmissions, motor models, sensors, presets, SDFormat/MJCF/USD, orientation IK, pins in slots, faster loops, coordinated poses, exact trapezoids, repeats, the Stewart platform, the panel and app checks) are logged in `MECHANISM_RESEARCH.md`.

**Iteration 14 (25 October, night): the intake's own mechanisms.** Gap, from the team: **Set up from your CAD** did not see that their intake's kicker/ramp pivots down. Causes:

- The button names the intake from its assembly, and "intake v4" says nothing, so it became a sweeper and the finder never looked for a hinge in it.
- The intake's second assembly ("FRONT RAMP") was dropped as a second intake on the same edge.
- The intake's gecko roller rides on two plates (named "4 bar") that turn on the drive axle inside an arc slot in the side plates, and nothing knew a roller could swing.
- The indexer's front axle carries 14 six-spoke flex wheels named only "Blue Version", which were neither round nor named as wheels.

Changes:

- Every intake is looked through for a hinge, and the CAD decides what it is. The button (and a CAD's first finding) sets it; otherwise the ramp offers to.
- Same-edge intake assemblies join one intake.
- Rollers on swing arms are found from snug and free plates, with their range from the slot, and float over pieces taken in.
- Star and flex wheels turn with their axle.

On the team's CAD (their saved setup untouched; a copy in a throwaway data folder): after the button, intake 1 is a deployable ramp made of "intake v4" + "FRONT RAMP".
- **Ramp:** the LUNALA bump plate on its servo hub shaft, down at 71°.
- **Roller arm:** the "4 bar" plates, U-channel, gecko roller, pulley and belt on the drive axle, lifting 26.5° (the slot in "RIGHT OUTER"), with the roller turning on it.
- **Indexer:** a third feeder axle with its 14 flex wheels.

The finder still takes about 1.3 s in Node. Renders checked: the arm at 0° and 26.5° (sliced between the side plates), and the ramp down on the floor in the app. Tests: a sweeper with a servo-hinged ramp, a swing arm in slotted side plates (and none with round holes), the floating signal and the capture lift, same-edge assemblies, and star wheels with a square block on the same shaft.
