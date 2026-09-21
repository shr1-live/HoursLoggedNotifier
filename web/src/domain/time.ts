/** Small time helpers. Everything is kept in seconds-since-midnight or minutes. */

/** "10:24:52" or "10:24" -> seconds since midnight. */
export function parseClock(value: string | undefined | null): number | null {
  if (!value) return null;
  const parts = value.split(':').map(Number);
  if (parts.some(Number.isNaN) || parts.length < 2) return null;
  const [h, m, s = 0] = parts;
  return h * 3600 + m * 60 + s;
}

/** Seconds since midnight -> "HH:mm:ss", the format shifts.json uses. */
export function toClock(seconds: number): string {
  const wrapped = ((seconds % 86400) + 86400) % 86400;
  const h = Math.floor(wrapped / 3600);
  const m = Math.floor((wrapped % 3600) / 60);
  const s = Math.floor(wrapped % 60);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Seconds since midnight -> "10:24:52 AM". */
export function formatTimeOfDay(seconds: number | null): string {
  if (seconds === null) return '-';
  const wrapped = ((seconds % 86400) + 86400) % 86400;
  let h = Math.floor(wrapped / 3600);
  const m = Math.floor((wrapped % 3600) / 60);
  const s = Math.floor(wrapped % 60);
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 === 0 ? 12 : h % 12;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${suffix}`;
}

/** Matches the desktop app's "0h 25m" / "0h 25m 51s" style. */
export function formatDuration(totalSeconds: number, withSeconds = false): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return withSeconds ? `${h}h ${m}m ${s}s` : `${h}h ${m}m`;
}

export function hoursToSeconds(hours: number): number {
  return Math.round(hours * 3600);
}

/** Local date as "YYYY-MM-DD", avoiding the UTC shift toISOString would cause. */
export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "21 Sep", matching the desktop app's display format. */
export function displayDate(date: Date): string {
  return `${date.getDate()} ${date.toLocaleString('en-GB', { month: 'short' })}`;
}

/** Monday of the week containing the given date. */
export function mondayOf(date: Date): Date {
  const copy = new Date(date);
  const daysSinceMonday = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - daysSinceMonday);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function secondsSinceMidnight(date: Date): number {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}
