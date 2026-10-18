# Controller support

The driver station owns controller discovery, assignment and testing. A robot website
does not need its own assignment prompt: it reads logical slots 0/1 through the standard
Gamepad API. The bundled FTC station translates those slots to Robocol User 1/2. A
website that has no Gamepad API input handler still needs a robot-specific integration;
the dashboard cannot infer motor commands from an arbitrary page.

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
