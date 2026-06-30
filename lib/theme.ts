// Theme preference resolution — pure, framework-free helpers shared by the
// no-flash boot script (app/layout.tsx) and the settings ThemeToggle.
//
// A user picks one of three preferences; "system" defers to the OS via
// `prefers-color-scheme`. The resolved value ('light' | 'dark') is what gets
// applied as the `.dark` class on <html>, re-theming the CSS variables defined
// in app/globals.css. Keeping the logic here (not inlined) makes it unit-
// testable and keeps the storage key a single source of truth.

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

// localStorage key. Referenced by the inline boot script via the constant, so
// the script and the toggle can never drift out of sync.
export const THEME_STORAGE_KEY = 'ddl-theme';

// Display order for the toggle; 'system' is the default when nothing is stored.
export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

// Coerce a raw localStorage read (possibly null or stale) to a valid preference,
// falling back to the default for anything unrecognized.
export function readStoredPreference(raw: string | null | undefined): ThemePreference {
  return isThemePreference(raw) ? raw : DEFAULT_THEME_PREFERENCE;
}

// The effective theme to apply: an explicit pick wins; "system" follows the OS.
export function resolveTheme(
  pref: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light';
  return pref;
}
