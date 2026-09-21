import { RingGauge } from './RingGauge';
import type { TodayStatus } from '../domain/attendance';
import { formatDuration, formatTimeOfDay, parseClock } from '../domain/time';

interface FocusViewProps {
  today: TodayStatus | null;
  officeFraction: number;
  officeLoggedSeconds: number;
  officeTargetSeconds: number;
  clock: string;
}

/**
 * The compact view opened in a small always-visible window. Deliberately shows
 * only what changes minute to minute, so it stays readable at a glance beside
 * whatever else is on screen.
 */
export function FocusView({
  today,
  officeFraction,
  officeLoggedSeconds,
  officeTargetSeconds,
  clock,
}: FocusViewProps) {
  if (!today) {
    return (
      <div className="focus">
        <p className="muted">No shift running.</p>
        <p className="muted small">Log one in the main window.</p>
      </div>
    );
  }

  const percent = Math.round(today.fraction * 100);
  const state = today.fraction >= 0.999 ? 'good' : today.fraction >= 0.75 ? 'warn' : '';

  return (
    <div className="focus">
      <div className={`focus-badge ${state}`}>{percent}%</div>

      <RingGauge
        fraction={today.fraction}
        value={formatDuration(today.spentSeconds)}
        caption="logged today"
        size={196}
      />

      <div className="focus-rows">
        <div>
          <span className="muted">95% exit</span>
          <span>
            {formatTimeOfDay(parseClock(today.record.Exit95))}
            {today.left95Seconds > 0 ? ` · ${formatDuration(today.left95Seconds)} left` : ' · reached'}
          </span>
        </div>
        <div>
          <span className="muted">100% exit</span>
          <span>
            {formatTimeOfDay(parseClock(today.record.Exit100))}
            {today.left100Seconds > 0 ? ` · ${formatDuration(today.left100Seconds)} left` : ' · reached'}
          </span>
        </div>
        <div>
          <span className="muted">Office week</span>
          <span>
            {formatDuration(officeLoggedSeconds)} / {formatDuration(officeTargetSeconds)}
            {' · '}
            {Math.round(officeFraction * 100)}%
          </span>
        </div>
      </div>

      <p className="muted small focus-clock">{clock}</p>
    </div>
  );
}
