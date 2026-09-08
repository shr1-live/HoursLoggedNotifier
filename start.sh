#!/usr/bin/env sh
# Linux/macOS launcher - the counterpart to start.bat.
# Keeps the working directory next to the script so appsettings.json and
# shifts.json are read from and written beside it.

cd "$(dirname "$0")" || exit 1

if [ ! -x ./publish/HoursLoggedNotifier ]; then
  echo "No published build found - building one now (needs the .NET 10 SDK)..."
  dotnet publish -c Release -o publish || exit 1
fi

exec ./publish/HoursLoggedNotifier
