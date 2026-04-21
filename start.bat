@echo off
setlocal ENABLEDELAYEDEXPANSION
cd /d "%~dp0"

echo ========================================
echo  Dead Spin - starting all services
echo ========================================
echo.

REM ---- 1) Postgres + Redis ----
echo [1/4] Docker: Postgres + Redis...
docker compose up -d
if errorlevel 1 (
    echo.
    echo ERROR: Docker Desktop is not running or docker-compose failed.
    pause
    exit /b 1
)

REM Ждём пока Postgres готов принимать соединения.
echo      Waiting for Postgres to be ready...
:wait_pg
docker exec dead-spin-pg pg_isready -U deadspin -d deadspin >nul 2>&1
if errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto wait_pg
)
echo      Postgres is ready.

REM ---- 2) API ----
if not exist "apps\api\.env" (
    echo [setup] apps\api\.env not found, copying from .env.example
    copy /y "apps\api\.env.example" "apps\api\.env" >nul
)
echo [2/4] Starting API  - http://localhost:3001
start "dead-spin-api" cmd /k "cd /d %~dp0apps\api && pnpm dev"

REM ---- 3) Bot ----
if exist "apps\bot\.env" (
    findstr /r /c:"^TELEGRAM_BOT_TOKEN=..*" "apps\bot\.env" >nul
    if errorlevel 1 (
        echo [3/4] Bot:  TELEGRAM_BOT_TOKEN is empty in apps\bot\.env - skipping.
    ) else (
        echo [3/4] Starting Bot
        start "dead-spin-bot" cmd /k "cd /d %~dp0apps\bot && pnpm dev"
    )
) else (
    echo [3/4] Bot:  apps\bot\.env not found - skipping. Copy .env.example and set TELEGRAM_BOT_TOKEN to enable.
)

REM ---- 4) Game ----
if not exist "apps\game\.env" (
    echo [setup] apps\game\.env not found, copying from .env.example
    copy /y "apps\game\.env.example" "apps\game\.env" >nul
)
echo [4/4] Starting Game - http://localhost:5173
start "dead-spin-game" cmd /k "cd /d %~dp0apps\game && pnpm dev"

echo.
echo ========================================
echo  All services launched.
echo    API:   http://localhost:3001
echo    Game:  http://localhost:5173
echo    PG:    localhost:5432  (deadspin/deadspin)
echo.
echo  To stop: run stop.bat
echo ========================================
echo.
