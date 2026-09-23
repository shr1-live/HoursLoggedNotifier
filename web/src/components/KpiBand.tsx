import type { CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  CalendarCheck,
  Building2,
  Flame,
  Gauge,
  TimerReset,
  TrendingUp,
} from 'lucide-react';
import { AnimatedNumber } from './AnimatedNumber';
import type { Pace, Punctuality } from '../domain/analytics';
import type { TodayStatus, WeekTotals } from '../domain/attendance';
import { formatDuration } from '../domain/time';

/**
 * The band that answers "where am I" without scrolling or reading a chart.
 *
 * Each tile is one measure, carries its own accent hairline so the row does not
 * read as six copies of the same card, and shows a rail only where there is a
 * target to run against - a rail with nothing to fill towards is decoration.
 */

interface KpiBandProps {
  today: TodayStatus | null;
  week: WeekTotals;
  pace: Pace;
  streak: number;
  punctual: Punctuality;
}

interface Tile {
  key: string;
  icon: typeof Gauge;
  label: string;
  value: string | number;
  /** Rendered small and muted next to the figure. */
  unit?: string;
  /** Eases the figure rather than snapping it, for values that tick. */
  animate?: { to: number; format: (v: number) => string };
  note: string;
  noteTone?: 'good' | 'warn' | 'bad';
  accent: string;
  /** 0-1; omitted where the measure has no target. */
  progress?: number;
}

function percent(fraction: number): number {
  return Math.round(Math.min(1, Math.max(0, fraction)) * 100);
}

export function KpiBand({ today, week, pace, streak, punctual }: KpiBandProps) {
  const reduced = useReducedMotion();

  const weekFraction = week.weeklyMark95Seconds > 0
    ? week.totalSeconds / week.weeklyMark95Seconds
    : 0;
  const officeFraction = week.officeMark95Seconds > 0
    ? week.officeSeconds / week.officeMark95Seconds
    : 0;
  const onTimeRate = punctual.sample > 0 ? punctual.onTime / punctual.sample : 0;
  const ahead = pace.differenceHours >= 0;

  const tiles: Tile[] = [
    {
      key: 'today',
      icon: Gauge,
      label: 'Today',
      value: today ? `${percent(today.fraction)}` : '—',
      unit: today ? '%' : undefined,
      animate: today
        ? { to: today.fraction * 100, format: (v) => String(Math.round(v)) }
        : undefined,
      note: today
        ? today.clockedOut
          ? `signed off · ${formatDuration(today.spentSeconds)} logged`
          : today.reachedGoal
            ? `${formatDuration(today.spentSeconds)} logged · you can leave`
            : `${formatDuration(today.spentSeconds)} logged · ${formatDuration(today.left95Seconds)} to go`
        : 'no office shift today',
      noteTone: today?.reachedGoal ? 'good' : undefined,
      accent: today?.reachedGoal ? 'var(--good)' : 'var(--accent)',
      progress: today ? today.fraction : undefined,
    },
    {
      key: 'week',
      icon: CalendarCheck,
      label: 'This week',
      value: formatDuration(week.totalSeconds),
      note: `of ${formatDuration(week.weeklyMark95Seconds)} · ${percent(weekFraction)}%`,
      noteTone: weekFraction >= 1 ? 'good' : undefined,
      accent: 'var(--series-office)',
      progress: weekFraction,
    },
    {
      key: 'office',
      icon: Building2,
      label: 'Office hours',
      value: formatDuration(week.officeSeconds),
      note: `of ${formatDuration(week.officeMark95Seconds)} · ${week.officeDays} day(s) in`,
      noteTone: officeFraction >= 1 ? 'good' : undefined,
      accent: 'var(--series-wfh)',
      progress: officeFraction,
    },
    {
      key: 'pace',
      icon: TimerReset,
      label: 'Pace',
      value: `${ahead ? '+' : '−'}${formatDuration(Math.abs(pace.differenceHours) * 3600)}`,
      note: ahead
        ? 'ahead of an even spread'
        : pace.remainingDays > 0
          ? `${formatDuration(pace.neededPerRemainingDay * 3600)}/day to catch up`
          : 'behind, no days left',
      noteTone: ahead ? 'good' : 'warn',
      accent: ahead ? 'var(--good)' : 'var(--warn)',
    },
    {
      key: 'streak',
      icon: Flame,
      label: 'Goal streak',
      value: streak,
      unit: streak === 1 ? 'day' : 'days',
      animate: { to: streak, format: (v) => String(Math.round(v)) },
      note: streak > 0 ? 'consecutive days at goal' : 'no streak running',
      noteTone: streak >= 3 ? 'good' : undefined,
      accent: 'var(--good)',
    },
    {
      key: 'ontime',
      icon: TrendingUp,
      label: 'On time',
      value: punctual.sample > 0 ? percent(onTimeRate) : '—',
      unit: punctual.sample > 0 ? '%' : undefined,
      animate: punctual.sample > 0
        ? { to: onTimeRate * 100, format: (v) => String(Math.round(v)) }
        : undefined,
      note: punctual.sample > 0
        ? `${punctual.late} late of ${punctual.sample} office day(s)`
        : 'no office days yet',
      noteTone: punctual.sample > 0 && onTimeRate >= 0.9 ? 'good' : undefined,
      accent: 'var(--accent)',
      progress: punctual.sample > 0 ? onTimeRate : undefined,
    },
  ];

  return (
    <div className="kpi-band">
      {tiles.map((tile, i) => (
        <motion.div
          key={tile.key}
          className="kpi"
          style={{ '--kpi-accent': tile.accent } as CSSProperties}
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: reduced ? 0 : i * 0.05, ease: [0.22, 1, 0.36, 1] }}
          whileHover={reduced ? undefined : { y: -3 }}
        >
          <span className="kpi-head">
            <tile.icon size={15} strokeWidth={2} aria-hidden="true" />
            {tile.label}
          </span>
          <span className="kpi-value">
            {tile.animate
              ? <AnimatedNumber value={tile.animate.to} format={tile.animate.format} />
              : tile.value}
            {tile.unit && <span className="kpi-unit">{tile.unit}</span>}
          </span>
          <span className={`kpi-note${tile.noteTone ? ` ${tile.noteTone}` : ''}`}>{tile.note}</span>
          {tile.progress !== undefined && (
            <span className="kpi-rail" aria-hidden="true">
              <span style={{ width: `${percent(tile.progress)}%` }} />
            </span>
          )}
        </motion.div>
      ))}
    </div>
  );
}
