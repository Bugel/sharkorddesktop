@echo off
cd /d "%~dp0"
set "DESKTOP=%~dp0"
set "NODE_DIR=%DESKTOP%node"
set "NPM_CLI=%NODE_DIR%\node_modules\npm\bin\npm-cli.js"

echo Starting Sharkord Desktop...

if not exist "node_modules" (
    echo Installing dependencies...
    if exist "%NODE_DIR%\node.exe" (
        "%NODE_DIR%\node.exe" "%NPM_CLI%" install
    ) else (
        call npm install
    )
    if errorlevel 1 goto err
)

if not exist "dist\main.js" (
    echo Building...
    if exist "%NODE_DIR%\node.exe" (
        "%NODE_DIR%\node.exe" "%NPM_CLI%" run build
    ) else (
        call npm run build
    )
    if errorlevel 1 goto err
)

if exist "%NODE_DIR%\node.exe" (
    set "PATH=%NODE_DIR%;%PATH%"
    "%NODE_DIR%\node.exe" "%NPM_CLI%" run start
) else (
    call npm run start
)
if errorlevel 1 (
    echo.
    echo The app exited with an error.
    goto err
)
goto end

:err
echo.
echo Something failed. If Node was not found, run setup-portable.bat first.
pause
exit /b 1

:end
echo.
pause