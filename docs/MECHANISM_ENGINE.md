# Moving parts: the mechanism engine

How the simulator represents, finds, edits and animates what moves on a robot. The user guide is in `SIMULATION.md` (Mechanisms → Moving parts); this is the design, its sources and its limits.

## Five separate ideas

| Idea | Where | What it is |
|---|---|---|
| Geometry | the imported CAD body | parts (leaves of the assembly tree), named by refs: an assembly key (every part under it) or `#n` (one part instance) |
| Joints | `sim-kinematics.js` | how a link (some parts) moves relative to its parent link |
| Actuators | `sim-kinematics.js` (`Axis`, `Driver`) | what commands a joint: position, speed, effort or named states, with speed and acceleration limits |
| Couplings and loops | `sim-kinematics.js` | motion passed on (gear, belt, rack, screw, cable, mimic) and closed chains |
| Actions | `sim-kinematics.js` (`timeline`, `Driver.start`) and route actions | named, timed steps that command actuators |

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

`q_to = ratio · q_from + offset`. This is URDF's mimic joint (`multiplier`, `offset`) and the linear case of MuJoCo's joint equality (`polycoef`). Onshape's gear, rack and pinion and screw relations are particular ratios. Couplings are resolved in dependency order (gear trains), and a joint is set by at most one coupling. A motor that drives a spool that pulls a cable that lifts a slide is a motor joint (with or without geometry), a `cable` coupling and a prismatic joint.

### Closed loops

URDF describes only trees; mimic joints and simulators' constraints cover loops (MuJoCo's `connect` equality, Onshape's closed mate loops). Here a loop says a point on one link and a point on another are the same point. The joints along either chain that nothing else sets are solved by damped least squares (Levenberg–Marquardt with a numerical Jacobian) so the points meet. To stay on the branch the CAD was assembled in, the driven joints move from the rest pose to their values in steps of at most 10° (or 0.5 in), so the result depends only on the inputs (deterministic for scrubbing and recordings). Tested against Freudenstein's four-bar solution and the slider-crank formula.

### Actuators and actions

An actuator moves its joint toward a target along a trapezoid (top speed, acceleration and deceleration; none means full speed at once), or holds a speed, or turns effort into a speed (a kinematic approximation, labelled as such). Joint limits stop it. Actions are steps that start together, in sequence or after a delay; `timeline()` works out each step's start and end ahead from the trapezoids, so a preview can scrub it and the ticking driver finishes when the timeline says. A route action named after a part and one of its named positions ("Lift up") moves that part there; a pin waits until it arrives.

### What is simulated, and how

Three levels, kept apart:

1. **Visual-only:** spinning parts (flywheels, rollers, feeders, wheels) are drawn turning, slower than real above 540°/s so they do not strobe. Drive wheels roll with the chassis speed at the floor.
2. **Kinematically constrained:** joint values come from the game's mechanism model (turret angles, how far a ramp is down, flywheel speed) or from actuators with speed and acceleration limits, then couplings and loops. The engine works these out every physics tick and sends them in each frame, so the 3D view, recordings and run videos show the same motion.
3. **Physics:** the game physics (DSIM) simulates the chassis and the pieces with its own mechanism model: a turret launches along its angle, a ramp reaches into a flower once settled, the hood angle is the launch angle. The joints do not add rigid-body dynamics or collisions of the CAD parts; a CAD arm passing through the frame is not detected.

## Finding the joints in a CAD

A STEP export from Onshape, SolidWorks or Fusion keeps the assembly tree and part names but not mates (the OpenCascade reader gives names and tessellated geometry only). So joints from a STEP file are inferred, never presented as confirmed. `sim-discovery.js` uses:

- **Round parts.** A part whose surface turns about an axis spreads equally in the two directions across it, so the principal axes of its area distribution give candidates (only an axis whose other two spreads match within 15%). The outline around a candidate is checked: the farthest point in each of 24 directions, including triangle edge midpoints so a coarse outer polygon reaches every direction, a circle fitted to those, and nearest/farthest ≥ 0.8. Gears, bearings, hex shafts, hubs and wheels pass; plates and cubes do not.
- **Coaxial parts.** Round parts whose axes line up turn together (a flywheel with its hub, pulley and shaft) or mark a hinge line.
- **Names.** "Rhino wheel", "Gecko wheel", "Servo Hub Shaft", "Hood", "Turntable gear" and similar.
- **Contact.** Clusters of parts whose boxes touch tell a swinging arm from the plates that hold its rollers.
- **The floor.** How far a ramp folds before its lowest point touches the floor.

| Mechanism | How its joint is found |
|---|---|
| Turret | The large round part with an upright axis under the shooter, ranked by size, name and how near its axis is to the shooter. It carries the shooter's parts and the turret-assembly parts within 85% of its radius above it. Which way it fires: across the flywheel, from the hood over the wheel. |
| Flywheel | The largest round part with a level axle (named like a wheel when one is), with the parts on its axle. It spins so the side facing the hood moves up. |
| Hood | Parts named hood. If their outline is an arc centred on the flywheel axle (RANSAC circle fit), it pivots there (the usual adjustable hood); otherwise on a shaft at its end. A gear coaxial with a servo or motor drives it and stays with the frame. |
| Ramp, kicker | Lines of round parts along the intake's edge, scored by hinge words (servo hub, hub shaft, horn, spline, hinge, pivot, axle), a servo whose output sits on the line, an arm or ramp the line passes through; pulleys, gears and rollers mark a drive axle instead. What swings: parts beyond the hinge, or arms on it that reach much further out than back, in clusters that do not touch the plates holding the hinge. Down is where it touches the floor. |
| Rollers, feeders | Round parts on one axle with a roller or wheel among them. Rollers turn so their underside sweeps pieces in. |
| Drive wheels | Round parts named like wheels whose bottom touches the floor. |

