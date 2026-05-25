@echo off
setlocal

set "ROOT=%~dp0"
set "WEB_DIR=%ROOT%invest_assistant\ui\web"

echo Stopping Liuli backend, worker and Web frontend...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = '%ROOT%'.TrimEnd('\'); " ^
  "$web = '%WEB_DIR%'.TrimEnd('\'); " ^
  "$all = Get-CimInstance Win32_Process; " ^
  "$matched = $all | Where-Object { " ^
  "  $cmd = [string]$_.CommandLine; " ^
  "  $isLiuliRuntime = $_.Name -like 'python*.exe' -or $_.Name -eq 'node.exe' -or $_.Name -eq 'cmd.exe' -or $_.Name -eq 'esbuild.exe'; " ^
  "  $isLiuliRuntime -and (" ^
  "    $cmd -like '*invest_assistant.main:app*' -or " ^
  "    $cmd -like '*invest_assistant.worker*' -or " ^
  "    $cmd -like ('*' + $web + '*') -or " ^
  "    $cmd -like '*invest_assistant\\ui\\web*' -or " ^
  "    $cmd -like '*vite --host 127.0.0.1 --port 5173*' " ^
  "  )" ^
  "}; " ^
  "$ids = @($matched | Select-Object -ExpandProperty ProcessId); " ^
  "$parentIds = @($matched | Where-Object { $_.ParentProcessId } | ForEach-Object { $_.ParentProcessId }); " ^
  "$cmdParents = $all | Where-Object { $parentIds -contains $_.ProcessId -and $_.Name -like 'cmd.exe' }; " ^
  "$ids = @($ids) + @($cmdParents | Select-Object -ExpandProperty ProcessId) | Select-Object -Unique; " ^
  "if (-not $ids) { Write-Host 'No Liuli processes found.'; exit 0 }; " ^
  "foreach ($processId in $ids) { " ^
  "  $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue; " ^
  "  if ($proc) { Write-Host ('Stopping Liuli PID {0} ({1})' -f $processId, $proc.ProcessName); Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue } " ^
  "}"

echo Done.

endlocal
