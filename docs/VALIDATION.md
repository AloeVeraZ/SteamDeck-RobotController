# Version 2.2 validation

Validated in this Windows development environment:

- 28 Node tests covering bookmark persistence/migration, same-IP/different-SSID
  records, name preservation, URL validation, password exclusion, NetworkManager
  parsing and connection commands, private temporary password files, original
  HTML/API pass-through, POST actions, cookies, authentication challenges,
  redirects, foreign-origin rejection, and streaming responses.
- Update tests cover testing/main release filtering, version ordering, missing
  platform assets, repository restrictions, verified downloads, checksum fallback,
  corrupt downloads, GitHub errors, and protection of development checkouts.
  Native Electron tests exercise the Updates menu and popup with unpublished,
  current, available, and rate-limit responses plus download verification.
  A real Windows helper test extracts a fixture archive, waits for its launcher
  to exit, replaces files, retains a previous-version backup, restarts a harmless
  fixture executable, and preserves separate saved data.
  A live GitHub API check confirms the new empty repository has no releases.
  The Linux helper passes replacement, backup, restart and forced-failure rollback
  shell fixtures under Git Bash; this does not substitute for a SteamOS run.
- Native Electron: the selected original robot webpage appears in a separate
  sandboxed WebContentsView with no Node or launcher bridge exposed. Its origin
  is a Chromium secure context and the Gamepad API is present.
- A test robot's own Initialize button sends its command; the launcher sends
  no initialization or robot control command itself. The real HTTP auth prompt
  accepts credentials. Saved website title/address/network records survive app
  restart and reopen from the saved list.
- Settings hides (does not close) the robot view, and the three-dot menu remains usable above
  the native child view. Responsive layouts have no horizontal overflow at LCD
  Deck, 4K, and phone window sizes.
- Desktop bundle builds verify upstream Electron SHA-256 checksums and check
  executable permissions, macOS bundle metadata, and app entry points. The Mac
  installer performs local ad-hoc signing because the app is not notarized.

Not validated here: physical Steam Deck hardware, SteamOS NetworkManager policy,
real robot motion, Bluetooth controller pairing, or Mac execution/signing on a Mac. Robot
control behavior and watchdogs remain the robot website/firmware's responsibility.
No GitHub release has been published and no production release download has been
installed end to end. Windows replacement is exercised with local fixtures;
SteamOS/macOS updater execution needs device tests.

Version 2.2 adds native UI checks for scanned Wi-Fi selection, Connect, password prompts, dropdown collapse, automatic network association, a larger update popup, and Main/Testing confirmation. Unit checks verify channel persistence and desktop return to an older Main release. Windows setup and the app launcher embed the robot icon; the Linux single-file installer verifies its included archive.

## FTC Driver Station

Validated in this Windows development environment against a simulated Control Hub
(`tools/ftc-sim.cjs`), which implements the Robot Controller side from the FTC SDK 11.0 sources:

- Byte layouts of peer discovery, heartbeat, gamepad (version 5), command, and telemetry
  packets; discovery, op mode list, active configuration, INIT/START/STOP, gamepad delivery,
  synthetic release gamepads, command retry and duplicate suppression, auto-transition,
  disconnect and reconnect, rejection by a robot with another station, Robocol version
  matching, camera frames, toasts, and telemetry formats (`tests/ftc.test.cjs`).
- Real UDP on port 20884, detection versus a non-FTC address, and the port-in-use error.
- The desktop app (`tests/ftc-app.cjs`): an address is detected and saved as FTC, the
  Driver Station connects (ping and battery shown), an op mode inits and runs on the robot,
  Settings keeps it connected and running, heartbeats continue, Close robot sends STOP,
  and a saved FTC robot reopens without detection.
- The Driver Station screen at 1280×800 in the browser preview: op mode lists, the 30 s
  autonomous timer, auto-transition, and the camera stream.
- Windows Wi-Fi listing: a fresh scan raised the visible networks on this PC from 1 to 20.

Not validated: a physical Control Hub or Robot Controller phone, real gamepads sending
input to a robot (Steam Deck controls, Bluetooth controllers), and SteamOS/macOS UDP behavior.
