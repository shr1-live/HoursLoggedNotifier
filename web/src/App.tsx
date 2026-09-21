import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DayOfWeekChart,
  PaceCard,
  StatGrid,
  WeeklyTrend,
} from './components/Analytics';
import { FocusView } from './components/FocusView';
import { RingGauge } from './components/RingGauge';
import { WeekChart } from './components/WeekChart';
import {
  byDayOfWeek,
  goalStreak,
  overallTotals,
  punctuality,
  weekPace,
  weeklyTrend,
} from './domain/analytics';
import {
  crossedThresholds,
  notificationPermission,
  notify,
  requestNotificationPermission,
} from './domain/alerts';
import {
  loggedSeconds,
  todayStatus,
  weekBreakdown,
  weekTotals,
  wfhCredit,
} from './domain/attendance';
import { lateBySeconds, parseShiftBlock } from './domain/parseShift';
import {
  lastExportedAt,
  loadSettings,
  loadShifts,
  markExported,
  mergeImported,
  requestPersistentStorage,
  saveSettings,
  saveShifts,
  upsert,
} from './domain/storage';
import { displayDate, formatDuration, formatTimeOfDay, isoDate, parseClock } from './domain/time';
import type { Settings, ShiftRecord } from './domain/types';

type Notice = { kind: 'ok' | 'error'; text: string } | null;

