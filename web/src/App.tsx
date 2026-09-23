import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DayOfWeekChart,
  PaceCard,
  StatGrid,
  WeeklyTrend,
} from './components/Analytics';
import { createPortal } from 'react-dom';
import {
  CircleGauge,
  Download,
  LogOut,
  Maximize2,
  Moon,
  PanelBottom,
  PanelLeft,
  Sun,
  SunMoon,
  Upload,
} from 'lucide-react';
import { MotionCard, MotionSection } from './components/Motion';
import { EditRow } from './components/EditRow';
import { FocusView } from './components/FocusView';
import { HoursMinutesInput } from './components/HoursMinutesInput';
import { AdaptiveWidget } from './components/AdaptiveWidget';
import { RingGauge } from './components/RingGauge';
import { WeekChart } from './components/WeekChart';
import { KpiBand } from './components/KpiBand';
import {
  DailyTrend,
  EntryTrendChart,
  LocationSplitChart,
} from './components/TrendCharts';
import {
  byDayOfWeek,
  dailyTrend,
  entryTrend,
  goalStreak,
  locationSplit,
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
  weekRange,
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
import { openPipContainer, pipSupported } from './domain/pip';
import {
  applyTheme,
  loadTheme,
  saveTheme,
  watchSystemTheme,
  type Theme,
} from './domain/theme';
import { displayDate, formatDuration, formatTimeOfDay, isoDate, parseClock } from './domain/time';
import type { Settings, ShiftRecord } from './domain/types';

type Notice = { kind: 'ok' | 'error'; text: string } | null;

export default function App() {
  const [records, setRecords] = useState<ShiftRecord[]>(() => loadShifts());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [paste, setPaste] = useState('');
  const [wfhEntry, setWfhEntry] = useState(9.5);
  // Which day's row is open for correction, by ISO date.
  const [editing, setEditing] = useState<string | null>(null);
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

  const today = useMemo(
    () => todayStatus(records, now, settings.targetExit),
    [records, now, settings.targetExit],
  );
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
  // The history table shows this week by default - older days stay recorded
  // and still feed every chart, they are just not the list you scroll.
  const [showAllHistory, setShowAllHistory] = useState(false);
  const history = useMemo(() => {
    if (showAllHistory) return records;
    const from = isoDate(weekRange(now).monday);
    return records.filter((r) => r.FullDate >= from);
  }, [records, showAllHistory, now]);

  const fortnight = useMemo(() => dailyTrend(records, settings, 10, now), [records, settings, now]);
  const split = useMemo(() => locationSplit(records, settings, now), [records, settings, now]);
  const arrivals = useMemo(() => entryTrend(records), [records]);

  // The compact window renders the same data with a different layout.
  const params = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const isFocus = params.has('focus');
  const isMini = params.has('mini');

  const [permission, setPermission] = useState(() => notificationPermission());
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [pip, setPip] = useState<{ window: Window; container: HTMLElement } | null>(null);
  const [persistent, setPersistent] = useState(false);

  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
    // Following the system means reacting when it changes, not only on load.
    return theme === 'system' ? watchSystemTheme(() => applyTheme('system')) : undefined;
  }, [theme]);
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
        `${formatDuration(today.spentSeconds)} logged. 95% logout at ${formatTimeOfDay(parseClock(today.record.Exit95))}.`,
      );
    }
  }, [today, todayIso, settings.notifyOnThreshold, settings.alertThresholds]);


  function handleParse(asWfh = false) {
    const result = parseShiftBlock(paste, now, asWfh, {
      defaultShiftHours: settings.dailyGoalHours,
    });
    if (result.error || !result.record) {
      setNotice({ kind: 'error', text: result.error ?? 'Could not read that block.' });
      return;
    }
    setRecords((current) => upsert(current, result.record!));
    setPortalStatus(result.portalStatus);
    setPaste('');
    setNotice({
      kind: 'ok',
      text: asWfh
        ? `Saved ${result.record.Date} as WFH - ${formatDuration(wfhCredit(result.record, settings))} credited.`
        : `Saved ${result.record.Date}.`,
    });
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


  async function openMiniWidget(shape: { width: number; height: number } = { width: 240, height: 250 }) {
    if (pip) {
      pip.window.focus();
      return;
    }

    const opened = await openPipContainer(shape);
    if (opened) {
      // Clear our reference when the user closes the window.
      opened.window.addEventListener('pagehide', () => setPip(null));
      setPip(opened);
      return;
    }

    // No picture-in-picture support: a small popup is the next best thing,
    // though it will not stay above other windows.
    window.open(
      '/?mini=1',
      'hours-logged-mini',
      `width=${shape.width},height=${shape.height + 30},menubar=no,toolbar=no,location=no,status=no`,
    );
  }


  /**
   * Signs the day off at the given time, or now. Recording an exit stops the
   * clock everywhere, since every figure derives from the same record.
   */
  function logOut(at?: string) {
    const record = todayRecord;
    if (!record || record.IsWfh) {
      setNotice({ kind: 'error', text: 'No office shift running today.' });
      return;
    }

    const exit = at ?? new Date().toTimeString().slice(0, 8);
    const entry = parseClock(record.EntryTime);
    const leaving = parseClock(exit);

    if (leaving === null) {
      setNotice({ kind: 'error', text: `Couldn't read "${exit}" as a time.` });
      return;
    }
    if (entry !== null && leaving < entry) {
      setNotice({
        kind: 'error',
        text: `That is before your entry at ${formatTimeOfDay(entry)}.`,
      });
      return;
    }

    setRecords((current) => upsert(current, { ...record, ActualExitTime: exit }));
    setNotice({
      kind: 'ok',
      text: `Signed off at ${formatTimeOfDay(leaving)} - ${formatDuration(Math.max(0, leaving - (entry ?? leaving)))} worked.`,
    });
  }

  /** Reopens the day, for a sign-off entered by mistake. */
  function reopenDay() {
    const record = todayRecord;
    if (!record) return;
    setRecords((current) => upsert(current, { ...record, ActualExitTime: null }));
    setNotice({ kind: 'ok', text: 'Day reopened - the clock is running again.' });
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
  const late = todayRecord && !todayRecord.IsWfh ? lateBySeconds(todayRecord) : null;

  // The popup shares all the state above, so it stays in step with the tab
  // that opened it without any message passing.
  if (isMini) {
    return (
      <AdaptiveWidget
        fraction={today ? today.fraction : null}
        loggedSeconds={today ? today.spentSeconds : 0}
        remainingSeconds={today ? today.left100Seconds : 0}
        officeFraction={officeFraction}
      />
    );
  }

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
      {/* Rendered into the picture-in-picture document, so it updates with
          the same state rather than polling or posting messages. */}
      {pip
        && createPortal(
          <AdaptiveWidget
            fraction={today ? today.fraction : null}
            loggedSeconds={today ? today.spentSeconds : 0}
            remainingSeconds={today ? today.left100Seconds : 0}
            officeFraction={officeFraction}
          />,
          pip.container,
        )}
      <header className="header">
        <div>
          <h1>Hours Logged</h1>
          <p className="muted">
            <span className="live-dot" aria-hidden="true" />
            {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            {' · '}
            {now.toLocaleTimeString('en-GB')}
          </p>
        </div>
        <div className="header-actions">
          <span className="theme-switch" role="group" aria-label="Theme">
            {(['light', 'system', 'dark'] as Theme[]).map((option) => (
              <button
                key={option}
                className={theme === option ? 'active' : ''}
                onClick={() => setTheme(option)}
              >
                {option === 'light' ? <Sun size={15} /> : option === 'dark' ? <Moon size={15} /> : <SunMoon size={15} />}
                {option === 'light' ? 'Light' : option === 'dark' ? 'Dark' : 'Auto'}
              </button>
            ))}
          </span>
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
            <Maximize2 size={15} /> Focus window
          </button>
          <button onClick={() => void openMiniWidget()}>
            <CircleGauge size={15} /> {pipSupported() ? 'Mini widget' : 'Mini window'}
          </button>
          <button
            onClick={() =>
              // Ask for the whole usable width; the browser clamps if it will
              // not allow it, which is better than guessing a smaller number.
              void openMiniWidget({
                width: Math.max(480, window.screen.availWidth - 8),
                height: 44,
              })
            }
          >
            <PanelBottom size={15} /> Bar widget
          </button>
          <button
            onClick={() =>
              void openMiniWidget({
                width: 86,
                height: Math.max(320, window.screen.availHeight - 120),
              })
            }
          >
            <PanelLeft size={15} /> Vertical bar
          </button>
          {permission !== 'granted' && permission !== 'unsupported' && (
            <button onClick={() => void requestNotificationPermission().then(setPermission)}>
              Enable alerts
            </button>
          )}
          <button onClick={exportJson}>
            <Download size={15} /> Export
          </button>
          <button onClick={() => fileInput.current?.click()}>
            <Upload size={15} /> Import
          </button>
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

      {/* The figures worth seeing before anything else, so the page answers
          "where am I" above the fold rather than in a chart further down. */}
      <KpiBand
        today={today}
        week={totals}
        pace={pace}
        streak={streak}
        punctual={punctual}
      />

      <MotionSection className="grid">
        <MotionCard className="card centre" index={0}>
          <h2>Today</h2>
          {today ? (
            <>
              <RingGauge
                fraction={today.fraction}
                value={formatDuration(today.spentSeconds)}
                caption={today.reachedGoal ? 'you can leave' : 'until the 95% logout'}
                goodThreshold={1}
              />
              <dl className="facts">
                <div>
                  <dt>Entry</dt>
                  <dd>{formatTimeOfDay(parseClock(today.record.EntryTime))}</dd>
                </div>
                <div>
                  <dt>95% logout</dt>
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
                  <dt>100% logout</dt>
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
                  <dd className={late === null ? 'muted' : late > 0 ? 'warn' : 'good'}>
                    {late === null
                      ? 'no roster recorded'
                      : late > 0
                        ? `${formatDuration(late, true)} LATE`
                        : 'On time'}
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

              {today.clockedOut ? (
                <div className="row signoff">
                  <span className="good">
                    Signed off at {formatTimeOfDay(parseClock(today.record.ActualExitTime ?? undefined))}
                  </span>
                  <button className="link" onClick={reopenDay}>
                    reopen
                  </button>
                </div>
              ) : (
                <div className="row signoff">
                  <button className="primary" onClick={() => logOut()}>
                    <LogOut size={15} /> Log out now
                  </button>
                  <input
                    type="time"
                    step={1}
                    aria-label="logout time"
                    onChange={(e) => {
                      // A blank value means the field was cleared, not a sign-off.
                      if (e.target.value) logOut(e.target.value.length === 5 ? `${e.target.value}:00` : e.target.value);
                    }}
                  />
                </div>
              )}
            </>
          ) : todayRecord?.IsWfh ? (
            <p className="muted pad">
              Today is logged as WFH — {formatDuration(wfhCredit(todayRecord, settings))} credited.
            </p>
          ) : (
            <p className="muted pad">No shift recorded today. Paste your block below.</p>
          )}
        </MotionCard>

        <MotionCard className="card centre" index={0}>
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
        </MotionCard>
      </MotionSection>

      <MotionSection className="card">
        <h2>This week</h2>
        <WeekChart days={days} goalHours={settings.dailyGoalHours} />
        <p className="muted small">
          Weekly hours: {formatDuration(totals.totalSeconds)} /{' '}
          {formatDuration(totals.weeklyTargetSeconds)}
          {totals.totalSeconds >= totals.weeklyMark95Seconds ? (
            <span className="good">
              {` · past the 95% mark (${formatDuration(totals.weeklyMark95Seconds)}) - week done`}
            </span>
          ) : (
            ` · ${formatDuration(totals.weeklyMark95Seconds - totals.totalSeconds)} to the 95% mark (${formatDuration(totals.weeklyMark95Seconds)})`
          )}
        </p>
      </MotionSection>

      <MotionSection className="two-up">
        <MotionCard className="card">
          <h2>Log a shift</h2>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={'General Shift\n(21 Sept)\n10:00 AM - 7:00 PM\n\nGurgaon Biometric\n10:24:52 AM\nMISSING'}
            rows={8}
            spellCheck={false}
          />
          <div className="row">
            <button className="primary" onClick={() => handleParse(false)} disabled={!paste.trim()}>
              Save as office day
            </button>
            <button onClick={() => handleParse(true)} disabled={!paste.trim()}>
              Save as WFH
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
            <HoursMinutesInput value={wfhEntry} onChange={setWfhEntry} />
            <button onClick={() => logWfh(wfhEntry)} disabled={wfhEntry <= 0}>
              Log these hours
            </button>
          </div>
        </MotionCard>

        <MotionCard className="card">
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
            <HoursMinutesInput
              value={settings.dailyGoalHours}
              onChange={(dailyGoalHours) => setSettings({ ...settings, dailyGoalHours })}
            />
          </label>
          <label>
            Default WFH hours
            <HoursMinutesInput
              value={settings.defaultWfhHours}
              onChange={(defaultWfhHours) => setSettings({ ...settings, defaultWfhHours })}
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
        </MotionCard>
      </MotionSection>

      <MotionSection className="card">
        <h2>Totals</h2>
        <p className="card-note">Everything logged since you started, at a glance.</p>
        <StatGrid
          totals={overall}
          punctual={punctual}
          goalHours={settings.dailyGoalHours}
        />
      </MotionSection>

      <MotionSection className="two-up">
        <MotionCard className="card">
          <h2>Last 10 working days</h2>
          <p className="card-note">
            The shape of the fortnight. A dip below the goal line is a short day.
          </p>
          <DailyTrend points={fortnight} goalHours={settings.dailyGoalHours} />
        </MotionCard>
        <MotionCard className="card">
          <h2>Where the time goes</h2>
          <p className="card-note">
            Office against home across all history, by hours rather than by days.
          </p>
          <LocationSplitChart split={split} />
        </MotionCard>
      </MotionSection>

      <MotionSection className="two-up">
        <MotionCard className="card">
          <h2>Last 6 weeks</h2>
          <p className="card-note">Weekly totals, split by where the hours were spent.</p>
          <WeeklyTrend
            points={trend}
            targetHours={settings.dailyGoalHours * settings.workdaysPerWeek}
          />
        </MotionCard>
        <MotionCard className="card">
          <h2>Average by weekday</h2>
          <p className="card-note">Which days of the week run long, and which run short.</p>
          <DayOfWeekChart stats={dayStats} goalHours={settings.dailyGoalHours} />
        </MotionCard>
      </MotionSection>

      <MotionSection className="two-up">
        <MotionCard className="card">
          <h2>Pace this week</h2>
          <p className="card-note">Measured against an even spread, not against the final total.</p>
          <PaceCard pace={pace} />
        </MotionCard>
        <MotionCard className="card">
          <h2>Arrival times</h2>
          <p className="card-note">
            How far each office morning ran from the rostered start. The line is on time.
          </p>
          <EntryTrendChart points={arrivals} />
        </MotionCard>
      </MotionSection>

      <MotionSection className="card">
        <h2>History</h2>
        <p className="card-note">
          {showAllHistory
            ? `Every day recorded, newest first. Click edit on any row to correct its times.`
            : `This week, newest first. Click edit on any row to correct its times.`}
          {records.length > history.length || showAllHistory ? (
            <button className="link" onClick={() => setShowAllHistory((v) => !v)}>
              {showAllHistory ? 'show this week only' : `show all ${records.length} day(s)`}
            </button>
          ) : null}
        </p>
        {records.length === 0 ? (
          <p className="muted">Nothing logged yet.</p>
        ) : history.length === 0 ? (
          <p className="muted">
            Nothing logged this week yet - {records.length} earlier day(s) are still recorded.
          </p>
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
              {history.slice(0, 40).map((record) =>
                editing === record.FullDate ? (
                  <EditRow
                    key={record.FullDate}
                    record={record}
                    settings={settings}
                    onCancel={() => setEditing(null)}
                    onError={(text) => setNotice({ kind: 'error', text })}
                    onSave={(updated) => {
                      setRecords((current) => upsert(current, updated));
                      setEditing(null);
                      setNotice({ kind: 'ok', text: `${updated.Date} corrected.` });
                    }}
                  />
                ) : (
                  <tr key={record.FullDate}>
                    <td>{record.Date}</td>
                    <td>{record.IsWfh ? 'WFH' : (record.Location ?? 'Office')}</td>
                    <td>
                      {record.IsWfh ? '—' : formatTimeOfDay(parseClock(record.EntryTime))}
                      {record.ActualExitTime && (
                        <span className="muted">
                          {' → '}
                          {formatTimeOfDay(parseClock(record.ActualExitTime))}
                        </span>
                      )}
                    </td>
                    <td>
                      {formatDuration(
                        record.IsWfh ? wfhCredit(record, settings) : loggedSeconds(record, now),
                      )}
                      {record.IsWfh && record.WfhHours == null && (
                        <span className="muted"> (default)</span>
                      )}
                    </td>
                    <td className="row-actions">
                      <button className="link" onClick={() => setEditing(record.FullDate)}>
                        edit
                      </button>
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
                ),
              )}
            </tbody>
          </table>
        )}
      </MotionSection>
    </div>
  );
}
