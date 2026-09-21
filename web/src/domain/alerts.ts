/**
 * Threshold alerts while the tab is open. A browser notification needs the
 * user to grant permission first, and each threshold fires once per day - so
 * reopening the page later does not replay the whole sequence.
 */

const FIRED_KEY = 'hln.firedThresholds';

interface FiredState {
  date: string;
  thresholds: number[];
}

function readFired(): FiredState {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    if (!raw) return { date: '', thresholds: [] };
    return JSON.parse(raw) as FiredState;
  } catch {
    return { date: '', thresholds: [] };
  }
}

function writeFired(state: FiredState): void {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(state));
  } catch {
    // Not fatal - at worst an alert repeats after a reload.
  }
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

/**
 * Returns the thresholds newly crossed, having recorded them so they do not
 * fire twice. Pass the percentage through the shift, not a fraction.
 */
export function crossedThresholds(
  todayIso: string,
  percent: number,
  thresholds: number[],
): number[] {
  const state = readFired();
  const already = state.date === todayIso ? state.thresholds : [];

  const crossed = thresholds
    .filter((t) => percent >= t && !already.includes(t))
    .sort((a, b) => a - b);

  if (crossed.length > 0) {
    writeFired({ date: todayIso, thresholds: [...already, ...crossed] });
  }

  return crossed;
}

/** Fires a desktop notification, silently doing nothing if not permitted. */
export function notify(title: string, body: string): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag: 'hours-logged', icon: '/favicon.svg' });
  } catch {
    // Some browsers require a service worker for notifications; failing here
    // should never break the dashboard.
  }
}
