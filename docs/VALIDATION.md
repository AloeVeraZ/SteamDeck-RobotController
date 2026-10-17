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
- Settings closes the remote view, and the three-dot menu remains usable above
  the native child view. Responsive layouts have no horizontal overflow at LCD
  Deck, 4K, and phone window sizes.
- Android Java sources compile against Android SDK 35. The personal APK passes
  Android's signature verification. A JVM smoke test runs the actual Android
  bridge against a real HTTP server: original HTML, POST requests, URL mapping,
  and separate cookie hostnames for different robot networks pass.
- Desktop bundle builds verify upstream Electron SHA-256 checksums and check
  executable permissions, macOS bundle metadata, and app entry points. The Mac
  installer performs local ad-hoc signing because the app is not notarized.

Not validated here: physical Steam Deck hardware, SteamOS NetworkManager policy,
real robot motion, Bluetooth controller pairing, Mac execution/signing on a Mac,
or Android installation/UI/gamepad behavior on a phone or emulator. The Android
APK is build-verified; it is not a claim of physical-device validation. Robot
control behavior and watchdogs remain the robot website/firmware's responsibility.
No GitHub release has been published and no production release download has been
installed end to end. Windows replacement is exercised with local fixtures;
SteamOS/macOS updater execution and Android installer handoff need device tests.

Version 2.2 adds native UI checks for scanned Wi-Fi selection, Connect, password prompts, dropdown collapse, automatic network association, a larger update popup, and Main/Testing confirmation. Unit checks verify channel persistence and desktop return to an older Main release. Windows setup and the app launcher embed the robot icon; the Linux single-file installer verifies its included archive.
