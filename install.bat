@echo off
title Smart Dairy - Installer
color 0A
echo.
echo  ========================================
echo   Smart Dairy - One-Click Installer
echo  ========================================
echo.

:: ─── Check Node.js ─────────────────────────────────────────────────
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Node.js is not installed!
    echo.
    echo  Please install Node.js from:
    echo    https://nodejs.org
    echo.
    echo  Download the LTS version, install it,
    echo  then run this installer again.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%a in ('node -v') do set NODE_VER=%%a
echo  [OK] Node.js found: %NODE_VER%

:: ─── Navigate to project directory ─────────────────────────────────
cd /d "%~dp0"
echo  [OK] Working directory: %cd%

:: ─── Install frontend dependencies ─────────────────────────────────
echo.
echo  [1/4] Installing frontend dependencies...
call npm install --silent
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] npm install failed!
    pause
    exit /b 1
)
echo  [OK] Frontend dependencies installed.

:: ─── Install server dependencies ───────────────────────────────────
echo.
echo  [2/4] Installing server dependencies...
cd server
call npm install --silent
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Server npm install failed!
    pause
    exit /b 1
)
cd ..
echo  [OK] Server dependencies installed.

:: ─── Install socket.io-client for frontend ─────────────────────────
echo.
echo  [2.5/4] Installing Socket.io client...
call npm install socket.io-client --save --silent
echo  [OK] Socket.io client installed.

:: ─── Build the React app ───────────────────────────────────────────
echo.
echo  [3/4] Building Smart Dairy...
call npm run build
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Build failed!
    pause
    exit /b 1
)
echo  [OK] Production build complete.

:: ─── Create Desktop Shortcut ───────────────────────────────────────
echo.
echo  [4/4] Creating desktop shortcut...
cscript //nologo "%~dp0scripts\create-shortcut.vbs"
echo  [OK] Desktop shortcut created.

:: ─── Done ──────────────────────────────────────────────────────────
echo.
echo  ========================================
echo   Installation Complete!
echo  ========================================
echo.
echo   Double-click the "Smart Dairy" icon
echo   on your Desktop to start the software.
echo.
echo   First time? Go to Settings to:
echo     - Set your dairy name and address
echo     - Connect WhatsApp (scan QR once)
echo.
echo  ========================================
echo.
pause
