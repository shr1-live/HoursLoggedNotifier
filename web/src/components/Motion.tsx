import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Shared motion wrappers, so timing and easing stay consistent instead of each
 * component inventing its own. Every one collapses under prefers-reduced-motion,
 * where an instant change is the correct behaviour rather than a missing one.
 */

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Position in a sequence, used to stagger the entrance. */
  index?: number;
}

/** A panel that rises into place and lifts slightly on hover. */
export function MotionCard({ children, className = 'card', index = 0 }: CardProps) {
  const reduced = useReducedMotion();

  return (
    <motion.article
      className={className}
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: reduced ? 0 : index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      whileHover={reduced ? undefined : { y: -3 }}
    >
      {children}
    </motion.article>
  );
}

/** A section wrapper with the same entrance, for non-card blocks. */
export function MotionSection({ children, className, index = 0 }: CardProps) {
  const reduced = useReducedMotion();

  return (
    <motion.section
      className={className}
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: reduced ? 0 : index * 0.06, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.section>
  );
}

/** A stat tile that pops in and responds to the pointer. */
export function MotionStat({ children, index = 0 }: CardProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className="stat"
      initial={reduced ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: reduced ? 0 : index * 0.04 }}
      whileHover={reduced ? undefined : { y: -3, scale: 1.02 }}
    >
      {children}
    </motion.div>
  );
}
