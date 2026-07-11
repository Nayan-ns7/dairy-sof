@echo off
title Smart Dairy Server
color 0A

:: Navigate to project directory
cd /d "%~dp0"

:: Check if dist/ exists (need to build first)
if not exist "dist\index.html" (
    echo.
    echo  [WARNING] Production build not found.
    echo  Running build first...
    call npm run build
    if %errorlevel% neq 0 (
        color 0C
        echo  [ERROR] Build failed! Run install.bat first.
        pause
        exit /b 1
    )
)

:: Start the server
echo.
echo  Starting Smart Dairy Server...
echo  (Chrome will open automatically)
echo.
echo  Press Ctrl+C to stop.
echo.
cd server
node index.js
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  [ERROR] Smart Dairy Server failed to run!
    echo  Please ensure port 3000 is not already in use.
    echo.
    pause
    exit /b 1
)
