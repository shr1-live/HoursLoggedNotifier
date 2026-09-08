@echo off
title Hours Logged Notifier
cd /d "%~dp0"

if not exist "publish\HoursLoggedNotifier.exe" (
  echo No published build found - building one now ^(needs the .NET 10 SDK^)...
  dotnet publish -c Release -o publish
  if errorlevel 1 goto fail
)

publish\HoursLoggedNotifier.exe
if errorlevel 1 goto fail
exit /b 0

:fail
echo.
echo Hours Logged Notifier closed unexpectedly. Press any key to close this window.
pause ^>nul
