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

/** "10:00 AM" / "7:00 PM" / "10:24:52 AM" -> seconds since midnight. */
function parseTimeToken(token: string): number | null {
  const match = token.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
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

export function parseShiftBlock(text: string, today = new Date(), asWfh = false): ParseResult {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { error: 'Nothing to parse.' };

  let date: Date | null = null;
  let shiftStart: number | null = null;
  let shiftEnd: number | null = null;
  let entry: number | null = null;
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

    // A bare time is the biometric entry.
    const single = parseTimeToken(line);
    if (single !== null && entry === null) {
      entry = single;
      continue;
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

  if (date === null) return { error: 'Could not find a date such as "(21 Sept)".' };

  // A WFH day may be pasted with only a date and a shift range - there is no
  // biometric entry to record, so the scheduled shift is what gets credited.
  if (asWfh) {
    let wfhHours: number | undefined;
    if (shiftStart !== null && shiftEnd !== null) {
      let span = shiftEnd - shiftStart;
      if (span < 0) span += 86400;
      wfhHours = Number((span / 3600).toFixed(4));
    }

    return {
      record: {
        Date: displayDate(date),
        FullDate: isoDate(date),
        IsWfh: true,
        // Left undefined when no range was given, so the default applies.
        WfhHours: wfhHours,
      },
      portalStatus,
    };
  }

  if (shiftStart === null || shiftEnd === null) {
    return { error: 'Could not find a shift range such as "10:00 AM - 7:00 PM".' };
  }
  if (entry === null) return { error: 'Could not find a biometric entry time.' };

  let shiftLength = shiftEnd - shiftStart;
  if (shiftLength < 0) shiftLength += 86400; // overnight shift

  const record: ShiftRecord = {
    Date: displayDate(date),
    FullDate: isoDate(date),
    ShiftStart: toClock(shiftStart),
    ShiftEnd: toClock(shiftEnd),
    EntryTime: toClock(entry),
    Exit95: toClock(entry + Math.floor(shiftLength * 0.95)),
    Exit100: toClock(entry + shiftLength),
    ActualExitTime: null,
    Location: location,
    IsWfh: false,
  };

  return { record, portalStatus };
}

/** How late the entry was against the scheduled start. */
export function lateBySeconds(record: ShiftRecord): number {
  const start = parseClock(record.ShiftStart);
  const entry = parseClock(record.EntryTime);
  if (start === null || entry === null) return 0;
  return entry - start;
}
