/**
 * Chart colours come from the stylesheet rather than from literals here, so a
 * theme switch moves the charts with the rest of the page.
 *
 * Read during render, never at module load: the value captured at import time
 * is whichever theme happened to be active first, and it never updates again.
 */

import type { CSSProperties } from 'react';

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export interface ChartTheme {
  text: string;
  muted: string;
  line: string;
  grid: string;
  panel: string;
  office: string;
  wfh: string;
  good: string;
  warn: string;
  bad: string;
  accent: string;
  axis: { fill: string; fontSize: number };
  tooltip: CSSProperties;
  /** Recessive dashed rule for a target or goal. */
  reference: string;
  /** The wash behind the hovered mark. */
  cursor: string;
}

export function chartTheme(): ChartTheme {
  const text = cssVar('--text', '#1d1d1f');
  const muted = cssVar('--muted', '#6e6e73');
  const line = cssVar('--line', '#e0e0e0');
  const grid = cssVar('--grid', '#f0f0f0');
  const panel = cssVar('--panel', '#ffffff');

  return {
    text,
    muted,
    line,
    grid,
    panel,
    office: cssVar('--series-office', '#0066cc'),
    wfh: cssVar('--series-wfh', '#d9418c'),
    good: cssVar('--good', '#1f7a4d'),
    warn: cssVar('--warn', '#8a5a00'),
    bad: cssVar('--bad', '#b32d2d'),
    accent: cssVar('--accent', '#0066cc'),
    axis: { fill: muted, fontSize: 13 },
    tooltip: {
      background: panel,
      border: `1px solid ${line}`,
      borderRadius: 11,
      color: text,
      fontSize: 14,
      letterSpacing: '-0.224px',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.12)',
    },
    // Mixed against the page rather than a fixed white/black, which only ever
    // suited one of the two themes.
    reference: `color-mix(in srgb, ${muted} 70%, transparent)`,
    cursor: `color-mix(in srgb, ${muted} 12%, transparent)`,
  };
}
