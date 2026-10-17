# Website compatibility in version 2

Version 2 is a browser-based robot launcher. **It no longer requires a special
control adapter or a particular robot API.** Any reachable HTTP(S) robot website
can be saved and opened; the site still implements its own driving controls.

## Existing projects with robot dashboards

- **PushBot** — opens its own ESP32 dashboard.
- **3DBU-Test / Big Zippy** — opens its RobotDashboard interface, including its
  own setup, teleop, and autonomous tools.
- **MotionModule**, including the **Mecanum** example — opens the real dashboard
  and the active robot project's controls.
- **City Tech OmniBot** — opens its Wi-Fi dashboard and camera interface.
- **City Tech STEM Research Academy / 3TSahur** — opens its MotionModule website
  and the robot-provided ramp controls.
- **Crab Crawler** — can open the existing ESP32-CAM website **if that firmware
  is already installed on the robot**. The checkout contains CAD/documentation
  rather than that firmware, so its live website cannot be verified here.

The launcher can also open **Pi_cam_test**, **TrainUI setup pages**, or another
device's web dashboard; they do not have to be drivable robots. It does not
convert a transit display or camera into a drivetrain.

## Projects without a website in the current checkout

**Self Balancing Robot**, **eye_bot**, and **raspberry-pi-controller-mapping**
contain local control code. They can be opened if your actual hardware already
has an additional web UI, but this launcher does not create one from that code.

**Dorito-Swerve**, **coax-swerve-FTC**, **diffy-swerve**,
**FTC9384-2023-Robot-Crabby**, **FTC9384-2024-Robot**, **tubba-odometry-**, and
**Kiwi Swerve v2** contain design/CAD/manufacturing archives rather than a
compatible running website in this checkout. Bookmark a real robot URL if one
exists on the hardware; the project name alone cannot provide a web server.

No robot repositories or firmware were changed for this revision. A robot that
only exposes Bluetooth, raw TCP, ROS, or the FRC protocol needs its own web
interface before it can be used through this launcher. FTC robots are the exception:
the built-in FTC Driver Station speaks their protocol directly (see [FTC robots](FTC.md)).

## Browser behavior

The selected robot's HTML, JavaScript, JSON requests, cookies, HTTP login
challenges, and streaming camera responses pass through the local bridge. Same-
port WebSocket upgrades are forwarded. The desktop also routes legacy loopback
references on a different port to the selected robot, which helps older pages
that construct a port-81 WebSocket URL from `location.hostname`.

The bridge provides a loopback secure context for browser gamepad access and
keeps robot web content away from the app's privileged settings. It does not
rewrite the robot's control software. Pages with unusual hardcoded origins,
different-port browser policies, proprietary browser extensions, WebRTC, or
self-signed HTTPS may still need testing or robot-side adjustments. Android's
WebView implementation and OS Wi-Fi permissions also vary by device.

The app uses one selected robot website and one Wi-Fi connection at a time.
Multiple saved entries may share a hotspot IP but associate it with different
SSIDs. Multiple robots on the home LAN can use separate IP addresses. Only the
robot's own firmware determines whether it broadcasts a hotspot and joins home
Wi-Fi simultaneously.

FTC Control Hubs and Robot Controller phones are detected automatically and open the
built-in FTC Driver Station instead of a website; their configuration website stays
available from **⋮ → Program & Manage**. The FTC mode is an independent implementation
and is not an official or competition-certified FTC Driver Station.
