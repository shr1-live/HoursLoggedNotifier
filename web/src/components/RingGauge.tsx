interface RingGaugeProps {
  /** 0..1, clamped. */
  fraction: number;
  value: string;
  caption?: string;
  /** Fraction at which the ring turns green. */
  goodThreshold?: number;
  size?: number;
}

/**
 * A donut where colour carries the same message as the number: red early,
 * amber approaching, green once the threshold is passed. Drawn as plain SVG
 * so there is no chart library between the data and the pixels.
 *
 * Every colour comes from the stylesheet rather than a literal here - the
 * earlier fixed values were dark-theme only, which left the centre reading
 * white-on-white in light mode.
 */
export function RingGauge({
  fraction,
  value,
  caption,
  goodThreshold = 0.95,
  size = 168,
}: RingGaugeProps) {
  const clamped = Math.min(1, Math.max(0, fraction));
  const stroke = 14;
  const radius = (size - stroke) / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  const centre = size / 2;

  const tone = clamped >= goodThreshold ? 'good' : clamped >= 0.6 ? 'warn' : 'bad';

  // Angle of the threshold tick, measured from twelve o'clock.
  const tickAngle = goodThreshold * 2 * Math.PI - Math.PI / 2;
  const tickInner = radius - stroke / 2;
  const tickOuter = radius + stroke / 2;

  return (
    <svg
      className="ring"
      width={size}
      height={size}
      role="img"
      aria-label={`${value} ${caption ?? ''}`.trim()}
    >
      <circle
        className="ring-track"
        cx={centre}
        cy={centre}
        r={radius}
        fill="none"
        strokeWidth={stroke}
      />
      <circle
        className={`ring-arc ${tone}`}
        cx={centre}
        cy={centre}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
        transform={`rotate(-90 ${centre} ${centre})`}
      />
      {goodThreshold > 0 && goodThreshold < 1 && (
        <line
          className="ring-tick"
          x1={centre + tickInner * Math.cos(tickAngle)}
          y1={centre + tickInner * Math.sin(tickAngle)}
          x2={centre + tickOuter * Math.cos(tickAngle)}
          y2={centre + tickOuter * Math.sin(tickAngle)}
          strokeWidth={2}
        />
      )}
      <text
        className="ring-value"
        x={centre}
        y={caption ? centre - 2 : centre + 6}
        textAnchor="middle"
        fontSize={size * 0.17}
        fontWeight={600}
      >
        {value}
      </text>
      {caption && (
        <text
          className="ring-caption"
          x={centre}
          y={centre + 22}
          textAnchor="middle"
          fontSize={size * 0.082}
        >
          {caption}
        </text>
      )}
    </svg>
  );
}
