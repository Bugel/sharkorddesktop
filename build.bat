@echo off
cd /d "%~dp0"
set "DESKTOP=%~dp0"
set "NODE_DIR=%DESKTOP%node"
set "NPM_CLI=%NODE_DIR%\node_modules\npm\bin\npm-cli.js"

if exist "%NODE_DIR%\node.exe" (
    set "PATH=%NODE_DIR%;%PATH%"
    set "NPM_RUN=%NODE_DIR%\node.exe"
) else (
    set "NPM_RUN=node"
)

if not exist "node_modules" (
    echo Installing dependencies...
    if exist "%NODE_DIR%\node.exe" (
        "%NODE_DIR%\node.exe" "%NPM_CLI%" install
    ) else (
        call npm install
    )
    if errorlevel 1 goto err
)

echo Building...
if exist "%NODE_DIR%\node.exe" (
    "%NODE_DIR%\node.exe" "%NPM_CLI%" run build
) else (
    call npm run build
)
if errorlevel 1 goto err
echo Build complete.
goto end

:err
echo.
echo Build failed. If Node was not found, run setup-portable.bat first.
pause
exit /b 1

:end
