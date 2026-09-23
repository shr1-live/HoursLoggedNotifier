import type { Settings, ShiftRecord } from './types';
import type { TodayStatus, WeekTotals } from './attendance';
import { hoursToSeconds, parseClock, secondsSinceMidnight } from './time';

/**
 * Answers the question the rest of the dashboard does not: what should I do
 * today?
 *
 * The rule is per day, not per week: from the moment you log in, an office day
 * owes 95% of the nine-hour shift - 8h 33m - and that is the whole of it. The
 * weekly total accumulates out of those days but never changes what today asks
 * for. An earlier version spread the week's shortfall across the days left,
 * which was wrong in both directions: it let a good week excuse a short day,
 * and it demanded impossible ones after a bad week.
 */

export type PlanState =
  | 'weekend'      // nothing owed today
  | 'wfh'          // working from home; hours are credited, not clocked
  | 'not-arrived'  // office day, no entry recorded yet
  | 'working'      // clock running, the daily minimum not yet met
  | 'can-leave'    // the daily minimum is met
  | 'signed-off';  // logged out already

export interface TodayPlan {
  state: PlanState;
  /** What an office day owes from login - 95% of the shift by default. */
  dailyRequired: number;
  /** Still to work today before the minimum is met. */
  remainingToday: number;
  /** Clock time to log out at, once an entry exists. */
  logoutAt: number | null;
  /** Seconds from now until that logout; zero once it has passed. */
  untilLogout: number | null;
  /** Latest arrival that still finishes by the preferred hour. */
  arriveBy: number | null;
  /** Seconds late against the rostered start; negative is early, null unknown. */
  lateBy: number | null;
  /** Logged today so far. */
  loggedToday: number;
  /** Context only - the week's position never moves today's target. */
  weekRemaining: number;
  daysLeft: number;
}

function workingDaysLeft(now: Date, workdaysPerWeek: number): number {
  const weekday = (now.getDay() + 6) % 7;
  return weekday >= workdaysPerWeek ? 0 : workdaysPerWeek - weekday;
}

export function todayPlan(
  todayRecord: ShiftRecord | undefined,
  status: TodayStatus | null,
  week: WeekTotals,
  settings: Settings,
  now = new Date(),
): TodayPlan {
  const daysLeft = workingDaysLeft(now, settings.workdaysPerWeek);
  const weekRemaining = Math.max(0, week.weeklyMark95Seconds - week.totalSeconds);
  const nowSeconds = secondsSinceMidnight(now);

  // The finish line is 95% of the day unless the settings move it to the full
  // shift - the same choice the ring and the widgets already follow.
  const factor = settings.targetExit === '100' ? 1 : 0.95;
  const dailyRequired = Math.round(hoursToSeconds(settings.dailyGoalHours) * factor);

  const loggedToday = status ? status.spentSeconds : 0;
  const entry = parseClock(todayRecord?.EntryTime);
  const rosterStart = parseClock(todayRecord?.ShiftStart);
  const lateBy = entry !== null && rosterStart !== null ? entry - rosterStart : null;
  const preferredFinish = parseClock(settings.preferredFinish) ?? 19 * 3600;

  const base = {
    dailyRequired,
    remainingToday: Math.max(0, dailyRequired - loggedToday),
    logoutAt: null as number | null,
    untilLogout: null as number | null,
    arriveBy: null as number | null,
    lateBy,
    loggedToday,
    weekRemaining,
    daysLeft,
  };

  if (daysLeft === 0) return { ...base, state: 'weekend' };

  // A day at home is credited rather than clocked, so there is no login to
  // measure from and no logout time to give.
  if (todayRecord?.IsWfh) return { ...base, state: 'wfh' };

  if (status?.clockedOut) return { ...base, state: 'signed-off' };

  if (entry === null) {
    return {
      ...base,
      state: 'not-arrived',
      arriveBy: Math.max(0, preferredFinish - dailyRequired),
    };
  }

  // Taken from the record where one exists, so this reads as the same 95%
  // logout shown beside the ring rather than a second opinion about it.
  const recorded = parseClock(
    settings.targetExit === '100' ? todayRecord?.Exit100 : todayRecord?.Exit95,
  );
  const logoutAt = recorded ?? entry + dailyRequired;

  return {
    ...base,
    state: loggedToday >= dailyRequired ? 'can-leave' : 'working',
    logoutAt,
    untilLogout: Math.max(0, logoutAt - nowSeconds),
  };
}
