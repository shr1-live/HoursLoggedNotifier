import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { chartTheme } from './chartTheme';
import type { DayPoint, EntryPoint, LocationSplit } from '../domain/analytics';
import { formatDuration } from '../domain/time';

/**
 * The longer-window charts: how the days have actually run, where the time is
 * spent, and whether the mornings are drifting.
 *
 * Every one reads its colours from the stylesheet at render, so they follow a
 * theme switch, and every one that encodes identity by colour also ships a
 * legend - colour is never the only thing carrying the meaning.
 */

function hours(value: number): string {
  return formatDuration(Math.round(value * 3600));
}

/** Signed minutes as "12m early" / "8m late", which is what the reader wants. */
function lateness(seconds: number): string {
  if (Math.abs(seconds) < 60) return 'on time';
  return `${formatDuration(Math.abs(seconds))} ${seconds > 0 ? 'late' : 'early'}`;
}

interface LegendItem {
  label: string;
  colour: string;
  value?: string;
}

function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="chart-legend">
      {items.map((item) => (
        <li key={item.label}>
          <span className="swatch" style={{ background: item.colour }} aria-hidden="true" />
          {item.label}
          {item.value && <span className="value">{item.value}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Hours per working day across the last fortnight. The shape matters more than
 * any single bar, so this is an area with the goal drawn across it - a day that
 * dips below the line is visible at a glance rather than by reading values.
 */
export function DailyTrend({ points, goalHours }: { points: DayPoint[]; goalHours: number }) {
  const t = chartTheme();

  return (
    <div className="chart-frame">
      <Legend
        items={[
          { label: 'Office', colour: t.office },
          { label: 'WFH', colour: t.wfh },
          { label: `${goalHours}h goal`, colour: t.muted },
        ]}
      />
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <AreaChart data={points} margin={{ top: 12, right: 12, bottom: 4, left: -16 }}>
            <defs>
              <linearGradient id="dailyFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={t.office} stopOpacity={0.28} />
                <stop offset="100%" stopColor={t.office} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={t.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={t.axis}
              axisLine={{ stroke: t.line }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={12}
            />
            <YAxis
              tick={t.axis}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v: number) => `${v}h`}
            />
            <Tooltip
              cursor={{ stroke: t.muted, strokeWidth: 1 }}
              contentStyle={t.tooltip}
              formatter={(value, _name, item) => {
                const point = item?.payload as DayPoint | undefined;
                if (point?.missing) return ['nothing logged', 'Day'];
                return [hours(Number(value ?? 0)), point?.isWfh ? 'WFH' : 'Office'];
              }}
            />
            <ReferenceLine
              y={goalHours}
              stroke={t.reference}
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <Area
              type="monotone"
              dataKey="hours"
              stroke={t.office}
              strokeWidth={2}
              fill="url(#dailyFill)"
              // The dot carries the office/WFH identity the line cannot.
              dot={(props) => {
                const point = points[props.index as number];
                return (
                  <circle
                    key={point?.iso ?? props.index}
                    cx={props.cx}
                    cy={props.cy}
                    r={point?.missing ? 0 : 4}
                    fill={point?.isWfh ? t.wfh : t.office}
                    stroke={t.panel}
                    strokeWidth={2}
                  />
                );
              }}
              activeDot={{ r: 6, stroke: t.panel, strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Office against home across all history, as a share of the total logged. */
export function LocationSplitChart({ split }: { split: LocationSplit }) {
  const t = chartTheme();
  const data = [
    { name: 'Office', value: split.officeHours, colour: t.office },
    { name: 'WFH', value: split.wfhHours, colour: t.wfh },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return <p className="muted small">Nothing logged yet.</p>;
  }

  return (
    <div className="chart-frame">
      <Legend
        items={[
          { label: 'Office', colour: t.office, value: hours(split.officeHours) },
          { label: 'WFH', colour: t.wfh, value: hours(split.wfhHours) },
        ]}
      />
      <div className="donut-wrap" style={{ width: '100%', height: 210 }}>
        <ResponsiveContainer>
          <PieChart>
            <Tooltip
              contentStyle={t.tooltip}
              formatter={(value, name) => [hours(Number(value ?? 0)), String(name)]}
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              startAngle={90}
              endAngle={-270}
              // A ring of the panel colour separates the slices, so adjacent
              // fills never touch and read as one shape.
              stroke={t.panel}
              strokeWidth={2}
            >
              {data.map((slice) => (
                <Cell key={slice.name} fill={slice.colour} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-centre">
          <span className="figure">{Math.round(split.officeShare * 100)}%</span>
          <span className="label">in office</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Arrival against the rostered start, as a signed difference rather than a
 * clock time: on time is the zero line, so drift shows as height in one
 * direction instead of needing the reader to compare two times.
 */
export function EntryTrendChart({ points }: { points: EntryPoint[] }) {
  const t = chartTheme();

  if (points.length === 0) {
    return <p className="muted small">No office days with a recorded entry yet.</p>;
  }

  const data = points.map((p) => ({ ...p, minutes: p.delta / 60 }));

  return (
    <div className="chart-frame">
      <Legend
        items={[
          { label: 'Early or on time', colour: t.good },
          { label: 'Late', colour: t.warn },
        ]}
      />
      <div style={{ width: '100%', height: 210 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
            <CartesianGrid stroke={t.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={t.axis}
              axisLine={{ stroke: t.line }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={10}
            />
            <YAxis
              tick={t.axis}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}m`}
            />
            <Tooltip
              cursor={{ fill: t.cursor }}
              contentStyle={t.tooltip}
              formatter={(_value, _name, item) => {
                const point = item?.payload as EntryPoint | undefined;
                return [point ? lateness(point.delta) : '—', 'Arrival'];
              }}
            />
            {/* The rostered start. Everything above it is lateness. */}
            <ReferenceLine y={0} stroke={t.reference} strokeWidth={1} />
            <Bar dataKey="minutes" radius={[4, 4, 0, 0]} maxBarSize={26}>
              {data.map((point) => (
                <Cell key={point.iso} fill={point.delta > 60 ? t.warn : t.good} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
