import type { Settings, ShiftRecord } from './types';
import { loggedSeconds, wfhCredit } from './attendance';
import { hoursToSeconds, isoDate, mondayOf, parseClock } from './time';

/**
 * Trends across the whole history rather than just this week. Everything is
 * derived on demand - there is no second copy of the data to fall out of step.
 */

export interface WeekPoint {
  /** Monday of the week, ISO. */
  weekStart: string;
  label: string;
  officeHours: number;
  wfhHours: number;
  totalHours: number;
  officeDays: number;
  isCurrent: boolean;
}

/** Totals per week, oldest first, for the trend chart. */
export function weeklyTrend(
  records: ShiftRecord[],
  settings: Settings,
  weeks = 6,
  now = new Date(),
): WeekPoint[] {
  const currentMonday = mondayOf(now);
  const points: WeekPoint[] = [];

  for (let back = weeks - 1; back >= 0; back -= 1) {
    const start = new Date(currentMonday);
    start.setDate(start.getDate() - back * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 4);

    const from = isoDate(start);
    const to = isoDate(end);
    const inWeek = records.filter((r) => r.FullDate >= from && r.FullDate <= to);

    let officeSeconds = 0;
    let wfhSeconds = 0;
    let officeDays = 0;

    for (const record of inWeek) {
      if (record.IsWfh) {
        wfhSeconds += wfhCredit(record, settings);
      } else {
        officeSeconds += loggedSeconds(record, now);
        officeDays += 1;
      }
    }

    points.push({
      weekStart: from,
      label: `${start.getDate()} ${start.toLocaleString('en-GB', { month: 'short' })}`,
      officeHours: officeSeconds / 3600,
      wfhHours: wfhSeconds / 3600,
      totalHours: (officeSeconds + wfhSeconds) / 3600,
      officeDays,
      isCurrent: back === 0,
    });
  }

  return points;
}

export interface Punctuality {
  /** Office days with a recorded entry. */
  sample: number;
  onTime: number;
  late: number;
  /** Average entry time, seconds since midnight. */
  averageEntry: number | null;
  /** Average lateness across late days, in seconds. */
  averageLateness: number;
  /** Earliest and latest entry seen. */
  earliest: number | null;
  latest: number | null;
}

export function punctuality(records: ShiftRecord[]): Punctuality {
  const office = records.filter((r) => !r.IsWfh && r.EntryTime && r.ShiftStart);

  let onTime = 0;
  let late = 0;
  let latenessTotal = 0;
  let entryTotal = 0;
  let earliest: number | null = null;
  let latest: number | null = null;

  for (const record of office) {
    const entry = parseClock(record.EntryTime);
    const start = parseClock(record.ShiftStart);
    if (entry === null || start === null) continue;

    entryTotal += entry;
    earliest = earliest === null ? entry : Math.min(earliest, entry);
    latest = latest === null ? entry : Math.max(latest, entry);

    if (entry > start) {
      late += 1;
      latenessTotal += entry - start;
    } else {
      onTime += 1;
    }
  }

  const sample = onTime + late;
  return {
    sample,
    onTime,
    late,
    averageEntry: sample > 0 ? Math.round(entryTotal / sample) : null,
    averageLateness: late > 0 ? Math.round(latenessTotal / late) : 0,
    earliest,
    latest,
  };
}

export interface DayOfWeekStat {
  label: string;
  averageHours: number;
  days: number;
}

/** Which weekdays you actually work longest - Monday to Friday. */
export function byDayOfWeek(records: ShiftRecord[], settings: Settings, now = new Date()): DayOfWeekStat[] {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const totals = labels.map(() => ({ seconds: 0, days: 0 }));

  for (const record of records) {
    const date = new Date(`${record.FullDate}T00:00:00`);
    const index = (date.getDay() + 6) % 7;
    if (index > 4) continue; // weekend

    const seconds = record.IsWfh ? wfhCredit(record, settings) : loggedSeconds(record, now);
    if (seconds <= 0) continue;

    totals[index].seconds += seconds;
    totals[index].days += 1;
  }

  return labels.map((label, i) => ({
    label,
    averageHours: totals[i].days > 0 ? totals[i].seconds / totals[i].days / 3600 : 0,
    days: totals[i].days,
  }));
}

export interface Pace {
  /** Hours logged so far this week. */
  loggedHours: number;
  targetHours: number;
  /** Where you would be if spread evenly across the working week by now. */
  expectedHours: number;
  /** Positive means ahead of the even pace. */
  differenceHours: number;
  /** Hours per remaining day to still hit the target. */
  neededPerRemainingDay: number;
  remainingDays: number;
  onTrack: boolean;
}

/**
 * Compares progress against an even spread rather than against the final
 * target, so "behind" means behind *for a Tuesday* rather than simply unfinished.
 */
export function weekPace(
  loggedSecondsThisWeek: number,
  settings: Settings,
  now = new Date(),
): Pace {
  const targetSeconds = hoursToSeconds(settings.dailyGoalHours * settings.workdaysPerWeek);
  const weekdayIndex = Math.min(Math.max((now.getDay() + 6) % 7, 0), settings.workdaysPerWeek - 1);

  // Days fully behind us, plus the fraction of today that has passed.
  const isWeekend = (now.getDay() + 6) % 7 >= settings.workdaysPerWeek;
  const dayFraction = isWeekend ? 1 : Math.min(1, (now.getHours() * 60 + now.getMinutes()) / (18 * 60));
  const elapsedDays = isWeekend ? settings.workdaysPerWeek : weekdayIndex + dayFraction;

  const expectedSeconds = (targetSeconds / settings.workdaysPerWeek) * elapsedDays;
  const remainingDays = Math.max(0, settings.workdaysPerWeek - Math.ceil(elapsedDays));
  const shortfall = Math.max(0, targetSeconds - loggedSecondsThisWeek);

  return {
    loggedHours: loggedSecondsThisWeek / 3600,
    targetHours: targetSeconds / 3600,
    expectedHours: expectedSeconds / 3600,
    differenceHours: (loggedSecondsThisWeek - expectedSeconds) / 3600,
    neededPerRemainingDay: remainingDays > 0 ? shortfall / remainingDays / 3600 : 0,
    remainingDays,
    onTrack: loggedSecondsThisWeek >= expectedSeconds,
  };
}

