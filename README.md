# Deck Driver Station 2

An app for driving your robots from Steam Deck, Linux, Windows, and Mac.
The robot icon is preserved. There are two main views: **Drive** (the robot's
controls) and **Settings** (Wi-Fi and saved addresses).

The app works with two kinds of robots, detected automatically when an address is opened:

- **Robots with their own website** (ESP32, Raspberry Pi, MotionModule…): Drive shows the
  robot's real page. The launcher does not implement motor controls or replace its
  teleop/autonomous interface.
- **FTC robots** (REV Control Hub or Robot Controller phone): join the robot's Wi-Fi and Drive
  connects by itself, with no IP to type. It shows a built-in FTC
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

Two controller indicators appear in the header. On Deck, controller one is the
built-in gamepad when it is the first connected gamepad. A second Bluetooth/USB
controller can be shown. The robot website retains its own controller assignments;
the launcher does not invent second-controller robot controls.

## Downloads and setup

The `dist` folder contains version **2.4.0** packages:

| Platform | Package | Install |
| --- | --- | --- |
| Steam Deck / Linux x64 | `DeckDriverStation-2.4.0-SteamDeck.run` | Run `bash DeckDriverStation-2.4.0-SteamDeck.run`. Creates application-menu and desktop shortcuts. Tar archive is also available. |
| Windows x64 | `DeckDriverStation-2.4.0-Windows-Setup.exe` | Run the setup executable. Creates branded desktop/Start-menu shortcuts and an installed-app entry. Portable ZIP is also available. |
| Apple Silicon Mac | `DeckDriverStation-2.4.0-macOS-arm64.zip` | Extract; run `Install-Mac.command`. It installs and ad-hoc signs the app locally. |

The Apple Silicon package is not Apple-notarized; approval may be required in Privacy &
Security. See [full setup](docs/QUICKSTART.md), [website compatibility](docs/COMPATIBILITY.md),
and [validation and remaining device checks](docs/VALIDATION.md).

## Why the local bridge exists

Many robots serve plain HTTP. Chromium restricts browser gamepad access on an
ordinary insecure IP origin. The desktop app transparently streams the selected
robot's HTTP, API, camera, and same-port WebSocket traffic through loopback. The
robot still supplies the HTML, JavaScript, controls, sessions, and safety behavior.
Nothing is hosted in the cloud.

Robot content runs without Node or desktop IPC.
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
then **Install & restart**. This build follows the **testing** release channel.
Checks distinguish no published release, current version, available version, and
network/access errors. A robot hotspot without internet cannot check GitHub.
See [update and release setup](docs/UPDATES.md).

Local branches `main` and `testing` exist; changes and commits belong on `testing`.
Nothing is pushed until explicitly authorized. The GitHub repository is initially empty.

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
