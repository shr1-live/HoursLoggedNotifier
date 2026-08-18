@echo off
title Hours Completion Notifier
cd /d "%~dp0"
publish\HoursCompletionNotifier.exe
if errorlevel 1 (
  echo.
  echo Hours Completion Notifier closed unexpectedly. Press any key to close this window.
  pause >nul
)
