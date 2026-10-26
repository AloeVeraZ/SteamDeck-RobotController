# Installs this checkout's app files and simulator runtime into the local Windows driver station
# (%LOCALAPPDATA%\DeckDriverStation\app). Development use on this laptop only; nothing is published.
# - Backs up the installed app files (and a copy of the small user settings files) first.
# - Closes only this install's verified main Electron process, gracefully first.
# - Leaves user data (%APPDATA%\Deck Driver Station), the launcher, runtime, icons and shortcuts untouched.
param([string]$Source = (Resolve-Path "$PSScriptRoot\..\..").Path, [switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
$install = Join-Path $env:LOCALAPPDATA 'DeckDriverStation'
$app = Join-Path $install 'app'
$userData = Join-Path $env:APPDATA 'Deck Driver Station'
foreach ($required in 'sim-runtime\manifest.json', 'sim-runtime\java\bin\java.exe', 'sim-runtime\driver\classes\deck\sim\RunBridge.class', 'sim-runtime\occt\occt-import-js.wasm', 'ui\sim-timed.js', 'ui\vendor\three-view.js', 'ui\vendor\planning.js', 'ui\vendor\models\decode\field.glb', 'ui\vendor\models\biobuzz\field.glb', 'ui\vendor\models\biobuzz\elements.glb', 'ui\assets\fields\NOTICES.md', 'ui\assets\robots\catalog.json', 'ui\assets\robots\strafer.glb.gz', 'ui\assets\robots\swechanum.glb.gz') {
    if (-not (Test-Path (Join-Path $Source $required))) { throw "Missing $required. Run: node tools/simulation/build.cjs" }
}
if (-not (Test-Path (Join-Path $app 'package.json'))) { throw "No installed app at $app." }

$version = (Get-Content (Join-Path $app 'package.json') -Raw | ConvertFrom-Json).version
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $env:LOCALAPPDATA "DeckDriverStation-backups\app-$version-$stamp"
New-Item -ItemType Directory -Force $backup | Out-Null
robocopy $app (Join-Path $backup 'app') /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Backup failed (robocopy $LASTEXITCODE)." }
if (Test-Path $userData) {
    New-Item -ItemType Directory -Force (Join-Path $backup 'user-settings') | Out-Null
    Get-ChildItem $userData -File -Filter *.json | Copy-Item -Destination (Join-Path $backup 'user-settings')
}
Write-Output "Backup: $backup"

# Only the main process of THIS install (no --type= switch); its helpers exit with it.
$main = @(Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.ExecutablePath -like "$install\*" -and $_.CommandLine -notmatch '--type=' })
foreach ($p in $main) {
    $proc = Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue
    if ($proc) { [void]$proc.CloseMainWindow(); if (-not $proc.WaitForExit(10000)) { Stop-Process -Id $p.ProcessId -Force; $proc.WaitForExit(5000) | Out-Null } }
    Write-Output "Closed Deck Driver Station (PID $($p.ProcessId))."
}
Start-Sleep -Milliseconds 500

foreach ($dir in 'src', 'ui', 'sim-runtime') {
    robocopy (Join-Path $Source $dir) (Join-Path $app $dir) /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Copy of $dir failed (robocopy $LASTEXITCODE). Restore from $backup." }
}
Copy-Item (Join-Path $Source 'package.json') (Join-Path $app 'package.json') -Force
Set-Content -Path (Join-Path $app 'licenses\SIMULATION-THIRD-PARTY.txt') -Encoding utf8 -Value @'
The offline simulator bundles third-party code and assets. Licenses and notices:
  ui/vendor/licenses/   DSIM (PolyForm Noncommercial 1.0.0, noncommercial use only), historical adapter notices,
                        three.js (MIT), Rapier (Apache-2.0), Clipper (Boost 1.0), dijkstrajs (MIT),
                        occt-import-js and Open CASCADE Technology (LGPL-2.1) for STEP import
  sim-runtime/driver/   Deck controller and Gson notice (Apache-2.0)
  sim-runtime/java/legal/  Eclipse Temurin OpenJDK 21 notices (GPLv2 with Classpath Exception)
  ui/assets/robots/NOTICES.md  goBILDA Strafer and NYC FIRST A301 Swechanum CAD sources and local preparation
  ui/assets/fields/NOTICES.md  DSIM BIOBUZZ and official FIRST DECODE field CAD; local noncommercial use
'@

# Verify the copy byte for byte against the tested checkout.
$checked = 0
$sourceRoot = (Resolve-Path -LiteralPath $Source).Path.TrimEnd('\')
$sourceFiles = @((Get-Item -LiteralPath (Join-Path $sourceRoot 'package.json')))
foreach ($dir in 'src', 'ui', 'sim-runtime') { $sourceFiles += Get-ChildItem -LiteralPath (Join-Path $sourceRoot $dir) -File -Recurse }
foreach ($file in $sourceFiles) {
    $rel = $file.FullName.Substring($sourceRoot.Length + 1)
    if ((Get-FileHash (Join-Path $Source $rel)).Hash -ne (Get-FileHash (Join-Path $app $rel)).Hash) { throw "Installed $rel differs from the source." }
    $checked++
}
Write-Output "Installed and verified all $checked copied files into $app."
if (-not $NoLaunch) { Start-Process (Join-Path $install 'DeckDriverStation.exe') -WindowStyle Hidden; Write-Output 'Launched Deck Driver Station.' }
exit 0
