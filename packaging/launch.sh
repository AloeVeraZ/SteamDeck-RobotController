#!/usr/bin/env bash
set -euo pipefail
app_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
unset ELECTRON_RUN_AS_NODE
# SteamOS / gamescope and KDE both provide Xwayland. Chromium uses unprivileged
# user namespaces; no setuid helper or root-owned system installation is needed.
exec "$app_dir/runtime/electron" --disable-setuid-sandbox --ozone-platform=x11 "$app_dir/app" "$@"
