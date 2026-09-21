interface HoursMinutesInputProps {
  /** Value in decimal hours, e.g. 8.75 for 8h 45m. */
  value: number;
  onChange: (hours: number) => void;
  max?: number;
  id?: string;
}

/**
 * Hours and minutes as two fields rather than a decimal with a fixed step.
 * A stepped decimal forces values onto a grid - 0.5 means nothing finer than
 * half an hour - while "8h 20m" is both exact and what people actually mean.
 */
export function HoursMinutesInput({ value, onChange, max = 24, id }: HoursMinutesInputProps) {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const hours = Math.floor(safe);
  const minutes = Math.round((safe - hours) * 60);

  function emit(nextHours: number, nextMinutes: number) {
    // Let 90 minutes roll into the next hour rather than rejecting it.
    const total = nextHours + nextMinutes / 60;
    onChange(Math.min(max, Math.max(0, Number(total.toFixed(4)))));
  }

  return (
    <span className="hm-input">
      <input
        id={id}
        type="number"
        min={0}
        max={max}
        step={1}
        value={hours}
        aria-label="hours"
        onChange={(e) => emit(Number(e.target.value || 0), minutes)}
      />
      <span className="hm-unit">h</span>
      <input
        type="number"
        min={0}
        max={59}
        step={1}
        value={minutes}
        aria-label="minutes"
        onChange={(e) => emit(hours, Number(e.target.value || 0))}
      />
      <span className="hm-unit">m</span>
    </span>
  );
}
