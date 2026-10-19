#!/bin/bash
set -euo pipefail
source_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
destination="$HOME/Applications/Deck Driver Station.app"
mkdir -p "$HOME/Applications"
/usr/bin/ditto "$source_dir/Deck Driver Station.app" "$destination"
# Ad-hoc sign locally after adding our app and icon to the Electron bundle.
# This needs no Apple account and does not alter system Gatekeeper settings.
/usr/bin/codesign --force --deep --sign - "$destination"
if [[ -d "$HOME/Desktop" && ! -e "$HOME/Desktop/Deck Driver Station.app" ]]; then
  /bin/ln -s "$destination" "$HOME/Desktop/Deck Driver Station.app"
fi
printf '\nInstalled in ~/Applications. This personal build is not Apple-notarized.\nIf macOS asks for approval, use Privacy & Security > Open Anyway.\n'
if [[ "${DECK_NO_LAUNCH:-}" != 1 ]]; then /usr/bin/open "$destination"; fi
