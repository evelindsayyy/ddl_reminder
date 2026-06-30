'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  readStoredPreference,
  resolveTheme,
  type ThemePreference,
} from '@/lib/theme';

const LABELS: Record<ThemePreference, string> = {
  light: 'light',
  dark: 'dark',
  system: 'system',
};

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function applyTheme(pref: ThemePreference): void {
  const dark = resolveTheme(pref, systemPrefersDark()) === 'dark';
  document.documentElement.classList.toggle('dark', dark);
}

// Segmented light / dark / system control. The actual class toggle is shared
// with the no-flash boot script (app/layout.tsx) via lib/theme; this only adds
// the live re-apply on click and OS-change tracking while on "system".
export default function ThemeToggle() {
  const [pref, setPref] = useState<ThemePreference>(DEFAULT_THEME_PREFERENCE);

  // Hydrate from localStorage after mount (the server can't read it).
  useEffect(() => {
    setPref(readStoredPreference(localStorage.getItem(THEME_STORAGE_KEY)));
  }, []);

  // When following the system, react to OS theme changes live.
  useEffect(() => {
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  function choose(next: ThemePreference): void {
    setPref(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // localStorage can throw (private mode / quota); the class still applies.
    }
    applyTheme(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="color theme"
      className="inline-flex rounded border border-ink-faint p-0.5"
    >
      {THEME_PREFERENCES.map((option) => {
        const active = option === pref;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => choose(option)}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? 'bg-ink text-bg'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            {LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
