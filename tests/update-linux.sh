#!/usr/bin/env bash
set -euo pipefail
repo="$(cd -- "$(dirname -- "$0")/.." && pwd)"
folder="$(mktemp -d "$repo/test-results/linux-update-XXXXXX")"
for scenario in success rollback; do
  base="$folder/$scenario"; installed="$base/installed"; stage="$base/stage"; source_dir="$stage/extracted/payload"
  mkdir -p "$installed/app" "$installed/runtime" "$source_dir/app"
  printf old > "$installed/app/package.json"
  printf new > "$source_dir/app/package.json"
  printf 'saved robot data' > "$base/robots.json"
  printf '#!/usr/bin/env bash\nprintf restarted > "$(dirname -- "$0")/restarted"\n' > "$source_dir/launch.sh"
  cp "$source_dir/launch.sh" "$installed/launch.sh"
  chmod +x "$installed/launch.sh" "$source_dir/launch.sh"
  if [[ "$scenario" == success ]]; then mkdir "$source_dir/runtime"; fi
  if bash "$repo/src/update-install.sh" "$source_dir" "$installed" 999999 linux "$stage"; then
    [[ "$scenario" == success && "$(cat "$installed/app/package.json")" == new ]]
    [[ "$(cat "$stage/previous/app/package.json")" == old ]]
    for ((i=0;i<20;i++)); do [[ -f "$installed/restarted" ]] && break; sleep .1; done
    [[ -f "$installed/restarted" ]]
  else
    [[ "$scenario" == rollback && "$(cat "$installed/app/package.json")" == old && -d "$installed/runtime" ]]
  fi
  [[ "$(cat "$base/robots.json")" == 'saved robot data' ]]
done
printf 'PASS: Steam Deck/Linux helper replacement, backup, restart, saved-data preservation, and rollback (shell fixtures).\n'
