@echo off
setlocal

echo Stopping Liuli backend and Web frontend...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ports = @(8000, 5173); " ^
  "$connections = Get-NetTCPConnection -LocalPort $ports -ErrorAction SilentlyContinue; " ^
  "$processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -ne 0 }; " ^
  "$workers = Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'python*.exe' -and $_.CommandLine -match 'python(\\.exe)?\"?\\s+-m\\s+invest_assistant\\.worker' }; " ^
  "$workerIds = $workers | Select-Object -ExpandProperty ProcessId -Unique; " ^
  "$processIds = @($processIds) + @($workerIds) | Select-Object -Unique; " ^
  "if (-not $processIds) { Write-Host 'No Liuli processes found on ports 8000/5173 or worker process.'; exit 0 }; " ^
  "foreach ($processId in $processIds) { " ^
  "  $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue; " ^
  "  if ($proc) { Write-Host ('Stopping PID {0} ({1})' -f $processId, $proc.ProcessName); Stop-Process -Id $processId -Force } " ^
  "}"

echo Done.

endlocal
