import { formatDuration } from '../domain/time';

interface VerticalBarWidgetProps {
  fraction: number | null;
  loggedSeconds: number;
  remainingSeconds: number;
  officeFraction: number;
}

/**
 * The tall layout: a column that fills from the bottom up, for parking down
 * the side of the screen. Labels stay short because the width is only a few
 * dozen pixels.
 */
export function VerticalBarWidget({
  fraction,
  loggedSeconds,
  remainingSeconds,
  officeFraction,
}: VerticalBarWidgetProps) {
  if (fraction === null) {
    return (
      <div className="vbar-widget">
        <span className="vbar-percent muted">—</span>
        <div className="vbar-track" />
      </div>
    );
  }

  const percent = Math.round(fraction * 100);
  const state = fraction >= 0.95 ? 'good' : fraction >= 0.6 ? 'warn' : 'bad';
  const running = fraction < 1;

  return (
    <div className="vbar-widget">
      <span className={`vbar-percent ${state}`}>{percent}%</span>

      <div className="vbar-track">
        <div
          className={`vbar-fill ${state} ${running ? 'running' : ''}`}
          style={{ height: `${Math.min(100, fraction * 100)}%` }}
        />
        {/* Measured from the bottom, since the column fills upwards. */}
        <div className="vbar-mark" style={{ bottom: '95%' }} title="95%" />
      </div>

      <span className="vbar-sub">
        <strong>{formatDuration(loggedSeconds)}</strong>
        <br />
        {remainingSeconds > 0 ? `${formatDuration(remainingSeconds)} left` : 'done'}
        <br />
        <span className="muted">wk {Math.round(officeFraction * 100)}%</span>
      </span>
    </div>
  );
}
