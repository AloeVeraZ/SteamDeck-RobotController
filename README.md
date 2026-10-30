# Torque 2

## ⬇️ Download

Paste the command for your terminal. It detects the supported device, downloads and verifies
**Main**, installs the app, creates its desktop icon, and launches it. Reuse the same command
for future Main releases; saved robots and settings are kept.

| Device | One-line install |
| --- | --- |
| **Steam Deck LCD / OLED · Konsole** | `curl -fsSL https://raw.githubusercontent.com/AloeVeraZ/SteamDeck-RobotController/main/install.sh \| bash` |
| **Windows x64 · PowerShell** | `irm https://raw.githubusercontent.com/AloeVeraZ/SteamDeck-RobotController/main/install.ps1 \| iex` |
| **Apple Silicon · Terminal** | `curl -fsSL https://raw.githubusercontent.com/AloeVeraZ/SteamDeck-RobotController/main/install.sh \| bash` |

Steam Deck/Linux and Apple Silicon use the **same command**. Windows uses its built-in
PowerShell shell. No administrator account is required. On Steam Deck, run from Desktop Mode;
add the installed app through Steam → Games → Add a Non-Steam Game for Gaming Mode.
After installing, **⋮ → Updates** lets you opt into experimental **Testing** or return to **Main**.
A testing release can be built for some devices only (currently Windows); the others stay on their version.
Direct downloads are on the [Main release page](https://github.com/AloeVeraZ/SteamDeck-RobotController/releases/latest).

---

An app for driving your robots from Steam Deck, Linux, Windows, and Mac.
The robot icon is preserved. There are three main views: **Drive** (the robot's
controls), **Simulate** and **Calibrate** ([live hardware debug and gated mechanism calibration](docs/CALIBRATION.md)).
**Settings** (Wi-Fi and saved addresses), updates, saved robots, the on-screen keyboard, fullscreen and exit are in the ⋮ menu.
The shared theme follows MotionModule: warm near-black surfaces, locally bundled
Inter/Barlow Condensed fonts, steel-blue actions and distinct connection, warning
and stop states. See the [design audit and scope](docs/DESIGN.md).

The app works with two kinds of robots, detected automatically when an address is opened:

- **Robots with their own website** (ESP32, Raspberry Pi, MotionModule…): Drive shows the
  robot's real page. The launcher does not implement motor controls or replace its
  teleop/autonomous interface.
- **FTC robots** (REV Control Hub or Robot Controller phone): save it once as **FTC · Control Hub** (Settings → Robot type), then open it on Wi-Fi or the USB cable;
  after that, joining its Wi-Fi opens Drive by itself. It shows a built-in FTC
  Driver Station with op mode selection, INIT/START/STOP, telemetry, and two gamepads,
  speaking the FTC SDK's own network protocol. See [FTC robots](docs/FTC.md).

## The workflow

1. Open the app from its shortcut or Steam's non-Steam library.
2. If Wi-Fi isn't connected, Settings opens with the connection controls.
3. Choose Wi-Fi, enter a robot IP/hostname/URL, optionally enter a friendly name,
   and press **Open robot**. No robot type or protocol selection is required; a typed
   name always replaces the website title.
4. Use the robot's real page, or the FTC Driver Station for an FTC robot. HTTP sign-in
   challenges prompt for credentials; website login forms appear inside the page.
5. The name, final URL, Wi-Fi association, and last-opened time are kept in the
   saved list. Reopen with **Open**. Desktop platforms first try saved OS Wi-Fi
   credentials when switching networks; a password prompt appears if needed.
   Settings also shows every robot saved for the current Wi-Fi as a grid of cards.

Controller 1 is the default. Recognized built-in handheld controls are preferred; if the OS
exposes an ordinary Xbox-style controller or an unknown handheld, its first standard gamepad
is selected. Both controller icons are always visible. Click one to open its live test screen:
sticks, triggers, and buttons show their standard gamepad names, indices, and values.
Choose **Assign/Reassign** and press any button on the desired pad. Selecting the other
slot's pad swaps them. The assignment press is suppressed until buttons are released and
sticks centered. **Use automatic assignment** restores the preferred built-in Controller 1.
The test screen stays open until you close it and holds robot gamepad outputs at rest.

The dashboard is **touch first**: tap Drive/Settings, menus, Wi-Fi rows, saved robots
and controller cards; swipe lists to scroll. Tap a text field for the built-in keyboard,
including addresses, Wi-Fi passwords and robot sign-in forms. It also handles taps
reported as mouse clicks on recognized handhelds. Gamepad inputs are reserved for the
robot; the dashboard reads live controller diagnostics through its separate input bridge.
Robot inputs stay neutral while its touch keyboard is open and until controls return
to center after closing it. See [touchscreen controls](docs/TOUCH.md).

Input support follows the actual **standard Gamepad layout** reported by Electron,
without a brand allowlist. That includes recognized Logitech, Nintendo, PlayStation,
Xbox and third-party USB/Bluetooth gamepads. Controller setup identifies the physical
model only when the driver provides enough information. Nintendo and PlayStation
button labels follow their physical positions; robot button indices stay standard.
Unmapped devices are available for raw diagnostics, but their robot outputs stay neutral.
Use a supported gamepad mode (Logitech **X**, or Steam Input **Gamepad**) and reconnect.
See [controller support and limitations](docs/CONTROLLERS.md) and the
[100-profile software regression catalog](docs/CONTROLLER-PROFILES.md).

The live illustration follows [Hardware Tester's controller layout](https://hardwaretester.com/gamepad):
one flat standard-input diagram, detached shoulders/triggers, offset sticks, and live
stick-position plots. All 17 standard button indices and analog trigger levels remain visible.
This is an input map rather than a picture of the connected physical model. Known model names appear throughout setup;
ambiguous Xbox/XInput or virtual drivers display **Generic controller**. **Driver details**
keeps the original OS identifier available. A Steam Deck host alone cannot prove that an
Xbox-compatible input is its built-in controller. Steam Deck desktop-shortcut guidance
appears only on detected Steam Deck hardware when launched outside Steam.

Saved robots default to **one controller**. Choose **Two controllers** in that robot's Settings
when it needs a second operator. Slot assignment applies to the FTC station and websites
using the standard Gamepad API; a custom USB, Bluetooth, or proprietary robot protocol needs
its own compatible integration. Browser gamepad visibility may require pressing a button first.
Two identical controllers without distinct OS identities may need reassignment after reconnecting.

The expand button between **Close robot** and the robot-view label opens **robot-only
fullscreen**. Only a corner **×** remains. Click it or press **Esc** to restore the
previous app view; the robot page and controller assignments remain open. The three-dot
menu's **Toggle fullscreen** still controls the whole app independently.

**Steam Deck desktop shortcut:** keep Steam running and hold **☰ Menu** until Gamepad Mode
appears, then press **A**. In Desktop Mode, Steam can map sticks to the mouse and scroll;
the app needs gamepad input. Verify both sticks in the test screen before returning to Drive.
For Gaming Mode, add the app to Steam and use a **Gamepad** layout with both sticks as joysticks.
Windows/Linux handheld utilities and Steam Input layouts need the same gamepad output mode;
external controllers pair through the OS. The app does not change system-wide desktop bindings.
See [Steam Input's gamepad emulation documentation](https://partner.steamgames.com/doc/features/steam_controller/steam_input_gamepad_emulation_bestpractices).

The Apple Silicon package is not Apple-notarized; approval may be required in Privacy & Security.
See [full setup](docs/QUICKSTART.md), [website compatibility](docs/COMPATIBILITY.md), and
[validation and remaining device checks](docs/VALIDATION.md).

## Offline autonomous simulator

The **Simulate** tab plans and test-drives FTC autonomous routes offline, with no extra
downloads: physics, the path follower and the Java runtime it needs ship inside the app.

- Set up your robot (drivetrain, size, motor RPM, sensors) and a field: BIOBUZZ (this season), or a
  custom field with your own obstacles for any season.
- Click to add paths or draw the route; the planner keeps the whole robot clear of obstacles and can
  turn it to fit. Like the Pedro Pathing visualizer, a path can be a **custom curve** with draggable
  handles, and the robot can hold a heading, turn, face a target or **face along the path**. Right-click
  a pin or a path for pauses, turns, spins and **action paths** (run an intake or shooter while driving).
  Switching the BIOBUZZ alliance moves the route to the other side. Drag the route preview to slide a
  robot outline along the plan before running physics.
- Describe your **mechanisms** in plain settings (intake sides, storage, index time, turret or fixed
  shooter, spin-up) and the hardware they run on: motor or continuous-servo rollers, one- or two-motor
  flywheels with or without an encoder, motor, servo pusher or servo gate feeders, motor or servo
  turrets, and which way each device turns. Routes use Intake, Spin up, Aim and Shoot, and the physics
  picks up, launches and scores real BIOBUZZ pieces. How these reach the robot is explained in
  [mechanism actions](docs/MECHANISM_ACTIONS.md).
- Run it through physics and replay it with a timeline and mechanism views, graph its speed, heading, sensor error, drive power and mechanisms, see a run analysis (pieces picked up, shot and scored), then export
  for your controller: Control Hub OnBot Java or TeamCode with working mechanism code, **Pedro Pathing
  3** TeamCode for a Pedro Quickstart project, or a MotionModule `autonomous.py`, plus a `.pp` path file
  or timed commands (a `.pp` from the Pedro Pathing visualizer can be imported too). Every Control Hub export is compiled against the real FTC SDK 12.0 (and Pedro
  Pathing 3.0.2) by the project's checks, and each export lists what still needs your robot: hardware
  names, tuning and a real test. Control Hub exports come with a guided check TeleOp that turns each
  drive motor and mechanism device on the robot and asks what it did, then finds where the odometry
  pods, Pinpoint or OTOS sit from two pushes by hand and a turn on the spot. **Send to robot** checks the
  device names against the Control Hub's own configuration (and can use its names), adds any missing
  device to a new configuration with the port to plug it into, uploads and builds the OnBot Java over
  Wi-Fi, and runs the guided check from the app, putting its answers (directions, servo positions,
  turret calibration, flywheel PIDF, odometry offsets) into the setup. Open a log from your real robot to compare where
  it drove with the plan.
- Or do all of it from a terminal with `deck-sim` (plan, test-drive, optimize, export, compare a robot log) and have the
  result open in the app on Run & review.

See [the simulator guide](docs/SIMULATION.md).

## License and credits

Torque's own code is [MIT licensed](LICENSE). It builds on Electron, Pedro Pathing,
DSIM, Rapier, three.js, OpenJDK and more; see [credits and third-party notices](THIRD-PARTY-NOTICES.md),
also in the app under Settings → Preferences → Licenses and credits. The simulator's physics come
from [DSIM](https://github.com/genius0412/dsim) by Dohun Kim, which is licensed for noncommercial
use only, so complete releases are free for noncommercial use such as team practice. Not
affiliated with or endorsed by FIRST®, REV Robotics, Valve or any project above.

## Why the local bridge exists

Many robots serve plain HTTP. Chromium restricts browser gamepad access on an
ordinary insecure IP origin. The desktop app transparently streams the selected
robot's HTTP, API, camera, and same-port WebSocket traffic through loopback. The
robot still supplies the HTML, JavaScript, controls, sessions, and safety behavior.
Nothing is hosted in the cloud.

Robot content has no Node access or desktop settings API. A narrow data-only
input bridge supplies controller slots; assignment stays in the app's UI.
The desktop uses a separate sandboxed WebContentsView, so robots with frame
restrictions still work. Robot browser cookies are isolated by network/address.
Robot passwords are never stored in the address JSON. The app does not bypass
invalid HTTPS certificates. Wi-Fi passwords are handled by the OS/network service.

Opening Settings hides the robot without disconnecting it; Drive shows it again.
Changing networks, opening Updates, or closing the robot closes its view and
transport (an FTC robot is sent STOP first). The robot's own stop/watchdog
behavior remains authoritative.
No launcher can provide a hardware emergency stop for an arbitrary robot website.

Once detected by the station, controllers stay assigned across robot reloads and Close robot/reopen.
The station forwards their current input to the robot; each robot page needs no separate controller activation.

Sleep or a lost Wi-Fi connection keeps the selected robot's address and network.
After reconnecting Wi-Fi, choose **Try again** to reopen it without restarting the app
or retyping its address. Controls stay neutral until held sticks/buttons are released;
robot enable and initialization are never automatically restored.
The station forwards their current input to the robot; each robot page needs no separate controller activation.

Robot-hosted Wi-Fi can use [Find robot automatically](docs/DISCOVERY.md) in Settings.
It is opt-in and checks the hotspot gateway only; home/shared networks keep manual or saved addresses.
Controller setup includes [drift measurement and app deadzones](docs/CONTROLLERS.md#calibration-and-steam-deck-navigation).

## Development

Use **⋮ → Updates → Check for updates**, then **Download update**. The app verifies
the download, installs it automatically, and restarts. Builds from `main` follow the **Main** (stable) channel; builds from `testing` follow **Testing**.
Checks distinguish no published release, current version, available version, and
network/access errors. A robot hotspot without internet cannot check GitHub.
See [update and release setup](docs/UPDATES.md).

New work belongs on `testing`; approved changes merge into `main`.
Public install commands always read Main and select its latest stable release.
Testing remains available through the installed app's Main and Testing buttons.

```bash
npm install
npm start
node --test tests/*.test.cjs
node tools/preview.cjs
```

The browser preview runs at `http://127.0.0.1:8787`; native Wi-Fi controls and the
native HTTP authentication dialog require the installed app.

```bash
python3 tools/icons.py                 # Pillow; rasterize the existing robot SVG design
python3 tools/package.py --target all  # Linux, Windows, Apple Silicon
```

The desktop builder verifies official Electron runtime checksums. It preserves
Mac executable/symlink metadata and Linux executable bits. Native desktop integration
tests use `DECK_ELECTRON` and `DECK_PLAYWRIGHT` paths with `node tests/ui.cjs`.

| Code | Purpose |
| --- | --- |
| `src/main.cjs` | Desktop browser view, authentication prompt, narrow settings IPC |
| `src/library.cjs` | Saved website/network associations and v1 data migration |
| `src/network.cjs` | Platform Wi-Fi connection helpers |
| `src/robot-proxy.cjs` | Single-target streaming loopback transport |
| `src/ftc.cjs`, `src/ftc-preload.cjs` | FTC detection and UDP 20884 bridge for the Driver Station page |
| `ui/ftc/` | FTC Driver Station page and Robocol protocol (desktop app and browser preview) |
| `tools/ftc-sim.cjs` | Simulated FTC Control Hub for tests and previews |
| `ui/` | Drive/Settings shell and original robot icon |
| `packaging/` | Per-user installers and shortcuts |

The FTC Driver Station is an independent implementation of the FTC SDK's Robocol
protocol, written from the published SDK sources. It is not REV or FIRST software and
is not competition-certified: [FIRST reference](https://ftc-docs.firstinspires.org/en/latest/control_hard_compon/ds_components/index.html).
