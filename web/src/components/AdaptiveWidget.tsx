import { useEffect, useRef, useState } from 'react';
import { BarWidget } from './BarWidget';
import { MiniWidget } from './MiniWidget';

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
export function AdaptiveWidget(props: AdaptiveWidgetProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const element = hostRef.current;
    if (!element) return;

    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (height <= 0) return;
      // Comfortably wider than tall means there is no room for a ring.
      setWide(width / height >= 1.9);
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
      {wide ? <BarWidget {...props} /> : <MiniWidget {...props} />}
    </div>
  );
}
