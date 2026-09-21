import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  /** Turns the animated number into the string actually shown. */
  format: (value: number) => string;
  durationMs?: number;
}

/**
 * Eases a number towards its new value instead of snapping, so a figure that
 * changes draws the eye. Respects prefers-reduced-motion, where the jump is
 * the correct behaviour rather than a missing feature.
 */
export function AnimatedNumber({ value, format, durationMs = 600 }: AnimatedNumberProps) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef(0);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduced || durationMs <= 0) {
      fromRef.current = value;
      setShown(value);
      return;
    }

    const from = fromRef.current;
    const start = performance.now();

    const tick = (nowMs: number) => {
      const progress = Math.min(1, (nowMs - start) / durationMs);
      // easeOutCubic: quick to move, gentle to settle.
      const eased = 1 - (1 - progress) ** 3;
      setShown(from + (value - from) * eased);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, durationMs]);

  return <>{format(shown)}</>;
}
