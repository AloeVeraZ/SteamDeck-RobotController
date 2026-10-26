# FTC hardware catalog for Deck: hubs, motors, servos, sensors, configuration XML

Research for the "same actions on the robot" work. Written 26 October 2026. This is read-only research: no repo file was changed.

**How the facts were checked.**
- **FTC SDK.** Every XML tag, motor parameter, port count, constant and Java signature below was read from FIRST's own FTC SDK libraries with `javap`. These were Hardware, RobotCore and FtcCommon **12.0.0**, the latest release on Maven Central (https://repo1.maven.org/maven2/org/firstinspires/ftc/Hardware/maven-metadata.xml).
  - Older AARs were checked for "since" versions: RobotCore 10.0.0, 10.2.0, 10.3.0, 11.0.0 and 11.1.0, and Hardware 9.2.0 to 11.1.0.
  - The AARs were downloaded to the scratchpad, not the repo.
- **Vendors.** Vendor figures come from REV's GitBook pages, read as `.md` files (https://docs.revrobotics.com/llms.txt), and from Axon, goBILDA, SparkFun, DigitalChickenLabs, Limelight and gm0.
- **Rules.** Legality comes from FIRST's **2026-27 Inspection Quick Reference, revision 26-27.1** (https://ftc-resources.firstinspires.org/ftc/event/inspection-reference).
- **Real configuration files.** Configurations saved by real teams were read on GitHub to confirm the XML format.

The file extends `docs/MECHANISM_RESEARCH.md` §8 and `ui/sim-actuators.js`, and does not repeat their servo and motor figures except where a field is added, such as `xmlType` or feedback.

---

## 0. Summary for the implementer

1. **Motor types.** A REV hub knows 14 motor XML types, plus the legacy alias `RevRoboticsHDHexMotor`. `ui/ftc/robot-config.js` already lists all of them (line 9).
   - The motor type only changes the SDK's ticks/rev and max RPM, which are used for `RUN_USING_ENCODER` power scaling, and its default PIDF.
   - It does not change `getCurrentPosition()` or RUN_TO_POSITION. Those use raw counts from the encoder, so Deck must keep using its own CPR (`DeckActuators.MODELS[id].cpr`).
2. **Sensors use three port kinds that Deck does not track yet.**
   - **Analog**: 4 channels on 2 connectors. Axon feedback, potentiometers and absolute encoders go here.
   - **Digital**: 8 channels on 4 connectors. Touch sensors and limit switches go here.
   - **I2C**: color, distance, Pinpoint, OTOS, OctoQuad and HuskyLens go here.
   - **Gaps in `robot-config.js`.**
     - `PORTS` (line 91) has no analog or digital entry.
     - `portsTaken` (line 107) returns `[]` for them.
     - `kindOf` (line 15) calls them all `'other'`.
     - `FAMILY_ORDER` (line 180) has no analog or digital slot.
     - `EthernetDevice` (the Limelight) is in `CONTAINERS` (line 14), so a Limelight is never parsed as a device.
3. **Wiring rules a planner must respect.**
   - A REV Touch Sensor works only on **odd** digital channels (the n+1 wire).
   - The REV Potentiometer works only on **even** analog channels (the n wire).
   - High-CPR encoders, such as the Through Bore at 8192 counts/rev, belong on motor-encoder ports **0 or 3**. Those two ports are hardware-decoded.
   - The internal IMU sits on **I2C bus 0** at address 0x28.
4. **Axon servos** have a 4th wire with analog position feedback. It goes into an analog channel configured as `AnalogInput`.
   - Community code maps it as `angle = (1 − V/3.3)·360° − offset`, with a wrap at 0 / 3.3 V.
   - Swerve teams' real configurations put CR Axons on a Servo Hub and the 4 feedback wires on analog 0 to 3.
   - Axon's own "Analog Output" page still says "Docs coming soon!", so the mapping must be calibrated on the robot.
5. **The REV Through Bore absolute (PWM) output cannot be read by a hub.** REV says so explicitly. It can only be read through an OctoQuad in pulse-width mode. On a hub, use its quadrature output on a motor-encoder port.
6. **The XML order the SDK writes**, from `WriteXMLFileHandler$6`, is: motors, servos, analog inputs, PWM outputs, digital devices, I2C devices.
   - Webcams and `EthernetDevice`s sit directly under `<Robot>`.
   - Servo Hubs are `<ServoHub name port>` elements inside the `LynxUsbDevice`, beside the `LynxModule`s.

---

## 1. Hub topology

### 1.1 Control Hub (REV-31-1595) and Expansion Hub (REV-31-1153)

REV: "The IO ports of the Expansion Hub are identical in specification to the Control Hub."
Sources: https://docs.revrobotics.com/duo-control/control-system-overview/control-hub-basics.md and https://docs.revrobotics.com/duo-control/control-system-overview/expansion-hub-basics.md.

| Port | Count / numbering | Connector | Electrical | SDK constant (LynxConstants, 12.0) |
|---|---|---|---|---|
| Motor | 4, ports 0–3 | JST VH 2-pin | 10 A continuous, 20 A absolute (fuse-limited) | `NUMBER_OF_MOTORS=4`, `INITIAL_MOTOR_PORT=0` |
| Encoder (one per motor port) | 4, ports 0–3 | JST PH 4-pin | Quadrature, 0–3.3 V in, 3.3 V supply, 500 mA total | (part of the motor port; read through the `DcMotor` on that port) |
| Servo | 6, ports 0–5 | 0.1" header | **5 V**; 2 A per pair (0-1, 2-3, 4-5); 5 A total shared with the +5V ports; pulse 500–2500 µs | `NUMBER_OF_SERVO_CHANNELS=6` |
| +5V aux | 2 | 0.1" header | 5 V, 2 A per pair | — |
| Analog | **4 channels = 2 connectors × 2** ("0-1", "2-3") | JST PH 4-pin | Input **0–5 V** measured; power pin gives only **3.3 V**, 500 mA | `NUMBER_OF_ANALOG_INPUTS=4` |
| Digital | **8 channels = 4 connectors × 2** ("0-1", "2-3", "4-5", "6-7") | JST PH 4-pin | 0–3.3 V logic, 3.3 V supply, 1 A total; inputs pulled up | `NUMBER_OF_DIGITAL_IOS=8` |
| I2C | 4 buses, 0–3 (each port is its own bus) | JST PH 4-pin | 3.3 V, 100/400 kHz, 2.49 kΩ pull-ups, 500 mA | `NUMBER_OF_I2C_BUSSES=4`, **`EMBEDDED_IMU_BUS=0`** |
| RS485 | 2 | JST PH 3-pin | Adds an Expansion Hub or Servo Hub | — |
| UART | 2 | JST PH 3-pin | Debug only | — |
| USB | Control Hub: USB-C (PC), USB 2.0 A, USB 3.0 A (cameras, Limelight), HDMI. Expansion Hub: Mini-USB | | | |

**Channel rules (REV).** On a 4-pin sensor cable, the blue wire is channel **n** (the even number) and the white wire is channel **n+1** (the odd number).
- Digital: "The n+1 channel operates on odd-numbered ports 1-7 and the n channel operates on the even number ports 0-6."
- Analog: n+1 is on ports 1 and 3, and n is on ports 0 and 2.
- A splitter cable (REV-31-1386) puts two sensors on one connector.

Sources: https://docs.revrobotics.com/duo-control/sensors/digital.md and https://docs.revrobotics.com/duo-control/sensors/analog.md.

