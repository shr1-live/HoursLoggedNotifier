import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlarmClock,
  CalendarDays,
  Clock,
  Hourglass,
  Timer,
} from 'lucide-react';
import { MotionStat } from './Motion';
import { chartTheme } from './chartTheme';
import type { DayOfWeekStat, Pace, Punctuality, Totals, WeekPoint } from '../domain/analytics';
import { formatDuration, formatTimeOfDay } from '../domain/time';

function hours(value: number): string {
  return formatDuration(Math.round(value * 3600));
}

/**
 * Secondary figures - the headline ones live in the KPI band, so these are the
 * totals you look up rather than watch, and they deliberately do not repeat it.
 */
export function StatGrid({
  totals,
  punctual,
  goalHours,
}: {
  totals: Totals;
  punctual: Punctuality;
  goalHours: number;
}) {
  const stats = [
    {
      icon: CalendarDays,
      label: 'Days logged',
      value: String(totals.daysLogged),
      note: `${totals.officeDays} office · ${totals.wfhDays} WFH`,
    },
    {
      icon: Hourglass,
      label: 'Total logged',
      value: hours(totals.totalHours),
      note: 'across all history',
    },
    {
      icon: Clock,
      label: 'Average day',
      value: hours(totals.averageDayHours),
      note: `goal ${goalHours}h`,
    },
    {
      icon: Timer,
      label: 'Longest day',
      value: hours(totals.longestDayHours),
      note: totals.longestDayLabel,
    },
    {
      icon: AlarmClock,
      label: 'Average entry',
      value: punctual.averageEntry !== null
        ? formatTimeOfDay(punctual.averageEntry).replace(':00 ', ' ')
        : '—',
      note: punctual.late > 0 ? `avg ${formatDuration(punctual.averageLateness)} late` : 'never late',
    },
  ];

  return (
    <div className="stat-grid">
      {stats.map((s, i) => (
        <MotionStat key={s.label} index={i}>
          <span className="stat-label">
            <s.icon size={14} strokeWidth={2} aria-hidden="true" />
            {s.label}
          </span>
          <span className="stat-value">{s.value}</span>
          <span className="stat-note">{s.note}</span>
        </MotionStat>
      ))}
    </div>
  );
}

