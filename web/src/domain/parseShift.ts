import type { ShiftRecord } from './types';
import { displayDate, isoDate, parseClock, toClock } from './time';

/**
 * Parses the block pasted from the attendance portal - the same text the
 * desktop app accepts, so the two stay interchangeable:
 *
 *   General Shift
 *   (21 Sept)
 *   10:00 AM - 7:00 PM
 *
 *   Gurgaon Biometric
 *   10:24:52 AM
 *   MISSING
 */

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export interface ParseResult {
  record?: ShiftRecord;
  portalStatus?: string;
  error?: string;
}

/**
 * "10:00 AM" / "7:00 PM" / "10:24:52 AM" / "10.23" -> seconds since midnight.
 *
 * A dot separates as well as a colon, since that is how the time often gets
 * typed by hand. With no am/pm the value is read as a 24-hour clock.
 */
function parseTimeToken(token: string): number | null {
  const match = token.trim().match(/^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([AaPp][Mm])?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;
  const meridiem = match[4]?.toLowerCase();

  if (minutes > 59 || seconds > 59) return null;

  if (meridiem === 'pm' && hours !== 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours > 23) return null;

  return hours * 3600 + minutes * 60 + seconds;
}

/** "(21 Sept)" or "21 September" -> the most recent matching date. */
function parseDate(line: string, today: Date): Date | null {
  const match = line.match(/(\d{1,2})\s+([A-Za-z]{3,})/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = MONTHS[match[2].slice(0, 3).toLowerCase()];
  if (month === undefined) return null;

  const candidate = new Date(today.getFullYear(), month, day);
  if (Number.isNaN(candidate.getTime()) || candidate.getDate() !== day) return null;

  // A date later in the year than today refers to last year.
  if (candidate > today) candidate.setFullYear(candidate.getFullYear() - 1);
  return candidate;
}

export interface ParseOptions {
  /** Shift length to assume when the paste carries no scheduled range. */
  defaultShiftHours?: number;
}

export function parseShiftBlock(
  text: string,
  today = new Date(),
  asWfh = false,
  options: ParseOptions = {},
): ParseResult {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { error: 'Nothing to parse.' };

  let date: Date | null = null;
  let shiftStart: number | null = null;
  let shiftEnd: number | null = null;
  let entry: number | null = null;
  let actualExit: number | null = null;
  let location: string | null = null;
  let portalStatus: string | undefined;

  for (const line of lines) {
    // "10:00 AM - 7:00 PM" - the scheduled shift.
    const range = line.match(/^(.+?)\s*[-–]\s*(.+)$/);
    if (range && shiftStart === null) {
      const from = parseTimeToken(range[1]);
      const to = parseTimeToken(range[2]);
      if (from !== null && to !== null) {
        shiftStart = from;
        shiftEnd = to;
        continue;
      }
    }

    if (date === null) {
      const parsed = parseDate(line, today);
      if (parsed) {
        date = parsed;
        continue;
      }
    }

    // The first bare time is the biometric entry; a second one is the swipe
    // out. Without picking that up the day has no recorded exit and falls back
    // to the whole scheduled shift, which reads as a full 9h however early you
    // actually left.
    const single = parseTimeToken(line);
    if (single !== null) {
      if (entry === null) {
        entry = single;
        continue;
      }
      if (actualExit === null) {
        actualExit = single;
        continue;
      }
    }

    if (/^(MISSING|PRESENT|APPROVED|PENDING)$/i.test(line)) {
      portalStatus = line.toUpperCase();
      continue;
    }

    // Anything else that mentions a place is treated as the location.
    if (/biometric|office|wework|campus|tower/i.test(line)) {
      location = line;
    }
  }

  // The portal block carries a date, but a hand-typed entry usually will not.
  // Today is the only sensible reading of a paste with no date on it.
  const day = date ?? today;

  // Refused rather than stored, for office and WFH days alike: a logout before
  // the entry is either a typo or a missing am/pm, and keeping it would credit
  // the day nothing at all.
  if (entry !== null && actualExit !== null && actualExit < entry) {
    return {
      error: `The logout time (${toClock(actualExit)}) is before the entry time (${toClock(entry)}).`,
    };
  }

  // A WFH day may be pasted with only a date and a shift range - there is no
  // biometric entry to record, so the scheduled shift is what gets credited.
  if (asWfh) {
    // What was actually worked beats what was scheduled, which beats the
    // default. A block carrying 9:06 to 19:02 is a ten-hour day; crediting the
    // 10:00-19:00 roster instead threw away an hour you had already worked.
    const worked = entry !== null && actualExit !== null ? { from: entry, to: actualExit } : null;
    const scheduled = shiftStart !== null && shiftEnd !== null
      ? { from: shiftStart, to: shiftEnd }
      : null;
    const span = worked ?? scheduled;

    let wfhHours: number | undefined;
    if (span) {
      let seconds = span.to - span.from;
      if (seconds < 0) seconds += 86400;
      wfhHours = Number((seconds / 3600).toFixed(4));
    }

    return {
      record: {
        Date: displayDate(day),
        FullDate: isoDate(day),
        IsWfh: true,
        // Left undefined when the paste carried no times at all, so the
        // configured default applies.
        WfhHours: wfhHours,
        // Kept so the history can show the day rather than a pair of dashes,
        // and so the credited figure can be checked against its source.
        EntryTime: entry === null ? undefined : toClock(entry),
        ActualExitTime: actualExit === null ? null : toClock(actualExit),
      },
      portalStatus,
    };
  }

  if (entry === null) {
    return { error: 'Could not find an entry time such as "10:23:44 AM" or "10.23".' };
  }

  // With no scheduled range in the paste, the day is assumed to be a full one
  // of the configured length. The roster itself stays unrecorded rather than
  // invented: without it there is nothing to measure lateness against, and
  // guessing a start would report a punctuality the paste never claimed.
  const known = shiftStart !== null && shiftEnd !== null;
  let shiftLength: number;
  if (known) {
    shiftLength = shiftEnd! - shiftStart!;
    if (shiftLength < 0) shiftLength += 86400; // overnight shift
  } else {
    shiftLength = Math.round((options.defaultShiftHours ?? 9) * 3600);
  }

  const record: ShiftRecord = {
    Date: displayDate(day),
    FullDate: isoDate(day),
    ShiftStart: known ? toClock(shiftStart!) : undefined,
    ShiftEnd: known ? toClock(shiftEnd!) : undefined,
    EntryTime: toClock(entry),
    Exit95: toClock(entry + Math.floor(shiftLength * 0.95)),
    Exit100: toClock(entry + shiftLength),
    ActualExitTime: actualExit === null ? null : toClock(actualExit),
    Location: location,
    IsWfh: false,
  };

  return { record, portalStatus };
}

/**
 * How late the entry was against the scheduled start, or null when the paste
 * carried no roster - "on time" would be a claim the data does not support.
 */
export function lateBySeconds(record: ShiftRecord): number | null {
  const start = parseClock(record.ShiftStart);
  const entry = parseClock(record.EntryTime);
  if (start === null || entry === null) return null;
  return entry - start;
}
