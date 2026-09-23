import { formatDuration } from '../domain/time';

interface BarWidgetProps {
  /** 0..1 through today's whole shift, or null when nothing is running. */
  fraction: number | null;
  /** Where the day is done - 0.95 of the shift by default. */
  targetFraction: number;
  loggedSeconds: number;
  remainingSeconds: number;
  officeFraction: number;
}

/**
 * The wide layout: a single progress line meant to be stretched across the
 * screen and parked above other windows. Everything sits on one row so it
 * stays readable at a height of only a few dozen pixels.
 */
export function BarWidget({
  fraction,
  targetFraction,
  loggedSeconds,
  remainingSeconds,
  officeFraction,
}: BarWidgetProps) {
  if (fraction === null) {
    return (
      <div className="bar-widget">
        <span className="bar-percent muted">—</span>
        <div className="bar-track" />
        <span className="bar-sub">no shift</span>
      </div>
    );
  }

  const percent = Math.round(fraction * 100);
  const state = fraction >= targetFraction ? 'good' : fraction >= targetFraction * 0.8 ? 'warn' : 'bad';
  // The glow stops once the shift is complete, so "running" reads at a glance.
  const running = fraction < targetFraction;

  return (
    <div className="bar-widget">
      <span className={`bar-percent ${state}`}>{percent}%</span>

      <div className="bar-track">
        <div
          className={`bar-fill ${state} ${running ? 'running' : ''}`}
          style={{ width: `${Math.min(100, fraction * 100)}%` }}
        />
        {/* The 95% threshold, visible before it is reached. */}
        <div className="bar-mark" style={{ left: `${targetFraction * 100}%` }} title="the point you can leave" />
      </div>

      <span className="bar-sub">
        <strong>{formatDuration(loggedSeconds)}</strong>
        {remainingSeconds > 0 ? ` · ${formatDuration(remainingSeconds)} left` : ' · done'}
        {' · week '}
        {Math.round(officeFraction * 100)}%
      </span>
    </div>
  );
}
