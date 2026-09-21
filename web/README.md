# Hours Logged — web dashboard

An interactive dashboard for the same attendance data the desktop app records:
ring gauges, a weekday comparison chart, office-hours tracking against the 95%
mark, and WFH days with editable hours.

It is a static site with no backend, so it deploys to Netlify as-is.

## Running locally

```bash
cd web
npm install
npm run dev
```

## Building

```bash
npm run build     # outputs to web/dist
npm run preview   # serves the built output
```

## Deploying to Netlify

`netlify.toml` already sets the base directory, build command and publish
directory, plus SPA redirects and cache headers. Connect the repository in
Netlify and it needs no further configuration — or run `netlify deploy --prod`
from this folder.

## How it relates to the desktop app

The two share a data format rather than a server:

| | Desktop (.NET) | Web (React) |
|---|---|---|
| Desktop notifications and reminders | yes | no |
| Runs in the background | yes | no |
| Parses the pasted shift block | yes | yes |
| Office-hours target and 95% mark | yes | yes |
| WFH days with editable hours | yes | yes |
| Charts and ring gauges | basic (WinForms) | full |
| Storage | `shifts.json` | browser localStorage |

**Use both together:** the desktop app keeps sending notifications, and
`Export shifts.json` / `Import` moves history between them. The exported file
is the same shape the desktop app reads, so it can be copied straight over the
desktop `shifts.json`.

## Notes

- Data lives in `localStorage`, so it is per-browser and per-device. Export if
  you need it elsewhere.
- Notifications deliberately stay in the desktop app: a web page cannot send
  reliable reminders when the tab is closed.
