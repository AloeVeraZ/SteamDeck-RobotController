$ErrorActionPreference = 'Stop'
$installDir = Join-Path $env:LOCALAPPDATA 'DeckDriverStation'
$sourceDir = $PSScriptRoot
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
foreach ($item in @('app', 'runtime')) {
    Copy-Item -LiteralPath (Join-Path $sourceDir $item) -Destination $installDir -Recurse -Force
}
$wscript = New-Object -ComObject WScript.Shell
$locations = @([Environment]::GetFolderPath('Desktop'), (Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs'))
foreach ($location in $locations) {
    New-Item -ItemType Directory -Force -Path $location | Out-Null
    $shortcut = $wscript.CreateShortcut((Join-Path $location 'Deck Driver Station.lnk'))
    $shortcut.TargetPath = Join-Path $installDir 'runtime/electron.exe'
    $shortcut.Arguments = '"' + (Join-Path $installDir 'app') + '"'
    $shortcut.WorkingDirectory = $installDir
    $shortcut.IconLocation = Join-Path $installDir 'app/ui/icon.ico'
    $shortcut.Save()
}
Write-Host 'Installed. Open Deck Driver Station from the desktop or Start menu.'
