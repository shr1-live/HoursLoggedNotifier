import type { Settings, ShiftRecord } from './types';
import { hoursToSeconds, isoDate, mondayOf, parseClock, secondsSinceMidnight } from './time';

/**
 * The same rules the desktop app applies, so both report identical figures.
 */

/** Seconds counted for one office day. */
export function loggedSeconds(record: ShiftRecord, now = new Date()): number {
  const entry = parseClock(record.EntryTime);
  if (entry === null) return 0;

  const actualExit = parseClock(record.ActualExitTime ?? undefined);
  if (actualExit !== null) return Math.max(0, actualExit - entry);

  if (record.FullDate === isoDate(now)) {
    return Math.max(0, secondsSinceMidnight(now) - entry);
  }

  // A past day whose exit was never recorded falls back to the full shift,
  // so it isn't silently dropped from the totals.
  const exit100 = parseClock(record.Exit100);
  return exit100 === null ? 0 : Math.max(0, exit100 - entry);
}

/** Seconds credited for a WFH day - the stored override, or the daily goal. */
export function wfhCredit(record: ShiftRecord, settings: Settings): number {
  return record.WfhHours != null
    ? hoursToSeconds(record.WfhHours)
    : hoursToSeconds(settings.dailyGoalHours);
}

export function weekRange(now = new Date()): { monday: Date; friday: Date } {
  const monday = mondayOf(now);
  const friday = new Date(monday);
  friday.setDate(friday.getDate() + 4);
  return { monday, friday };
}

export function thisWeek(records: ShiftRecord[], now = new Date()): ShiftRecord[] {
  const { monday, friday } = weekRange(now);
  const from = isoDate(monday);
  const to = isoDate(friday);
  return records
    .filter((r) => r.FullDate >= from && r.FullDate <= to)
    .sort((a, b) => a.FullDate.localeCompare(b.FullDate));
}

export interface WeekTotals {
  officeDays: number;
  wfhDays: number;
  /** Office time only. */
  officeSeconds: number;
  /** Office time plus WFH credit. */
  totalSeconds: number;
  officeTargetSeconds: number;
  /** 95% of the office target - the threshold that actually gets checked. */
  officeMark95Seconds: number;
  weeklyTargetSeconds: number;
  /** Days already accounted for, used to spread what is left. */
  accountedDays: number;
}

export function weekTotals(records: ShiftRecord[], settings: Settings, now = new Date()): WeekTotals {
  const week = thisWeek(records, now);
  const today = isoDate(now);

  let officeSeconds = 0;
  let totalSeconds = 0;
  let officeDays = 0;
  let wfhDays = 0;
  let accountedDays = 0;

  for (const record of week) {
    if (record.IsWfh) {
      wfhDays += 1;
      accountedDays += 1;
      totalSeconds += wfhCredit(record, settings);
      continue;
    }

    officeDays += 1;
    const logged = loggedSeconds(record, now);
    officeSeconds += logged;
    totalSeconds += logged;

    // Today is still running, so it is not an accounted-for day yet.
    if (record.ActualExitTime || record.FullDate !== today) accountedDays += 1;
  }

  const officeTargetSeconds = hoursToSeconds(settings.dailyGoalHours * settings.requiredOfficeDays);

  return {
    officeDays,
    wfhDays,
    officeSeconds,
    totalSeconds,
    officeTargetSeconds,
    officeMark95Seconds: Math.round(officeTargetSeconds * 0.95),
    weeklyTargetSeconds: hoursToSeconds(settings.dailyGoalHours * settings.workdaysPerWeek),
    accountedDays,
  };
}

export interface DayBar {
  iso: string;
  label: string;
  hours: number;
  isWfh: boolean;
  isToday: boolean;
  logged: boolean;
}

/** Monday to Friday, including days with nothing logged. */
export function weekBreakdown(records: ShiftRecord[], settings: Settings, now = new Date()): DayBar[] {
  const { monday } = weekRange(now);
  const week = thisWeek(records, now);
  const today = isoDate(now);
  const bars: DayBar[] = [];

  for (let i = 0; i < settings.workdaysPerWeek; i += 1) {
    const date = new Date(monday);
    date.setDate(date.getDate() + i);
    const iso = isoDate(date);
    const label = date.toLocaleDateString('en-GB', { weekday: 'short' });
    const record = week.find((r) => r.FullDate === iso);

    if (!record) {
      bars.push({ iso, label, hours: 0, isWfh: false, isToday: iso === today, logged: false });
    } else if (record.IsWfh) {
      bars.push({
        iso, label, hours: wfhCredit(record, settings) / 3600,
        isWfh: true, isToday: iso === today, logged: true,
      });
    } else {
      bars.push({
        iso, label, hours: loggedSeconds(record, now) / 3600,
        isWfh: false, isToday: iso === today, logged: true,
      });
    }
  }

  return bars;
}

export interface TodayStatus {
  record: ShiftRecord;
  spentSeconds: number;
  left95Seconds: number;
  left100Seconds: number;
  /** 0..1 through the scheduled shift. */
  fraction: number;
}

export function todayStatus(records: ShiftRecord[], now = new Date()): TodayStatus | null {
  const record = records.find((r) => r.FullDate === isoDate(now));
  if (!record || record.IsWfh) return null;

  const entry = parseClock(record.EntryTime);
  const exit95 = parseClock(record.Exit95);
  const exit100 = parseClock(record.Exit100);
  if (entry === null || exit95 === null || exit100 === null) return null;

  const nowSeconds = secondsSinceMidnight(now);
  const spentSeconds = Math.max(0, nowSeconds - entry);
  const total = Math.max(1, exit100 - entry);

  return {
    record,
    spentSeconds,
    left95Seconds: Math.max(0, exit95 - nowSeconds),
    left100Seconds: Math.max(0, exit100 - nowSeconds),
    fraction: Math.min(1, spentSeconds / total),
  };
}
