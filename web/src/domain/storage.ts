import type { Settings, ShiftRecord } from './types';
import { defaultSettings } from './types';

/**
 * Persistence is localStorage, so the site works on Netlify with no backend.
 * Every accessor is defensive: private windows and blocked site data make
 * these calls throw, and a dashboard that crashes on load is worse than one
 * that starts empty.
 */

const SHIFTS_KEY = 'hln.shifts';
const SETTINGS_KEY = 'hln.settings';
const BACKUP_KEY = 'hln.lastExport';

/**
 * Asks the browser to keep this origin's data rather than treating it as
 * evictable cache. Without it, Safari clears script-writable storage after
 * about seven days of not visiting, and any browser may evict under storage
 * pressure. Granting is at the browser's discretion and usually depends on
 * engagement, so this is a request rather than a guarantee.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageIsPersistent(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}

/** When the history was last exported, so the UI can nag before data is lost. */
export function lastExportedAt(): Date | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    return raw ? new Date(raw) : null;
  } catch {
    return null;
  }
}

export function markExported(when = new Date()): void {
  try {
    localStorage.setItem(BACKUP_KEY, when.toISOString());
  } catch {
    // Not fatal.
  }
}

export function loadShifts(): ShiftRecord[] {
  try {
    const raw = localStorage.getItem(SHIFTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ShiftRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveShifts(records: ShiftRecord[]): void {
  try {
    localStorage.setItem(SHIFTS_KEY, JSON.stringify(records));
  } catch {
    // Out of quota or storage blocked - the in-memory state still works.
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    return { ...defaultSettings, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // As above - not fatal.
  }
}

/** Replaces any record for the same date, matching the desktop app's Save. */
export function upsert(records: ShiftRecord[], record: ShiftRecord): ShiftRecord[] {
  const rest = records.filter((r) => r.FullDate !== record.FullDate);
  return [...rest, record].sort((a, b) => b.FullDate.localeCompare(a.FullDate));
}

/**
 * Merges a shifts.json exported from the desktop app. Imported rows win on a
 * clash, since the desktop app is where office time is actually recorded.
 */
export function mergeImported(existing: ShiftRecord[], incoming: unknown): { records: ShiftRecord[]; added: number } {
  if (!Array.isArray(incoming)) throw new Error('That file is not a shifts.json array.');

  const valid = incoming.filter(
    (r): r is ShiftRecord =>
      typeof r === 'object' && r !== null && typeof (r as ShiftRecord).FullDate === 'string',
  );
  if (valid.length === 0) throw new Error('No usable records found in that file.');

  const byDate = new Map(existing.map((r) => [r.FullDate, r]));
  let added = 0;
  for (const record of valid) {
    if (!byDate.has(record.FullDate)) added += 1;
    byDate.set(record.FullDate, record);
  }

  const records = [...byDate.values()].sort((a, b) => b.FullDate.localeCompare(a.FullDate));
  return { records, added };
}
