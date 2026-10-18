# Validation

## Testing 2.4.4: installation and controller slots

- The GitHub README has three install entries. Steam Deck/Linux and Apple Silicon
  share one platform-detecting Bash command; Windows uses PowerShell. The stable
  URLs resolve the current Main release, with no version in the command.
- Bootstrap fixtures exercise future versioned assets, Linux and Apple Silicon
  selection, old/new Linux installer behavior, exactly one app launch, CRLF
  checksums, corrupt downloads, prerelease rejection, and unsupported hardware.
  A separate PowerShell fixture checks Windows silent installation followed by
  launch, future stable assets, and rejection before execution on verification failure.
- 56 Node tests pass for controller policy, saved data, robot transports, networking,
  and updates. Native UI checks pass at LCD, 4K, and portrait sizes.
- Native Electron checks exercise default Controller 1, optional Controller 2,
  header click/press assignment and swapping, neutral assignment presses,
  disconnect/reconnect, and actual FTC UDP axis delivery. A separate native website
  fixture verifies the selected slots through its own standard Gamepad API,
  Settings input pause, and sandbox isolation. Test controller injection is absent
  from normal app launches.
- This does not validate physical Steam Deck input, Bluetooth radio stability,
  physical robot motion, or execution on Apple Silicon. Those need device tests.

## Testing 2.4.3: built-in handheld controllers

- 49 Node tests pass, including Linux/Windows hardware detection, built-in preference,
  sparse gamepad indices, generic Steam Input identities, no-controller and ordinary-PC
  behavior, manual overrides, disconnects, reconnects, and index reuse.
- Native Electron against a simulated Control Hub passes with LCD, OLED, ROG Ally X,
  and Legion Go device profiles. An external controller is enumerated first. The
  built-in pad's axes arrive over real UDP as User 1 without a button chord; manual
  User 1/User 2 assignments, chord suppression, header slots, and reconnects also pass.
- The native LCD test checks INIT/START/STOP, Settings visibility, heartbeat continuity,
  saved robot reopening, and automatic reopening on the saved network.
- These tests simulate controller and device identities; physical handheld input,
  Steam Input configuration, Bluetooth pairing, and robot motion still need device checks.

## GitHub installation (2.4.2)

- The GitHub README provides Steam Deck, Windows, and Apple Silicon downloads and
  one-line installers directly. A separate download website is not required.
- Bootstrap installers resolve GitHub's latest stable release and use its versioned
  assets and checksums; prerelease tags are refused. The app's existing Main/Testing
  selector remains available after installation, including its experimental warning.
- The real Steam Deck `.run` installs into an isolated directory, creates branded
  desktop/application shortcuts, and preserves saved-data fixtures. This ran under
  Git Bash with a scoped platform fixture, without executing the Linux runtime.
  CI also runs this installer fixture on Linux.

Physical Steam Deck installation and launch remain untested in this workspace.

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
  Empty-repository responses were checked before the first release was published.
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
Main 2.4.2 is published. Its Steam Deck and Windows installer downloads pass
live checksum checks. Windows replacement is exercised with local fixtures;
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
