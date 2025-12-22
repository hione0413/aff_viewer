@echo off
echo ========================================
echo   Starting Services
echo ========================================

set ROOT_DIR=%~dp0

echo.
echo [1/2] Starting API server...
cd /d %ROOT_DIR%packages\api

if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)

call .venv\Scripts\activate
pip install -e . >nul 2>&1

start "API Server" cmd /k cd /d %ROOT_DIR%packages\api ^&^& call .venv\Scripts\activate ^&^& uvicorn affiliate_api.main:app --reload --port 8000

echo.
echo [2/2] Starting Web server...
cd /d %ROOT_DIR%packages\web

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

start "Web Server" cmd /k cd /d %ROOT_DIR%packages\web ^&^& npm run dev

echo.
echo ========================================
echo   Services started!
echo ========================================
echo.
echo   API: http://localhost:8000
echo   Web: http://localhost:3000
echo.
echo   Run stop.bat to stop services.
echo ========================================
