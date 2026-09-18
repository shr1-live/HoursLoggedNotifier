@echo off
title Hours Logged Notifier
cd /d "%~dp0"

rem Publish every launch so code changes always reach the running app.
rem The build is incremental, so this costs a couple of seconds when nothing
rem has changed - and it stops a stale publish\ folder silently shadowing edits.
where dotnet >nul 2>&1
if errorlevel 1 goto nosdk

echo Checking for updates...
dotnet publish -c Release -o publish --nologo -v quiet
if errorlevel 1 (
  if exist "publish\HoursLoggedNotifier.exe" (
    echo Build failed - starting the previous build instead.
  ) else (
    echo Build failed and there is no previous build to fall back on.
    goto fail
  )
)
goto run

:nosdk
if not exist "publish\HoursLoggedNotifier.exe" (
  echo The .NET SDK was not found and no published build exists yet.
  echo Install the .NET 10 SDK, then run this script again.
  goto fail
)
echo .NET SDK not found - starting the existing build without checking for updates.

:run
publish\HoursLoggedNotifier.exe
if errorlevel 1 goto fail
exit /b 0

:fail
echo.
echo Hours Logged Notifier closed unexpectedly. Press any key to close this window.
pause ^>nul
