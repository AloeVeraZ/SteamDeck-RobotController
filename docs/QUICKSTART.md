# Install and use Deck Driver Station 2

## Steam Deck LCD / OLED and Linux x64

1. Transfer `DeckDriverStation-2.0.0-SteamDeck.tar.gz` to the Deck.
2. In Desktop Mode, extract the archive. Open a terminal in that folder.
3. Run `bash install.sh`. It creates desktop and application-menu shortcuts.
4. Launch **Deck Driver Station**. To use Gaming Mode, add it through Steam's
   **Games → Add a Non-Steam Game**. If needed, browse to
   `~/.local/share/deck-driver-station/launch.sh`.
5. Select **Gamepad With Joystick Trackpad** and leave Proton disabled. Use
   **Steam + X** to type in text fields.

The app runs natively without root or changes to SteamOS's read-only system.
The LCD and OLED Decks both have 1280×800 built-in screens; the app also resizes
for docked displays and display scaling. The installer includes its own runtime.

## Windows

Extract `DeckDriverStation-2.0.0-Windows.zip`. Double-click **Install-Windows.cmd**
to install per-user and create Start-menu and desktop shortcuts. Or use
**Launch-Windows.cmd** to run directly from the extracted folder.
Keep the complete `app` and `runtime` folders together. No administrator account
or separate Node installation is required. Unsigned personal software may be
subject to your Windows application policies.

## Mac

Choose **arm64** for Apple Silicon or **x64** for Intel. Extract the ZIP and run
**Install-Mac.command**. It copies the app into `~/Applications`, ad-hoc signs it
using macOS's `codesign`, and creates a desktop link when one is not present.

This is a personal build, not Apple-notarized. If macOS requires explicit approval,
use **System Settings → Privacy & Security → Open Anyway** for this app. The
installer does not disable Gatekeeper or change global security settings.
Local-network access may require macOS's normal permission prompt.

## Android

Transfer and open **DeckDriverStation-2.0.0-Android.apk** on Android 8 or newer.
Approve installation from the file manager/browser you selected. The APK is a
signed personal build, not a Play Store release.

Use Settings to open Android's Wi-Fi panel. Android handles network selection
and passwords through its own approval flow. **Read current network name** asks
for the location permission Android uses to reveal SSIDs; location services may
also need to be enabled. You can enter the association manually if SSID access
is unavailable. A saved robot on a different known network opens the Wi-Fi panel
and can open automatically when its SSID is detected after returning.

The Android app uses the same robot mark and Drive/Settings concept, a native
WebView, local saved addresses, and native HTTP sign-in prompts. It closes the
robot view when backgrounded. Controller support depends on the installed Android
WebView and the robot page; two attached gamepad names are displayed.

## Daily workflow

**Settings → Wi-Fi → robot address → Open robot.** Enter an IP such as
`192.168.4.1`, a hostname such as `pushbot.local`, or a full URL including a port
or path. No robot protocol or type is selected. Names can be left blank; desktop
builds take the robot website's title after it opens.

The app caches the robot name, final address, associated Wi-Fi, and last-opened
time. Saved entries can be searched, edited, deleted, and opened. Entries on the
current network appear first. Robots on different hotspots can share the same
`192.168.4.1` address without overwriting one another.

On desktop, **Open** first tries OS-saved credentials when a network switch is
needed. If a password is needed, the app prompts for it and then opens the robot.
Linux uses NetworkManager, Windows uses saved WLAN profiles, and macOS uses the
system network service. Enterprise Wi-Fi or restrictive system permissions may
require **System Wi-Fi settings**. macOS scan APIs and Windows SSID visibility
vary with OS permissions; a manually entered network association remains useful.

For website authentication, ordinary login forms appear within the robot page.
HTTP authentication challenges open a username/password prompt. Robot passwords
are not saved in the address list. The browser's robot-specific cookie storage
can retain website sessions; HTTP authentication may ask again after reopening.

## Drive view and controllers

The page displayed is served by your robot. **Initialize, Teleop, Auto, Enable,
STOP, mechanisms, and camera controls belong to that page.** The launcher sends
none of those commands on its own. Header controls only reload, navigate back,
close the page, or open the three-dot settings menu.

Controller one is the Deck when it is the first connected gamepad, as expected
when using the built-in controller alone. Up to two indicators are displayed.
Bluetooth/USB controller pairing is handled by the OS. The robot website decides
which gamepad index it reads and whether it implements a second controller;
this app does not add an operator-two mapping to firmware that lacks one.

Opening Settings closes the robot page, and changing Wi-Fi closes its transport.
The robot's firmware must stop stale commands when a client or network disappears.
Keep the robot's normal physical stop/power controls available.

## Saved data and updates

Desktop settings normally live in Electron's **Deck Driver Station** user-data
directory: `~/.config` on Linux, `%APPDATA%` on Windows, and
`~/Library/Application Support` on Mac. `robots.json` stores bookmarks and SSIDs,
not passwords. Android uses the app's private preferences; its manifest disables
cloud backup of that data.

Close the old app before rerunning an installer. Version-one saved custom robots
and edited addresses migrate to generic website entries. On Android, retain the
same signing key when rebuilding an update APK. Remove the installed application
and its shortcuts to uninstall; remove the user-data directory separately if you
also want to discard the saved robot library.
