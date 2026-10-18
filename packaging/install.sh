#!/usr/bin/env bash
set -euo pipefail
source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
data_dir="${XDG_DATA_HOME:-$HOME/.local/share}"
install_dir="$data_dir/deck-driver-station"
if [[ "$(uname -m)" != "x86_64" ]]; then
  echo 'This build needs an x86_64 Linux computer (Steam Deck LCD or OLED).'; exit 1
fi
if [[ ! -f "$source_dir/runtime/electron" ]]; then
  echo 'Extract the complete SteamDeck installer archive first.'; exit 1
fi
if [[ "$source_dir" != "$install_dir" ]]; then
  mkdir -p -- "$install_dir"
  cp -a -- "$source_dir/app" "$source_dir/runtime" "$source_dir/launch.sh" "$source_dir/QUICKSTART.md" "$install_dir/"
fi
chmod +x -- "$install_dir/launch.sh" "$install_dir/runtime/electron" "$install_dir/runtime/chrome_crashpad_handler"
mkdir -p -- "$data_dir/applications" "$data_dir/icons/hicolor/scalable/apps"
cp -- "$install_dir/app/ui/icon.svg" "$data_dir/icons/hicolor/scalable/apps/deck-driver-station.svg"
# Escape values according to the Desktop Entry Exec string rules.
exec_path="${install_dir//\\/\\\\}/launch.sh"
exec_path="${exec_path//\"/\\\"}"
exec_path="${exec_path//\$/\\\$}"
exec_path="${exec_path//\`/\\\`}"
exec_path="${exec_path//%/%%}"
cat > "$data_dir/applications/deck-driver-station.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Deck Driver Station
Comment=Open robot websites with saved Wi-Fi networks and addresses
Exec="$exec_path"
Icon=$install_dir/app/ui/icon.png
Terminal=false
Categories=Utility;Education;
StartupWMClass=deck-driver-station
EOF
desktop_dir="$(xdg-user-dir DESKTOP 2>/dev/null || printf '%s/Desktop' "$HOME")"
mkdir -p -- "$desktop_dir"
cp -- "$data_dir/applications/deck-driver-station.desktop" "$desktop_dir/Deck Driver Station.desktop"
chmod +x -- "$desktop_dir/Deck Driver Station.desktop"
command -v gio >/dev/null && gio set "$desktop_dir/Deck Driver Station.desktop" metadata::trusted true 2>/dev/null || true
command -v update-desktop-database >/dev/null && update-desktop-database "$data_dir/applications" || true
printf '\nInstalled Deck Driver Station.\nLaunch it from the application menu.\nIn Steam: Games > Add a Non-Steam Game > Deck Driver Station.\nChoose a Gamepad template with both sticks as joysticks.\nDesktop shortcut: keep Steam running; hold Menu to select Gamepad Mode.\nNo sudo, Proton, or SteamOS system changes are required.\n'
if [[ "${DECK_NO_LAUNCH:-}" != 1 ]]; then
  nohup bash "$install_dir/launch.sh" </dev/null >"${TMPDIR:-/tmp}/deck-driver-station-launch.log" 2>&1 &
fi
