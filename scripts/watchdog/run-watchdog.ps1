[CmdletBinding()]
param(
  [switch]$DryRun,
  [switch]$Scheduled,
  [switch]$TestNotificationOnly
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$node = (Get-Command node -ErrorAction Stop).Source
$arguments = @((Join-Path $PSScriptRoot 'run.mjs'))
if ($DryRun) { $arguments += '--dry-run' }
if ($Scheduled) { $arguments += '--scheduled' }
if ($TestNotificationOnly) { $arguments += '--test-notification-only' }

Push-Location $repoRoot
try {
  & $node @arguments
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
