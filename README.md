# Hours Logged Notifier

A Windows console app that tracks your daily office shift, tells you when you've
hit 95%/100% of your required hours, and fires desktop notifications reminding
you of time left. It also tracks office vs. work-from-home days against a
weekly in-office attendance target.

## What it does

- Paste your shift + biometric entry block straight from your attendance
  portal (no manual field entry) and it instantly calculates:
  - 95% exit time (minimum attendance)
  - 100% exit time (full shift)
  - Whether you clocked in early/late/on time
- Fires a Windows tray notification on a configurable interval showing time
  spent so far and time left until 95%/100% exit
- Tracks office days vs. work-from-home days against a weekly required
  office-days target, and shows a running weekly summary in every notification
- Optional: email reminders via Outlook/Office 365 SMTP (needs an app
  password; disabled by default)

## Requirements

- Windows
- .NET 10 SDK

## Running it

```
dotnet run
```

Paste a block like this at the prompt:

```
General Shift
(18 Aug)
General Shift
10:00 AM - 7:00 PM

Gurgaon Biometric
9:38:14 AM
MISSING
```

## Commands

At the `>` prompt, instead of pasting a shift block you can type:

| Command | Action |
|---|---|
| `today` | Show today's recorded shift |
| `history` | Show the last 10 recorded days |
| `week` | Show this week's day-by-day log and office-day count |
| `wfh` | Log today as a work-from-home day |
| `testnotify` | Fire a notification immediately using today's real data |
| `testemail` | Send a test email (if email is configured) |
| `exit` | Quit |

## Configuration

Copy `appsettings.example.json` to `appsettings.json` and edit as needed:

- `ReminderIntervalMinutes` - how often notifications fire (default 60)
- `RequiredOfficeDaysPerWeek` - your in-office attendance target (default 3)
- `Email` - fill in `AppPassword` to enable email reminders (see below).
  Leave the placeholder in place to keep email reminders off.

`appsettings.json` is gitignored since it can hold a mail credential -
never commit your real one.

### Enabling email (optional)

Work/school Microsoft 365 accounts often block legacy app passwords for
security reasons - check with your IT admin, or use a personal
Gmail/Outlook.com account's app password instead. Desktop notifications work
regardless of whether email is configured.

## Running on startup

`start.bat` launches the published build directly. To have it launch
automatically:

1. `dotnet publish -c Release -o publish`
2. Add a shortcut to `start.bat` in your Windows Startup folder
   (`Win+R` -> `shell:startup`) for it to launch on every fresh sign-in.

Note: locking your PC with Win+L and unlocking with a PIN does **not**
trigger a new sign-in, so this only fires on an actual restart or
sign-out/sign-in - but since Windows keeps background processes running
while the screen is locked, you only need to start it once per day and
leave the window open.

## Data storage

All data is stored locally in `shifts.json` (also gitignored) - no cloud,
no external database.
