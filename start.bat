@echo off
title Hours Logged Notifier
cd /d "%~dp0"
publish\HoursLoggedNotifier.exe
if errorlevel 1 (
  echo.
  echo Hours Logged Notifier closed unexpectedly. Press any key to close this window.
  pause >nul
)
