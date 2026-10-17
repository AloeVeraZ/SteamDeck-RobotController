# FTC robots (REV Control Hub / Robot Controller)

Deck Driver Station includes its own FTC Driver Station. Open an FTC robot the same way as
any other robot: join its Wi-Fi in **Settings**, enter its address (a Control Hub is usually
`192.168.43.1`), and press **Open robot**. No robot type is chosen.

## How the app tells robots apart

When an address is opened for the first time, the app sends an FTC *peer discovery* message
to UDP port 20884. A Robot Controller always answers it, so:

- **Answer received** → the robot is saved as **FTC** and the Driver Station opens in Drive.
- **No answer within 1.5 s** → the robot is saved as a **Website** and its own page opens.

The type is remembered with the saved address, so later opens skip the check. Editing the
address clears the remembered type and the check runs again. The FTC robot's code stays on the
robot; the op mode list, telemetry, and controls come from the robot over the network.

## The Driver Station

| Area | What it does |
| --- | --- |
| Top bar | Robot name, connection, ping, robot battery voltage (green / yellow below 12 V / red below 11 V), User 1 and User 2 gamepads, ⋮ menu |
| ◀ Auto / TeleOp ▶ | Lists the robot's Autonomous or TeleOp op modes, grouped like the FTC Driver Station |
| INIT → START → STOP | One large button walks through the op mode lifecycle; the small ■ button aborts INIT |
| 30 s timer | Shown for Autonomous op modes; on by default, stops the op mode after 30 s. Tap to toggle |
| Telemetry | The op mode's telemetry (classic, monospace, and HTML display formats), plus robot errors and warnings |
| ⋮ menu | Restart Robot, Program & Manage, Camera Stream, Gamepad assignment, About |

- **Gamepads:** like the FTC Driver Station, press **START + A** to make a gamepad User 1
  (`gamepad1`) or **START + B** for User 2 (`gamepad2`). On Steam Deck, START is the ☰ button.
  Inputs are sent only after assignment, and only while the Driver Station is visible and
  focused. Opening Settings, a dialog, or another window sends the gamepads back to rest.
- **Auto-transition:** when an Autonomous op mode with `autoTransition` stops, its TeleOp is
  selected and initialized automatically.
- **Program & Manage** opens the Robot Controller's own web page (port 8080) above the Driver
  Station; **← Driver Station** in the toolbar returns. The robot connection stays up.
- **Space** stops an initialized or running op mode.
- Rumble, robot toasts, dialogs, crash stack traces, progress, text-to-speech, and camera
  frames from the robot are shown or played.

## Safety behavior

- Closing the robot, switching Wi-Fi, or quitting sends STOP before the connection closes.
  The robot also stops on its own when it hears nothing for 2 seconds.
- Settings hides the Driver Station without disconnecting, so a running op mode keeps running
  with gamepads at rest. Use STOP first if the robot should not move.
- If another Driver Station is already connected, the robot refuses this one and the screen
  says so; nothing is sent to the robot.

## Compatibility and limits

- Speaks Robocol, the FTC SDK network protocol, version 124 (SDK 10.x–11.x). Robots on other
  recent SDK versions are matched automatically; versions before 121 are refused.
- One Driver Station app per computer: the protocol requires UDP port 20884. Close other FTC
  Driver Station apps or emulators first. Windows may ask to allow the app on private networks.
- This is an independent implementation written from the published FTC SDK sources. It is not
  the REV Driver Hub software and is not certified for FIRST competitions; event rules may
  require an official Driver Station.
- Not implemented: robot configuration editing, Wi-Fi channel/password changes, firmware
  updates, Self Inspect, match logging, and gamepad LED effects.

## Testing without a robot

```bash
node tools/ftc-sim.cjs 127.0.0.2
```

This runs a simulated Control Hub on `127.0.0.2`. Open that address in the app or the browser
preview. `node --test tests/ftc.test.cjs` covers the protocol, and `node tests/ftc-app.cjs`
drives the desktop app against the simulator.