export interface Totals {
  daysLogged: number;
  officeDays: number;
  wfhDays: number;
  totalHours: number;
  averageDayHours: number;
  longestDayHours: number;
  longestDayLabel: string;
}

export function overallTotals(records: ShiftRecord[], settings: Settings, now = new Date()): Totals {
  let totalSeconds = 0;
  let officeDays = 0;
  let wfhDays = 0;
  let longest = 0;
  let longestLabel = '-';

  for (const record of records) {
    const seconds = record.IsWfh ? wfhCredit(record, settings) : loggedSeconds(record, now);
    totalSeconds += seconds;
    if (record.IsWfh) wfhDays += 1;
    else officeDays += 1;

    if (seconds > longest) {
      longest = seconds;
      longestLabel = record.Date;
    }
  }

  const daysLogged = officeDays + wfhDays;
  return {
    daysLogged,
    officeDays,
    wfhDays,
    totalHours: totalSeconds / 3600,
    averageDayHours: daysLogged > 0 ? totalSeconds / daysLogged / 3600 : 0,
    longestDayHours: longest / 3600,
    longestDayLabel: longestLabel,
  };
}

/** Consecutive days, most recent first, that met the daily goal. */
export function goalStreak(records: ShiftRecord[], settings: Settings, now = new Date()): number {
  const goal = hoursToSeconds(settings.dailyGoalHours);
  const sorted = [...records].sort((a, b) => b.FullDate.localeCompare(a.FullDate));
  const today = isoDate(now);

  let streak = 0;
  for (const record of sorted) {
    const seconds = record.IsWfh ? wfhCredit(record, settings) : loggedSeconds(record, now);
    // Today is still running, so falling short of the goal does not break it yet.
    if (record.FullDate === today && seconds < goal) continue;
    if (seconds >= goal) streak += 1;
    else break;
  }

  return streak;
}

export interface DayPoint {
  iso: string;
  label: string;
  hours: number;
  isWfh: boolean;
  /** No record at all, as opposed to a record of zero hours. */
  missing: boolean;
}

/**
 * The last N working days, oldest first. Weekends are skipped rather than
 * drawn as gaps, so a fortnight reads as ten bars instead of fourteen with
 * two holes in it.
 */
export function dailyTrend(
  records: ShiftRecord[],
  settings: Settings,
  days = 10,
  now = new Date(),
): DayPoint[] {
  const byDate = new Map(records.map((r) => [r.FullDate, r]));
  const points: DayPoint[] = [];
  const cursor = new Date(now);

  while (points.length < days) {
    const weekday = (cursor.getDay() + 6) % 7;
    if (weekday < 5) {
      const iso = isoDate(cursor);
      const record = byDate.get(iso);
      const seconds = record
        ? record.IsWfh
          ? wfhCredit(record, settings)
          : loggedSeconds(record, now)
        : 0;

      points.push({
        iso,
        label: `${cursor.getDate()} ${cursor.toLocaleString('en-GB', { month: 'short' })}`,
        hours: seconds / 3600,
        isWfh: record?.IsWfh ?? false,
        missing: !record,
      });
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  return points.reverse();
}

export interface LocationSplit {
  officeHours: number;
  wfhHours: number;
  totalHours: number;
  /** Office share of the total, 0-1. */
  officeShare: number;
}

/** How the logged time divides between office and home, across all history. */
export function locationSplit(
  records: ShiftRecord[],
  settings: Settings,
  now = new Date(),
): LocationSplit {
  let officeSeconds = 0;
  let wfhSeconds = 0;

  for (const record of records) {
    if (record.IsWfh) wfhSeconds += wfhCredit(record, settings);
    else officeSeconds += loggedSeconds(record, now);
  }

  const total = officeSeconds + wfhSeconds;
  return {
    officeHours: officeSeconds / 3600,
    wfhHours: wfhSeconds / 3600,
    totalHours: total / 3600,
    officeShare: total > 0 ? officeSeconds / total : 0,
  };
}

export interface EntryPoint {
  iso: string;
  label: string;
  /** Seconds since midnight. */
  entry: number;
  start: number;
  /** Signed seconds against the rostered start - negative is early. */
  delta: number;
}

/**
 * Entry time against the rostered start for recent office days. Plotted as a
 * signed delta rather than a clock time, so "on time" is a flat line at zero
 * and lateness reads as height rather than as an absolute hour.
 */
export function entryTrend(records: ShiftRecord[], limit = 14): EntryPoint[] {
  return records
    .filter((r) => !r.IsWfh && r.EntryTime && r.ShiftStart)
    .sort((a, b) => a.FullDate.localeCompare(b.FullDate))
    .slice(-limit)
    .flatMap((record) => {
      const entry = parseClock(record.EntryTime);
      const start = parseClock(record.ShiftStart);
      if (entry === null || start === null) return [];
      return [{
        iso: record.FullDate,
        label: record.Date,
        entry,
        start,
        delta: entry - start,
      }];
    });
}
