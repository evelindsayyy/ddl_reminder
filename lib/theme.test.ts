// Assertion-based unit tests for the theme-preference resolver in lib/theme.ts.
// Run: npx tsx lib/theme.test.ts   (exits non-zero on any failure)
//
// resolveTheme + readStoredPreference drive both the no-flash boot script and
// the settings toggle. A regression here means the app boots into the wrong
// palette or a flash-of-wrong-theme, so the system/explicit/fallback branches
// are worth pinning.

import {
  isThemePreference,
  readStoredPreference,
  resolveTheme,
  THEME_PREFERENCES,
  DEFAULT_THEME_PREFERENCE,
  THEME_STORAGE_KEY,
} from './theme';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// isThemePreference — only the three known strings are valid
check('light is a preference', isThemePreference('light'));
check('dark is a preference', isThemePreference('dark'));
check('system is a preference', isThemePreference('system'));
check('null is not a preference', !isThemePreference(null));
check('empty string is not a preference', !isThemePreference(''));
check('unknown string is not a preference', !isThemePreference('Dark'));
check('number is not a preference', !isThemePreference(1));

// readStoredPreference — coerces raw localStorage reads, default on anything odd
check('stored "dark" → dark', readStoredPreference('dark') === 'dark');
check('stored "light" → light', readStoredPreference('light') === 'light');
check('stored "system" → system', readStoredPreference('system') === 'system');
check('null → default', readStoredPreference(null) === DEFAULT_THEME_PREFERENCE);
check('undefined → default', readStoredPreference(undefined) === DEFAULT_THEME_PREFERENCE);
check('garbage → default', readStoredPreference('purple') === DEFAULT_THEME_PREFERENCE,
  `got ${readStoredPreference('purple')}`);
check('default preference is system', DEFAULT_THEME_PREFERENCE === 'system');

// resolveTheme — explicit picks ignore the OS; system follows it
check('explicit light ignores dark OS', resolveTheme('light', true) === 'light');
check('explicit light ignores light OS', resolveTheme('light', false) === 'light');
check('explicit dark ignores light OS', resolveTheme('dark', false) === 'dark');
check('explicit dark ignores dark OS', resolveTheme('dark', true) === 'dark');
check('system + dark OS → dark', resolveTheme('system', true) === 'dark');
check('system + light OS → light', resolveTheme('system', false) === 'light');

// metadata sanity
check('three preferences exposed', THEME_PREFERENCES.length === 3);
check('preferences are the known set',
  THEME_PREFERENCES.every((p) => isThemePreference(p)));
check('storage key is stable', THEME_STORAGE_KEY === 'ddl-theme',
  `got ${THEME_STORAGE_KEY}`);

console.log(`\ntheme.test.ts — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
