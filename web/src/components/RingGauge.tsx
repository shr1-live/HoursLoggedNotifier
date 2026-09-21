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

  const colour =
    clamped >= goodThreshold ? '#4cc984' : clamped >= 0.6 ? '#e8b246' : '#dc6060';

  // Angle of the threshold tick, measured from twelve o'clock.
  const tickAngle = goodThreshold * 2 * Math.PI - Math.PI / 2;
  const tickInner = radius - stroke / 2;
  const tickOuter = radius + stroke / 2;

  return (
    <svg width={size} height={size} role="img" aria-label={`${value} ${caption ?? ''}`.trim()}>
      <circle
        cx={centre}
        cy={centre}
        r={radius}
        fill="none"
        stroke="#30343e"
        strokeWidth={stroke}
      />
      <circle
        cx={centre}
        cy={centre}
        r={radius}
        fill="none"
        stroke={colour}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
        transform={`rotate(-90 ${centre} ${centre})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.6s ease' }}
      />
      {goodThreshold > 0 && goodThreshold < 1 && (
        <line
          x1={centre + tickInner * Math.cos(tickAngle)}
          y1={centre + tickInner * Math.sin(tickAngle)}
          x2={centre + tickOuter * Math.cos(tickAngle)}
          y2={centre + tickOuter * Math.sin(tickAngle)}
          stroke="rgba(255,255,255,0.55)"
          strokeWidth={2}
        />
      )}
      <text
        x={centre}
        y={caption ? centre - 4 : centre + 6}
        textAnchor="middle"
        fill="#ffffff"
        fontSize={size * 0.16}
        fontWeight={600}
      >
        {value}
      </text>
      {caption && (
        <text x={centre} y={centre + 20} textAnchor="middle" fill="#969ba5" fontSize={size * 0.082}>
          {caption}
        </text>
      )}
    </svg>
  );
}
