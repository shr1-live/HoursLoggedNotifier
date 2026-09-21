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
  /** Hours that count as a full day. */
  dailyGoalHours: number;
  /** Working days in a week, used for the weekly total. */
  workdaysPerWeek: number;
}

export const defaultSettings: Settings = {
  requiredOfficeDays: 3,
  dailyGoalHours: 9,
  workdaysPerWeek: 5,
};
