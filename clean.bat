@echo off
cd /d "%~dp0"
echo Cleaning desktop build artifacts...

if exist "dist" (
  rmdir /s /q "dist"
  echo   Deleted dist
)
if exist "out" (
  rmdir /s /q "out"
  echo   Deleted out
)
if exist "node" (
  rmdir /s /q "node"
  echo   Deleted node (portable Node)
)

if "%1"=="full" (
  if exist "node_modules" (
    rmdir /s /q "node_modules"
    echo   Deleted node_modules
  )
  echo Full clean done. Run setup-portable.bat or npm install, then build.bat.
) else (
  echo Done. Run build.bat to rebuild.
  echo Use clean.bat full to also remove node_modules.
)
