param([string]$Script, [string]$Plan, [string]$LogPath)
$ErrorActionPreference = 'Stop'
$arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $Script + '" "' + $Plan + '"'
$helper = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $arguments -WindowStyle Hidden -RedirectStandardOutput $LogPath -RedirectStandardError ($LogPath+'.error') -PassThru
# Confirm that the helper actually started before the app exits.
for ($attempt=0; $attempt -lt 50; $attempt++) {
    if ((Test-Path -LiteralPath $LogPath) -and (Get-Item -LiteralPath $LogPath).Length -gt 0) { exit 0 }
    if ($helper.HasExited) { throw 'The update helper could not start; the app will stay open.' }
    Start-Sleep -Milliseconds 100
}
throw 'The update helper did not become ready; the app will stay open.'
