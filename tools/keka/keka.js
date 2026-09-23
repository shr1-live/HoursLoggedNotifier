#!/usr/bin/env node
/**
 * Reads logged hours from the Keka portal and merges them into shifts.json.
 *
 * This runs on your machine and nowhere else. The hosted dashboard cannot do
 * this: a browser tab cannot drive a browser, Keka sends no CORS headers for
 * our domain, and the site ships `connect-src 'self'`, which forbids talking
 * to any other origin. So this is a local companion to the desktop app, not a
 * feature of the deployed site.
 *
 * Login is SSO with MFA, so there is no stored password. Instead a browser
 * profile is kept on disk: you sign in by hand once with `npm run login`, and
 * later runs reuse that session until it expires.
 *
 *   npm run login   sign in by hand; the session is saved
 *   npm run dump    save the attendance page so selectors can be written
 *   npm run fetch   read the hours and print them (add -- --write to save)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright-core');

const HERE = __dirname;
const PROFILE = path.join(HERE, '.profile');
const DUMP = path.join(HERE, 'dump');
const CONFIG = path.join(HERE, 'config.json');
// Overridable so the merge can be exercised against a copy; the default is the
// file the desktop app actually reads.
const SHIFTS = process.env.KEKA_SHIFTS || path.join(HERE, '..', '..', 'shifts.json');

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function loadConfig() {
  // The tenant URL is yours, so it lives in an ignored file rather than in the
  // repository. KEKA_URL overrides it for a one-off run.
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  } catch {
    // Absent is fine as long as the environment supplies the URL.
  }
  const url = process.env.KEKA_URL || config.url;
  if (!url) {
    console.error(
      'No Keka URL. Create tools/keka/config.json with {"url": "https://<you>.keka.com"}\n' +
      'or run with KEKA_URL=https://<you>.keka.com',
    );
    process.exit(2);
  }
  return { url, attendancePath: config.attendancePath || '#/me/attendance/logs' };
}

/** Chrome you already have, so no browser download and a familiar UA. */
async function open({ headless }) {
  fs.mkdirSync(PROFILE, { recursive: true });
  return chromium.launchPersistentContext(PROFILE, {
    headless,
    channel: 'chrome',
    viewport: { width: 1360, height: 900 },
  });
}

function pad(n) { return String(n).padStart(2, '0'); }

/** "23 Sep 2026", "Mon, 23 Sep", "23-09-2026" -> a Date, or null. */
function parseDate(text, today = new Date()) {
  if (!text) return null;
  const dmy = text.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));

  const named = text.match(/(\d{1,2})\s*[-\s]\s*([A-Za-z]{3,})\s*,?\s*(\d{4})?/);
  if (!named) return null;
  const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
  if (month === undefined) return null;

  const year = named[3] ? Number(named[3]) : today.getFullYear();
  const date = new Date(year, month, Number(named[1]));
  // Without a year, a date ahead of today belongs to last year.
  if (!named[3] && date > today) date.setFullYear(year - 1);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "09:06 AM" / "9:06:17 AM" / "18:04" -> seconds since midnight, or null. */
