param([Parameter(Mandatory=$true)][string]$Device)
$ErrorActionPreference='Stop'
$config=Get-NetIPConfiguration -InterfaceAlias $Device
$profile=Get-NetConnectionProfile -InterfaceAlias $Device -ErrorAction SilentlyContinue
$address=@($config.IPv4Address)[0]
@{address=$address.IPAddress;prefix=$address.PrefixLength;gateway=@($config.IPv4DefaultGateway)[0].NextHop;internet=$(if($profile.IPv4Connectivity -eq 'Internet'){'full'}elseif($profile.IPv4Connectivity -in @('LocalNetwork','Subnet','NoTraffic')){'limited'}else{'unknown'})} | ConvertTo-Json -Compress
