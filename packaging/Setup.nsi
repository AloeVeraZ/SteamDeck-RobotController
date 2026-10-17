Unicode true
!include "MUI2.nsh"
Name "Deck Driver Station"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\DeckDriverStation"
RequestExecutionLevel user
SetCompressor /FINAL zlib
Icon "${ICON}"
UninstallIcon "${ICON}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "Deck Driver Station Setup"
VIAddVersionKey /LANG=1033 "FileDescription" "Deck Driver Station Installer"
VIAddVersionKey /LANG=1033 "FileVersion" "${VERSION}"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\DeckDriverStation.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Open Deck Driver Station"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Section "Deck Driver Station"
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File "${PAYLOAD}\DeckDriverStation.exe"
  SetOutPath "$INSTDIR\app"
  File /r "${PAYLOAD}\app\*"
  SetOutPath "$INSTDIR\runtime"
  File /r "${PAYLOAD}\runtime\*"
  CreateShortCut "$DESKTOP\Deck Driver Station.lnk" "$INSTDIR\DeckDriverStation.exe" "" "$INSTDIR\DeckDriverStation.exe" 0
  CreateShortCut "$SMPROGRAMS\Deck Driver Station.lnk" "$INSTDIR\DeckDriverStation.exe" "" "$INSTDIR\DeckDriverStation.exe" 0
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  FileOpen $0 "$INSTDIR\.deck-driver-station-install" w
  FileWrite $0 "dev.deckdriverstation.app"
  FileClose $0
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckDriverStation" "DisplayName" "Deck Driver Station"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckDriverStation" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckDriverStation" "DisplayIcon" "$INSTDIR\DeckDriverStation.exe,0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckDriverStation" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckDriverStation" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckDriverStation" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckDriverStation" "NoRepair" 1
  System::Call 'shell32::SHChangeNotify(i 0x08000000,i 0,p 0,p 0)'
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  GetFullPathName $INSTDIR "$INSTDIR"
  FileOpen $0 "$INSTDIR\.deck-driver-station-install" r
  IfErrors unsafe
  FileRead $0 $1
  FileClose $0
  StrCmp $1 "dev.deckdriverstation.app" owned unsafe
  unsafe:
    MessageBox MB_ICONSTOP "The installation marker is missing. No app folders were removed."
    Abort
  owned:
  Delete "$DESKTOP\Deck Driver Station.lnk"
  Delete "$SMPROGRAMS\Deck Driver Station.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeckDriverStation"
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\runtime"
  Delete "$INSTDIR\DeckDriverStation.exe"
  Delete "$INSTDIR\Uninstall.exe"
  Delete "$INSTDIR\.deck-driver-station-install"
  RMDir "$INSTDIR"
SectionEnd
