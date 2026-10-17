# Deck Driver Station 2

An app for opening your robots' **existing websites** on Steam Deck, Linux,
Windows, Mac, and Android. The robot icon is preserved. There are two main views:
**Drive** (the actual robot website) and **Settings** (Wi-Fi and saved addresses).

The launcher does not implement motor controls, initialize the robot, or replace
its teleop/autonomous interface. It connects to the network and website you choose.

## The workflow

1. Open the app from its shortcut or Steam's non-Steam library.
2. If Wi-Fi isn't connected, Settings opens with the connection controls.
3. Choose Wi-Fi, enter a robot IP/hostname/URL, optionally enter a friendly name,
   and press **Open robot**. No robot type or protocol selection is required.
4. Use the robot's real page. HTTP sign-in challenges prompt for credentials;
   website login forms appear normally inside the page.
5. The name, final URL, Wi-Fi association, and last-opened time are kept in the
   saved list. Reopen with **Open**. Desktop platforms first try saved OS Wi-Fi
   credentials when switching networks; a password prompt appears if needed.

Two controller indicators appear in the header. On Deck, controller one is the
built-in gamepad when it is the first connected gamepad. A second Bluetooth/USB
controller can be shown. The robot website retains its own controller assignments;
the launcher does not invent second-controller robot controls.

## Downloads and setup

The `dist` folder contains version **2.0.0** packages:

| Platform | Package | Install |
| --- | --- | --- |
| Steam Deck / Linux x64 | `DeckDriverStation-2.0.0-SteamDeck.tar.gz` | Extract; run `bash install.sh`. Creates application-menu and desktop shortcuts. |
| Windows x64 | `DeckDriverStation-2.0.0-Windows.zip` | Extract; run `Install-Windows.cmd`. Creates Start-menu and desktop shortcuts. `Launch-Windows.cmd` runs it portably. |
| Apple Silicon Mac | `DeckDriverStation-2.0.0-macOS-arm64.zip` | Extract; run `Install-Mac.command`. It installs and ad-hoc signs the app locally. |
| Intel Mac | `DeckDriverStation-2.0.0-macOS-x64.zip` | Same Mac installation. |
| Android 8+ | `DeckDriverStation-2.0.0-Android.apk` | Install the signed personal-build APK; Android asks permission to install from your chosen source. |

The Mac packages are not Apple-notarized; approval may be required in Privacy &
Security. See [full setup](docs/QUICKSTART.md), [website compatibility](docs/COMPATIBILITY.md),
and [validation and remaining device checks](docs/VALIDATION.md).

## Why the local bridge exists

Many robots serve plain HTTP. Chromium restricts browser gamepad access on an
ordinary insecure IP origin. The desktop app transparently streams the selected
robot's HTTP, API, camera, and same-port WebSocket traffic through loopback. The
robot still supplies the HTML, JavaScript, controls, sessions, and safety behavior.
Android has a corresponding native Java bridge. Nothing is hosted in the cloud.

Robot content runs without Node, desktop IPC, or an Android JavaScript interface.
The desktop uses a separate sandboxed WebContentsView, so robots with frame
restrictions still work. Robot browser cookies are isolated by network/address.
Robot passwords are never stored in the address JSON. The app does not bypass
invalid HTTPS certificates. Wi-Fi passwords are handled by the OS/network service.

Opening Settings, changing networks, or closing the robot closes its browser
view and transport. The robot's own stop/watchdog behavior remains authoritative.
No launcher can provide a hardware emergency stop for an arbitrary robot website.

## Development

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
python3 tools/package.py --target all  # Linux, Windows, Apple Silicon, Intel Mac
python3 tools/build_android.py         # JAVA_HOME / ANDROID_HOME, or local paths.json
```

The desktop builder verifies official Electron runtime checksums. It preserves
Mac executable/symlink metadata and Linux executable bits. Android is compiled
with SDK 35 and signed with a local personal-build key in `.cache/android-build`.
Keep that key to install later APK updates with the same signing identity.

`tools/android_toolchain.py` prepares verified, workspace-local Windows JDK/SDK
dependencies if needed; it does not modify system PATH. Native desktop integration
tests use `DECK_ELECTRON` and `DECK_PLAYWRIGHT` paths with `node tests/ui.cjs`.

| Code | Purpose |
| --- | --- |
| `src/main.cjs` | Desktop browser view, authentication prompt, narrow settings IPC |
| `src/library.cjs` | Saved website/network associations and v1 data migration |
| `src/network.cjs` | Platform Wi-Fi connection helpers |
| `src/robot-proxy.cjs` | Single-target streaming loopback transport |
| `ui/` | Drive/Settings shell and original robot icon |
| `android/` | Native Android host, WebView, saved library, Java loopback bridge |
| `packaging/` | Per-user installers and shortcuts |

The FTC Driver Station is a layout/workflow reference, not an implemented control
protocol or competition certification: [FIRST reference](https://ftc-docs.firstinspires.org/en/latest/control_hard_compon/ds_components/index.html).