/** Office vs WFH hours per week, stacked, with the weekly target marked. */
export function WeeklyTrend({ points, targetHours }: { points: WeekPoint[]; targetHours: number }) {
  const t = chartTheme();

  return (
    <div className="chart-frame">
      <ul className="chart-legend">
        <li>
          <span className="swatch" style={{ background: t.office }} aria-hidden="true" />
          Office
        </li>
        <li>
          <span className="swatch" style={{ background: t.wfh }} aria-hidden="true" />
          WFH
        </li>
        <li>
          <span className="swatch" style={{ background: t.muted }} aria-hidden="true" />
          {targetHours}h target
        </li>
      </ul>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={points} margin={{ top: 12, right: 12, bottom: 4, left: -16 }}>
            <CartesianGrid stroke={t.grid} vertical={false} />
            <XAxis dataKey="label" tick={t.axis} axisLine={{ stroke: t.line }} tickLine={false} />
            <YAxis
              tick={t.axis}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v: number) => `${v}h`}
            />
            <Tooltip
              cursor={{ fill: t.cursor }}
              contentStyle={t.tooltip}
              formatter={(value, name) => [hours(Number(value ?? 0)), String(name)]}
            />
            <ReferenceLine y={targetHours} stroke={t.reference} strokeDasharray="4 4" strokeWidth={1} />
            {/* The panel-coloured stroke is the 2px gap between stacked fills,
                so the two segments never merge into one block. */}
            <Bar
              dataKey="officeHours"
              name="Office"
              stackId="w"
              fill={t.office}
              stroke={t.panel}
              strokeWidth={2}
              maxBarSize={48}
            />
            <Bar
              dataKey="wfhHours"
              name="WFH"
              stackId="w"
              fill={t.wfh}
              stroke={t.panel}
              strokeWidth={2}
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Average hours by weekday, to show where the week is uneven. */
export function DayOfWeekChart({ stats, goalHours }: { stats: DayOfWeekStat[]; goalHours: number }) {
  const t = chartTheme();

  return (
    <div className="chart-frame">
      <ul className="chart-legend">
        <li>
          <span className="swatch" style={{ background: t.good }} aria-hidden="true" />
          At or above goal
        </li>
        <li>
          <span className="swatch" style={{ background: t.warn }} aria-hidden="true" />
          Short of goal
        </li>
      </ul>
      <div style={{ width: '100%', height: 210 }}>
        <ResponsiveContainer>
          <BarChart data={stats} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
            <CartesianGrid stroke={t.grid} vertical={false} />
            <XAxis dataKey="label" tick={t.axis} axisLine={{ stroke: t.line }} tickLine={false} />
            <YAxis
              tick={t.axis}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v: number) => `${v}h`}
            />
            <Tooltip
              cursor={{ fill: t.cursor }}
              contentStyle={t.tooltip}
              formatter={(value, _n, item) => [
                hours(Number(value ?? 0)),
                `average over ${(item?.payload as DayOfWeekStat | undefined)?.days ?? 0} day(s)`,
              ]}
            />
            <ReferenceLine y={goalHours} stroke={t.reference} strokeDasharray="4 4" strokeWidth={1} />
            <Bar dataKey="averageHours" radius={[4, 4, 0, 0]} maxBarSize={46}>
              {stats.map((s) => (
                <Cell key={s.label} fill={s.averageHours >= goalHours ? t.good : t.warn} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Where you are against an even spread, rather than against the final total.
 *
 * Two values and a target is a comparison, not a time series - drawn as two
 * horizontal bars against the week's target rather than as a line through two
 * points, which was a nearly flat segment that read as an empty chart.
 */
export function PaceCard({ pace }: { pace: Pace }) {
  const t = chartTheme();
  const ahead = pace.differenceHours >= 0;
  const tone = ahead ? t.good : t.warn;
  const data = [
    { name: 'Logged', value: pace.loggedHours, fill: tone },
    { name: 'Expected by now', value: pace.expectedHours, fill: t.muted },
  ];

  return (
    <>
      <ul className="chart-legend">
        <li>
          <span className="swatch" style={{ background: tone }} aria-hidden="true" />
          Logged<span className="value">{hours(pace.loggedHours)}</span>
        </li>
        <li>
          <span className="swatch" style={{ background: t.muted }} aria-hidden="true" />
          Expected by now<span className="value">{hours(pace.expectedHours)}</span>
        </li>
      </ul>
      <div style={{ width: '100%', height: 132 }}>
        <ResponsiveContainer>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
            barCategoryGap={14}
          >
            <CartesianGrid stroke={t.grid} horizontal={false} />
            <XAxis
              type="number"
              domain={[0, Math.max(pace.targetHours, pace.loggedHours)]}
              tick={t.axis}
              axisLine={{ stroke: t.line }}
              tickLine={false}
              tickFormatter={(v: number) => `${Math.round(v)}h`}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={t.axis}
              axisLine={false}
              tickLine={false}
              width={112}
            />
            <Tooltip
              cursor={{ fill: t.cursor }}
              contentStyle={t.tooltip}
              formatter={(value) => [hours(Number(value ?? 0)), 'Hours']}
            />
            {/* The full week's target, so both bars are read against it. */}
            <ReferenceLine
              x={pace.targetHours}
              stroke={t.reference}
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: `${pace.targetHours}h`,
                fill: t.muted,
                fontSize: 12,
                position: 'top',
              }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={26}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className={ahead ? 'good' : 'warn'}>
        {ahead ? 'Ahead by ' : 'Behind by '}
        <strong>{hours(Math.abs(pace.differenceHours))}</strong> against an even pace.
      </p>
      <p className="muted small">
        {pace.remainingDays > 0
          ? `${hours(pace.neededPerRemainingDay)}/day across ${pace.remainingDays} day(s) left to reach ${pace.targetHours}h.`
          : 'No working days left this week.'}
      </p>
    </>
  );
}