function parseTime(text) {
  if (!text) return null;
  const m = text.trim().match(/(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([AaPp][Mm])?/);
  if (!m) return null;
  let h = Number(m[1]);
  const mins = Number(m[2]);
  const secs = m[3] ? Number(m[3]) : 0;
  const mer = m[4]?.toLowerCase();
  if (mins > 59 || secs > 59) return null;
  if (mer === 'pm' && h !== 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  if (h > 23) return null;
  return h * 3600 + mins * 60 + secs;
}

function clock(seconds) {
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
}

/**
 * Pulls candidate rows out of whatever table the attendance page renders.
 *
 * Deliberately generic: it reads every table row, then keeps the ones holding
 * a date and at least one time. Keka's markup has not been inspected yet, so
 * anchoring to its class names would be a guess - run `npm run dump` and the
 * selectors can be tightened against the real page.
 */
async function extractRows(page) {
  return page.evaluate(() => {
    const out = [];
    for (const row of document.querySelectorAll('tr, [role="row"]')) {
      const cells = [...row.querySelectorAll('td, [role="cell"], [role="gridcell"]')]
        .map((c) => c.innerText.trim())
        .filter(Boolean);
      if (cells.length >= 2) out.push(cells);
    }
    return out;
  });
}

/** Turns one scraped row into the record shape shifts.json already uses. */
function toRecord(cells, today) {
  const dateCell = cells.find((c) => parseDate(c, today));
  if (!dateCell) return null;
  const date = parseDate(dateCell, today);

  // Times, in the order they appear: first is the entry, second the exit.
  const times = [];
  for (const cell of cells) {
    if (cell === dateCell) continue;
    for (const token of cell.split(/\s*(?:-|–|to)\s*/)) {
      const t = parseTime(token);
      if (t !== null) times.push(t);
    }
  }
  if (times.length === 0) return null;

  const entry = times[0];
  const exit = times.length > 1 && times[1] > entry ? times[1] : null;
  const shiftLength = 9 * 3600;

  return {
    Date: `${date.getDate()} ${date.toLocaleString('en-GB', { month: 'short' })}`,
    FullDate: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    ShiftStart: undefined,
    ShiftEnd: undefined,
    EntryTime: clock(entry),
    Exit95: clock(entry + Math.floor(shiftLength * 0.95)),
    Exit100: clock(entry + shiftLength),
    ActualExitTime: exit === null ? null : clock(exit),
    Location: 'Keka',
    IsWfh: false,
    WfhHours: null,
  };
}

/** Adds to shifts.json without dropping anything already there. */
function merge(records) {
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(SHIFTS, 'utf8'));
    if (!Array.isArray(existing)) existing = [];
  } catch {
    existing = [];
  }

  // Your history is the thing that cannot be re-created, so it is copied
  // before anything is written over it.
  if (existing.length > 0) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = `${SHIFTS.replace(/\.json$/, '')}.backup-${stamp}.json`;
    fs.writeFileSync(backup, JSON.stringify(existing, null, 2));
    console.log(`backed up ${existing.length} record(s) to ${path.basename(backup)}`);
  }

  const byDate = new Map(existing.map((r) => [r.FullDate, r]));
  let added = 0;
  let updated = 0;
  for (const record of records) {
    if (byDate.has(record.FullDate)) updated += 1;
    else added += 1;
    // Keep a day already marked WFH as WFH; Keka only knows office swipes.
    const prior = byDate.get(record.FullDate);
    byDate.set(record.FullDate, prior?.IsWfh ? { ...prior } : { ...prior, ...record });
  }

  const merged = [...byDate.values()].sort((a, b) => b.FullDate.localeCompare(a.FullDate));
  fs.writeFileSync(SHIFTS, JSON.stringify(merged, null, 2));
  console.log(`wrote ${merged.length} record(s) to shifts.json (${added} new, ${updated} updated)`);
}

async function waitForEnter(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => rl.question(prompt, resolve));
  rl.close();
}

async function main() {
  const mode = process.argv[2] || 'fetch';
  const write = process.argv.includes('--write');
  const { url, attendancePath } = loadConfig();

  if (mode === 'login') {
    const ctx = await open({ headless: false });
    const page = ctx.pages()[0] || (await ctx.newPage());
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    console.log('\nSign in to Keka in the window that opened, finish the MFA prompt,');
    console.log('and navigate to your attendance log.');
    await waitForEnter('Press Enter here once you can see your hours... ');
    console.log(`session saved in ${path.relative(process.cwd(), PROFILE)}`);
    await ctx.close();
    return;
  }

  const ctx = await open({ headless: mode !== 'dump' });
  const page = ctx.pages()[0] || (await ctx.newPage());
  const target = url.replace(/\/+$/, '') + '/' + attendancePath.replace(/^\/+/, '');
  await page.goto(target, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(3000);

  // A redirect back to a login screen means the saved session has lapsed.
  const here = page.url();
  if (/login|signin|auth|adfs|microsoftonline/i.test(here)) {
    console.error('The saved session has expired. Run `npm run login` again.');
    await ctx.close();
    process.exit(3);
  }

  if (mode === 'dump') {
    fs.mkdirSync(DUMP, { recursive: true });
    fs.writeFileSync(path.join(DUMP, 'page.html'), await page.content());
    await page.screenshot({ path: path.join(DUMP, 'page.png'), fullPage: true });
    console.log(`saved dump/page.html and dump/page.png from ${here}`);
    console.log('Share those and the selectors can be written against the real markup.');
    await ctx.close();
    return;
  }

  const rows = await extractRows(page);
  const today = new Date();
  const records = rows.map((r) => toRecord(r, today)).filter(Boolean);

  console.log(`scanned ${rows.length} row(s), recognised ${records.length}`);
  for (const r of records.slice(0, 15)) {
    console.log(`  ${r.FullDate}  in ${r.EntryTime}  out ${r.ActualExitTime ?? '-'}`);
  }

  if (records.length === 0) {
    console.log('\nNothing recognised. Run `npm run dump` so the selectors can be');
    console.log('written against the real page rather than guessed.');
  } else if (write) {
    merge(records);
  } else {
    console.log('\nDry run - nothing written. Re-run with `-- --write` to save.');
  }

  await ctx.close();
}

// Exported so the parsing can be tested without a Keka session; only the
// browser half needs the real portal.
module.exports = { parseDate, parseTime, clock, toRecord, merge };

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
