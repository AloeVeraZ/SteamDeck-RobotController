param([string]$PlanPath)
$ErrorActionPreference = 'Stop'
Write-Output 'Starting update installer'
$plan = Get-Content -LiteralPath $PlanPath -Raw | ConvertFrom-Json
$source = [IO.Path]::GetFullPath($plan.source)
$destination = [IO.Path]::GetFullPath($plan.destination)
$stage = [IO.Path]::GetFullPath($plan.stage).TrimEnd('\') + '\'
if (!$source.StartsWith($stage, [StringComparison]::OrdinalIgnoreCase)) { throw 'Update source is outside staging' }
if (!(Test-Path -LiteralPath (Join-Path $destination 'app/package.json'))) { throw 'Installed app is missing' }
Wait-Process -Id $plan.pid -Timeout 60 -ErrorAction SilentlyContinue
if (Get-Process -Id $plan.pid -ErrorAction SilentlyContinue) { throw 'App did not exit; update cancelled' }
Write-Output 'App exited; replacing files'
$backup = Join-Path $stage 'previous'
New-Item -ItemType Directory -Path $backup | Out-Null
$moved = @()
$installed = @()
try {
    foreach ($item in @('app','runtime')) {
        $target = Join-Path $destination $item
        $done = $false
        for ($attempt=0; $attempt -lt 20; $attempt++) {
            try { Move-Item -LiteralPath $target -Destination $backup; $done=$true; break } catch { Start-Sleep -Milliseconds 500 }
        }
        if (!$done) { throw "Could not replace $item" }
        $moved += $item
        Move-Item -LiteralPath (Join-Path $source $item) -Destination $destination
        $installed += $item
    }
} catch {
    foreach ($item in $installed) { Move-Item -LiteralPath (Join-Path $destination $item) -Destination (Join-Path $stage ('failed-'+$item)) }
    foreach ($item in $moved) { Move-Item -LiteralPath (Join-Path $backup $item) -Destination $destination }
    throw
}
Start-Process -FilePath (Join-Path $destination 'runtime/electron.exe') -ArgumentList ('"'+(Join-Path $destination 'app')+'"') -WorkingDirectory $destination -WindowStyle Hidden
Write-Output 'Update installed; restarted application'
