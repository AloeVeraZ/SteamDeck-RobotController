$ErrorActionPreference = 'Stop'
$installDir = Join-Path $env:LOCALAPPDATA 'DeckDriverStation'
$sourceDir = $PSScriptRoot
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
foreach ($item in @('app', 'runtime')) {
    Copy-Item -LiteralPath (Join-Path $sourceDir $item) -Destination $installDir -Recurse -Force
}
Copy-Item -LiteralPath (Join-Path $sourceDir 'DeckDriverStation.exe') -Destination $installDir -Force
$wscript = New-Object -ComObject WScript.Shell
$locations = @([Environment]::GetFolderPath('Desktop'), (Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs'))
foreach ($location in $locations) {
    New-Item -ItemType Directory -Force -Path $location | Out-Null
    $shortcut = $wscript.CreateShortcut((Join-Path $location 'Deck Driver Station.lnk'))
    $shortcut.TargetPath = Join-Path $installDir 'DeckDriverStation.exe'
    $shortcut.Arguments = ''
    $shortcut.WorkingDirectory = $installDir
    $shortcut.IconLocation = (Join-Path $installDir 'DeckDriverStation.exe') + ',0'
    $shortcut.Save()
}
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class DeckShellNotify { [DllImport("shell32.dll")] public static extern void SHChangeNotify(uint e,uint f,IntPtr a,IntPtr b); }'
[DeckShellNotify]::SHChangeNotify(0x08000000,0,[IntPtr]::Zero,[IntPtr]::Zero)
Write-Host 'Installed. Open Deck Driver Station from the desktop or Start menu.'