Each proposal carries `source` (`metadata`, `inferred`, `user`, `standin`), a confidence and a note saying why. The interface shows three levels: **From the file** (none yet: see limits), **Found · likely right** (confidence ≥ 0.7) and **Found · please check**, plus **Set by you** once changed. Settings it cannot know (a hood's shooting tilt) are left for the team and say so.

On the team's own robot (a 118 MB, 2.18 M-triangle Onshape STEP) the finder takes about half a second in Node and runs in a worker in the app. It finds both turrets on their turntable gears (each facing the robot's right in the CAD), both flywheels with 10 parts on each axle, both hoods pivoting on their flywheel axles (the hood arc is concentric with the wheel), the deployable bump plate hinged on the servo hub shaft (down at 71°), the gecko intake roller, two feeder axles and the four mecanum wheels. These were checked against renders of the CAD.

### Picking a pivot on the model

**Pick a circle** measures the circle under the click, as a slicer does: a round part gives its own axis; on a flat face the edge loop nearest the click (a hole, or the face's rim) is fitted as a circle, accepted only when it is many short edges (any four corners of a rectangle also lie on a circle); a curved patch is fitted as a cylinder whose axis is the direction its normals avoid. **Two points** sets an axis through two clicks.

## Limits

- **No mates from STEP.** Joints come from geometry and names. AP242 can carry kinematic structure (`KINEMATIC_JOINT`, `REVOLUTE_PAIR`), but the exporters teams use do not write it and the reader does not expose it.
- **No URDF, SDF or MJCF import yet.** Only those files carry joints as data. Importing them needs their mesh files, which the importer does not yet read.
- **Discovery is tuned to FTC mechanisms.** Turrets, hoods, flywheels, ramps, rollers, feeders and drive wheels are found; other assemblies (arms, slides, claws) are added by hand with + Add (choose parts, pick the pivot, name positions).
- **Loops, couplings and actuators exist in the model and its tests**, but the panel does not yet edit them.
- **No collision of CAD parts.** See the three levels above.

## Sources

- URDF joints and mimic (`multiplier · other + offset`; types fixed, prismatic, revolute, continuous, planar, floating; URDF describes trees, with mimic for coupled joints): [urdfpy JointMimic](https://urdfpy.readthedocs.io/en/stable/generated/urdfpy.JointMimic.html), [urdfgenpy joint](https://urdfgenpy.readthedocs.io/en/latest/api/joint.html), [ros2_control joint kinematics](https://docs.ros.org/en/iron/p/hardware_interface/doc/joints_userdoc.html)
- SDFormat joint types (revolute, continuous, revolute2, prismatic, screw, universal, gearbox, ball, fixed): [sdformat Joint.hh](https://gazebosim.org/api/sdformat/14/Joint_8hh_source.html), [Specifying model kinematics in SDFormat](https://sdformat.org/tutorials/specification/spec_model_kinematics/)
- MuJoCo equality constraints (connect, weld, joint with `polycoef`, tendon) and tendons: [MuJoCo XML reference](https://mujoco.readthedocs.io/en/2.2.0/XMLreference.html), [onshape-to-robot MuJoCo exporter](https://onshape-to-robot.readthedocs.io/en/latest/exporter_mujoco.html) (closed loops as connect constraints)
- Onshape mates (fastened, revolute, slider, cylindrical, pin slot, planar, ball, parallel) and relations (gear, rack and pinion, screw): [Onshape blog: kinematics, assemblies, mates](https://www.onshape.com/en/blog/kinematics-assemblies-mates-simulation), [Mate connectors](https://cad.onshape.com/help/Content/mateconnector.htm)
- Drake multibody joints: [Joint](https://drake.mit.edu/doxygen_cxx/classdrake_1_1multibody_1_1_joint.html), [UniversalJoint](https://drake.mit.edu/doxygen_cxx/classdrake_1_1multibody_1_1_universal_joint.html)
- Four-bar position analysis (Freudenstein) and the slider-crank are standard results used as test references.

## Iteration log

**Iteration 1 (25 October).** Robotics concept: articulated CAD mechanisms for FTC (turret yaw, hood pitch, flywheel and roller spin, deploying ramps and kickers), on a general joint model. Built the joint, actuator, coupling, loop and action model with forward kinematics, a loop solver and inverse kinematics; CAD discovery; the rig that splits the body into links without copying vertices; engine joint values in every frame; the Moving parts panel; route actions that move a part to a named position. Tested: 15 kinematics tests (four-bar against Freudenstein, slider-crank formula, two-link IK, trapezoid timing, action timelines), 6 discovery tests on a synthetic FTC robot (floor-contact angle checked exactly), 5 rig tests with Three.js, 4 engine tests, the full suite, and the team's own CAD in the app (renders of each joint posed, and a 3D run). Found and fixed on the way: hinge hardware without a round outline (a Sonic Hub) holding the arm still; an arm wrapping round its own pivot counted as frame; four rectangle corners passing as a circle; a tube's inner ring lowering its roundness; the hood lagging one tick; the turret drawn in its CAD pose before the first tick; discovery blocking the page for 2.5 s (moved to a worker). Next objective: moving parts on any field (the panel lives under Mechanisms, which BIOBUZZ alone has), then editing couplings, loops and actions in the panel, then generic discovery (arms, slides, claws) and URDF import.
