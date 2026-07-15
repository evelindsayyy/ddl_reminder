'use client';

import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  /** Accessible name for the tablist; rendered as `aria-label`. */
  label: string;
  className?: string;
  // Panel id the tabs control (WAI-ARIA); when set, tabs also get stable ids
  // (`${controls}-${value}`) so the panel can point back with aria-labelledby.
  controls?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  controls,
}: SegmentedControlProps<T>) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Roving-tabindex arrow-key navigation (WAI-ARIA tabs pattern): Left/Right
  // wrap, Home/End jump to ends; the newly focused tab is also activated.
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const idx = options.findIndex((o) => o.value === value);
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (idx - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    else return;
    e.preventDefault();
    onChange(options[next].value);
    tabRefs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'inline-flex rounded border border-ink-faint/60 bg-bg-soft p-0.5',
        className
      )}
    >
      {options.map((opt, i) => (
        <button
          key={opt.value}
          ref={(el) => {
            tabRefs.current[i] = el;
          }}
          id={controls ? `${controls}-${opt.value}` : undefined}
          role="tab"
          aria-selected={value === opt.value}
          aria-controls={controls}
          tabIndex={value === opt.value ? 0 : -1}
          type="button"
          onClick={() => onChange(opt.value)}
          onKeyDown={onKeyDown}
          className={cn(
            'rounded-sm px-3 py-1 text-xs transition-colors duration-150',
            value === opt.value ? 'bg-ink text-bg' : 'text-ink-soft hover:bg-bg-dim'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
