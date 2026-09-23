// Covers the parsing, which is the part that works without a Keka session.
const assert = require('assert');
const { parseDate, parseTime, toRecord } = require('./keka');

const today = new Date(2026, 8, 23); // 23 Sep 2026
let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}: ${e.message}`); }
}

console.log('dates:');
check('23 Sep 2026', () => assert.equal(parseDate('23 Sep 2026', today).getMonth(), 8));
check('Mon, 21 Sep', () => assert.equal(parseDate('Mon, 21 Sep', today).getDate(), 21));
check('21-09-2026', () => assert.equal(parseDate('21-09-2026', today).getDate(), 21));
check('no year, future -> last year', () => assert.equal(parseDate('25 Dec', today).getFullYear(), 2025));
check('rubbish -> null', () => assert.equal(parseDate('Total Hours', today), null));

console.log('times:');
check('9:06:17 AM', () => assert.equal(parseTime('9:06:17 AM'), 9 * 3600 + 6 * 60 + 17));
check('7:02:49 PM', () => assert.equal(parseTime('7:02:49 PM'), 19 * 3600 + 2 * 60 + 49));
check('12:30 AM -> 00:30', () => assert.equal(parseTime('12:30 AM'), 1800));
check('12:30 PM -> 12:30', () => assert.equal(parseTime('12:30 PM'), 12 * 3600 + 1800));
check('18:04 24h', () => assert.equal(parseTime('18:04'), 18 * 3600 + 4 * 60));
check('rubbish -> null', () => assert.equal(parseTime('--'), null));

console.log('rows:');
check('date + in + out', () => {
  const r = toRecord(['23 Sep 2026', '09:06:17 AM', '07:02:49 PM', '9h 56m'], today);
  assert.equal(r.FullDate, '2026-09-23');
  assert.equal(r.EntryTime, '09:06:17');
  assert.equal(r.ActualExitTime, '19:02:49');
});
check('in-out in one cell', () => {
  const r = toRecord(['21 Sep 2026', '10:24:52 AM - 07:04:29 PM'], today);
  assert.equal(r.EntryTime, '10:24:52');
  assert.equal(r.ActualExitTime, '19:04:29');
});
check('entry only, still in', () => {
  const r = toRecord(['23 Sep 2026', '09:06:17 AM', '-'], today);
  assert.equal(r.ActualExitTime, null);
  assert.equal(r.Exit95, '17:39:17');   // entry + 8h33m
  assert.equal(r.Exit100, '18:06:17');  // entry + 9h
});
check('header row -> null', () => assert.equal(toRecord(['Date', 'In', 'Out'], today), null));
check('date but no time -> null', () => assert.equal(toRecord(['23 Sep 2026', 'Absent'], today), null));
check('out before in is ignored', () => {
  const r = toRecord(['23 Sep 2026', '10:24:52 AM', '07:04:29 AM'], today);
  assert.equal(r.ActualExitTime, null); // refused rather than a negative day
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