export default function App() {
  const [records, setRecords] = useState<ShiftRecord[]>(() => loadShifts());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [paste, setPaste] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [portalStatus, setPortalStatus] = useState<string | undefined>();
  // Ticks once a second so the live figures move without re-reading storage.
  const [now, setNow] = useState(() => new Date());
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => saveShifts(records), [records]);
  useEffect(() => saveSettings(settings), [settings]);

  const today = useMemo(() => todayStatus(records, now), [records, now]);
  const totals = useMemo(() => weekTotals(records, settings, now), [records, settings, now]);
  const days = useMemo(() => weekBreakdown(records, settings, now), [records, settings, now]);

  const trend = useMemo(() => weeklyTrend(records, settings, 6, now), [records, settings, now]);
  const dayStats = useMemo(() => byDayOfWeek(records, settings, now), [records, settings, now]);
  const punctual = useMemo(() => punctuality(records), [records]);
  const overall = useMemo(() => overallTotals(records, settings, now), [records, settings, now]);
  const streak = useMemo(() => goalStreak(records, settings, now), [records, settings, now]);
  const pace = useMemo(
    () => weekPace(totals.totalSeconds, settings, now),
    [totals.totalSeconds, settings, now],
  );

  // The compact window renders the same data with a different layout.
  const isFocus = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('focus');

  const [permission, setPermission] = useState(() => notificationPermission());
  const [persistent, setPersistent] = useState(false);
  const [lastExport, setLastExport] = useState<Date | null>(() => lastExportedAt());

  // Ask once on load; browsers grant this based on engagement, so it may take
  // a few visits before it sticks.
  useEffect(() => {
    void requestPersistentStorage().then(setPersistent);
  }, []);

  const todayIso = isoDate(now);
  const todayRecord = records.find((r) => r.FullDate === todayIso);

  useEffect(() => {
    if (!settings.notifyOnThreshold || !today) return;
    const percent = today.fraction * 100;
    const crossed = crossedThresholds(todayIso, percent, settings.alertThresholds);
    for (const threshold of crossed) {
      notify(
        `${threshold}% of today's shift`,
        `${formatDuration(today.spentSeconds)} logged. 95% exit at ${formatTimeOfDay(parseClock(today.record.Exit95))}.`,
      );
    }
  }, [today, todayIso, settings.notifyOnThreshold, settings.alertThresholds]);


  function handleParse() {
    const result = parseShiftBlock(paste, now);
    if (result.error || !result.record) {
      setNotice({ kind: 'error', text: result.error ?? 'Could not read that block.' });
      return;
    }
    setRecords((current) => upsert(current, result.record!));
    setPortalStatus(result.portalStatus);
    setPaste('');
    setNotice({ kind: 'ok', text: `Saved ${result.record.Date}.` });
  }

  function logWfh(hours?: number) {
    const existing = todayRecord;
    if (existing && !existing.IsWfh) {
      setNotice({ kind: 'error', text: 'Today is already logged as an office day.' });
      return;
    }

    const record: ShiftRecord = existing ?? {
      Date: displayDate(now),
      FullDate: todayIso,
      IsWfh: true,
    };
    // Leaving hours undefined keeps the default rather than clearing a value.
    const updated: ShiftRecord = hours === undefined ? record : { ...record, WfhHours: hours };

    setRecords((current) => upsert(current, updated));
    setNotice({
      kind: 'ok',
      text: `${updated.Date} logged as WFH - ${formatDuration(wfhCredit(updated, settings))} credited.`,
    });
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'shifts.json';
    link.click();
    URL.revokeObjectURL(url);
    markExported();
    setLastExport(new Date());
  }

  async function importJson(file: File) {
    try {
      const { records: merged, added } = mergeImported(records, JSON.parse(await file.text()));
      setRecords(merged);
      setNotice({ kind: 'ok', text: `Imported ${merged.length} record(s), ${added} new.` });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Import failed.' });
    }
  }

  const officeFraction = totals.officeTargetSeconds
    ? totals.officeSeconds / totals.officeTargetSeconds
    : 0;
  const to95 = totals.officeMark95Seconds - totals.officeSeconds;
  const late = todayRecord && !todayRecord.IsWfh ? lateBySeconds(todayRecord) : 0;

  // The popup shares all the state above, so it stays in step with the tab
  // that opened it without any message passing.
  if (isFocus) {
    return (
      <FocusView
        today={today}
        officeFraction={officeFraction}
        officeLoggedSeconds={totals.officeSeconds}
        officeTargetSeconds={totals.officeTargetSeconds}
        clock={now.toLocaleTimeString('en-GB')}
      />
    );
  }

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>Hours Logged</h1>
          <p className="muted">
            {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            {' · '}
            {now.toLocaleTimeString('en-GB')}
          </p>
        </div>
        <div className="header-actions">
          <button
            className="primary"
            onClick={() =>
              window.open(
                '/?focus=1',
                'hours-logged-focus',
                'width=400,height=560,menubar=no,toolbar=no,location=no,status=no',
              )
            }
          >
            Focus window
          </button>
          {permission !== 'granted' && permission !== 'unsupported' && (
            <button onClick={() => void requestNotificationPermission().then(setPermission)}>
              Enable alerts
            </button>
          )}
          <button onClick={exportJson}>Export shifts.json</button>
          <button onClick={() => fileInput.current?.click()}>Import</button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importJson(file);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      {records.length > 0 && (() => {
        const days = lastExport
          ? Math.floor((now.getTime() - lastExport.getTime()) / 86400000)
          : null;
        const stale = days === null || days >= 7;
        if (!stale && persistent) return null;
        return (
          <div className={`notice ${stale ? 'error' : 'ok'}`} role="status">
            {stale
              ? `History has ${days === null ? 'never been' : `not been exported for ${days} day(s)`} backed up. Browser storage can be cleared - export a copy.`
              : 'Browser storage is not marked persistent yet, so it could be evicted. Export a copy now and then.'}
            <button className="link" onClick={exportJson}>export now</button>
          </div>
        );
      })()}

      {notice && (
        <div className={`notice ${notice.kind}`} role="status">
          {notice.text}
          <button className="link" onClick={() => setNotice(null)}>
            dismiss
          </button>
        </div>
      )}

      <section className="grid">
        <article className="card centre">
          <h2>Today</h2>
          {today ? (
            <>
              <RingGauge
                fraction={today.fraction}
                value={formatDuration(today.spentSeconds)}
                caption="of today's shift"
              />
              <dl className="facts">
                <div>
                  <dt>Entry</dt>
                  <dd>{formatTimeOfDay(parseClock(today.record.EntryTime))}</dd>
                </div>
                <div>
                  <dt>95% exit</dt>
                  <dd>
                    {formatTimeOfDay(parseClock(today.record.Exit95))}
                    <span className="muted">
                      {today.left95Seconds > 0
                        ? ` · in ${formatDuration(today.left95Seconds)}`
                        : ' · reached'}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>100% exit</dt>
                  <dd>
                    {formatTimeOfDay(parseClock(today.record.Exit100))}
                    <span className="muted">
                      {today.left100Seconds > 0
                        ? ` · in ${formatDuration(today.left100Seconds)}`
                        : ' · reached'}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd className={late > 0 ? 'warn' : 'good'}>
                    {late > 0 ? `${formatDuration(late, true)} LATE` : 'On time'}
                  </dd>
                </div>
                {today.record.Location && (
                  <div>
                    <dt>Location</dt>
                    <dd>{today.record.Location}</dd>
                  </div>
                )}
                {portalStatus && (
                  <div>
                    <dt>Portal</dt>
                    <dd>{portalStatus}</dd>
                  </div>
                )}
              </dl>
            </>
          ) : todayRecord?.IsWfh ? (
            <p className="muted pad">
              Today is logged as WFH — {formatDuration(wfhCredit(todayRecord, settings))} credited.
            </p>
          ) : (
            <p className="muted pad">No shift recorded today. Paste your block below.</p>
          )}
        </article>

        <article className="card centre">
          <h2>Office hours this week</h2>
          <RingGauge
            fraction={officeFraction}
            value={formatDuration(totals.officeSeconds)}
            caption={`of ${formatDuration(totals.officeTargetSeconds)}`}
          />
          <p className="target">
            {to95 > 0 ? (
              <>
                <strong>{formatDuration(to95)}</strong> to the 95% mark (
                {formatDuration(totals.officeMark95Seconds)})
              </>
            ) : (
              <span className="good">
                Past the 95% mark ({formatDuration(totals.officeMark95Seconds)})
              </span>
            )}
          </p>
          <p className="muted small">
            {totals.officeDays} office day(s), {totals.wfhDays} WFH — target{' '}
            {settings.requiredOfficeDays}/week
          </p>
        </article>
      </section>

      <section className="card">
        <h2>This week</h2>
        <WeekChart days={days} goalHours={settings.dailyGoalHours} />
        <p className="muted small">
          Weekly hours: {formatDuration(totals.totalSeconds)} /{' '}
          {formatDuration(totals.weeklyTargetSeconds)}
          {totals.totalSeconds < totals.weeklyTargetSeconds &&
            ` · ${formatDuration(totals.weeklyTargetSeconds - totals.totalSeconds)} pending`}
        </p>
      </section>

      <section className="two-up">
        <article className="card">
          <h2>Log a shift</h2>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={'General Shift\n(21 Sept)\n10:00 AM - 7:00 PM\n\nGurgaon Biometric\n10:24:52 AM\nMISSING'}
            rows={8}
            spellCheck={false}
          />
          <div className="row">
            <button className="primary" onClick={handleParse} disabled={!paste.trim()}>
              Parse and save
            </button>
            <button onClick={() => setPaste('')} disabled={!paste}>
              Clear
            </button>
          </div>

          <h3>Working from home</h3>
          <div className="row">
            <button onClick={() => logWfh()}>
              Log WFH ({settings.dailyGoalHours}h default)
            </button>
            <input
              type="number"
              min={0.5}
              max={24}
              step={0.5}
              placeholder="hours"
              aria-label="WFH hours"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const value = Number((e.target as HTMLInputElement).value);
                if (value > 0 && value <= 24) logWfh(value);
              }}
            />
            <span className="muted small">type hours, press Enter</span>
          </div>
        </article>

        <article className="card">
          <h2>Settings</h2>
          <label>
            Office days required per week
            <input
              type="number"
              min={0}
              max={7}
              value={settings.requiredOfficeDays}
              onChange={(e) =>
                setSettings({ ...settings, requiredOfficeDays: Number(e.target.value) })
              }
            />
          </label>
          <label>
            WFH days per week
            <input
              type="number"
              min={0}
              max={7}
              value={settings.wfhDaysPerWeek}
              onChange={(e) => setSettings({ ...settings, wfhDaysPerWeek: Number(e.target.value) })}
            />
          </label>
          <label>
            Daily hour goal
            <input
              type="number"
              min={1}
              max={24}
              step={0.5}
              value={settings.dailyGoalHours}
              onChange={(e) => setSettings({ ...settings, dailyGoalHours: Number(e.target.value) })}
            />
          </label>
          <label>
            Default WFH hours
            <input
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={settings.defaultWfhHours}
              onChange={(e) => setSettings({ ...settings, defaultWfhHours: Number(e.target.value) })}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.notifyOnThreshold}
              onChange={(e) => setSettings({ ...settings, notifyOnThreshold: e.target.checked })}
            />
            Alert me at {settings.alertThresholds.join('%, ')}% of the shift
          </label>
          <p className="muted small">
            Office target is {settings.requiredOfficeDays} × {settings.dailyGoalHours}h ={' '}
            {formatDuration(totals.officeTargetSeconds)}, and the 95% mark is{' '}
            {formatDuration(totals.officeMark95Seconds)}.
          </p>
          <p className="muted small">
            Desktop reminders and notifications stay in the .NET app — this dashboard is the
            read-and-record side.
          </p>
        </article>
      </section>

      <section className="card">
        <h2>Analytics</h2>
        <StatGrid
          totals={overall}
          punctual={punctual}
          streak={streak}
          goalHours={settings.dailyGoalHours}
        />
      </section>

      <section className="two-up">
        <article className="card">
          <h2>Last 6 weeks</h2>
          <WeeklyTrend
            points={trend}
            targetHours={settings.dailyGoalHours * settings.workdaysPerWeek}
          />
        </article>
        <article className="card">
          <h2>Average by weekday</h2>
          <DayOfWeekChart stats={dayStats} goalHours={settings.dailyGoalHours} />
        </article>
      </section>

      <section className="card">
        <h2>Pace this week</h2>
        <PaceCard pace={pace} />
      </section>

      <section className="card">
        <h2>History</h2>
        {records.length === 0 ? (
          <p className="muted">Nothing logged yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Entry</th>
                <th>Hours</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {records.slice(0, 20).map((record) => (
                <tr key={record.FullDate}>
                  <td>{record.Date}</td>
                  <td>{record.IsWfh ? 'WFH' : (record.Location ?? 'Office')}</td>
                  <td>{record.IsWfh ? '—' : formatTimeOfDay(parseClock(record.EntryTime))}</td>
                  <td>
                    {formatDuration(
                      record.IsWfh ? wfhCredit(record, settings) : loggedSeconds(record, now),
                    )}
                    {record.IsWfh && record.WfhHours == null && (
                      <span className="muted"> (default)</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="link"
                      onClick={() =>
                        setRecords((current) =>
                          current.filter((r) => r.FullDate !== record.FullDate),
                        )
                      }
                    >
                      delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
