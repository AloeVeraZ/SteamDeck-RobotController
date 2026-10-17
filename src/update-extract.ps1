param([string]$Archive, [string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = [IO.Path]::GetFullPath($Destination).TrimEnd('\') + '\'
$zip = [IO.Compression.ZipFile]::OpenRead($Archive)
try {
    foreach ($entry in $zip.Entries) {
        $target = [IO.Path]::GetFullPath((Join-Path $root $entry.FullName))
        if (!$target.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe update archive path' }
    }
} finally { $zip.Dispose() }
Expand-Archive -LiteralPath $Archive -DestinationPath $Destination
