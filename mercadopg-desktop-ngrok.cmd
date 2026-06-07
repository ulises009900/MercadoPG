@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "PS1_FILE=%ROOT_DIR%scripts\start-ngrok-desktop.ps1"

if not exist "%PS1_FILE%" (
  echo No se encontro el script:
  echo   %PS1_FILE%
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1_FILE%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo No se pudo iniciar MercadoPG con ngrok.
  pause
)

endlocal & exit /b %EXIT_CODE%
