#!/usr/bin/env bash
set -euo pipefail
repo="$(cd -- "$(dirname -- "$0")/.." && pwd)"
mkdir -p "$repo/test-results"
fixture="$(mktemp -d "$repo/test-results/main-bootstrap.XXXXXX")"
mkdir -p "$fixture/bin" "$fixture/tmp"
printf '#!/usr/bin/env bash\necho fixture\n' > "$fixture/payload"
sha256sum "$fixture/payload" | cut -d ' ' -f 1 > "$fixture/hash"
cat > "$fixture/bin/uname" <<'SH'
#!/usr/bin/env bash
case "$1" in -s) echo Linux;; -m) echo x86_64;; esac
SH
cat > "$fixture/bin/curl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
destination='';previous=''
for argument in "$@"; do
  if [[ "$previous" == -o ]]; then destination="$argument"; fi
  previous="$argument"
done
url="${!#}"
if [[ "$url" == https://github.com/AloeVeraZ/SteamDeck-RobotController/releases/latest ]]; then
  printf '%s' "https://github.com/AloeVeraZ/SteamDeck-RobotController/releases/tag/$BOOTSTRAP_TEST_TAG"
elif [[ "$url" == https://github.com/AloeVeraZ/SteamDeck-RobotController/releases/download/v9.8.7/DeckDriverStation-9.8.7-SteamDeck.run.sha256 ]]; then
  printf '%s  DeckDriverStation-9.8.7-SteamDeck.run\r\n' "$(cat "$BOOTSTRAP_FIXTURE/hash")" > "$destination"
elif [[ "$url" == https://github.com/AloeVeraZ/SteamDeck-RobotController/releases/download/v9.8.7/DeckDriverStation-9.8.7-SteamDeck.run ]]; then
  if [[ "${BOOTSTRAP_CORRUPT:-}" == 1 ]]; then echo corrupt > "$destination"; else cp "$BOOTSTRAP_FIXTURE/payload" "$destination"; fi
else
  echo "Unexpected download URL: $url" >&2; exit 47
fi
SH
chmod +x "$fixture/bin/"*
export PATH="$fixture/bin:$PATH" TMPDIR="$fixture/tmp" BOOTSTRAP_FIXTURE="$fixture" DECK_DOWNLOAD_ONLY=1
export BOOTSTRAP_TEST_TAG=v9.8.7
bash "$repo/install.sh"
export BOOTSTRAP_TEST_TAG=testing-v9.8.7
if bash "$repo/install.sh"; then echo 'Testing unexpectedly installed'; exit 1; fi
export BOOTSTRAP_TEST_TAG=v9.8.7 BOOTSTRAP_CORRUPT=1
if bash "$repo/install.sh"; then echo 'Corrupt download unexpectedly accepted'; exit 1; fi
if bash "$repo/install.sh" testing; then echo 'Testing argument unexpectedly accepted'; exit 1; fi
printf 'PASS: Main-only resolution, future versioned assets, Windows CRLF checksum compatibility, checksum verification, prerelease refusal, and invalid-channel refusal.\n'
[[ "$fixture" == "$repo/test-results/main-bootstrap."* ]] && rm -rf -- "$fixture"
