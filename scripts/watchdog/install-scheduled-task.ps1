[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$taskName = 'Honest Lenses Deployment and Search Watchdog'
$runner = (Resolve-Path (Join-Path $PSScriptRoot 'run-watchdog.ps1')).Path
$powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$action = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$runner`" -Scheduled" -WorkingDirectory (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$trigger = New-ScheduledTaskTrigger -Daily -At '7:00 AM'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 12) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$description = 'Read-only deployment, production SEO, and Google Search Console watchdog. Central-time schedule; local lock and once-per-calendar-day guard enabled.'

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description $description -Force | Out-Null
$task = Get-ScheduledTask -TaskName $taskName
$info = Get-ScheduledTaskInfo -TaskName $taskName
[pscustomobject]@{
  TaskName = $task.TaskName
  State = $task.State
  Enabled = $task.Settings.Enabled
  NextRunTime = $info.NextRunTime
  LastTaskResult = $info.LastTaskResult
  StartWhenAvailable = $task.Settings.StartWhenAvailable
  MultipleInstances = $task.Settings.MultipleInstances
  ExecutionTimeLimit = $task.Settings.ExecutionTimeLimit
}
