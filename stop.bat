@echo off
cd /d "%~dp0"

echo Stopping Dead Spin services...

REM Закрываем окна CMD, запущенные start.bat по их заголовкам.
taskkill /FI "WindowTitle eq dead-spin-api*" /T /F >nul 2>&1
taskkill /FI "WindowTitle eq dead-spin-bot*" /T /F >nul 2>&1
taskkill /FI "WindowTitle eq dead-spin-game*" /T /F >nul 2>&1

REM Добиваем любые висящие node-процессы dev-серверов в этом проекте.
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*dead-spin*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

REM Останавливаем контейнеры (данные сохраняются в volume).
docker compose down

echo Done. Run start.bat to launch again.
