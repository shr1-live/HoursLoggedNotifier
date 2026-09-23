# Keka sync

Reads your logged hours from the Keka portal and merges them into
`shifts.json`, which the desktop app and the dashboard both already read.

## This cannot run on the deployed site

The hosted dashboard is static files in a browser tab. It cannot do this, and
no amount of code will change that:

- Playwright drives a browser from a Node process; a browser tab cannot launch
  a browser.
- Keka sends no CORS headers for our domain, so a `fetch` from the page is
  refused.
- The site ships `connect-src 'self'`, which forbids talking to any other
  origin at all.

So this is a local companion to the desktop app. It runs on your machine,
writes `shifts.json`, and the dashboard picks that up through **Import**.

## Login

Keka is behind SSO with MFA, so there is no stored password and no unattended
login. Instead a browser profile is kept in `.profile/` (ignored by git): you
sign in by hand once, and later runs reuse that session until it expires.

## Setup

Create `tools/keka/config.json` — ignored by git, because the tenant URL is
yours:

```json
{
  "url": "https://yourcompany.keka.com",
  "attendancePath": "#/me/attendance/logs"
}
```

Then:

```
cd tools/keka
npm install
npm run login     # a window opens; sign in, finish MFA, press Enter
npm run dump      # saves the attendance page so selectors can be written
npm run fetch     # reads the hours and prints them - writes nothing
npm run fetch -- --write   # merges them into shifts.json
```

## Safety

- `fetch` is a **dry run** by default and prints what it found. It only
  touches `shifts.json` when you pass `--write`.
- Before writing, the current `shifts.json` is copied to
  `shifts.backup-<timestamp>.json`.
- The merge is by date and never drops a day that is already recorded.
- A day already marked WFH stays WFH, because Keka only knows office swipes.

## Status

The parsing is tested and passing (`node selftest.js`, 17 cases covering date
formats, 12-hour and 24-hour times, combined in/out cells, header rows, and an
exit that precedes its entry).

The **row extraction is still generic** — it reads every table row and keeps
the ones holding a date and a time. Keka's own markup has not been inspected,
so nothing is anchored to its class names yet. Run `npm run dump` and the
selectors can be tightened against the real page.