**Analog range: an important nuance.**
- The hardware measures 0–5 V ("The Control Hub and Expansion Hub can read voltages ranging from 0V to 5V").
- The SDK's `LynxAnalogInputController.getMaxAnalogInputVoltage()` returns the **constant 3.3** (javap: `ldc2_w 3.3d; dreturn`), so `AnalogInput.getMaxVoltage()` is always 3.3.
- gm0 agrees: "Although getMaxVoltage() returns 3.3v, the expansion and control hub analog input ports can safely handle up to 5v" (https://gm0.org/en/latest/docs/software/getting-started/common-hardware-components.html).
- A sensor powered from the hub's own 3.3 V pin swings 0–3.3 V. A 5 V sensor, such as a US Digital MA3, needs a custom harness for its 5 V power.

**Encoder ports 1 and 2 decode in software.** gm0: "ports 0 and 3, the two ports connected to the special quadrature ports, will always read accurately. Ports 1 and 2 are connected to the less accurate 'software' ports, meaning that with high CPR encoders (encoders that produce more than 4000 counts per revolution, such as the REV Through Bore Encoder…) they can 'lose steps' and drift" (https://gm0.org/en/latest/docs/software/adv-control-system/sdk-motors.html).
- `DcMotorEx.getVelocity()` is a 16-bit signed number of ticks per second. At 8192 counts/rev it saturates above 32767/8192 × 60 ≈ **240 rpm**.
- The hub computes velocity from a 5-sample ring buffer at 10 ms intervals (same gm0 page).

**Internal IMU (REV).** It is "Internally connected to I2C port 0 and configured to address 0x28."
- Control Hubs: BHI260AP since September 2022, BNO055 before that.
- **Expansion Hubs shipped after 1 December 2021 have no IMU.**
- The XML tags are `ControlHubImuBHI260AP` and `LynxEmbeddedIMU` (the BNO055). `LynxConstants` has these as `EMBEDDED_BHI260AP_IMU_XML_TAG` and `EMBEDDED_BNO055_IMU_XML_TAG`.

Source: https://docs.revrobotics.com/duo-control/sensors/i2c/imu.md.

**Addresses (LynxConstants).**
- A Control Hub's embedded module is `CH_EMBEDDED_MODULE_ADDRESS=173`.
- `MAX_UNRESERVED_MODULE_ADDRESS=10`.
- `DEFAULT_PARENT_MODULE_ADDRESS=1`.
- REV: Expansion Hubs default to address 1 or 2, and Servo Hubs to 3. Every hub on the RS485 chain needs a unique address in 1–10.
- If an Expansion Hub is configured at 173, the SDK refuses it (string in `LynxUsbDeviceConfiguration`).

**Bulk reads.** Encoder position and velocity, digital and analog inputs are all returned by a single bulk read. **I2C is not.**
- Set `LynxModule.setBulkCachingMode(AUTO|MANUAL)`.
- Each hardware call takes about 3 ms, and an I2C call 7 ms or more (https://gm0.org/en/latest/docs/software/tutorials/bulk-reads.html).
- This matters for how many color sensors a loop can afford.

### 1.2 REV Servo Hub (REV-11-1855)

Sources: https://docs.revrobotics.com/rev-crossover-products/servo/servo-hub.md, …/configuring-the-servo-hub-with-a-control-hub.md, …/channel-power.md, …/servo-hub-wiring.md, and https://www.revrobotics.com/rev-11-1855/.

- It has **6 servo channels (0–5)** and connects over **RS485** (FTC), USB-C (configuration) or CAN.
- **Power.**
  - Input is 7–15 V. Total output is **15 A**, about 3 A per channel pin.
  - The output voltage is configurable: the product page says "5V - 7.4V (6V Default)", and the docs say 0.5–7.4 V. It is **6 V by default**, against 5 V on a hub's own ports.
- **Not reachable from the FTC SDK:** per-channel current measurement, switching a channel's power at run time, and changing the voltage. "Channels are always powered when enabled."
- Its pulse range is 500–2500 µs, with min, max and center configurable in the REV Hardware Client.
- It needs Robot Controller and Driver Station apps **10.0 or later**. The SDK 10.0.0 RobotCore already has `ServoHubConfiguration`.
- Default ID 3, settable to 1–10 for FTC. It appears inside the portal like an Expansion Hub.
- **XML:** `<ServoHub name="Servo Hub 3" port="3">` holds `<Servo|ServoFullRange|ContinuousRotationServo name=… port="0..5" />`.
  - It sits inside `<LynxUsbDevice>`, as a sibling of the `<LynxModule>`s.
  - The SDK writes only `getServos()` for it (`WriteXMLFileHandler$6`).
- **Wiring:** ports 0–2 are mirrored by ports 3–5. The ground pin faces the outer edge.
- **Legal (2026-27):** "servos can only be controlled by core power regulating devices (REV Control Hub, REV Expansion Hub, REV Servo Hub)."

### 1.3 REV Servo Power Module (REV-11-1144; part number from memory, not re-checked) and other legal power devices

Source: https://docs.revrobotics.com/rev-crossover-products/servo/spm.md.

- **Power:** 6 V, 90 W, 6 channels; 15 A total, about 3 A per channel. Input 7–20 V (12 V nominal); it needs at least 9 V to start.
- It is a **signal pass-through**: it powers each servo at 6 V while the hub's PWM still sets position.
- The inspection reference 26-27.1 also names the **Studica Servo Power Block** as an allowed pass-through.
- **Illegal:**
  - goBILDA Servo Travel Tuner;
  - goBILDA Servo Power Distribution Board (8 Channel);
  - goBILDA 4-Channel Servo Extension via CAT6.
- **REV SPARKmini** (a motor controller driven from a servo port) is the SDK type `RevSPARKMini`: `@ServoType(flavor=CONTINUOUS, usPulseLower=500, usPulseUpper=2500, usPulseFrameRate=5500)`. It is used from code as a `DcMotorSimple` or `CRServo`.
- **REV Blinkin** is the type `RevBlinkinLedDriver`, `@ServoType(flavor=CUSTOM, 500–2500 µs)`, on a servo port.

### 1.4 Servo ports and the SDK pulse range

From the SDK 12.0 annotations on `com.qualcomm.robotcore.hardware.Servo` and `PwmControl.PwmRange`:

| XML tag | Flavor | Default pulses the SDK sends for 0 and 1 | Notes |
|---|---|---|---|
| `Servo` | STANDARD | **600–2400 µs**, 20 000 µs frame (`usPulseLowerDefault`, `usPulseUpperDefault`, `usFrameDefault`) | The default "Servo" in Configure Robot |
| `ServoFullRange` | STANDARD | **500–2500 µs** | "Servo (full range)" in Configure Robot. **New in SDK 10.3.0** (absent in 10.2.0) |
| `ContinuousRotationServo` | CONTINUOUS | 600–2400 µs (annotation default) | `CRServo` (extends `DcMotorSimple`) |
| `RevSPARKMini` | CONTINUOUS | 500–2500 µs, 5500 µs frame | Motor controller |
| `RevBlinkinLedDriver` | CUSTOM | 500–2500 µs | LED driver |

- `ServoImplEx` (every hub servo is one) has `setPwmRange(new PwmRange(lo, hi[, frame]))`, `getPwmRange()`, `setPwmEnable()`, `setPwmDisable()` and `isPwmEnabled()`.
  - **SDK 12.0 added `setPulseWidth(double)` and `getPulseWidth()`** to `PwmControl`. They are absent in 11.1.0.
  - `Servo` has `setPosition`, `getPosition` (the target, not the measured angle), `setDirection` and `scaleRange(min, max)`.
- gm0: the hub's 5 V servo power is off until the first servo command, and `setPwmDisable()` can turn the pair's power off. goBILDA servos and REV Smart Robot Servos go limp when PWM is disabled.

---

## 2. Motors

### 2.1 Legal motors, 2026-27 (Inspection Quick Reference 26-27.1)

"Remember any transmission or gearbox is allowed to be used with a motor." The legal motors are:
- AndyMark NeveRest 12V DC and NeveRest Hex 12V DC;
- goBILDA YellowJacket 12V DC;
- Modern Robotics/MATRIX, which is now goBILDA 5000-series;
- NFR Products Yuksel 12V DC;
- REV Robotics Core Hex 12V DC and HD Hex 12V DC;
- Studica Robotics Maverick 12V DC;
- SWYFT Robotics SWYFT Spike Motor;
- Tetrix MAX DC 12V Motor and Tetrix MAX TorqueNADO 12V DC;
- WATTOS Stingray DC 12V Motor.

The SWYFT Spike, NFR Yuksel and WATTOS Stingray have no SDK type of their own, and their CPR was not found online. They should be configured as `Motor` (unspecified), with the CPR entered by the team.

### 2.2 SDK motor XML types (javap of `@MotorType` and `@DeviceProperties`, Hardware 12.0.0)

`@MotorType.achieveableMaxRPMFraction` defaults to **0.85**, and `orientation` defaults to CW.

| `xmlType` | Class | ticksPerRev | gearing | maxRPM | orientation | Distributor model |
|---|---|---|---|---|---|---|
| `Motor` | `UnspecifiedMotor` ("Unspecified Motor") | 1440 | 52 | 165 | CW | — |
| `goBILDA5201SeriesMotor` | `GoBILDA5201Series` | 1500 | 54 | 104 | CCW | goBILDA-5201 |
| `goBILDA5202SeriesMotor` | `GoBILDA5202Series` ("GoBILDA 5202/3/4 series") | 2786 | 99.5 | 60 | CCW | goBILDA-5202 |
| `Matrix12vMotor` | `Matrix12vMotor` | 1478.4 | 52.8 | 190 | CW | MR 50-0120 |
| `NeveRest20Gearmotor` | `NeveRest20Gearmotor` | 560 | 20 | 315 | CW | am-3102 |
| `NeveRest3.7v1Gearmotor` | `NeveRest3_7GearmotorV1` | 44.4 | 3.7 | 1784 | CCW | am-3461 |
| `NeveRest40Gearmotor` | `NeveRest40Gearmotor` | 1120 | 40 | 160 | CCW | am-2964a |
| `NeveRest60Gearmotor` | `NeveRest60Gearmotor` | 1680 | 60 | 105 | CCW | am-3103 |
| `RevRobotics20HDHexMotor` | `RevRobotics20HdHexMotor` | 560 | 20 | 300 | CCW | REV-41-1301 |
| `RevRobotics40HDHexMotor` | `RevRobotics40HdHexMotor` | 1120 | 40 | 150 | CCW | REV-41-1301 |
| `RevRoboticsHDHexMotor` | legacy tag: `ConfigurationTypeManager.LEGACY_HD_HEX_MOTOR_TAG`, read as `RevRobotics40HDHexMotor` | — | — | — | — | — |
| `RevRoboticsCoreHexMotor` | `RevRoboticsCoreHexMotor` | 288 | 36.25 | 137 | CCW | REV-41-1300. It also has `@ExpansionHubMotorControllerVelocityParams(P=10, I=3, D=0)` and `PositionParams(P=10, I=0.05, D=0)` |
| `RevRoboticsUltraplanetaryHDHexMotor` | `RevRoboticsUltraPlanetaryHdHexMotor` | 560 | 20 | 300 | CW | REV-41-1600 |
| `StudicaMaverick` | `StudicaMaverickMotor` | 1464 | 61 | 100 | CW | Studica 75001 |
| `TetrixMotor` | `TetrixMotor` | 1440 | 52 | 165 | CW | Pitsco W39530 |

**What the type changes.**
- **RUN_USING_ENCODER and `setPower`.** The SDK scales power to a velocity of `ticksPerRev × maxRPM × 0.85 / 60` ticks/s.
  - Within one motor family that product does not depend on the ratio: goBILDA 2786 × 60 ≈ 537.7 × 312 ≈ 167 k ticks/min.
  - So picking `goBILDA5202SeriesMotor` for any Yellow Jacket ratio is right, and so is `RevRoboticsUltraplanetaryHDHexMotor` for any UltraPlanetary stack.
- The type also sets the default velocity and position PIDF.
- **What it does not change:** `getCurrentPosition()`, `setTargetPosition()` and `getVelocity()` use raw encoder ticks. Deck's own counts per output turn (`ui/sim-actuators.js` MOTORS, `cpr`) are what the generated code must use.

### 2.3 Deck's motor models → xmlType (to add as a field on `ui/sim-actuators.js` MOTORS, lines 56–76)

The figures (free rpm at 12 V, counts per output turn, stall N·m) already live in `ui/sim-actuators.js` and are sourced in MECHANISM_RESEARCH §8. They are repeated here only where they matter.

| Deck id | xmlType | cpr | rpm | Notes |
|---|---|---|---|---|
| `gobilda-5203-6000` … `gobilda-5203-30` (all 11 ratios) | `goBILDA5202SeriesMotor` | 28 × ratio: 28, 103.8, 145.1, 384.5, **537.7** (19.2:1, 312 rpm), 751.8, 1425.1, 1993.6, 2786.2, 3895.9, 5281.1 | 6000…30 | 19.2:1 is exactly (1+46/17)(1+46/11) = 19.2032, and × 28 = 537.69. The **5204 series** (80 mm length) has the same ratios and CPR (https://core-electronics.com.au/5204-series-yellow-jacket-planetary-gear-motor-1921-ratio-80mm-length-8mm-rex-shaft-312-rpm-33-5v-encoder.html) |
| (new) `gobilda-5201-*` spur | `goBILDA5201SeriesMotor` | vendor | vendor | Older kits only |
| `rev-hd-hex` and `rev-ultra-*` | `RevRoboticsUltraplanetaryHDHexMotor` | 28 × real ratio (2.89 = 84:29, 3.61 = 76:21, 5.23 = 68:13); for example "20:1" = 530.05 and "60:1" = 1535.3 | | Real ratios from https://docs.revrobotics.com/rev-crossover-products/ultraplanetary/cartridge-details.md |
| `rev-hd-hex-20` | `RevRobotics20HDHexMotor` | 560 | 300 | |
| `rev-hd-hex-40` | `RevRobotics40HDHexMotor` | 1120 | 150 | |
| `rev-core-hex` | `RevRoboticsCoreHexMotor` | 288 | 125 | REV: 72:1, encoder 4 counts per motor turn (https://docs.revrobotics.com/duo-control/sensors/encoders/motor-based-encoders.md). The SDK type says 137 rpm |
| `torquenado` | `TetrixMotor` (or `Motor`) | 1440 | 100 | The SDK has no TorqueNADO type |
| `studica-maverick` | `StudicaMaverick` | 1464 (61:1) | 100 | Studica now lists other ratios too; 24 counts per motor turn × ratio (one listing shows 50.9:1 at 1221.6) |
| `neverest-20` | `NeveRest20Gearmotor` | 537.6 | 340 | Orbital 20 |
| `neverest-40` | `NeveRest40Gearmotor` | 1120 | 160 | |
| (new) `neverest-60` | `NeveRest60Gearmotor` | 1680 | 105 | |
| (new) `neverest-3.7` | `NeveRest3.7v1Gearmotor` | 44.4 | 1784 | |
| (new) `matrix-12v` | `Matrix12vMotor` | 1478.4 | 190 | |
| (new) `swyft-spike`, `nfr-yuksel`, `wattos-stingray`, `other-motor` | `Motor` | team-entered | team-entered | Legal for 2026-27, but no SDK type and no published CPR found |

---

## 3. Servos (position, continuous, linear) and servo feedback

### 3.1 Pre-verified servos, 2026-27 (Inspection Quick Reference 26-27.1)

R502 sets the limits: "Servos must be 8W or less maximum mechanical power at 6V, and have 4A or less Max Stall Current". Linear servos must stall at 1 A or less at 6 V. A servo not on the list needs the maker's documentation. All figures below are at 6 V.

| Servo | SKU | s/60° | kg·cm | Stall A | W | In `sim-actuators.js` |
|---|---|---|---|---|---|---|
| Axon MAX+ / MAX MK2 | — | 0.115 | 34 | 4 | 7.59 | `axon-max` |
| Axon MINI+ / MINI MK2 | — | 0.09 | 25 | 3.8 | 7.13 | `axon-mini` |
| Axon Micro+ | — | 0.075 | 7.8 | 2.2 | 2.67 | `axon-micro` |
| goBILDA 2000 Dual Mode Torque | 2000-0025-0002 | 0.2 | 21.6 | 2.5 | 2.77 | `gobilda-torque` |
| goBILDA 2000 Dual Mode Speed | 2000-0025-0003 | 0.09 | 9.3 | 2.5 | 2.65 | `gobilda-speed` |
| goBILDA 2000 Dual Mode Super Speed | 2000-0025-0004 | 0.043 | 4.7 | 2.5 | 2.81 | `gobilda-superspeed` |
| REV Smart Servo | REV-41-1097 | 0.14 | 13.5 | 2 | 2.48 | `rev-smart` |
| REV SRS V2 Balanced | REV-41-3334 | 0.2 | 13.5 | 2.1 | 1.73 | (the old one's figures) |
| REV SRS V2 UltraSpeed | REV-41-3336 | 0.043 | 5.6 | 2.9 | 3.34 | `rev-smart-ultra` |
| Studica Multi-Mode Smart Servo | 75002 | 0.2 | 21.6 | 1.8 | 2.77 | `studica-multimode` |
| Studica Multi-Mode Smart Servo 200 FAST | 75007 | 0.046 | 5 | 2.7 | 2.79 | **missing** |
| Tetrix MAX (HiTec HS-485HB) | 39197 | 0.18 | 6 | 1.2 | 0.86 | `hitec-485` |
| SWYFT Balance / Nano / Slim / Speed / Torque | SR-Servo-02/05/04/01/03 | 0.092 / 0.110 / 0.075 / 0.062 / 0.112 | 27.3 / 10.2 / 14 / 19 / 33.5 | 2.7 / 2.0 / 2.4 / 2.7 / 2.7 | 7.53 / 2.38 / 4.79 / 7.87 / 7.68 | **missing** (travel not published here) |
| PLEX Speed / Torque Brushless | PLEX-09-0017-0001/2 | 0.067 / 0.095 | 18 / 28 | 3.9 | 6.90 / 7.57 | **missing** |
| TORCTEX MAX / PRO / MICRO | — | 0.115 / 0.09 / 0.075 | 34 / 25 / 7.8 | 4 / 3.8 / 2.2 | — | **missing** (same figures as Axon MAX, MINI and MICRO) |
| MATA TORQUE | — | 0.115 | 34 | 4 | 7.59 | **missing** |
| Others listed | | | | | | DSSERVO DS32xx, FEETECH FT5335M-FB, HiTec HSR-M9382TH, Miuzei DS3218, AndyMark am-4954/4955/4343, AGFRC, Melonbotics Super Servo Plus, TIANCONGRC TD-8125MG, Tower Pro MG90S/MG995/MG996R |

**Known illegal:** AGFRC A73BHLW V2, DSSERVO DS3225PRO, Hitec HS-805BB and Smraza SC55-NA.

**Linear servos (pre-verified):**
- Actuonix Micro Linear Servo P8-100-252-12-R (0.45 A);
- Hitec HLS12-xx-6V family (0.5 A);
- Studica Linear Servo RC Actuator 75010–75015 (1 A).

The Actuonix **L16-R**, which is Deck's default `actuonix-l16-50`, is **not** on the 26-27 pre-verified list. It needs documentation under R502.

### 3.2 Axon MAX/MINI MK2 (current) and MAX+/MINI+/MICRO+ (discontinued)

From Axon's docs: https://docs.axon-robotics.com/servos/max.md, …/servos/mini.md, …/archive/max.md, …/archive/mini.md and …/archive/micro.md.

- MK2: "4.8V to 8.4V operating voltage, **500us to 2500us PWM Range, 360° max range**".
  - The modes are Servo, Continuous Rotation and Swerve ("coming soon"), set with Programmer MK2. Left and right limits, power limits, deadband and soft start are adjustable.
  - Deck's catalog uses 350° for these. Axon now states 360° as the maximum, with programmable limits, so offer a "range" override.
- Axon tables give figures at **4.8 V (the hub)** and at **6.0 V (the SPM or Servo Hub)**:

  | Servo | 4.8 V: s/60°, kg·cm | 6.0 V: s/60°, kg·cm | 7.4 V | 8.4 V |
  |---|---|---|---|---|
  | MAX | 0.140, 28 | 0.115, 34 | 0.100, 39 | 0.085, 45 |
  | MINI | 0.110, 20 | 0.090, 25 | 0.080, 30 | 0.068, 33 |
  | MICRO+ | 0.085, 6.5 | 0.075, 7.8 | 0.062, 9.2 | 0.055, 10.4 |

  The hub's own ports give 5 V, so the 4.8 V column is the better model on a hub servo port.
- **Wiring:** a 3-pin servo connector, plus an **additional Analog Output wire** (the "4th wire"). MAX+ and MINI+ list a "Hall effect encoder"; MICRO+ lists "Analog feedback".
- **Analog Output page** (https://docs.axon-robotics.com/servos/analog-output.md): "allows you to read the position of the servo with high precision in realtime… Docs coming soon!" There is still **no official voltage-to-angle table.**
- **How teams use it:**
  - Plug the 4th wire into a hub **analog** channel and configure it as `AnalogInput`.
  - "Axon sells jst boards so that you can plug in 2 axons per analog port on your hubs" (r/FTC, https://lr.in.psf.lt/r/FTC/comments/1fs4jq2/axon_servos).
  - Two real 2024-26 swerve configurations put four `ContinuousRotationServo`s on a `ServoHub` and four `AnalogInput`s on analog 0–3 of the Control Hub: Petelax/FTC16413-IntoTheDeep `TeamCode/src/main/res/xml/swerve.xml` and FTC-23511/Decode-2026-Safe `TeamCode/src/main/res/xml/decode.xml`.
- **Mapping used in the wild.** `AbsoluteAnalogEncoder` (KookyBotz CenterStage/PowerPlay; SolversLib copy in skandacode/DecodeV2) has `DEFAULT_RANGE = 3.3` and computes:

  ```java
  pos = norm((inverted ? V/range : 1 - V/range) * 2π - offset)
  ```

  So the default reading is **angle = (1 − V/3.3) × 360° − offset**, wrapping between 0 V and 3.3 V. The optional "value rejection" drops jumps near the wrap.
  - Sources: https://github.com/KookyBotz/CenterStage/blob/30ff374cda7469fc291d56dd3f947093a2c5b5db/TeamCode/src/main/java/org/firstinspires/ftc/teamcode/common/hardware/AbsoluteAnalogEncoder.java and https://github.com/skandacode/DecodeV2/blob/989f59fc5a98f6a43d0288fbf1348dd6851f356f/TeamCode/src/main/java/solverslib/hardware/AbsoluteAnalogEncoder.java.
- **Caveat** (Chief Delphi, https://www.chiefdelphi.com/t/fire-drive-ftc-swerve/483755): "when the servo draws power, there is a voltage drop on the ground line that is part of the reference for the analog out". Readings shift under load.
- **Recommendation for Deck:**
  - Model the feedback as `{port:'analog', vMin, vMax, degMin, degMax, wrap:true}`, defaulting to 0–3.3 V over 360° with the sign inverted.
  - Have the guided check measure `vAtCenter` and the sign by moving the servo to two positions and reading `AnalogInput.getVoltage()`.

### 3.3 Other servo notes

- **goBILDA 2000 Dual Mode:** 300° in servo mode, switched to continuous with goBILDA's programmer. The 5-Turn version (2000-0025-0503) travels 1800°.
- **REV Smart Robot Servo:** 270° by default. It is programmable to a custom angular range or continuous mode with the SRS Programmer (https://docs.revrobotics.com/duo-build/motion/servos/smart-robot-servo.md).
- **Studica Multi-Mode:** 300° by default.
- **Pulse range.** All of these servos are rated over 500–2500 µs, so the `ServoFullRange` tag or `setPwmRange(500, 2500)` gives their full travel. Deck already models this in `PWM.full`.
- **Linear servos are configured as `Servo`.**
  - L16-R: retracted at 1.0 ms, out at 2.0 ms.
  - HLS12: 1050–1950 µs.

---

## 4. Sensors

The table gives the port kind, XML type, Java class with its key calls, and what the sensor measures for a mechanism. "Since" means the first SDK whose Hardware AAR contains the driver class.

| Sensor | Port kind | XML tag | Java (`hardwareMap.get(X.class, name)`) and key calls | Measures, and what a mechanism uses it for |
|---|---|---|---|---|
| Built-in motor encoder (any legal motor) | motor-encoder port n (the same n as the motor) | the motor's tag | `DcMotorEx`: `getCurrentPosition()`, `getVelocity()` (ticks/s), `getVelocity(AngleUnit)`, `setMode(STOP_AND_RESET_ENCODER / RUN_TO_POSITION / RUN_USING_ENCODER / RUN_WITHOUT_ENCODER)`, `setTargetPosition`, `setTargetPositionTolerance` (default 5 = `LynxConstants.DEFAULT_TARGET_POSITION_TOLERANCE`), `setPositionPIDFCoefficients(p)`, `setVelocityPIDFCoefficients(p,i,d,f)`, `getCurrent(CurrentUnit)`, `setCurrentAlert`, `isOverCurrent()` | Relative position of a lift, arm or turret. Current draw can detect a stall or hard stop when homing |
| **REV Through Bore Encoder V1** (REV-11-1271, Broadcom AEAT-8800) | motor-encoder port, **0 or 3** | (none; read through the motor configured on that port) | `DcMotorEx.getCurrentPosition()` on that port. With no motor wired there, configure any motor type on the port as a placeholder | 2048 cycles = **8192 counts/rev**, plus an index pulse. The absolute PWM output (1025 µs period, 1–1024 µs = 0–360°, 10-bit) is **not readable** on a hub. Turret or arm angle at the joint, without gear lash. https://docs.revrobotics.com/rev-crossover-products/sensors/tbe/v1/specs.md |
| **REV Through Bore Encoder V2** (MPS MA600; REV's notes also mention REV-11-3174) | same | same | same | 8192 counts/rev, factory zero ±0.5°. Absolute PWM at 1 kHz, 3.884–998.06 µs, 12-bit (OctoQuad only). Supply 3.3–5 V, at most 10 000 rpm. Uses the JST-PH 6-pin → 4-pin cable REV-31-1815 (A and B only). https://docs.revrobotics.com/rev-crossover-products/sensors/tbe/specs.md |
| goBILDA odometry pods (4-bar 32 mm, swingarm 48 mm), 2000 counts/rev | motor-encoder port, or the Pinpoint's X/Y ports | (motor tag on that port), or the `goBILDAPinpoint` I2C device | As above, or the Pinpoint | 4-bar = 2000/(32π) = **19.894 ticks/mm**; swingarm = 2000/(48π) = **13.263 ticks/mm** (the SDK has these as `GoBildaPinpointDriver.GoBildaOdometryPods` 19.894367 and 13.262912). Deck already handles pods |
| **REV Potentiometer** (REV-31-1155) | **analog, channel n only (ports 0 or 2)** | `AnalogInput` | `AnalogInput.getVoltage()` | 270° shaft angle, read on a 5 mm hex. **Not linear on a hub:** `V = 445.5(θ−270)/(θ²−270θ−36450)`. Inverse (V > 0): `θ = [(270V+445.5) − √((270V+445.5)² − 4V(120285−36450V))]/(2V)`, with θ = 270° at 0 V. Checked: 0°→3.30 V, 45°→2.152, 90°→1.523, 135°→1.100, 180°→0.762, 225°→0.430, 270°→0. REV recommends recording the voltage at each real position. Arm angle with no homing needed. https://docs.revrobotics.com/rev-crossover-products/sensors/potentiometer/application-examples.md |
| **Axon servo feedback wire** | analog (n or n+1, using Axon's JST board for 2 per connector) | `AnalogInput` | `getVoltage()` | Servo output angle (§3.2). Confirms a claw or wrist reached its position; absolute swerve azimuth |
| AndyMark HexBore absolute encoder (am-5200, FTC version) | analog (absolute) **or** motor-encoder port (quadrature) | `AnalogInput` / motor port | `getVoltage()` / `getCurrentPosition()` | Quadrature 4096 counts/rev; PWM 12-bit; **analog 0 to about 1 V** ("scale factor to 3.3V: 3.125"); supply 3.3–16 V; factory zero at the notch; JST-PA 4-pin → JST-PH 4-pin cable. https://docs.andymark.com/ftc-electronics/ftc-sensors/hexbore-absolute-encoder-am-5200/specifications |
| US Digital MA3 (am-2899), Thrifty absolute magnetic encoder | analog | `AnalogInput` | `getVoltage()` | Absolute angle. The output is ratiometric to its supply (https://docs.thethriftybot.com/absolute-encoder/setup-guide/getting-set-up/using-with-3.3v). The MA3 is a 5 V part and needs a custom 5 V harness (REV analog note) |
| **REV Touch Sensor** (REV-31-1425) | **digital, n+1 only (odd channels 1, 3, 5, 7)** | `RevTouchSensor` (or `DigitalDevice`) | `TouchSensor.isPressed()` (javap: `return !getDigitalChannelState(port)`), `getValue()`; or `DigitalChannel.getState()`, which is **true when not pressed** | Active-low: 3.3 V when released, 0 V when pressed. Home or limit for an arm or lift; a game piece seated. https://docs.revrobotics.com/rev-crossover-products/sensors/touch-sensor/specs.md |
| **REV Magnetic Limit Switch** (REV-31-1462) | digital, n **or** n+1 | `RevTouchSensor` or `DigitalDevice` | same | Normally open, active-low, omnipolar. Triggers at 10 mm (top) or 5 mm (side) with the included magnet, 5 mm hysteresis; 3.3–5 V. Non-contact home for slides and turrets. https://docs.revrobotics.com/rev-crossover-products/sensors/magnetic-limit-switch/specs.md |
| goBILDA limit switches (3103-0001-0001/-0002), generic microswitch | digital | `DigitalDevice` | `DigitalChannel` with `setMode(DigitalChannel.Mode.INPUT)` (the default), `getState()` | Wire common to ground and normally-open to the signal pin. The ports are pulled up, so pressed reads false (gm0) |
| **REV Color Sensor V3** (REV-31-1557, Broadcom APDS-9151) | I2C, any bus; 7-bit address **0x52** (`BroadcomColorSensor.BROADCOM_APDS9151_ADDRESS = I2cAddr.create7bit(82)`) | `RevColorSensorV3` | `RevColorSensorV3` / `NormalizedColorSensor.getNormalizedColors()` (RGBA), `setGain(float)`; `ColorSensor.red()`, `green()`, `blue()`, `alpha()`; `DistanceSensor.getDistance(DistanceUnit.CM)`; `getLightDetected()`, `rawOptical()` | Color (best within 2 cm) and proximity (1–10 cm, rough, depends on reflectivity). **A game piece present and its color**: an intake that is full, sorting. https://docs.revrobotics.com/rev-crossover-products/sensors/color-sensor/specs.md |
| REV Color Sensor V2 (older) | I2C | `LynxColorSensor` | same interfaces | Same uses |
| **REV 2m Distance Sensor** (REV-31-1505, ST VL53L0X) | I2C; REV lists "0x52" (the SDK creates it as **8-bit 0x52 = 7-bit 0x29**) | `REV_VL53L0X_RANGE_SENSOR` | `Rev2mDistanceSensor` / `DistanceSensor.getDistance(DistanceUnit)`. Returns `DistanceSensor.distanceOutOfRange` when nothing is in range | 5–200 cm, 1 mm resolution, 25° field of view. Slide extension, distance to a wall, a piece in a hopper. REV says the Color V3 and the 2m sensor "cannot be hosted on the same bus". By the SDK addresses they differ, but one sensor per bus (Deck's rule) avoids the question. https://docs.revrobotics.com/rev-crossover-products/sensors/2m-distance/specs.md |
| AndyMark 2m TOF Lidar / AndyMark Proximity & Color | I2C | `AndyMarkTOF` / `AndyMarkColor` | `DistanceSensor` / color interfaces | Since 11.1 (Hardware 11.1.0) |
| MaxBotix I2CXL sonar | I2C | `MaxSonarI2CXL` | `DistanceSensor` | Range |
| **goBILDA Pinpoint** (V1 3110-0002-0001; V2 3110-0002-0002) | I2C, address 0x31 (`DEFAULT_ADDRESS = 49`); keep it off the IMU's bus 0 on a Control Hub | `goBILDAPinpoint` (**since SDK 10.3**) | `GoBildaPinpointDriver`: `update()`, `setOffsets(x, y, DistanceUnit)`, `setEncoderResolution(GoBildaOdometryPods.goBILDA_4_BAR_POD / goBILDA_SWINGARM_POD)` or `(ticksPerUnit, DistanceUnit)`, `setEncoderDirections(…)`, `resetPosAndIMU()`, `getPosition()` (Pose2D), `getEncoderX/Y()`, `getHeading(AngleUnit)`; 12.0 adds `getPitch`, `getRoll` and `getQuaternion` (V2) | Robot pose (2 pods + IMU). Already in Deck |
| **SparkFun OTOS** | I2C, address 0x17; Qwiic connector (needs a Qwiic → JST-PH cable) | `SparkFunOTOS` (since ≤ 9.2) | `SparkFunOTOS`: `setOffset`, `setLinearScalar`, `setAngularScalar`, `calibrateImu`, `resetTracking`, `getPosition` | PixArt PAA5160E1-Q plus LSM6DSO IMU. **Works 10–27 mm above the floor**, up to 2.5 m/s (https://docs.sparkfun.com/SparkFun_Optical_Tracking_Odometry_Sensor/hardware_overview/). Already in Deck |
| **OctoQuad FTC Edition (MK2)** (DigitalChickenLabs) | I2C, address 0x30 (`OctoQuadImpl.I2C_ADDRESS = 48`); 8 JST-PH channel inputs | `OctoQuadFTC` | `OctoQuad`: `setChannelBankConfig(ALL_QUADRATURE / ALL_PULSE_WIDTH / BANK1_QUADRATURE_BANK2_PULSE_WIDTH)`, `readSinglePosition(ch)`, `readSingleVelocity(ch)`, `readAllEncoderData()` (`positions[]`, `velocities[]`), `resetSinglePosition`, `setSingleEncoderDirection`, `setSingleChannelPulseWidthParams(ch, minUs, maxUs)`, `setSingleChannelPulseWidthTracksWrap`; MK2 localizer: `setLocalizerPortX/Y`, `setLocalizerCountsPerMM_X/Y`, `setLocalizerTcpOffsetMM_X/Y`, `readLocalizerData()` | 8 encoders: quadrature up to 250 kHz (1 M counts/s), or pulse width up to 65 535 µs. Firmware v3 tracks absolute PWM encoders across turns. **This is the only legal way to read a Through Bore's absolute output** (V1 1–1024 µs, V2 3.884–998.06 µs). **3.3 V only, not 5 V tolerant.** Many turrets or swerve modules, more encoders than motor ports. https://github.com/DigitalChickenLabs/OctoQuad |
| **Limelight 3A** | USB (Ethernet over USB) on the Control Hub. One per Control Hub (AndyMark) | `<EthernetDevice name ipAddress="172.29.0.1" port serialNumber="EthernetOverUsb:eth0:172.29.0.N"/>`, under `<Robot>` (since SDK 10.0) | `Limelight3A`: `start()`, `pipelineSwitch(n)`, `getLatestResult()` → `LLResult.getTx()`, `getTy()`, `getBotpose()`, `getBotpose_MT2()`, `isValid()`; `updateRobotOrientation(yaw)`, `isConnected()`, `setPollRateHz` | Target bearing for a turret, AprilTag pose, piece detection. https://docs.limelightvision.io/docs/docs-limelight/apis/ftc-programming |
| DFRobot HuskyLens | I2C, address 0x32 (`DEFAULT_I2C_ADDR = 50`); set Protocol = I2C on the device. HuskyLens 2 reportedly uses 0x50 (DFRobot forum) | `HuskyLens` | `knock()`, `selectAlgorithm(HuskyLens.Algorithm)`, `blocks()`, `arrows()` | Object or color detection |
| USB webcam | USB | `<Webcam name serialNumber/>` under `<Robot>` | `WebcamName`, VisionPortal | Vision |
| IMUs | I2C (bus 0 for the internal one) | `ControlHubImuBHI260AP`, `LynxEmbeddedIMU`, `RevExternalImu` (REV 9-axis), `AdafruitBNO055IMU`, `AndyMarkIMU`, `KauaiLabsNavxMicro` | `IMU`: `initialize(new IMU.Parameters(new RevHubOrientationOnRobot(logo, usb)))`, `getRobotYawPitchRollAngles()`, `getRobotAngularVelocity(AngleUnit)`, `resetYaw()` | Heading |
| LEDs | digital / servo / I2C | `Led`, `RevBlinkinLedDriver`, `QWIIC_LED_STICK` | `LED.enable`, `RevBlinkinLedDriver.setPattern`, … | Driver feedback (a piece loaded) |
| MR legacy analog | analog | `OpticalDistanceSensor`, `ModernRoboticsAnalogTouchSensor` | | Old kits |

**Seen in real configurations but not verified against a vendor:** IronReign's `brushland_color.xml` wires a Brushland Labs color rangefinder as `AnalogInput` ("brushlandcolor0") plus two `DigitalDevice` pins ("samplerP0" and "samplerP1"). It is a piece-presence sensor that uses analog and digital ports instead of I2C (https://github.com/IronReign/FtcRobotControllerIronReign/blob/HEAD/TeamCode/src/main/res/xml/brushland_color.xml).

---

## 5. Robot configuration XML

### 5.1 Format as the SDK writes it

This was read from `WriteXMLFileHandler` and its inner classes, `LynxModuleConfiguration`, `DeviceConfiguration`, `LynxI2cDeviceConfiguration`, `EthernetOverUsbConfiguration` and `WebcamConfiguration` in RobotCore 12.0.0. Real saved files were used to cross-check.

- **Root and portals.**
  - The root is `<Robot type="FirstInspires-FTC">`, after `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>`.
  - `<LynxUsbDevice name="Control Hub Portal" serialNumber="(embedded)" parentModuleAddress="173">` is the Control Hub's own board.
  - An Expansion Hub on USB is `<LynxUsbDevice name="Expansion Hub Portal 1" serialNumber="DQ2F3UGC" parentModuleAddress="2">`.
- **Hubs inside a portal.**
  - `<LynxModule name="Control Hub" port="173">` and `<LynxModule name="Expansion Hub 2" port="2">`, where `port` is the RS485 module address.
  - `<ServoHub name="Servo Hub 3" port="3">` sits beside them.
- **Device elements:** `<Tag name="…" port="N" />`.
  - I2C devices add `bus="B"`. Their `port` is the **index on that bus** (0 for the first device), not a connector. For example, Petelax has `LynxEmbeddedIMU port="0" bus="0"` and `SparkFunOTOS port="1" bus="0"`.
  - Attribute names: `name` and `port` (DeviceConfiguration), `bus` (LynxI2cDeviceConfiguration).
- **Order inside a `LynxModule`** (`WriteXMLFileHandler$6`): `getMotors()`, `getServos()`, `getAnalogInputs()`, `getPwmOutputs()`, `getDigitalDevices()`, `getI2cDevices()`. Inside a `ServoHub`: `getServos()`.
- **Robot-level devices:**
  - `<Webcam name serialNumber [autoOpen]/>`;
  - `<EthernetDevice name serialNumber port ipAddress/>` (`XMLATTR_IPADDRESS="ipAddress"`).
- The SDK refuses duplicate names ("duplicate names:").

### 5.2 Full small example

It has a motor, a servo, a CR servo, an analog input, a digital touch sensor, an I2C color sensor, a Servo Hub and a Limelight. The order is as the SDK writes it.

```xml
<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<Robot type="FirstInspires-FTC">
    <LynxUsbDevice name="Control Hub Portal" serialNumber="(embedded)" parentModuleAddress="173">
        <LynxModule name="Expansion Hub 2" port="2">
            <goBILDA5202SeriesMotor name="lift" port="0" />
            <RevRoboticsCoreHexMotor name="turret" port="3" />
            <Servo name="claw" port="0" />
            <ServoFullRange name="wrist" port="1" />
            <ContinuousRotationServo name="roller" port="2" />
            <AnalogInput name="wristAngle" port="0" />
            <RevTouchSensor name="liftHome" port="1" />
            <DigitalDevice name="turretHome" port="2" />
            <RevColorSensorV3 name="slot" port="0" bus="1" />
        </LynxModule>
        <LynxModule name="Control Hub" port="173">
            <goBILDA5202SeriesMotor name="frontLeft" port="0" />
            <goBILDA5202SeriesMotor name="frontRight" port="1" />
            <goBILDA5202SeriesMotor name="backLeft" port="2" />
            <goBILDA5202SeriesMotor name="backRight" port="3" />
            <ControlHubImuBHI260AP name="imu" port="0" bus="0" />
            <goBILDAPinpoint name="pinpoint" port="0" bus="1" />
            <REV_VL53L0X_RANGE_SENSOR name="extendDistance" port="0" bus="2" />
        </LynxModule>
        <ServoHub name="Servo Hub 3" port="3">
            <Servo name="hood" port="0" />
        </ServoHub>
    </LynxUsbDevice>
    <EthernetDevice name="limelight" serialNumber="EthernetOverUsb:eth0:172.29.0.24" port="0" ipAddress="172.29.0.1" />
</Robot>
```

The hub order inside the portal follows real files, where the Expansion Hub comes before the Control Hub. Deck's `newConfiguration` sorts the parent last, which matches. Real files used:
- https://github.com/Xeo-Alba-Iulia/Decode/blob/HEAD/Decode.xml
- https://github.com/SaMoTechRobotics/FTC-Decode/blob/HEAD/Decode.xml
- https://github.com/Petelax/FTC16413-IntoTheDeep/blob/HEAD/TeamCode/src/main/res/xml/swerve.xml
- https://github.com/FTC-23511/Decode-2026-Safe/blob/HEAD/TeamCode/src/main/res/xml/decode.xml
- https://github.com/Te0-faN/FTC-Framework/blob/HEAD/TeamCode/src/main/res/xml/regionala2025.xml

### 5.3 Cross-check against `ui/ftc/robot-config.js`

**Already right:**
- `MOTORS` (line 9) has all 14 SDK motor tags and the legacy `RevRoboticsHDHexMotor`.
- `SERVOS` (line 11) has `Servo` and `ServoFullRange`; `CRSERVOS` has `ContinuousRotationServo` and `RevSPARKMini`.
- `IMUS` (line 12) has 5 of the 6 IMU tags.
- `HUBS` and `CONTAINERS` (line 14) include `ServoHub`.
- `OTHER_PORT` (line 99) has `DigitalDevice`, `RevTouchSensor`, `Led`, `AnalogInput`, `OpticalDistanceSensor` and `ModernRoboticsAnalogTouchSensor`.
- `newConfiguration` writes the same root, portal and hub shapes.

**Missing or wrong:**

| Where | Gap | Fix |
|---|---|---|
| `IMUS` (line 12) | `KauaiLabsNavxMicro` is missing | Add it |
| `kindOf` (line 15) | Analog, digital, touch, color, distance, OctoQuad, HuskyLens and Limelight are all `'other'` | Add kinds: `analog` (AnalogInput, OpticalDistanceSensor, ModernRoboticsAnalogTouchSensor); `digital` (DigitalDevice, Led); `touch` (RevTouchSensor; it also fits a `digital` need); `color` (RevColorSensorV3, LynxColorSensor, AndyMarkColor, AdafruitColorSensor, ColorSensor); `distance` (REV_VL53L0X_RANGE_SENSOR, AndyMarkTOF, MaxSonarI2CXL, ModernRoboticsI2cRangeSensor; a color sensor also fits a `distance` need at 1–10 cm); `octoquad` (OctoQuadFTC); `huskylens`; `limelight` (EthernetDevice); `led` (QWIIC_LED_STICK, RevBlinkinLedDriver) |
| `KINDS` and `fits` (lines 19–20) | No labels or fit rules for the new kinds | For example, `fits('digital', 'touch') = true` |
| `CONTAINERS` (line 14) | Includes `'EthernetDevice'`, so the Limelight never appears in `parse().devices`. It is a leaf element with `name` and `port` | Remove it from `CONTAINERS` and treat it as kind `limelight`, a robot-level device with no `module` |
| `parse` (line 38) | Devices in a `ServoHub` get `hub`, but no `module`. Only `LynxModule` sets `module` (line 43–44), so Servo Hub ports are never marked taken and never offered | Set `module:{portal, address, servoHub:true}` for `ServoHub` too, and allow servo-family planning on it (6 ports) |
| `PORTS` (line 91) | `{motor:4, servo:6, i2c:4}` | Add `analog:4` and `digital:8`, plus `servoHub:6` if Servo Hubs are planned |
| `portFamily` (line 103) | Only motor, servo and i2c | Map `analog`/`potentiometer`/`axonFeedback` to `analog`; `touch`/`digital`/`limit` to `digital`; `color`/`distance`/`octoquad`/`huskylens` to `i2c` |
| `portsTaken` (line 107) | `OTHER_PORT` tags return `[]`, so two analog sensors can be planned onto the same channel | Return `portKey(module,'analog',port)` and `portKey(module,'digital',port)` |
| `planPorts` (line 122) | No channel parity rules | Touch sensors take **odd** digital channels only. The REV potentiometer takes **even** analog channels only. Axon feedback and generic analog take any. Through Bore or other high-CPR encoders read through a motor port prefer motor **ports 0 and 3**. Keep one I2C device per bus (already the rule) and keep bus 0 free on a hub with an internal IMU |
| `tagFor` (line 114) | No sensor tags | `analog → 'AnalogInput'`, `touch → 'RevTouchSensor'`, `digital → 'DigitalDevice'`, `color → 'RevColorSensorV3'`, `distance → 'REV_VL53L0X_RANGE_SENSOR'`, `octoquad → 'OctoQuadFTC'` |
| `FAMILY_ORDER` (line 180) | `{motor:0, servo:1, i2c:2}` | `{motor:0, servo:1, analog:2, pwm:3, digital:4, i2c:5}` (the SDK's order) |
| `MOTOR_TYPES` (line 93) | Only 6 choices | Derive from the catalog's `xmlType` (all 14) |
| `deviceXml` (line 155) | Fine for hub devices. An `EthernetDevice` needs `serialNumber` and `ipAddress` | Deck should never write a Limelight; it is configured by scan |

---

## 6. How teams close the loop (patterns for generated code and the guided check)

1. **Motor encoder with RUN_TO_POSITION** (lift, arm, turret on its motor encoder).
   - The code:

     ```java
     m.setMode(STOP_AND_RESET_ENCODER);
     m.setTargetPosition(t);
     m.setMode(RUN_TO_POSITION);
     m.setPower(p);
     ```

     Then check `isBusy()` or `|getCurrentPosition() - t| <= getTargetPositionTolerance()`. The default tolerance is 5 ticks.
   - Setting RUN_TO_POSITION before any target throws (gm0). It is "inadvisable to use this on mechanisms with multiple motors" (gm0 common-hardware-components).
   - Tune it with `setPositionPIDFCoefficients(p)`.
   - The counts come from `DeckActuators.ticks(a, value)` (`ui/sim-actuators.js` line 98). Deck already generates this for motor turrets (`ticksPerDegree`).
2. **Servo + analog feedback (Axon).**
   - Keep `setPosition` as the command. Read `AnalogInput.getVoltage()` and convert it to an angle as in §3.2. Use it to:
     - confirm arrival: `|angle − target| < tol`, which replaces timed waits;
     - detect a stall;
     - run an outer PID on top of a CR Axon. This is swerve azimuth: `power = PID(wrap(target − angle))`, with the servo in CR mode on a Servo Hub.
   - Mind the ground-offset under load (Chief Delphi) and the 0 / 3.3 V wrap.
3. **Through Bore on a turret or arm.**
   - Mount it on the output shaft and plug it into motor-encoder port **0 or 3**. Read it through the `DcMotorEx` configured on that port; this need not be the motor that drives the joint.
   - Close the loop in code: `power = kP·(target − ticks) + kF·cos(θ)`, with gravity feedforward from gm0 control-loops.
   - Do not use `getVelocity()` above about 240 rpm.
   - For an absolute start pose, use an OctoQuad in pulse-width mode, a potentiometer or AM-5200 analog, or a limit switch.
4. **Limit-switch homing.**
   - Drive slowly toward the switch until `touch.isPressed()` (or `!digital.getState()`). Then `STOP_AND_RESET_ENCODER`, back off, and run normally.
   - Keep the switch as a software stop: refuse power toward it while it is pressed (REV "Adding a Limit Switch", https://docs.revrobotics.com/duo-control/hello-robot-java/part-2/arm-control-onbot-java/adding-a-limit-switch.md).
   - A current spike (`isOverCurrent()` after `setCurrentAlert`) is a switchless alternative.
5. **Potentiometer arm.** Run a bang-bang or PID on `getVoltage()` against voltages recorded at each named position (REV's advice), or use the nonlinear formula in §4.
6. **Piece presence.**
   - Color V3: `getDistance(CM) < threshold`, and/or `getNormalizedColors()` hue. Thresholds must be tuned on the robot.
   - 2m distance: a range threshold.
   - Touch sensor: a piece seated.
   - This is the "piece sensors (stop intaking when full, shoot until empty)" item still open in `docs/MECHANISM_ACTIONS.md` (Phases → Later).
7. **Bulk reads.** Set `LynxModule.BulkCachingMode.AUTO` once, so encoders, analog and digital cost one call per hub per loop. Read I2C sensors at a lower rate.

---

## 7. Extension points in Deck (where an implementer acts)

**Do not touch**, per the task: `ui/sim-discovery.js`, `ui/sim-mechanisms.js`, `ui/sim-robot-model.js` and `src/sim-model.cjs`. Another agent is editing them.

1. **Catalog.** Add the catalog in §8 as a new UMD module, `ui/ftc/hardware-catalog.js` (`DeckHardware`), using the same wrapper as `ui/sim-actuators.js` line 1.
   - Alternatively, extend `ui/sim-actuators.js`:
     - add `xmlType` to each `m()` / `yj()` entry (lines 56–76);
     - add `feedback:{port:'analog', …}` to `axon-*` (lines 28–30);
     - add the missing 2026-27 servos (Studica 75007, SWYFT, PLEX, TORCTEX, MATA);
     - export `SENSORS`.
   - `device(a, states)` (line 134) should then return `xmlType` for motors and `feedback` for servos.
   - Tests to cover it: `tests/sim-actuators.test.cjs`.
2. **Kinematics sensors.** `ui/sim-kinematics.js`:
   - `SENSORS` is at line 41: `{encoder, limit, potentiometer, velocity}`.
   - Sanitising is at lines 158–162: kept fields are `id`, `name`, `kind`, `actuator|joint`, `index`, `cpr`, `at` and `band`.
   - `Driver.read(id)` is at line 500, and returns counts, a boolean for a limit, or a value.
   - **To add:**
     - `model` (a catalog sensor id) and `device` (its configuration name), the same DEVICE regex as `hardwareOf` (line 226);
     - `port` (motor-encoder / analog / digital / i2c);
     - for `limit`, an `activeLow` flag (REV parts are active-low);
     - new kinds:
       - `absolute`: analog volts from `{vMin, vMax, degMin, degMax, wrap}`, or the potentiometer curve;
       - `presence`: a color or distance threshold on a game piece;
       - `distance`.
     - A `raw(id)` that returns what the robot code actually reads (ticks, volts, `getState()` boolean, cm), so the guided check and exports share one meaning.
   - Tests: `tests/sim-kinematics.test.cjs` and `tests/sim-kinematics-robots.test.cjs`.
3. **Export device list.** `ui/sim-ftc.js`:
   - `robotNeeds()` (line 54) maps `mechanismDevices` rows to `need`. Add sensor needs such as `analog`, `touch`, `digital`, `color`, `distance` and `encoderPort`.
   - `mechanismDevices(m, robot)` (line 562) is the single device list. Add sensor rows such as `{role:'sensor', device:'touch'|'analog'|…, name, label, setting}`, and for an encoder read through another motor's port, `{device:'motor', role:'encoder'}`.
   - `mechanismHardware(m)` (line 581) feeds `VirtualHub.java`. Add `sensors:[{name, kind, …}]`.
   - The guided check (`checkOpMode`) can add steps such as "press the lift's limit switch" (expects `isPressed`) and "move the wrist by hand" (expects the analog voltage to change).
   - Tests: `tests/sim-mechanism-hardware.test.cjs` and `tests/sim-guided-check.test.cjs`.
4. **Configuration check and planner.** `ui/ftc/robot-config.js`: everything in the §5.3 table. Tests: `tests/robot-link.test.cjs`, which already has XML fixtures containing `RevTouchSensor`, `RevColorSensorV3` and `ServoFullRange`.
5. **Virtual Control Hub.**
   - `tools/simulation/java/com/qualcomm/robotcore/hardware/` has stubs for `DcMotor(Ex)`, `Servo`, `CRServo`, `IMU`, `VoltageSensor` and `HardwareMap`. There is **no** `AnalogInput`, `DigitalChannel`, `TouchSensor`, `DistanceSensor`, `ColorSensor` or `NormalizedColorSensor`.
   - Add them with the SDK 12 signatures in §4, and `DistanceUnit` is already present.
   - Register them in `tools/simulation/java/deck/sim/hub/VirtualHub.java`, following the `map.put(name, device)` and `devices.put(name, supplier)` pattern (lines 120–220), fed from the engine's sensor readings.
   - Rebuild with `tools/simulation/build.cjs`. Real-library compile check: `tools/simulation/check-ftc-sdk.cjs`.
6. **Docs.** Record the decision in `docs/MECHANISM_RESEARCH.md` §8 and the "Later" item in `docs/MECHANISM_ACTIONS.md`.

---

## 8. Catalog draft (JSON-like, ready for a JS module)

Units: rpm at the output (12 V); `cpr` = encoder counts per output turn as `getCurrentPosition()` reports it; servo `range` in degrees across `pulse` µs (inches for linear servos); speed s/60° at 6 V. `port` ∈ `motor | servo | analog | digital | i2c | usb | encoderPort`. Motor and servo ids match `ui/sim-actuators.js` where they exist.

```js
const HUBS = {
  'rev-control-hub':   {name:'REV Control Hub', part:'REV-31-1595', address:173, motor:4, encoder:4, servo:6, servoVolts:5, servoPairAmps:2, servoTotalAmps:5,
                        analog:{channels:4, connectors:[[0,1],[2,3]], measuredVolts:[0,5], sdkMaxVoltage:3.3, powerPinVolts:3.3},
                        digital:{channels:8, connectors:[[0,1],[2,3],[4,5],[6,7]], logicVolts:3.3, pulledUp:true},
                        i2c:{buses:4, imuBus:0, imuAddress:0x28, kHz:[100,400]}, rs485:2, usb:['usb-c','usb2-a','usb3-a'], hardwareEncoderPorts:[0,3]},
  'rev-expansion-hub': {name:'REV Expansion Hub', part:'REV-31-1153', defaultAddress:[1,2], sameIoAs:'rev-control-hub', imu:'none (shipped after Dec 2021) or BNO055'},
  'rev-servo-hub':     {name:'REV Servo Hub', part:'REV-11-1855', defaultAddress:3, servo:6, servoVolts:6, totalAmps:15, channelAmps:3, xml:'ServoHub', sinceSdk:'10.0'},
  'rev-spm':           {name:'REV Servo Power Module', part:'REV-11-1144', servo:6, servoVolts:6, totalAmps:15, passThrough:true},
};

const MOTORS = [ // add xmlType to sim-actuators MOTORS
  {id:'gobilda-5203-312', name:'goBILDA 5203 Yellow Jacket 19.2:1', kind:'dcmotor', port:'motor', xmlType:'goBILDA5202SeriesMotor', ratio:19.2, rpm:312, cpr:537.7, feedback:{port:'encoderPort', type:'quadrature'}},
  // …every gobilda-5203-* ratio: xmlType 'goBILDA5202SeriesMotor', cpr = 28 × ratio
  {id:'rev-hd-hex',     xmlType:'RevRoboticsUltraplanetaryHDHexMotor', rpm:6000, cpr:28},
  {id:'rev-ultra-20',   xmlType:'RevRoboticsUltraplanetaryHDHexMotor', rpm:317,  cpr:530.05},   // and every rev-ultra-*
  {id:'rev-hd-hex-20',  xmlType:'RevRobotics20HDHexMotor', rpm:300, cpr:560},
  {id:'rev-hd-hex-40',  xmlType:'RevRobotics40HDHexMotor', rpm:150, cpr:1120},
  {id:'rev-core-hex',   xmlType:'RevRoboticsCoreHexMotor', rpm:125, cpr:288},
  {id:'torquenado',     xmlType:'TetrixMotor', rpm:100, cpr:1440},
  {id:'studica-maverick', xmlType:'StudicaMaverick', rpm:100, cpr:1464},
  {id:'neverest-20',    xmlType:'NeveRest20Gearmotor', rpm:340, cpr:537.6},
  {id:'neverest-40',    xmlType:'NeveRest40Gearmotor', rpm:160, cpr:1120},
  {id:'neverest-60',    xmlType:'NeveRest60Gearmotor', rpm:105, cpr:1680},                     // new
  {id:'neverest-3.7',   xmlType:'NeveRest3.7v1Gearmotor', rpm:1784, cpr:44.4},                  // new
  {id:'matrix-12v',     xmlType:'Matrix12vMotor', rpm:190, cpr:1478.4},                         // new
  {id:'other-motor',    xmlType:'Motor', rpm:null, cpr:null, note:'SWYFT Spike, NFR Yuksel, WATTOS Stingray: enter CPR'},
];

const SERVO_XML = {servo:'Servo', servoFull:'ServoFullRange', crservo:'ContinuousRotationServo', sparkMini:'RevSPARKMini', blinkin:'RevBlinkinLedDriver'};
const SDK_PWM = {Servo:[600,2400], ServoFullRange:[500,2500], ContinuousRotationServo:[600,2400], RevSPARKMini:[500,2500]};

const SERVOS = [ // additions to sim-actuators SERVOS
  {id:'axon-max',  xmlType:'Servo', range:360, pulse:[500,2500], speed6V:0.115, torque6V:34, speed5V:0.140, torque5V:28, stallA:4,
   feedback:{port:'analog', xmlType:'AnalogInput', java:'AnalogInput.getVoltage()', volts:[0,3.3], degrees:360, invert:true, wrap:true, note:'4th wire; calibrate'}},
  {id:'axon-mini', xmlType:'Servo', range:360, pulse:[500,2500], speed6V:0.09, torque6V:25, speed5V:0.110, torque5V:20, stallA:3.8, feedback:{/* same as axon-max */}},
  {id:'axon-micro',xmlType:'Servo', range:360, pulse:[500,2500], speed6V:0.075, torque6V:7.8, speed5V:0.085, torque5V:6.5, stallA:2.2, feedback:{/* same */}},
  {id:'studica-multimode-fast', name:'Studica Multi-Mode Smart Servo 200 FAST (75007)', range:300, speed6V:0.046, torque6V:5, stallA:2.7},
  {id:'swyft-speed',   name:'SWYFT Speed Servo (SR-Servo-01)',  range:null, speed6V:0.062, torque6V:19,   stallA:2.7},
  {id:'swyft-torque',  name:'SWYFT Torque Servo (SR-Servo-03)', range:null, speed6V:0.112, torque6V:33.5, stallA:2.7},
  {id:'swyft-balance', name:'SWYFT Balance Servo (SR-Servo-02)',range:null, speed6V:0.092, torque6V:27.3, stallA:2.7},
  {id:'swyft-slim',    name:'SWYFT Slim Servo (SR-Servo-04)',   range:null, speed6V:0.075, torque6V:14,   stallA:2.4},
  {id:'swyft-nano',    name:'SWYFT Nano Servo (SR-Servo-05)',   range:null, speed6V:0.110, torque6V:10.2, stallA:2.0},
  {id:'plex-speed',    name:'PLEX Speed Brushless',  range:null, speed6V:0.067, torque6V:18, stallA:3.9},
  {id:'plex-torque',   name:'PLEX Torque Brushless', range:null, speed6V:0.095, torque6V:28, stallA:3.9},
];

const SENSORS = [
  {id:'motor-encoder', name:'Motor encoder (built in)', kind:'encoder', port:'encoderPort', xmlType:null, java:'DcMotorEx.getCurrentPosition()/getVelocity()', measures:'relative position', cpr:'from motor'},
  {id:'rev-through-bore-v1', name:'REV Through Bore Encoder V1 (REV-11-1271)', kind:'encoder', port:'encoderPort', preferPorts:[0,3], xmlType:null, java:'DcMotorEx.getCurrentPosition()', cpr:8192, maxRpmVelocity:240,
   absolute:{signal:'pwm', periodUs:1025, pulseUs:[1,1024], bits:10, readableOn:'octoquad'}},
  {id:'rev-through-bore-v2', name:'REV Through Bore Encoder V2 (MA600)', kind:'encoder', port:'encoderPort', preferPorts:[0,3], cpr:8192, accuracyDeg:0.5,
   absolute:{signal:'pwm', periodUs:1000, pulseUs:[3.884,998.06], bits:12, readableOn:'octoquad'}},
  {id:'gobilda-pod-4bar',     name:'goBILDA 4-Bar Odometry Pod (32 mm)', kind:'encoder', port:'encoderPort', cpr:2000, ticksPerMm:19.8944},
  {id:'gobilda-pod-swingarm', name:'goBILDA Swingarm Odometry Pod (48 mm)', kind:'encoder', port:'encoderPort', cpr:2000, ticksPerMm:13.2629},
  {id:'rev-potentiometer', name:'REV Potentiometer (REV-31-1155)', kind:'absolute', port:'analog', channels:'even', xmlType:'AnalogInput', java:'AnalogInput.getVoltage()', degrees:270,
   curve:'V = 445.5*(t-270)/(t*t-270*t-36450)'},
  {id:'axon-feedback', name:'Axon servo analog feedback', kind:'absolute', port:'analog', channels:'any', xmlType:'AnalogInput', java:'AnalogInput.getVoltage()', volts:[0,3.3], degrees:360, invert:true, wrap:true},
  {id:'andymark-am5200', name:'AndyMark HexBore Absolute Encoder (am-5200)', kind:'absolute', port:'analog', xmlType:'AnalogInput', volts:[0,1.056], degrees:360, alt:{port:'encoderPort', cpr:4096}},
  {id:'analog-absolute', name:'Other analog absolute encoder (MA3, Thrifty)', kind:'absolute', port:'analog', xmlType:'AnalogInput', volts:[0,3.3], degrees:360, note:'ratiometric to supply; MA3 needs 5 V harness'},
  {id:'rev-touch', name:'REV Touch Sensor (REV-31-1425)', kind:'limit', port:'digital', channels:'odd', xmlType:'RevTouchSensor', java:'TouchSensor.isPressed()', activeLow:true},
  {id:'rev-magnetic-limit', name:'REV Magnetic Limit Switch (REV-31-1462)', kind:'limit', port:'digital', channels:'any', xmlType:'DigitalDevice', alt:'RevTouchSensor', java:'DigitalChannel.getState() (false = triggered)', activeLow:true, triggerMm:10},
  {id:'limit-switch', name:'Limit switch / microswitch (goBILDA 3103-0001)', kind:'limit', port:'digital', channels:'any', xmlType:'DigitalDevice', java:'DigitalChannel.getState()', activeLow:true},
  {id:'rev-color-v3', name:'REV Color Sensor V3 (REV-31-1557)', kind:'presence', port:'i2c', address:0x52, xmlType:'RevColorSensorV3', java:'NormalizedColorSensor.getNormalizedColors(); DistanceSensor.getDistance(CM)', rangeCm:[1,10], colorWithinCm:2},
  {id:'rev-2m-distance', name:'REV 2m Distance Sensor (REV-31-1505)', kind:'distance', port:'i2c', address:0x29, xmlType:'REV_VL53L0X_RANGE_SENSOR', java:'DistanceSensor.getDistance(DistanceUnit)', rangeCm:[5,200], fovDeg:25},
  {id:'andymark-tof', name:'AndyMark 2m TOF Lidar', kind:'distance', port:'i2c', xmlType:'AndyMarkTOF', java:'DistanceSensor.getDistance', sinceSdk:'11.1'},
  {id:'gobilda-pinpoint', name:'goBILDA Pinpoint', kind:'odometry', port:'i2c', address:0x31, xmlType:'goBILDAPinpoint', java:'GoBildaPinpointDriver', sinceSdk:'10.3'},
  {id:'sparkfun-otos', name:'SparkFun OTOS', kind:'odometry', port:'i2c', address:0x17, xmlType:'SparkFunOTOS', java:'SparkFunOTOS', heightMm:[10,27]},
  {id:'octoquad', name:'DigitalChickenLabs OctoQuad FTC (MK2)', kind:'encoderHub', port:'i2c', address:0x30, xmlType:'OctoQuadFTC', java:'OctoQuad', channels:8, modes:['quadrature','pulseWidth'], volts:3.3},
  {id:'limelight-3a', name:'Limelight 3A', kind:'vision', port:'usb', xmlType:'EthernetDevice', java:'Limelight3A', ip:'172.29.0.1', perHub:1, sinceSdk:'10.0'},
  {id:'huskylens', name:'DFRobot HuskyLens', kind:'vision', port:'i2c', address:0x32, xmlType:'HuskyLens', java:'HuskyLens'},
  {id:'webcam', name:'USB webcam', kind:'vision', port:'usb', xmlType:'Webcam', java:'WebcamName'},
  {id:'imu-bhi260', name:'Control Hub IMU (BHI260AP)', kind:'imu', port:'i2c', bus:0, address:0x28, xmlType:'ControlHubImuBHI260AP', java:'IMU'},
  {id:'imu-bno055', name:'Hub IMU (BNO055)', kind:'imu', port:'i2c', bus:0, address:0x28, xmlType:'LynxEmbeddedIMU', java:'IMU'},
];
```

The AM-5200 `volts:[0,1.056]` is inferred from AndyMark's "0 → ~1V" and "scale factor 3.125" (3.3/3.125 = 1.056). Verify it on the robot.

---

## 9. Sources

**FTC SDK 12.0.0 (javap)**
- https://repo1.maven.org/maven2/org/firstinspires/ftc/Hardware/12.0.0/
- https://repo1.maven.org/maven2/org/firstinspires/ftc/RobotCore/12.0.0/
- https://repo1.maven.org/maven2/org/firstinspires/ftc/FtcCommon/12.0.0/
- Classes read:
  - `com.qualcomm.hardware.motors.*`, `rev.*`, `gobilda.GoBildaPinpointDriver`, `sparkfun.SparkFunOTOS`, `digitalchickenlabs.OctoQuad(Impl)`, `limelightvision.Limelight3A`, `dfrobot.HuskyLens`, `lynx.LynxAnalogInputController`;
  - `robotcore.hardware.{Servo, CRServo, ServoImplEx, PwmControl$PwmRange, AnalogInput, DigitalChannel, TouchSensor, DcMotorEx, NormalizedColorSensor, ColorSensor, DistanceSensor}`;
  - `configuration.{LynxConstants, BuiltInConfigurationType, ConfigurationTypeManager, WriteXMLFileHandler*, LynxModuleConfiguration, EthernetOverUsbConfiguration, UnspecifiedMotor, annotations.ServoType, annotations.MotorType}`.

**REV**
- Specifications and ports:
  - https://docs.revrobotics.com/duo-control/control-system-overview/control-hub-basics.md
  - https://docs.revrobotics.com/duo-control/control-system-overview/expansion-hub-basics.md
  - https://docs.revrobotics.com/duo-control/sensors/digital.md
  - https://docs.revrobotics.com/duo-control/sensors/analog.md
  - https://docs.revrobotics.com/duo-control/sensors/i2c.md
  - https://docs.revrobotics.com/duo-control/sensors/i2c/imu.md
  - https://docs.revrobotics.com/duo-control/control-system-overview/integrated-sensors.md
- Encoders:
  - https://docs.revrobotics.com/duo-control/sensors/encoders.md
  - https://docs.revrobotics.com/duo-control/sensors/encoders/motor-based-encoders.md
  - https://docs.revrobotics.com/duo-control/sensors/encoders/through-bore-encoder.md
  - https://docs.revrobotics.com/rev-crossover-products/sensors/tbe/specs.md
  - https://docs.revrobotics.com/rev-crossover-products/sensors/tbe/v1/specs.md
  - https://docs.revrobotics.com/rev-crossover-products/sensors/tbe/application-examples.md
- Sensors:
  - https://docs.revrobotics.com/rev-crossover-products/sensors/touch-sensor/specs.md
  - https://docs.revrobotics.com/rev-crossover-products/sensors/touch-sensor/application-examples.md
  - https://docs.revrobotics.com/rev-crossover-products/sensors/magnetic-limit-switch/specs.md
  - https://docs.revrobotics.com/rev-crossover-products/sensors/potentiometer/application-examples.md
  - https://docs.revrobotics.com/rev-crossover-products/sensors/color-sensor/specs.md
  - https://docs.revrobotics.com/rev-crossover-products/sensors/2m-distance/specs.md
- Servo power and actuators:
  - https://docs.revrobotics.com/rev-crossover-products/servo/servo-hub.md (and its channel-power, channel-pulse, wiring and configuring-with-a-control-hub pages)
  - https://www.revrobotics.com/rev-11-1855/
  - https://docs.revrobotics.com/rev-crossover-products/servo/spm.md
  - https://docs.revrobotics.com/rev-crossover-products/ultraplanetary/cartridge-details.md
  - https://docs.revrobotics.com/duo-build/motion/servos/smart-robot-servo.md
- Programming:
  - https://docs.revrobotics.com/duo-control/hello-robot-java/part-2/arm-control-onbot-java/adding-a-limit-switch.md

**Rules:** FIRST Inspection Quick Reference 26-27.1, https://ftc-resources.firstinspires.org/ftc/event/inspection-reference.

**Axon**
- https://docs.axon-robotics.com/servos/max.md
- https://docs.axon-robotics.com/servos/mini.md
- https://docs.axon-robotics.com/servos/analog-output.md
- https://docs.axon-robotics.com/archive/max.md
- https://docs.axon-robotics.com/archive/mini.md
- https://docs.axon-robotics.com/archive/micro.md

**gm0**
- https://gm0.org/en/latest/docs/software/adv-control-system/sdk-motors.html
- https://gm0.org/en/latest/docs/software/adv-control-system/sdk-servos.html
- https://gm0.org/en/latest/docs/software/getting-started/common-hardware-components.html
- https://gm0.org/en/latest/docs/software/tutorials/bulk-reads.html
- https://gm0.org/en/latest/docs/software/concepts/control-loops.html
- https://gm0.org/en/latest/docs/power-and-electronics/sensor-glossary.html

**Other vendors**
- goBILDA and Pinpoint:
  - https://servocity.com/content/user_manuals/3110-0002-0001%20User%20Guide.pdf
  - https://www.gobilda.com/pinpoint-v2-odometry-computer-imu-sensor-fusion-for-2-wheel-odometry/
  - https://core-electronics.com.au/5204-series-yellow-jacket-planetary-gear-motor-1921-ratio-80mm-length-8mm-rex-shaft-312-rpm-33-5v-encoder.html
- SparkFun OTOS: https://docs.sparkfun.com/SparkFun_Optical_Tracking_Odometry_Sensor/hardware_overview/
- OctoQuad: https://github.com/DigitalChickenLabs/OctoQuad
- Limelight: https://docs.limelightvision.io/docs/docs-limelight/apis/ftc-programming and https://ftc.andymark.com/products/limelight-3a
- AndyMark: https://docs.andymark.com/ftc-electronics/ftc-sensors/hexbore-absolute-encoder-am-5200/specifications
- Thrifty: https://docs.thethriftybot.com/absolute-encoder/setup-guide/getting-set-up/using-with-3.3v
- HuskyLens: https://www.dfrobot.com/forum/topic/401453

**Team code and configurations (GitHub)**
- KookyBotz/CenterStage `AbsoluteAnalogEncoder.java`
- skandacode/DecodeV2 `solverslib/hardware/AbsoluteAnalogEncoder.java`
- Petelax/FTC16413-IntoTheDeep `swerve.xml`
- FTC-23511/Decode-2026-Safe `decode.xml`
- Xeo-Alba-Iulia/Decode `Decode.xml`
- SaMoTechRobotics/FTC-Decode `Decode.xml`
- Te0-faN/FTC-Framework `regionala2025.xml`
- IronReign/FtcRobotControllerIronReign `brushland_color.xml`

**Community**
- https://lr.in.psf.lt/r/FTC/comments/1fs4jq2/axon_servos
- https://www.chiefdelphi.com/t/fire-drive-ftc-swerve/483755
