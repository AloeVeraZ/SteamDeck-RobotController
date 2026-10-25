# Mechanism research notes

This file records the research behind the mechanism engine: what each kind of robot needs mathematically, how the engine represents it, which decisions came from which source, and what is tested. The design itself is in `MECHANISM_ENGINE.md`; the user guide is in `SIMULATION.md`.

## 1. What carries across every robot

Looked at kinematically, rather than by how they look, the robots below reduce to a few ideas. The engine keeps these ideas apart.

1. **A joint is relative motion between two rigid links.** Turret, elbow, ramp and roller are all one revolute joint. What the part is for (`drive`) is a separate label.
2. **A transmission maps actuator motion to joint motion.** ros2_control's simple, differential and four-bar transmissions are each a linear map, joint = A · actuator + offset (§3). Gear trains, belts, CoreXY, planetary sets and fixed tendons are the same kind of map. Cams, Geneva wheels and continuously rigged slides are one-input functions.
3. **Closed chains are constraints, not trees.** Four-bars, slider-cranks, delta robots and geared five-bars are a tree plus "this point equals that point". This is how MuJoCo (`connect`, `weld`), SDFormat (a joint whose child is already reached) and Onshape (closed mate loops) represent them.
4. **The command is not the response.** A servo told 90° is not at 90° yet. A motor under load runs slower than its free speed. A pneumatic cylinder cannot stop half way. The engine keeps what an actuator was told (`command`) apart from how it moves (`q`, `v`). Sensors read the response.
5. **Accuracy has three levels:** visual-only, kinematically constrained, and physics. The engine says which level a result comes from and does not invent dynamics from geometry.

## 2. Robot categories: what they need and how they are represented

Status key: **Tested** means checked against an independent answer in `tests/`. **Modelled** means representable and used, but with no dedicated reference test.

