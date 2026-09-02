'use client';
import { useEffect, useRef, useState } from 'react';

// Animated count-up. Renders as tabular-nums and preserves prefix/suffix.
export function CountUp({
  value, prefix = '', suffix = '', decimals = 0, duration = 900,
}: { value: number; prefix?: string; suffix?: string; decimals?: number; duration?: number }) {
  const [n, setN] = useState(0);
  const startedRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (Number.isNaN(value)) return;
    startedRef.current = null;
    fromRef.current = n;
    const target = value;
    const from = fromRef.current;
    const step = (t: number) => {
      if (startedRef.current == null) startedRef.current = t;
      const p = Math.min(1, (t - startedRef.current) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setN(from + (target - from) * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const formatted = n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <span className="tabular-nums">{prefix}{formatted}{suffix}</span>;
}
