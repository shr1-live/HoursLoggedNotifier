import { RingGauge } from './RingGauge';
import { formatDuration } from '../domain/time';
import type { Density } from './AdaptiveWidget';

interface MiniWidgetProps {
  /** 0..1 through today's shift, or null when nothing is running. */
  fraction: number | null;
  /** Where the day is done - 0.95 of the shift by default. */
  targetFraction: number;
  loggedSeconds: number;
  officeFraction: number;
  /** How much detail there is room for. */
  density: Density;
}

/**
 * The smallest useful view: one ring, the percentage, nothing else. Sized for
 * a picture-in-picture window that sits above other windows while you work.
 */
export function MiniWidget({ fraction, targetFraction, loggedSeconds, officeFraction, density }: MiniWidgetProps) {
  if (fraction === null) {
    return (
      <div className="mini mini-empty">
        <span className="mini-percent muted">—</span>
        <span className="mini-sub">no shift</span>
      </div>
    );
  }

  const percent = Math.round(fraction * 100);
  const state = fraction >= targetFraction ? 'good' : fraction >= targetFraction * 0.8 ? 'warn' : 'bad';
  // A fixed 150px ring was the floor on how small this could be dragged.
  const ringSize = density === 'full' ? 150 : density === 'tight' ? 116 : 88;

  return (
    <div className="mini">
      <div className="mini-ring">
        <RingGauge
          fraction={fraction}
          goodThreshold={targetFraction}
          value={`${percent}%`}
          size={ringSize}
        />
      </div>
      <div className="mini-meta">
        <span className={`mini-logged ${state}`}>{formatDuration(loggedSeconds)}</span>
        {density === 'full' && (
          <span className="mini-sub">week {Math.round(officeFraction * 100)}%</span>
        )}
      </div>
    </div>
  );
}
