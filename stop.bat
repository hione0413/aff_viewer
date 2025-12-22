@echo off
echo ========================================
echo   Stopping Services
echo ========================================

echo.
echo Stopping API Server...
taskkill /FI "WINDOWTITLE eq API Server*" /F >nul 2>&1

echo Stopping Web Server...
taskkill /FI "WINDOWTITLE eq Web Server*" /F >nul 2>&1

echo.
echo Killing processes on port 8000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo Killing processes on port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo ========================================
echo   Services stopped.
echo ========================================
