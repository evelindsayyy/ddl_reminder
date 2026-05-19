'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/format';

export interface RelativeTimeProps {
  date: string; // ISO UTC
  now?: Date; // for tests; default = new Date()
  className?: string;
  // When true, the text re-computes every minute so "in 5m" stays accurate.
  live?: boolean;
}

const REFRESH_MS = 60 * 1000;

/**
 * Renders "in 2 days" / "5h overdue" using `lib/format.formatRelative`.
 * Wraps in a <time> element so screen readers + tooling get the ISO.
 *
 * Note: when `now` is passed (tests), `live` is forced off so we don't fight
 * the test fixture.
 */
export function RelativeTime({ date, now, className, live = true }: RelativeTimeProps) {
  const fixed = now !== undefined;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (fixed || !live) return;
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, [fixed, live]);
  // tick used as a render trigger; reference it so eslint doesn't strip it
  void tick;

  const text = formatRelative(date, now ?? new Date());
  return (
    <time dateTime={date} className={cn('font-mono', className)}>
      {text}
    </time>
  );
}
