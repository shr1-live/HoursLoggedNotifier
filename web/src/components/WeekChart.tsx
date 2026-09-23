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
import { chartTheme } from './chartTheme';
import type { DayBar } from '../domain/attendance';

interface WeekChartProps {
  days: DayBar[];
  goalHours: number;
}

function formatHours(hours: number): string {
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`;
}

/**
 * Monday to Friday side by side, so the shape of the week is obvious - which
 * days are short, which are WFH, and where today sits against the rest.
 *
 * Today is marked with a ring rather than a third colour: it is the same kind
 * of day as the others, so giving it its own hue would imply a category that
 * does not exist.
 */
export function WeekChart({ days, goalHours }: WeekChartProps) {
  const t = chartTheme();
  const max = Math.max(goalHours, ...days.map((d) => d.hours), 1);

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
          {goalHours}h goal
        </li>
      </ul>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <BarChart data={days} margin={{ top: 12, right: 12, bottom: 4, left: -16 }}>
            <CartesianGrid stroke={t.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={t.axis}
              axisLine={{ stroke: t.line }}
              tickLine={false}
            />
            <YAxis
              domain={[0, Math.ceil(max)]}
              tick={t.axis}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v: number) => `${v}h`}
            />
            <Tooltip
              cursor={{ fill: t.cursor }}
              contentStyle={t.tooltip}
              formatter={(value, _name, item) => {
                const day = item?.payload as DayBar | undefined;
                if (!day?.logged) return ['nothing logged', 'Day'];
                return [formatHours(Number(value ?? 0)), day.isWfh ? 'WFH' : 'Office'];
              }}
            />
            {/* The daily goal, so a short day is visible rather than inferred. */}
            <ReferenceLine
              y={goalHours}
              stroke={t.reference}
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <Bar dataKey="hours" radius={[4, 4, 0, 0]} maxBarSize={46}>
              {days.map((day) => (
                <Cell
                  key={day.iso}
                  fill={day.isWfh ? t.wfh : t.office}
                  stroke={day.isToday ? t.text : undefined}
                  strokeWidth={day.isToday ? 2 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
