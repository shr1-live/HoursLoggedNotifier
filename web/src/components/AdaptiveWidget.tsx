import { useEffect, useRef, useState } from 'react';
import { BarWidget } from './BarWidget';
import { MiniWidget } from './MiniWidget';
import { VerticalBarWidget } from './VerticalBarWidget';

interface AdaptiveWidgetProps {
  fraction: number | null;
  targetFraction: number;
  loggedSeconds: number;
  remainingSeconds: number;
  officeFraction: number;
}

/**
 * Picks the layout from the shape of the window rather than from a setting:
 * stretch it wide and it becomes a progress line, leave it square and it stays
 * a ring. Resizing switches it live, so there is nothing to configure.
 *
 * It also picks a density, because the window can be dragged smaller than the
 * text comfortably fits. Rather than let the labels crush together, the widget
 * drops detail as it shrinks - the percentage and the bar are the last things
 * to go, since they are the reason it is on screen.
 */
type Layout = 'ring' | 'bar' | 'column';
export type Density = 'full' | 'tight' | 'minimal';

export function AdaptiveWidget(props: AdaptiveWidgetProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout>('ring');
  const [density, setDensity] = useState<Density>('full');

  useEffect(() => {
    const element = hostRef.current;
    if (!element) return;

    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (height <= 0 || width <= 0) return;
      const ratio = width / height;
      // Comfortably wider than tall leaves no room for a ring, and the
      // reverse means a column reads better than a squashed one.
      const next: Layout = ratio >= 1.9 ? 'bar' : ratio <= 0.55 ? 'column' : 'ring';
      setLayout(next);

      // Measured along whichever axis the labels actually compete for.
      const along = next === 'bar' ? width : next === 'column' ? height : Math.min(width, height);
      const limits = next === 'bar' ? [430, 260] : next === 'column' ? [300, 210] : [190, 140];
      setDensity(along >= limits[0] ? 'full' : along >= limits[1] ? 'tight' : 'minimal');
    };

    measure();

    // ResizeObserver is the reliable signal inside a picture-in-picture
    // window, where window resize events are not always delivered.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={hostRef} className={`adaptive-host density-${density}`}>
      {layout === 'bar' && <BarWidget {...props} density={density} />}
      {layout === 'column' && <VerticalBarWidget {...props} density={density} />}
      {layout === 'ring' && <MiniWidget {...props} density={density} />}
    </div>
  );
}
