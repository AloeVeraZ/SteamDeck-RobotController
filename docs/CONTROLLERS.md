# Controller support

The driver station owns controller discovery, assignment and testing. A robot website
does not need its own assignment prompt: it reads logical slots 0/1 through the standard
Gamepad API. The bundled FTC station translates those slots to Robocol User 1/2. A
website that has no Gamepad API input handler still needs a robot-specific integration;
the dashboard cannot infer motor commands from an arbitrary page.

Controller polling belongs to the persistent driver-station document. Once the OS
exposes the controllers there, robot reloads, navigation, and Close robot/reopen do
not require another controller activation or assignment. Each new robot document
receives the current logical C1/C2 reports and connection events after its load
handlers run. Cached logical Gamepad/button objects remain live as inputs change.
Robot pages cannot submit controller reports or clear the station's devices.
Real physical disconnects clear the output; a missing station heartbeat clears it
within about 0.6 seconds. Full app restarts or OS pairing can still require the
initial interaction that exposes a controller to Chromium. Robot enable/INIT
remains the robot's responsibility. Optional haptic actuators still depend on the
robot document's native OS exposure; driving input does not.

## Keyboard as Controller 1

Laptops and desktops with a keyboard can drive without a gamepad. Open **Controller 1**
and choose **Keyboard**; the choice is saved on this device. The keyboard then becomes a
standard-mapping gamepad on logical slot 0, so robot pages read it exactly like a
controller, and any physical controller moves to Controller 2.

