import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DayOfWeekStat, Pace, Punctuality, Totals, WeekPoint } from '../domain/analytics';
import { formatDuration, formatTimeOfDay } from '../domain/time';

const AXIS = { fill: '#969ba5', fontSize: 12 };
const TOOLTIP = {
  background: '#20232b',
  border: '1px solid #30343e',
  borderRadius: 8,
  color: '#e6e8ec',
};

function hours(value: number): string {
  return formatDuration(Math.round(value * 3600));
}

/** Headline numbers, so the important figures are readable without a chart. */
export function StatGrid({
  totals,
  punctual,
  streak,
  goalHours,
}: {
  totals: Totals;
  punctual: Punctuality;
  streak: number;
  goalHours: number;
}) {
  const onTimeRate = punctual.sample > 0 ? (punctual.onTime / punctual.sample) * 100 : 0;

  const stats = [
    { label: 'Days logged', value: String(totals.daysLogged), note: `${totals.officeDays} office · ${totals.wfhDays} WFH` },
    { label: 'Average day', value: hours(totals.averageDayHours), note: `goal ${goalHours}h` },
    { label: 'Longest day', value: hours(totals.longestDayHours), note: totals.longestDayLabel },
    { label: 'Goal streak', value: `${streak}`, note: streak === 1 ? 'day' : 'days' },
    {
      label: 'On time',
      value: punctual.sample > 0 ? `${Math.round(onTimeRate)}%` : '—',
      note: punctual.sample > 0 ? `${punctual.late} late of ${punctual.sample}` : 'no office days yet',
    },
    {
      label: 'Average entry',
      value: punctual.averageEntry !== null ? formatTimeOfDay(punctual.averageEntry).replace(':00 ', ' ') : '—',
      note: punctual.late > 0 ? `avg ${formatDuration(punctual.averageLateness)} late` : 'never late',
    },
  ];

  return (
    <div className="stat-grid">
      {stats.map((s) => (
        <div key={s.label} className="stat">
          <span className="stat-label">{s.label}</span>
          <span className="stat-value">{s.value}</span>
          <span className="stat-note">{s.note}</span>
        </div>
      ))}
    </div>
  );
}

/** Office vs WFH hours per week, stacked, with the weekly target marked. */
export function WeeklyTrend({ points, targetHours }: { points: WeekPoint[]; targetHours: number }) {
  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={points} margin={{ top: 16, right: 8, bottom: 4, left: -18 }}>
          <CartesianGrid stroke="#282c35" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} axisLine={{ stroke: '#30343e' }} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}h`} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            contentStyle={TOOLTIP}
            formatter={(value) => hours(Number(value ?? 0))}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#969ba5' }} />
          <ReferenceLine
            y={targetHours}
            stroke="rgba(255,255,255,0.35)"
            strokeDasharray="4 4"
            label={{ value: `${targetHours}h target`, fill: '#969ba5', fontSize: 11, position: 'right' }}
          />
          <Bar dataKey="officeHours" name="Office" stackId="w" fill="#4ca0d2" radius={[0, 0, 0, 0]} maxBarSize={46} />
          <Bar dataKey="wfhHours" name="WFH" stackId="w" fill="#788cdc" radius={[6, 6, 0, 0]} maxBarSize={46} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Average hours by weekday, to show where the week is uneven. */
export function DayOfWeekChart({ stats, goalHours }: { stats: DayOfWeekStat[]; goalHours: number }) {
  return (
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer>
        <BarChart data={stats} margin={{ top: 16, right: 8, bottom: 4, left: -18 }}>
          <CartesianGrid stroke="#282c35" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} axisLine={{ stroke: '#30343e' }} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}h`} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            contentStyle={TOOLTIP}
            formatter={(value, _n, item) => [
              hours(Number(value ?? 0)),
              `average over ${(item?.payload as DayOfWeekStat | undefined)?.days ?? 0} day(s)`,
            ]}
          />
          <ReferenceLine y={goalHours} stroke="rgba(255,255,255,0.35)" strokeDasharray="4 4" />
          <Bar dataKey="averageHours" radius={[6, 6, 0, 0]} maxBarSize={44}>
            {stats.map((s) => (
              <Cell key={s.label} fill={s.averageHours >= goalHours ? '#4cc984' : '#e8b246'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Where you are against an even spread, rather than against the final total. */
export function PaceCard({ pace }: { pace: Pace }) {
  const ahead = pace.differenceHours >= 0;
  const data = [
    { name: 'Expected by now', value: pace.expectedHours },
    { name: 'Actually logged', value: pace.loggedHours },
  ];

  return (
    <>
      <div style={{ width: '100%', height: 130 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}h`} />
            <Tooltip contentStyle={TOOLTIP} formatter={(value) => hours(Number(value ?? 0))} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={ahead ? '#4cc984' : '#e8b246'}
              fill={ahead ? 'rgba(76,201,132,0.25)' : 'rgba(232,178,70,0.25)'}
            />
          </AreaChart>
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
