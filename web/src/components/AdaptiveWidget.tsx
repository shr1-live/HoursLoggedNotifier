import { useEffect, useRef, useState } from 'react';
import { BarWidget } from './BarWidget';
import { MiniWidget } from './MiniWidget';
import { VerticalBarWidget } from './VerticalBarWidget';

interface AdaptiveWidgetProps {
  fraction: number | null;
  loggedSeconds: number;
  remainingSeconds: number;
  officeFraction: number;
}

/**
 * Picks the layout from the shape of the window rather than from a setting:
 * stretch it wide and it becomes a progress line, leave it square and it stays
 * a ring. Resizing switches it live, so there is nothing to configure.
 */
type Layout = 'ring' | 'bar' | 'column';

export function AdaptiveWidget(props: AdaptiveWidgetProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout>('ring');

  useEffect(() => {
    const element = hostRef.current;
    if (!element) return;

    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (height <= 0 || width <= 0) return;
      const ratio = width / height;
      // Comfortably wider than tall leaves no room for a ring, and the
      // reverse means a column reads better than a squashed one.
      setLayout(ratio >= 1.9 ? 'bar' : ratio <= 0.55 ? 'column' : 'ring');
    };

    measure();

    // ResizeObserver is the reliable signal inside a picture-in-picture
    // window, where window resize events are not always delivered.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={hostRef} className="adaptive-host">
      {layout === 'bar' && <BarWidget {...props} />}
      {layout === 'column' && <VerticalBarWidget {...props} />}
      {layout === 'ring' && <MiniWidget {...props} />}
    </div>
  );
}
