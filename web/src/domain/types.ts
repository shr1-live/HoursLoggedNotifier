/**
 * Mirrors the shapes the desktop app writes to shifts.json, so a file exported
 * from one can be imported into the other without translation.
 */
export interface ShiftRecord {
  /** Display label, e.g. "21 Sep". */
  Date: string;
  /** ISO date, e.g. "2026-09-21". */
  FullDate: string;
  /** "HH:mm:ss" - absent on WFH days. */
  ShiftStart?: string;
  ShiftEnd?: string;
  EntryTime?: string;
  Exit95?: string;
  Exit100?: string;
  ActualExitTime?: string | null;
  Location?: string | null;
  IsWfh: boolean;
  /** Hours credited for a WFH day. Null/undefined means "use the daily goal". */
  WfhHours?: number | null;
}

export interface Settings {
  /** Office days required each week. */
  requiredOfficeDays: number;
  /** WFH days expected each week - the rest of the working week. */
  wfhDaysPerWeek: number;
  /** Hours that count as a full day. */
  dailyGoalHours: number;
  /** Default hours credited for a WFH day, before any per-day override. */
  defaultWfhHours: number;
  /** Working days in a week, used for the weekly total. */
  workdaysPerWeek: number;
  /** Alert when today's shift crosses these percentages. */
  alertThresholds: number[];
  /** Which exit time counts as the finish line for the ring and bars. */
  targetExit: '95' | '100';
  /** Whether to raise a browser notification at those thresholds. */
  notifyOnThreshold: boolean;
}

export const defaultSettings: Settings = {
  requiredOfficeDays: 3,
  wfhDaysPerWeek: 2,
  dailyGoalHours: 9,
  defaultWfhHours: 9.5,
  workdaysPerWeek: 5,
  targetExit: '95',
  alertThresholds: [50, 75, 95, 100],
  notifyOnThreshold: true,
};
