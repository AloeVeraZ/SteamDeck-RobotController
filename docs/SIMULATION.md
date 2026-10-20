# Simulation view

Open **⋮ → Simulation**. This first slice provides an empty 144 × 144-inch FTC field and an initial-pose editor. No dependencies or external services were added.

The 18 × 18-inch square is a placement preview, not imported robot geometry. A new setup starts against the left wall, centered at **(9, 72)** inches. The preview follows the pointer until a click, touch release, or Enter sets the pose. Use **Place on field** to move it again, **Start at edge** for a wall placement, or enter X, Y and heading directly. Escape discards a draft. The preview footprint stays inside the field, including at rotated headings. Only confirmed poses are saved in this device's local storage.

Coordinates use the bottom-left field origin: X right, Y up, headings counterclockwise, 0° right and 90° up. User placement changes the robot's initial pose; it does not move the field origin. All values are inches and degrees in this view. Future library adapters must explicitly transform units and coordinate frames.

Simulation is currently offline. Entering it closes the connected robot using the existing disconnect/FTC STOP path. Robot auto-open is suppressed while this view is active. Placement does not write any configuration or pose to a robot. Driving physics, live pose telemetry, geometry import and executable path generation are not implemented in this release.

## Ownership and next steps

The robot remains the source of truth for its configuration, code, sensors and localization. Do not add dashboard hardware maps, GPIO/encoder assignments, sensor drivers, localizer selection or calibration. These belong in the REV/FTC stack or MotionModule's robot software, including Raspberry Pi GPIO and Arduino services. The dashboard visualizes robot results; it does not replace a robot's localizer or run its feedback control loop over Wi-Fi.

The first hardware targets are MotionModule and REV Control Hub. Robot-side implementations must accommodate the actual installed setup: gyro only; drivetrain encoders; two dead-wheel pods plus heading; three dead-wheel pods; and goBILDA Pinpoint. Do not infer position feedback from the platform name. A gyro-only MotionModule cannot measure X/Y. Swerve and mecanum motion/feedback are distinct robot-side implementations.

Pinpoint already combines its pod readings and IMU into a pose. Read that robot-side pose, with the configured tracking-point offset and frame; do not fuse its raw inputs a second time in the dashboard. Control Hub encoder-port odometry should likewise publish the pose computed by the robot's existing localizer. Pod directions, offsets, resolution and encoder names stay on the robot.

Implement in stages:

1. Inspect and document each robot's existing telemetry endpoints. Agree a robot-owned pose record carrying schema version, field frame, tracking point, units, monotonic sample time, X/Y/heading and validity. Optional velocity, uncertainty and localizer description help diagnostics. Display stale/missing data honestly; never silently replace it with simulated ground truth. Robot-reported frames must be converted explicitly before overlaying them on this field. There is no universal live pose endpoint wired up yet.
2. Add read-only pose visualization and recordings from those robot endpoints. Keep the chosen simulated start distinct from a measured robot pose. Applying an initial pose to real hardware must use an explicit robot-supported initialization action, rather than an automatic dashboard write.
3. Add offline driving, trajectories and geometry. Reuse existing libraries through tested adapters, with separate simulation truth and sensor estimates. Render imported meshes, derive collision geometry, and configure physical properties explicitly. A model alone does not establish mass, friction or drivetrain behavior.
4. Integrate version-pinned Pedro Pathing/Road Runner on their supported robot runtimes. Keep execution and mechanism scheduling on the robot. Road Runner parallel actions are cooperative, not an instruction to start competing hardware-writing threads. MotionModule's Python runtime needs a verified runtime/IO integration before claiming genuine Pedro/Road Runner execution. Do not label an approximation as the actual library. Calibrate and compare simulation with physical runs before asserting transfer accuracy.

The inspected MotionModule source already provides `GET /api/drive/telemetry` through `core/motion_module/dashboard.py`. Its normalized snapshot exposes the runtime IMU (`yaw` in degrees, `rate` in degrees/second) and bounded sensor readings. `core/motion_module/telemetry.py` does not currently define a structured X/Y pose record; arbitrary project keys are removed by the normalizer. A future robot-side pose publication must extend that existing contract deliberately. Raw gyro data alone is not a substitute for a robot-computed X/Y estimate. No MotionModule source or hardware configuration was changed for this field editor.

Primary references: [Pedro coordinates](https://pedropathing.com/docs/pathing/reference/coordinates), [Pedro Pinpoint localizer](https://pedropathing.com/docs/pathing/tuning/localization/pinpoint), [goBILDA Pinpoint documentation](https://www.gobilda.com/pinpoint-odometry-computer-imu-sensor-fusion-for-2-wheel-odometry/), [Road Runner actions](https://rr.brott.dev/docs/v1-0/actions/). These are integration guidance, not claims of integrations already shipped.
