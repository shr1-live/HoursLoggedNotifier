# Hours Logged Notifier — Setup Guide

A small tool that tracks your office/WFH shift hours and pops up a desktop reminder before your exit time.

On Windows: no installation needed, no .NET needed — just the folder below. On Linux: one build step, see "On Linux" below.

## 1. What to copy

Copy the whole `publish-standalone` folder to the other person's laptop (USB drive, shared drive, zip over email/Teams — any way works). It contains:

```
publish-standalone/
├── HoursLoggedNotifier.exe   <- the app (double-click this)
└── appsettings.json           <- settings (safe to leave as-is)
```

Keep both files in the same folder. The app creates a `shifts.json` file next to itself the first time you log a day — that's where your history is saved.

### On Linux

The standalone `.exe` above is Windows-only, and a Linux build has to be made on Linux. Clone the repo, then:

```
git clone <repo-url> hours-logged-notifier
cd hours-logged-notifier
./start.sh
```

`start.sh` publishes the app the first time it runs (needs the .NET 10 SDK) and launches it. For popup reminders, install notify-send if it is missing: `sudo apt install libnotify-bin` on Debian/Ubuntu, `sudo dnf install libnotify` on Fedora. Without it everything still works, but reminders print in the terminal window instead of popping up.

## 2. Running it

Double-click `HoursLoggedNotifier.exe`.

A black console window opens. That's normal — leave it running in the background while you're at work. Closing the window stops the reminders.

## 3. Using it day to day

When you have your shift + biometric text (copied from the attendance portal), paste it into the window and press Enter. Example of what to paste:

```
General Shift
(18 Aug)
10:00 AM - 7:00 PM

Gurgaon Biometric
9:38:14 AM
MISSING
```

It will print a summary: entry time, expected exit time, time left, and how the week is tracking.

Other things you can type at the `>` prompt instead of pasting:

| Type this     | What it does                                    |
|---------------|--------------------------------------------------|
| `today`       | Show today's summary again                       |
| `week`        | Show this week's attendance + hours              |
| `history`     | Show the last 10 days logged                     |
| `wfh`         | Mark today as Work From Home                     |
| `testnotify`  | Fire a test desktop popup (to confirm it works)  |
| `testemail`   | Send a test email (only if email is set up)      |
| `exit`        | Close the app                                    |

## 4. Desktop reminders

These work automatically, no setup needed. Every 5 minutes (configurable — see below) it checks: if today's shift isn't finished yet, it shows a desktop notification with time remaining (a tray balloon on Windows, notify-send on Linux).

## 5. Optional settings

Open `appsettings.json` in a text editor if you want to change anything. All fields are optional to touch:

| Setting                    | What it means                                       | Default |
|-----------------------------|------------------------------------------------------|---------|
| `ReminderIntervalMinutes`   | How often the popup reminder checks/fires            | 60      |
| `RequiredOfficeDaysPerWeek` | Office days needed per week for the weekly counter    | 3       |
| `DailyHourGoalHours`        | Hours counted per day toward the weekly hours target  | 9       |

## 6. Email reminders (optional, skip for now)

Off by default — the app works fully without it. To turn it on later, an Outlook app password needs to go into the `AppPassword` field in `appsettings.json`. This is a separate, extra step and not required to use the tool.

## 7. Nothing to worry about

- No internet access required unless email is turned on.
- No install, no admin rights needed — the `.exe` runs standalone (on Linux you only need the .NET SDK to build it once).
- All data (`shifts.json`) stays local in the same folder as the app.