| Gamepad | Keys (by position) |
|---|---|
| Left stick | W A S D |
| Right stick | Arrow keys |
| D-pad | I K J L (up, down, left, right) |
| A · B · X · Y | Space · C · R · F |
| LB · RB · LT · RT | Q · E · Left Shift · G |
| Back · Start | ` · Enter |
| Left / right stick click | X · M |

Keys are read by physical position (`KeyboardEvent.code`), so the cluster stays in the
WASD position on AZERTY, QWERTZ, Dvorak and other layouts. The dialog names the layout
from Chromium's keyboard map (for example *English (UK) QWERTY*, *German QWERTZ*,
*French AZERTY*) and shows the keycaps printed at each position. Chords with Ctrl, ⌘ or
Alt are left for station shortcuts. Held keys are released when the window loses focus.
Key presses still reach the robot page too, so text fields keep working.

Controllers report a vendor and product ID. Known models are named from a catalog; an
unlisted product from a known maker is named by brand (for example *8BitDo controller*).
Valve's virtual Steam pad and the Xbox 360 ID that many third-party pads reuse stay
"Generic controller", because the ID cannot identify the physical device.

The station sends only gated logical values to robot documents: setup, assignment,
keyboard pauses, unmapped layouts and release locks are already neutral in the
IPC payload. Raw readings stay in the trusted station. Analog input precision and
the driver's button press/touch flags are preserved across the bridge.

Touchscreen navigation is the default interaction model. The shell exposes no gamepads
through its own enumeration; raw diagnostic reports still support testing/assignment.
The selected robot receives the logical pads, while Settings, controller tests and the
robot touch keyboard hold their outputs neutral. See [touchscreen controls](TOUCH.md).

## Layout and detection

Electron/Chromium and the operating system perform USB/Bluetooth enumeration and
hardware layout mapping. The dashboard accepts every device actually reporting
`mapping: "standard"`; it has no product allowlist. This applies equally to built-in
handheld controls, generic XInput devices and recognized Logitech, Nintendo, Sony,
Microsoft, 8BitDo, GameSir, GuliKit, Razer, HORI, PowerA, PDP, SteelSeries, Nacon, SCUF,
Turtle Beach and future brands. It does not imply every model/mode has drivers on
every supported OS. Pairing remains in the operating system.

Controller 1 prefers recognized built-in controls, otherwise the first standard pad.
Controller 2 is independently available even when the robot accepts only Controller 1.
**Use automatic assignment** clears both manual slot preferences and rebuilds the
slots: recognized built-in controls first, then an available external standard pad.
Only two controllers can be assigned at once. Ambiguous virtual Xbox IDs may still
need manual assignment because their physical origin is not exposed by the driver.
Click either slot, choose Assign/Reassign and press a button to select or swap devices.
The assignment press is consumed until controls return to neutral. Manual choices
persist. Disconnects and reconnects are handled without relying on a fixed browser index.
Identical devices reporting the same ID may require reassignment after reconnecting.

Controller names are conservative. Explicit model names and selected documented VID/PIDs
identify Nintendo Pro/Joy-Con, Sony and Logitech devices. Shared DirectInput Logitech
IDs remain “Logitech controller.” Virtual or ambiguous Xbox drivers remain “Generic
controller”; the app cannot determine which physical controller Steam Input is emulating.
Nintendo uses B/A/Y/X at south/east/west/north; Sony uses Cross/Circle/Square/Triangle.
These display labels do not reorder the standardized robot input indices.

## Unmapped devices and gamepad mode

An empty mapping means the browser has not normalized that device. Such a pad does not
automatically occupy a slot. It can be assigned manually to inspect raw buttons/axes,
but outputs sent to robot content stay neutral; the app never guesses raw indices.
The FTC encoder also rejects unmapped inputs independently of the shared bridge.

- Logitech F310/F510/F710: try the X/D switch in **X** mode, reconnect, then test.
  Recognized D-mode mappings also work when Electron reports `standard`.
- Steam Deck/Desktop Mode: keep Steam running, hold Menu to select Gamepad Mode and
  press A. Sticks must move the test axes, not the pointer. Steam Input Gamepad layouts
  also provide a normalized route for compatible external controllers.
- Windows/Linux handhelds: select Gamepad in the vendor's handheld utility. Desktop
  mouse modes are not joystick reports.
- Nintendo/Sony/third-party Bluetooth: pair through the OS, then press a button while
  the app is focused. If the OS/browser cannot expose a standard layout, use a supported
  wired mode or compatible controller translation software. Do not expect arbitrary
  Bluetooth accessories, flight sticks, wheels or separate pedals to have a two-stick layout.

Standard input here covers four stick axes, 17 standard buttons, analog trigger values
when provided by hardware, two logical slots and reconnect/assignment behavior. A pad
with digital triggers cannot supply analog precision. Single Joy-Cons, retro pads and
accessibility setups can expose fewer physical controls. Gyro, touch coordinates,
extra paddles, adaptive triggers and vendor software features are not promised by this
input contract. Rumble availability depends on the exposed actuator and robot support.

## Keyboard controller

Choose **Keyboard** in Controller 1 to use the displayed physical-key bindings.
Mapped keys, including arrows and Space, drive the virtual gamepad without scrolling
or activating page controls. This also applies inside the controller test dialog.
Text fields keep normal typing and cursor movement; Ctrl/Command/Alt shortcuts
remain available. Choose **Controller** to restore normal page key handling.

## Calibration and Steam Deck navigation

Open either controller, then **Calibration**. Live plots show reported raw stick
positions, recent travel and per-axis extrema. **Measure drift · 3 seconds** records
peak resting movement while the sticks are released. It suggests a radial app
deadzone with a small margin; large movement invalidates the recommendation.
**Apply deadzone**, **Use measured recommendation**, and **Reset to 0%** are explicit
saved changes. Defaults remain zero. Values are stored by driver ID outside the
installation; identical driver names share a preference. This is software drift
filtering, not firmware/Steam calibration. OS/Steam filtering can already affect
the reported raw values. Settings/testing continues to hold robot output neutral;
release the sticks before driving after applying a change.

On a detected Steam Deck, expand **Steam Deck trackpads & back paddles**. Launch
the app through Steam and use **Gamepad with Mouse Trackpad**, then set right pad
to mouse/left click, left pad to scroll/right click. Leave sticks, triggers,
bumpers, face buttons and D-pad mapped to gamepad outputs. Enable back grips and
map them to robot gamepad buttons such as A/B/X/Y. Extra button indices 17–23 are
shown when actually reported. Steam Input's emulated Xbox pad does not expose
every Deck control independently; the app cannot manufacture missing paddle or
trackpad reports. This one-time per-app layout is configured in Steam, not by
rewriting the global desktop layout. The dashboard and robot website accept the
resulting pointer events while gamepads remain reserved for the robot.

See [Valve's legacy input bindings](https://partner.steamgames.com/doc/features/steam_controller/legacy_mode)
and [Steam Deck desktop controls](https://help.steampowered.com/en/faqs/view/671a-4453-e8d2-323c).

## Evidence and remaining device checks

The [100-profile catalog](CONTROLLER-PROFILES.md) contains source-documented device/mode
IDs. Tests inject synthetic normalized reports and exercise discovery, both slots,
reconnection and native Electron-to-robot forwarding of axes/buttons. Additional
unknown-brand cases verify no allowlist is required. Tests also cover raw-layout output
suppression and live Nintendo labels. These verify dashboard behavior after mapping;
they do not run Chromium's OS driver mappers or test physical radio stability.

Physical Steam Deck/Windows/Apple Silicon pairing and each real controller remain
hardware checks. No claim is made that the “top 100” market models were physically tested.

Sources: [W3C Gamepad mapping](https://w3c.github.io/gamepad/#remapping),
[Chromium gamepad implementation](https://chromium.googlesource.com/chromium/src/+/main/device/gamepad/),
and the pinned source URLs in the regression catalog. Chromium distinguishes known
device IDs from supported mappings; a database entry alone is not proof of support.