| Category | Kinematic essence | Representation | Status |
|---|---|---|---|
| FTC/FRC/VEX turret and flywheel | yaw revolute, spin continuous; hood pitch on the turret | continuous + nested revolute; flywheel speed from a motor model (spin-up τ = J·ωf/τs) | Tested (`sim-kinematics`, `sim-joints-engine`, `sim-mechanism-universal` motor test) |
| Pivoting intake / ramp | limited revolute, two named positions | revolute with `states`; game `deploy` signal or actions | Tested |
| Linear elevator (cascade) | stages each move the same amount on the one below | prismatic chain + cable couplings, ratio 1 (`rigging('cascade')`) | Tested |
| Linear elevator (continuous rigging) | top stage moves first, then each one below (gm0) | prismatic chain + `sequence` couplings from a total-travel joint (`rigging('continuous')`) | Tested |
| Swerve module | steering continuous, wheel spinning on the steered axle | nested continuous joints | Tested (`sim-kinematics-robots`) |
| Mecanum / omni / differential drive | wheel spin follows chassis velocity | `wheel` signal, `roll: mecanum/omni` | Modelled (drawn from chassis motion) |
| Six-axis arm | serial revolute chain | revolute chain; IK by damped least squares | Tested against Denavit–Hartenberg |
| SCARA | two vertical pivots, quill slide, wrist | revolute, revolute, prismatic, continuous | Tested (planar two-link geometry; also as an SDFormat file) |
| Cartesian gantry / CNC | three orthogonal slides | prismatic chain with limits | Tested |
| CoreXY gantry | x = (A+B)/2, y = (A−B)/2 belt travel | two-input `differential` couplings from motor joints | Tested |
| Delta (parallel) robot | three driven arms, ball-jointed forearms meeting at a platform | revolute + ball, two point loops | Tested (sphere intersection) |
| Four-bar / slider-crank | one-DOF closed chain | tree + point loop, homotopy so it stays on the branch it was built in | Tested (Freudenstein, slider-crank formula; also driven in a run, and imported from SDFormat and MJCF) |
| Geared five-bar | two cranks geared together, links meet | gear coupling inside the loop; couplings re-applied during solving | Tested |
| Robotic gripper | mirrored fingers | `mimic` coupling, ratio −1 | Tested |
| Pneumatic gripper / cylinder | rests only at its ends | actuator `response: 'pneumatic'` | Tested |
| Humanoid arm | ball shoulder, elbow, universal wrist | ball, revolute, universal; per-value limits | Tested (law of cosines) |
| Differential wrist | pitch = (a1+a2)/2n, roll = (a1−a2)/2n | two-input couplings from two motor joints | Tested (ros2_control's equations) |
| Quadruped leg | hip abduction, hip, knee | revolute chain | Tested (planar two-link geometry) |
| Underactuated / tendon finger | phalanges coupled by tendons | multi-input `tendon` coupling (MJCF fixed tendons) | Tested (2·pip − 3·dip = 0 from an MJCF file) |
| Lead screw | travel = lead × turns | `screw` joint, or a `screw` transmission stage | Tested |
| Cable spool lift | travel = π·d × turns | `cable` coupling or `spool` transmission stage | Tested |
| Gear train | ratios multiply, sign flips per external mesh | chained `gear` couplings | Tested |
| Planetary gearbox | Ns·ωs + Nr·ωr = (Ns+Nr)·ωc | `planetary()` coupling, any member as output | Tested (from pitch-line speeds) |
| Cam and follower | follower = f(cam angle), repeating every turn | `cam` coupling: table + period | Tested (eccentric disc, e·(1 − cos θ)) |
| Geneva / indexer | dwell, then a quarter turn per input turn | table + period; each period adds the table's rise | Tested (tan β = sin α / (√2 − cos α)) |
| Rack and pinion | travel = π·d/360 per degree | `rack` coupling or stage | Tested |
| Conveyors, rollers | continuous spin | continuous joint + speed command or signal | Modelled |
| Snake / cable-driven / soft robots | many coupled joints; continuum bending | long chains + multi-input couplings approximate them; true continuum mechanics is not modelled | Partly (see §6) |
| Aerial robots with actuators | floating base + small joints | floating joint + revolute | Modelled |

## 3. Software studied, and what was taken from each

- **URDF / ROS 2.** Joints as a tree (fixed, revolute, continuous, prismatic, planar, floating). `mimic` gives q = multiplier·q_other + offset. Imported in `sim-urdf.js`.
- **ros2_control transmission_interface.** A transmission is a linear actuator-to-joint map. From the headers (`simple_transmission.hpp`, `differential_transmission.hpp`, `four_bar_linkage_transmission.hpp`):
  - simple: x_j = x_a/n + x_off;
  - differential: x_j1 = (x_a1/n_a1 + x_a2/n_a2)/(2·n_j1) + x_off1, and the difference for x_j2;
  - four-bar transmission: x_j2 = (x_a2/n_a2 − x_a1/(n_j1·n_a1))/n_j2 + x_off2.

  These led to **multi-input linear couplings**: one coupling shape covers all three, plus CoreXY, planetary sets and tendons. https://github.com/ros-controls/ros2_control/tree/master/transmission_interface
- **SDFormat / Gazebo.** Read from the spec sources (`sdf/1.11/joint.sdf`, `pose.sdf`) and the pose-frame-semantics page.
  - A link's pose defaults to its model's frame, a joint's to its child link's frame, and `relative_to` names any frame in scope.
  - The axis is in the joint frame unless `expressed_in` says otherwise. 1.5–1.6 had `use_parent_model_frame` instead, and 1.4 used the model frame.
  - `screw_thread_pitch` is metres a turn, positive right-handed. The deprecated `thread_pitch` is radians a metre, positive left-handed.
  - `gearbox` enforces θ2 = −ratio·θ1 about a reference body.

  https://sdformat.org/tutorials/specification/pose_frame_semantics/, https://github.com/gazebosim/sdformat/tree/main/sdf
- **MuJoCo / MJCF.** Read from `XMLreference.rst` and the modelling chapter.
  - Compiler and frames:
    - `compiler/angle` defaults to degrees.
    - `eulerseq` defaults to `xyz`; lower case turns with the frame, upper case is fixed, and URDF rpy is `XYZ`.
    - `autolimits` infers `limited` from `range`.
    - `quat` is w x y z.
    - Joint `pos` is in the body frame.
    - Geom sizes are half-sizes, and `fromto` sets the length.
  - Rendering:
    - Geom groups 0–2 are visible by default.
    - A geom's rgba wins over its material when it differs from the default.
    - Mesh vertices are drawn relative to `refpos` and `refquat`; the compiler's own recentring is undone by the geom frame.
  - Constraints:
    - Joint equality: y − y0 = a0 + a1(x − x0) + … + a4(x − x0)⁴. This led to **polynomial couplings**.
    - `connect` takes an anchor in body1's frame, which led to **point loops**. `weld` is position and orientation, imported as three points.
    - A fixed tendon is a linear combination of joints, which led to **tendon couplings**.

  https://mujoco.readthedocs.io/en/stable/XMLreference.html, https://mujoco.readthedocs.io/en/stable/modeling.html
- **Drake.** `MultibodyPlant::AddCouplerConstraint(joint0, joint1, gear_ratio, offset)` is the same linear coupling. https://drake.mit.edu/doxygen_cxx/classdrake_1_1multibody_1_1_multibody_plant.html
- **OpenUSD / Isaac Sim.** UsdPhysics defines revolute, prismatic, spherical, distance and fixed joints, with a generic D6 joint as the base. PhysX adds gear and rack-and-pinion joints. These confirm that gears and racks belong beside joints as relations, not as joint types. USD import is not implemented (§6). https://docs.omniverse.nvidia.com/kit/docs/pxr-usd-api/latest/pxr/UsdPhysics.html
- **Onshape, SolidWorks, Fusion.** Mates map to the joint types: fastened, revolute, slider, cylindrical, pin slot, planar, ball. Mate relations (gear, rack and pinion, screw) map to couplings. STEP exports from these tools do not carry mates, so STEP joints are inferred and labelled as such.
- **WPILib DCMotor.** R = V/I_stall, Kv = ω_free/(V − R·I_free), Kt = τ_stall/I_stall, giving a linear torque–speed line scaled by voltage. This is the **motor response model**. https://github.wpilib.org/allwpilib/docs/release/cpp/_d_c_motor_8h_source.html
- **gm0 (FTC).** Continuous rigging extends the last stage first, then the next-to-last, and so on; cascade moves all stages together. https://gm0.org/en/latest/docs/common-mechanisms/linear-motion-guide/rigging.html
- **CoreXY.** Both motors turning the same way move the carriage along x, opposite ways along y. corexy.com describes this qualitatively. The engine's x = (A+B)/2, y = (A−B)/2 follows from the belt paths. https://corexy.com/theory.html

## 4. Design decisions

| # | Decision | Why | Source |
|---|---|---|---|
| D1 | Couplings are `offset + f(first input) + Σ ratio·input`, with f a ratio (plus x²…x⁴ terms) or a table, optionally periodic. | One relation covers ros2_control's transmissions, MuJoCo polycoef and tendons, cams, Geneva wheels and continuous rigging. Robot-specific code is not needed. | ros2_control, MJCF |
| D2 | Actuator targets, named positions and speeds are in the joint's units. Transmission stages give the ratio. A motor model's datasheet figures (free speed, stall torque, count) are converted through it; load and inertia are entered at the joint. | Teams think "lift to 20 in at 15 in/s", not motor degrees. An ideal transmission conserves power, so τ_joint = τ_motor·ratio and ω_joint = ω_motor/ratio. | WPILib model, power balance |
| D3 | The driver sends only the joints it drives; `pose()` sets coupled joints and solves loop joints. | Sending every joint held loop joints at their rest values, so linkages never closed in runs or videos (found in this phase). | — |
| D4 | Motor model: the exact exponential solution of J·dω/dt = τs(u − ω/ωf) − τL over sub-steps. The default position gain closes an error at full speed in T = 4τ, which is critically damped. Velocity commands are closed loop with load feed-forward; effort is open loop. | Exact for held voltage, so the spin-up test can be strict. ζ = √(T/τ)/2 = 1 means no overshoot. | WPILib DCMotor |
| D5 | A pneumatic cylinder rests only at its ends and crosses at its set speed. | A plain solenoid-valve cylinder cannot hold mid-stroke. Speed under load depends on pressure and flow, which are not modelled, so this is labelled a kinematic approximation. | — |
| D6 | A closing joint from a file becomes a constraint: two points on its axis for a hinge (exactly a revolute constraint), three points for a weld, one point otherwise (noted). | Point coincidences are what the solver handles. Two points on an axis remove five DOF, exactly as a hinge does. | MJCF connect/weld, SDFormat graphs |
| D7 | Loop residuals are measured in inches whatever the CAD unit. Stored points keep 9 decimals. | Metre-scale files converged loosely, and 5-decimal storage moved loop points by 10 µm (both found in this phase). | — |
| D8 | A ball joint's cone limit is kept as the same limit on each of its three angles. | Per-angle stops are what the joint model holds. The approximation is stated in the import notes. | MJCF range on ball joints |
| D9 | Every format becomes one description (links, joints, loops, couplings, actuators, notes), then one path to the body and the joints. | New formats add a reader only. What cannot be read goes into `notes` rather than being guessed. | — |
| D10 | Timelines are worked out ahead for ideal actuators. They are ticked through the driver (1/240 s) when an action waits on a sensor or uses a motor model. Driver steps hand over on the tick they end. | Scrubbing and recordings must be deterministic. A wait or motor response cannot be computed ahead in closed form. | — |
| D11 | Joints in a loop from a file are left for the solver unless an actuator in the file drives them. | Which joint is the input of a linkage is not in the geometry. Guessing would drive the wrong one. | — |

## 5. Test coverage

Each line is a robot or mechanism, the test that checks it, and the independent reference.

1. FTC intake pivot and elevator: `sim-kinematics` (driver signals, actions) and `sim-mechanism-universal` (rigging). Reference: named positions, gm0 order.
2. FTC turret and flywheel: `sim-kinematics`, `sim-joints-engine`, and the motor model in `sim-mechanism-universal`. Reference: ωf(1 − e^(−t/τ)).
3. Swerve module: `sim-kinematics-robots`. Reference: axle direction and rolling direction.
4. Six-axis arm: `sim-kinematics-robots`. Reference: Denavit–Hartenberg forward kinematics.
5. SCARA: `sim-kinematics-robots` and `sim-robot-formats` (SDFormat file). Reference: planar two-link.
6. Cartesian gantry: `sim-kinematics-robots`, and CoreXY in `sim-mechanism-universal`. Reference: slides add; belt-path equations.
7. Four-bar: `sim-kinematics`, `sim-mechanism-universal` (in a run), `sim-robot-formats` (SDFormat and MJCF). Reference: circle intersection.
8. Slider-crank: `sim-kinematics`. Reference: x = r cos θ + √(l² − r² sin² θ).
9. Telescoping lift: `sim-kinematics-robots` and `sim-mechanism-universal`. Reference: cascade ×n; continuous order.
10. Gripper: `sim-kinematics-robots` (mimic), `sim-robot-formats` (MJCF equality), `sim-mechanism-universal` (pneumatic). Reference: symmetric jaws; ends only.
11. Humanoid arm: `sim-kinematics-robots`. Reference: law of cosines.
12. Quadruped leg: `sim-kinematics-robots`. Reference: planar two-link.
13. Lead screw: `sim-kinematics`, `sim-kinematics-robots`, and the transmission test in `sim-mechanism-universal`. Reference: lead × turns; encoder counts.
14. Cable pulley: `sim-kinematics-robots`. Reference: π·d per turn.
15. Gear-coupled: `sim-kinematics` (gear chain), planetary and the geared five-bar in `sim-mechanism-universal`, and the SDFormat gearbox. Reference: tooth ratios; Willis.
16. Delta robot: `sim-kinematics-robots`. Reference: three-sphere intersection.

Difficult cases covered:
- reversed axes (SCARA elbow, g2 gear, finger_r);
- non-zero joint origins everywhere;
- nested subassemblies (MJCF bodies, SDFormat frames);
- cyclic constraints (four-bars, geared five-bar, delta);
- missing metadata (notes for includes, unread meshes, muscles, flex);
- mixed units (radians and degrees, metres and inches, millimetre meshes);
- partial formats (Collada reported, tendon actuators reported).

## 6. Known limits

- **No rigid-body dynamics for CAD links.** Joints are kinematically constrained. The motor model is a one-DOF dynamic model at the actuator; it does not compute link inertia or gravity from CAD geometry, since a STEP mesh has no reliable mass. Loads and inertia are entered.
- **Springs, dampers and counterweights are not simulated as forces.** A spring-return part is modelled as a position actuator whose released position is where the spring holds it.
- **Inverse kinematics** reaches positions only (no orientation targets yet) and is not collision-aware.
- **Loops** are point coincidences. A prismatic or screw joint that closes a loop in a file is kept as one point and noted.
- **Formats not read:** OpenUSD, Collada meshes (collision shapes are drawn instead), xacro (expand it first), SDFormat `<include>`, MJCF `<include>`, spatial tendons, muscles, flex.
- **Continuum (soft) robots and snake robots** are approximated by joint chains; continuum bending mechanics is not modelled.
- **STEP files carry no mates**, so their joints are inferred and always marked "Found" (see `MECHANISM_ENGINE.md`).

## 7. Iteration log (universal engine phase)

**Iteration 6.** Concept: transmissions and actuator responses across robot types (ros2_control, WPILib, gm0, MuJoCo). Gaps:
- couplings had one input and were linear only;
- actuators moved in their own units, ideally;
- no sensors or conditional steps;
- joints other than revolute and prismatic had no end stops;
- linkages did not close in runs.

Changes: D1–D5 and D10, sensors, wait and preset steps, per-value limits.

Tests: 16 new, each against an independent reference.

Found and fixed: step handover losing up to two ticks per step, so sequences drifted; an arriving ideal actuator reporting speed for one more tick.

**Iteration 7.** Concept: structured formats beyond URDF (SDFormat, MJCF). Gap: only URDF carried joints as data.

Changes: D6–D9 and D11, `sim-robot-formats.js`, bridge reading with mesh lookup.

Tests: SCARA (SDFormat 1.9), four-bar and gearbox (SDFormat 1.6), arm and four-bar with tendon finger (MJCF), orientation and unit details, the body nesting, reading from disk.

Found and fixed: loop damping tied to inch-scale CAD; 5-decimal storage of points; MJCF rgba precedence over materials.

**Iteration 8.** Concept: industrial arms need tool orientation, and linkages such as the Scotch yoke and the quick-return lever need a pin sliding in another link's slot. Performance matters too, since the 3D view poses the robot every frame.

Gaps:
- inverse kinematics reached positions only;
- loops held points together but not a point on a line;
- a moving four-bar cost 1.9 ms a pose, because every frame re-solved from the rest pose and every robot input stepped the homotopy, even a turret elsewhere on the robot.

Changes:
- `reach({aim})` adds direction targets; two directions fix the tool's orientation;
- loops take `along`, a pin in a slot;
- loop solving poses only the loops' own chains and steps only the inputs that reach them;
- it continues from the last pose when inputs moved less than one step, and returns the last answer when nothing changed.

Tests:
- a six-axis arm reaching a full pose, checked by Denavit–Hartenberg;
- the Scotch yoke (r·cos θ) and the slotted lever (atan2);
- frame-by-frame poses against rest-pose solving over two crank turns, worst difference under 10⁻⁴°.

Benchmarks (Electron's Node, this laptop), µs per pose:

| Mechanism | Before | After |
|---|---|---|
| One ramp | 5 | 4 |
| 30-joint chain | 51 | 45 |
| Four-bar, unchanged | 443 | 15 |
| Four-bar, moving | 1859 | 107 |
| Delta robot, moving | 1446 | 438 |

A driver tick with 30 actuators takes 14 µs; a ticked motor-model timeline takes 0.17 ms.
