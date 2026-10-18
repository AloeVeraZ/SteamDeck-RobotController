# Deck Driver Station 2

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
Direct downloads are on the [Main release page](https://github.com/AloeVeraZ/SteamDeck-RobotController/releases/latest).

---

An app for driving your robots from Steam Deck, Linux, Windows, and Mac.
The robot icon is preserved. There are two main views: **Drive** (the robot's
controls) and **Settings** (Wi-Fi and saved addresses).
The shared theme follows MotionModule: warm near-black surfaces, locally bundled
Inter/Barlow Condensed fonts, steel-blue actions and distinct connection, warning
and stop states. See the [design audit and scope](docs/DESIGN.md).

The app works with two kinds of robots, detected automatically when an address is opened:

- **Robots with their own website** (ESP32, Raspberry Pi, MotionModule…): Drive shows the
  robot's real page. The launcher does not implement motor controls or replace its
  teleop/autonomous interface.
- **FTC robots** (REV Control Hub or Robot Controller phone): save it once with **FTC robot** ticked;
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

## Development

Use **⋮ → Updates** to check the GitHub repository, download a verified update,
then **Install & restart**. Builds from `main` follow the **Main** (stable) channel; builds from `testing` follow **Testing**.
Checks distinguish no published release, current version, available version, and
network/access errors. A robot hotspot without internet cannot check GitHub.
See [update and release setup](docs/UPDATES.md).

New work belongs on `testing`; approved changes merge into `main`.
Public install commands always read Main and select its latest stable release.
Testing remains available through the installed app's update-channel selector.

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
