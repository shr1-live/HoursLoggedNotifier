import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
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
 */
export function WeekChart({ days, goalHours }: WeekChartProps) {
  const max = Math.max(goalHours, ...days.map((d) => d.hours), 1);

  return (
    <div style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer>
        <BarChart data={days} margin={{ top: 16, right: 8, bottom: 4, left: -18 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: '#969ba5', fontSize: 12 }}
            axisLine={{ stroke: '#30343e' }}
            tickLine={false}
          />
          <YAxis
            domain={[0, Math.ceil(max)]}
            tick={{ fill: '#969ba5', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v}h`}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            contentStyle={{
              background: '#20232b',
              border: '1px solid #30343e',
              borderRadius: 8,
              color: '#e6e8ec',
            }}
            formatter={(value, _name, item) => [
              formatHours(Number(value ?? 0)),
              (item?.payload as DayBar | undefined)?.isWfh ? 'WFH' : 'Office',
            ]}
          />
          {/* The daily goal, so a short day is visible rather than inferred. */}
          <ReferenceLine
            y={goalHours}
            stroke="rgba(255,255,255,0.35)"
            strokeDasharray="4 4"
            label={{ value: `${goalHours}h goal`, fill: '#969ba5', fontSize: 11, position: 'right' }}
          />
          <Bar dataKey="hours" radius={[6, 6, 0, 0]} maxBarSize={44}>
            {days.map((day) => (
              <Cell
                key={day.iso}
                fill={day.isWfh ? '#788cdc' : day.isToday ? '#78c8ff' : '#4ca0d2'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
