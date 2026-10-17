# Installs the Proud Indian signing helper on Windows (no administrator rights).
#
#   & ([scriptblock]::Create((iwr -useb https://raw.githubusercontent.com/proud-indian-ngo/dash/master/services/signing-helper/install/install-windows.ps1))) -Server https://dash.example.org
#
# Downloads the latest helper release, writes its config and registers the
# pidash-sign:// links for this user.
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [string]$Module = "C:\Windows\System32\castle.dll"
)
$ErrorActionPreference = "Stop"
$Repo = "proud-indian-ngo/dash"
$Dir = Join-Path $env:LOCALAPPDATA "pidash-sign"
$ConfigDir = Join-Path $env:APPDATA "pidash-sign"

$Release = (Invoke-RestMethod "https://api.github.com/repos/$Repo/releases") |
  Where-Object { $_.tag_name -like "signing-helper-v*" } | Select-Object -First 1
if (-not $Release) { throw "No helper release found." }
New-Item -ItemType Directory -Force -Path $Dir, $ConfigDir | Out-Null
$Zip = Join-Path $env:TEMP "pidash-sign.zip"
Invoke-WebRequest -UseBasicParsing -OutFile $Zip `
  "https://github.com/$Repo/releases/download/$($Release.tag_name)/pidash-sign-windows-x64.zip"
Expand-Archive -Force -Path $Zip -DestinationPath $Dir
Remove-Item $Zip

@{ server = $Server; module = $Module } | ConvertTo-Json |
  Set-Content -Encoding UTF8 (Join-Path $ConfigDir "config.json")

$Exe = Join-Path $Dir "pidash-sign.exe"
$Key = "HKCU:\Software\Classes\pidash-sign"
New-Item -Force -Path "$Key\shell\open\command" | Out-Null
Set-ItemProperty -Path $Key -Name "(Default)" -Value "URL:Proud Indian signing"
Set-ItemProperty -Path $Key -Name "URL Protocol" -Value ""
Set-ItemProperty -Path "$Key\shell\open\command" -Name "(Default)" -Value "`"$Exe`" `"%1`""

if (-not (Test-Path $Module)) {
  Write-Warning "The token driver wasn't found at $Module. Install the HyperSecu (ePass) driver, or edit $ConfigDir\config.json."
}
Write-Host "Installed $($Release.tag_name). Plug in your DSC token and return to the dashboard."
