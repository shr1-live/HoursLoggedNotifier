import { useState } from 'react';
import { HoursMinutesInput } from './HoursMinutesInput';
import { wfhCredit } from '../domain/attendance';
import { parseClock } from '../domain/time';
import type { Settings, ShiftRecord } from '../domain/types';

interface EditRowProps {
  record: ShiftRecord;
  settings: Settings;
  onSave: (updated: ShiftRecord) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}

/** "HH:mm:ss" from a time input, which may come back as "HH:mm". */
function normaliseTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

/**
 * Inline correction for one day. Office days take entry and exit times - a
 * mistyped biometric or a forgotten sign-off are the usual reasons - and WFH
 * days take their hours directly, since there is no clock to correct.
 */
export function EditRow({ record, settings, onSave, onCancel, onError }: EditRowProps) {
  const [entry, setEntry] = useState(record.EntryTime ?? '');
  const [exit, setExit] = useState(record.ActualExitTime ?? '');
  const [hours, setHours] = useState(wfhCredit(record, settings) / 3600);

  function save() {
    if (record.IsWfh) {
      onSave({ ...record, WfhHours: hours });
      return;
    }

    const entrySeconds = parseClock(entry);
    if (entrySeconds === null) {
      onError('Entry time is not valid.');
      return;
    }

    // An empty exit means the day is still running, which is a legitimate
    // correction for a sign-off entered by mistake.
    const exitSeconds = exit ? parseClock(exit) : null;
    if (exit && exitSeconds === null) {
      onError('Exit time is not valid.');
      return;
    }
    if (exitSeconds !== null && exitSeconds < entrySeconds) {
      onError('The exit time is before the entry time.');
      return;
    }

    onSave({
      ...record,
      EntryTime: entry,
      ActualExitTime: exit || null,
    });
  }

  return (
    <tr className="edit-row">
      <td colSpan={5}>
        <div className="edit-fields">
          <strong>{record.Date}</strong>

          {record.IsWfh ? (
            <label className="inline">
              Hours
              <HoursMinutesInput value={hours} onChange={setHours} />
            </label>
          ) : (
            <>
              <label className="inline">
                Entry
                <input
                  type="time"
                  step={1}
                  value={entry.slice(0, 8)}
                  onChange={(e) => setEntry(normaliseTime(e.target.value))}
                />
              </label>
              <label className="inline">
                Exit
                <input
                  type="time"
                  step={1}
                  value={exit ? exit.slice(0, 8) : ''}
                  onChange={(e) => setExit(e.target.value ? normaliseTime(e.target.value) : '')}
                />
              </label>
              <span className="muted small">leave Exit blank to reopen the day</span>
            </>
          )}

          <button className="primary" onClick={save}>
            Save
          </button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </td>
    </tr>
  );
}
