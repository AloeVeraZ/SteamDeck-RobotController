Unicode true
Name "Deck Driver Station"
OutFile "${OUTPUT}"
Icon "${ICON}"
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "Deck Driver Station"
VIAddVersionKey /LANG=1033 "FileDescription" "Deck Driver Station"
VIAddVersionKey /LANG=1033 "FileVersion" "${VERSION}"
Section
  System::Call 'kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", p 0)'
  SetOutPath "$EXEDIR"
  Exec '"$EXEDIR\runtime\electron.exe" "$EXEDIR\app"'
SectionEnd
