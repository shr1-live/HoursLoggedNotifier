#!/usr/bin/env sh
# Linux/macOS launcher - the counterpart to start.bat.
# Keeps the working directory next to the script so appsettings.json and
# shifts.json are read from and written beside it.

cd "$(dirname "$0")" || exit 1

# Publish every launch so code changes always reach the running app. The build
# is incremental, so this is quick when nothing changed - and it stops a stale
# publish/ directory silently shadowing edits.
if command -v dotnet >/dev/null 2>&1; then
  echo "Checking for updates..."
  if ! dotnet publish -c Release -o publish --nologo -v quiet; then
    if [ -x ./publish/HoursLoggedNotifier ]; then
      echo "Build failed - starting the previous build instead."
    else
      echo "Build failed and there is no previous build to fall back on."
      exit 1
    fi
  fi
elif [ ! -x ./publish/HoursLoggedNotifier ]; then
  echo "The .NET SDK was not found and no published build exists yet."
  echo "Install the .NET 10 SDK, then run this script again."
  exit 1
else
  echo ".NET SDK not found - starting the existing build without checking for updates."
fi

exec ./publish/HoursLoggedNotifier
