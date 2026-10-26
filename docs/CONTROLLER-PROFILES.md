# Controller regression profiles

These 100 synthetic reports exercise the dashboard after the OS/browser has provided `mapping: "standard"`. They represent documented vendor/product modes; different modes can belong to the same physical model. This is not a top-selling ranking or a list of 100 physically tested controllers. Device IDs alone do not guarantee driver availability on Windows, SteamOS, or macOS.

Source: [Chromium gamepad sources](https://raw.githubusercontent.com/chromium/chromium/afc57f0601ec757437e9e9fdc641a930a067aafb/device/gamepad/) at `afc57f0601ec757437e9e9fdc641a930a067aafb`, retrieved 2026-10-18. Device facts and model descriptions are derived from Chromium; see [Chromium license](CHROMIUM-LICENSE.txt). The source list also contains unsupported devices; this catalog uses explicit Linux mappings or Xbox 360/One XInput classifications only. Our runtime still checks the actual mapping reported by Electron.

| # | Device / reported mode | Vendor:product | Source basis |
|---|---|---|---|
| 1 | DragonRise Generic USB | 0079:0006 | Linux mapper: MapperDragonRiseGeneric |
| 2 | 2Axes 8Keys Game Pad | 0079:0011 | Linux mapper: Mapper2Axes8Keys |
| 3 | HORIPAD for Nintendo Switch | 0f0d:00c1 | Linux mapper: MapperHoripadSwitch |
| 4 | Xbox One S (Bluetooth) | 045e:02e0 | Linux mapper: MapperXboxOneS |
| 5 | Xbox One S (Bluetooth) | 045e:02fd | Linux mapper: MapperXboxOneS2016Firmware |
| 6 | Xbox One Elite 2 (Bluetooth) | 045e:0b05 | Linux mapper: MapperXboxElite2Bluetooth |
| 7 | Xbox Series X (Bluetooth) | 045e:0b13 | Linux mapper: MapperXboxSeriesXBluetooth |
| 8 | Xbox One S (Bluetooth) | 045e:0b20 | Linux mapper: MapperXboxBluetooth |
| 9 | Xbox Adaptive (Bluetooth) | 045e:0b21 | Linux mapper: MapperXboxBluetooth |
| 10 | Xbox Elite Series 2 (Bluetooth) | 045e:0b22 | Linux mapper: MapperXboxBluetooth |
| 11 | Logitech F310 D-mode | 046d:c216 | Linux mapper: MapperLogitechDInput |
| 12 | Logitech F510 D-mode | 046d:c218 | Linux mapper: MapperLogitechDInput |
| 13 | Logitech F710 D-mode | 046d:c219 | Linux mapper: MapperLogitechDInput |
| 14 | Samsung Gamepad EI-GP20 | 04e8:a000 | Linux mapper: MapperSamsung_EI_GP20 |
| 15 | Acer GC501 X-INPUT mode | 0502:1304 | Linux mapper: MapperAcer |
| 16 | Acer Gaming Controller Nitro X-INPUT mode | 0502:1305 | Linux mapper: MapperAcer |
| 17 | Acer GC501 APP mode | 0502:1316 | Linux mapper: MapperAcerAppMode |
| 18 | Acer Gaming Controller Nitro APP mode | 0502:1317 | Linux mapper: MapperAcerAppMode |
| 19 | Dualshock 3 / SIXAXIS | 054c:0268 | Linux mapper: MapperDualshock3SixAxis |
| 20 | Playstation Dualshock 4 | 054c:05c4 | Linux mapper: MapperDualshock4 |
| 21 | Dualshock 4 (PS4 Slim) | 054c:09cc | Linux mapper: MapperDualshock4 |
| 22 | Dualshock 4 USB receiver | 054c:0ba0 | Linux mapper: MapperDualshock4 |
| 23 | DualSense | 054c:0ce6 | Linux mapper: MapperDualSense |
| 24 | DualSense Edge | 054c:0df2 | Linux mapper: MapperDualSense |
| 25 | PlayStation Access | 054c:0e5f | Linux mapper: MapperDualSense |
| 26 | Switch Joy-Con L | 057e:2006 | Linux mapper: MapperSwitchJoyCon |
| 27 | Switch Joy-Con R | 057e:2007 | Linux mapper: MapperSwitchJoyCon |
| 28 | Switch Pro Controller | 057e:2009 | Linux mapper: MapperSwitchPro |
| 29 | Switch Charging Grip | 057e:200e | Linux mapper: MapperSwitchPro |
| 30 | iBuffalo Classic | 0583:2060 | Linux mapper: MapperIBuffalo |
| 31 | SmartJoy PLUS Adapter | 0925:0005 | Linux mapper: MapperLakeviewResearch |
| 32 | WiseGroup MP-8866 | 0925:8866 | Linux mapper: MapperLakeviewResearch |
| 33 | Nvidia Shield gamepad (2015) | 0955:7210 | Linux mapper: MapperNvShield |
| 34 | Nvidia Shield gamepad (2017) | 0955:7214 | Linux mapper: MapperNvShield2017 |
| 35 | Nexus Player Controller | 0b05:4500 | Linux mapper: MapperADT1 |
| 36 | XSkills Gamecube USB adapter | 0b43:0005 | Linux mapper: MapperXSkills |
| 37 | XFXforce XGEAR PS2 Controller | 0e8f:0003 | Linux mapper: MapperXGEAR |
| 38 | Zeemote: SteelSeries FREE | 1038:1412 | Linux mapper: MapperSteelSeriesZeemote |
| 39 | SteelSeries Stratus XL USB | 1038:1418 | Linux mapper: MapperSteelSeriesStratusXLUsb |
| 40 | SteelSeries Stratus XL Bluetooth | 0111:1419 | Linux mapper: MapperSteelSeriesStratusBt |
| 41 | SteelSeries Stratus Duo Bluetooth | 0111:1431 | Linux mapper: MapperSteelSeriesStratusBt |
| 42 | SteelSeries Stratus+ Bluetooth | 0111:1434 | Linux mapper: MapperSteelSeriesStratusPlusBt |
| 43 | Razer Serval Controller | 1532:0900 | Linux mapper: MapperRazerServal |
| 44 | ADT-1 Controller | 18d1:2c40 | Linux mapper: MapperADT1 |
| 45 | Stadia Controller | 18d1:9400 | Linux mapper: MapperStadiaController |
| 46 | Moga Pro Controller (HID mode) | 20d6:6271 | Linux mapper: MapperMoga |
| 47 | Moga 2 HID | 20d6:89e5 | Linux mapper: MapperMoga |
| 48 | OnLive Controller (Bluetooth) | 2378:1008 | Linux mapper: MapperOnLiveWireless |
| 49 | OnLive Controller (Wired) | 2378:100a | Linux mapper: MapperOnLiveWireless |
| 50 | OUYA Controller | 2836:0001 | Linux mapper: MapperOUYA |
| 51 | SCUF Vantage, SCUF Vantage 2 | 2e95:7725 | Linux mapper: MapperDualshock4 |
| 52 | Snakebyte iDroid:con | 0a5c:8502 | Linux mapper: MapperSnakebyteIDroidCon |
| 53 | Elecom JC-U4013SBK (DirectInput mode) | 056e:200f | Linux mapper: MapperElecomWiredDirectInput |
| 54 | Elecom JC-U4113SBK (DirectInput mode) | 056e:2010 | Linux mapper: MapperElecomWirelessDirectInput |
| 55 | Valve Steam Controller 2015 | 28de:1102 | Linux mapper: MapperValve1 |
| 56 | Valve Steam Controller 2015 (Wireless) | 28de:1142 | Linux mapper: MapperValve1 |
| 57 | Valve Steam Deck | 28de:1205 | Linux mapper: MapperValve2 |
| 58 | Valve Steam Controller 2026 (Wired) | 28de:1302 | Linux mapper: MapperValve2 |
| 59 | Valve Steam Controller 2026 (Bluetooth) | 28de:1303 | Linux mapper: MapperValve2 |
| 60 | Valve Steam Controller 2026 (Wireless) | 28de:1304 | Linux mapper: MapperValve2 |
| 61 | Valve Steam Controller 2026 (Steam Machine integrated wireless) | 28de:1305 | Linux mapper: MapperValve2 |
| 62 | SteelSeries 1038:1430 (Xbox360 mode) | 1038:1430 | Chromium kXInputTypeXbox360 |
| 63 | Razer 1532:0037 (Xbox360 mode) | 1532:0037 | Chromium kXInputTypeXbox360 |
| 64 | Razer 1689:fd00 (Xbox360 mode) | 1689:fd00 | Chromium kXInputTypeXbox360 |
| 65 | Microsoft 045e:028e (Xbox360 mode) | 045e:028e | Chromium kXInputTypeXbox360 |
| 66 | Logitech 046d:c21d (Xbox360 mode) | 046d:c21d | Chromium kXInputTypeXbox360 |
| 67 | HORI 0f0d:000a (Xbox360 mode) | 0f0d:000a | Chromium kXInputTypeXbox360 |
| 68 | Mad Catz 0738:4716 (Xbox360 mode) | 0738:4716 | Chromium kXInputTypeXbox360 |
| 69 | PDP / Logic3 0e6f:0105 (Xbox360 mode) | 0e6f:0105 | Chromium kXInputTypeXbox360 |
| 70 | PowerA 24c6:5000 (Xbox360 mode) | 24c6:5000 | Chromium kXInputTypeXbox360 |
| 71 | 8BitDo 2dc8:3106 (Xbox360 mode) | 2dc8:3106 | Chromium kXInputTypeXbox360 |
| 72 | SteelSeries 1038:1431 (Xbox360 mode) | 1038:1431 | Chromium kXInputTypeXbox360 |
| 73 | Razer 1532:0a00 (XboxOne mode) | 1532:0a00 | Chromium kXInputTypeXboxOne |
| 74 | Razer 1689:fd01 (Xbox360 mode) | 1689:fd01 | Chromium kXInputTypeXbox360 |
| 75 | Microsoft 045e:0291 (Xbox360 mode) | 045e:0291 | Chromium kXInputTypeXbox360 |
| 76 | Logitech 046d:c21e (Xbox360 mode) | 046d:c21e | Chromium kXInputTypeXbox360 |
| 77 | HORI 0f0d:000c (Xbox360 mode) | 0f0d:000c | Chromium kXInputTypeXbox360 |
| 78 | Mad Catz 0738:4718 (Xbox360 mode) | 0738:4718 | Chromium kXInputTypeXbox360 |
| 79 | PDP / Logic3 0e6f:0113 (Xbox360 mode) | 0e6f:0113 | Chromium kXInputTypeXbox360 |
| 80 | PowerA 24c6:5300 (Xbox360 mode) | 24c6:5300 | Chromium kXInputTypeXbox360 |
| 81 | SteelSeries 1038:1434 (Xbox360 mode) | 1038:1434 | Chromium kXInputTypeXbox360 |
| 82 | Razer 1532:0a03 (XboxOne mode) | 1532:0a03 | Chromium kXInputTypeXboxOne |
| 83 | Razer 1689:fe00 (Xbox360 mode) | 1689:fe00 | Chromium kXInputTypeXbox360 |
| 84 | Microsoft 045e:02a0 (Xbox360 mode) | 045e:02a0 | Chromium kXInputTypeXbox360 |
| 85 | Logitech 046d:c21f (Xbox360 mode) | 046d:c21f | Chromium kXInputTypeXbox360 |
| 86 | HORI 0f0d:000d (Xbox360 mode) | 0f0d:000d | Chromium kXInputTypeXbox360 |
| 87 | Mad Catz 0738:4726 (Xbox360 mode) | 0738:4726 | Chromium kXInputTypeXbox360 |
| 88 | PDP / Logic3 0e6f:011f (Xbox360 mode) | 0e6f:011f | Chromium kXInputTypeXbox360 |
| 89 | PowerA 24c6:5303 (Xbox360 mode) | 24c6:5303 | Chromium kXInputTypeXbox360 |
| 90 | Microsoft 045e:02a1 (Xbox360 mode) | 045e:02a1 | Chromium kXInputTypeXbox360 |
| 91 | Logitech 046d:c242 (Xbox360 mode) | 046d:c242 | Chromium kXInputTypeXbox360 |
| 92 | HORI 0f0d:0016 (Xbox360 mode) | 0f0d:0016 | Chromium kXInputTypeXbox360 |
| 93 | Mad Catz 0738:4728 (Xbox360 mode) | 0738:4728 | Chromium kXInputTypeXbox360 |
| 94 | PDP / Logic3 0e6f:0131 (Xbox360 mode) | 0e6f:0131 | Chromium kXInputTypeXbox360 |
| 95 | PowerA 24c6:530a (Xbox360 mode) | 24c6:530a | Chromium kXInputTypeXbox360 |
| 96 | Microsoft 045e:02d1 (XboxOne mode) | 045e:02d1 | Chromium kXInputTypeXboxOne |
| 97 | Logitech 046d:caa3 (Xbox360 mode) | 046d:caa3 | Chromium kXInputTypeXbox360 |
| 98 | HORI 0f0d:001b (Xbox360 mode) | 0f0d:001b | Chromium kXInputTypeXbox360 |
| 99 | Mad Catz 0738:4736 (Xbox360 mode) | 0738:4736 | Chromium kXInputTypeXbox360 |
| 100 | PDP / Logic3 0e6f:0133 (Xbox360 mode) | 0e6f:0133 | Chromium kXInputTypeXbox360 |
