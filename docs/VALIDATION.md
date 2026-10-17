# Version 2 validation

Validated in this Windows development environment:

- 16 Node tests covering bookmark persistence/migration, same-IP/different-SSID
  records, name preservation, URL validation, password exclusion, NetworkManager
  parsing and connection commands, private temporary password files, original
  HTML/API pass-through, POST actions, cookies, authentication challenges,
  redirects, foreign-origin rejection, and streaming responses.
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
