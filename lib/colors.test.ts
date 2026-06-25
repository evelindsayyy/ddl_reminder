// Assertion-based unit tests for the course-color picker in lib/colors.ts.
// Run: npx tsx lib/colors.test.ts   (exits non-zero on any failure)
//
// pickColorForNewCourse auto-assigns a distinct hue to every new course across
// four call sites (assignment create, course create, Gradescope + Canvas sync).
// A regression here silently hands two courses the same color, so the
// first-unused / case-insensitive / fallback behavior is worth pinning.

import { pickColorForNewCourse, COURSE_COLOR_PALETTE } from './colors';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const [INDIGO, RED, AMBER, EMERALD] = COURSE_COLOR_PALETTE;

// empty input → first palette color
check('no colors used → indigo', pickColorForNewCourse([]) === INDIGO,
  `got ${pickColorForNewCourse([])}`);

// picks the first unused color in palette order
check('indigo used → red', pickColorForNewCourse([INDIGO]) === RED,
  `got ${pickColorForNewCourse([INDIGO])}`);
check('indigo+red used → amber', pickColorForNewCourse([INDIGO, RED]) === AMBER,
  `got ${pickColorForNewCourse([INDIGO, RED])}`);

// palette order is respected even when later colors are taken first
check('red+amber used (indigo free) → indigo',
  pickColorForNewCourse([RED, AMBER]) === INDIGO,
  `got ${pickColorForNewCourse([RED, AMBER])}`);
check('indigo+amber used → red', pickColorForNewCourse([INDIGO, AMBER]) === RED,
  `got ${pickColorForNewCourse([INDIGO, AMBER])}`);

// case-insensitive matching — DB-stored colors may differ in case
check('uppercase indigo still counts as used',
  pickColorForNewCourse([INDIGO.toUpperCase()]) === RED,
  `got ${pickColorForNewCourse([INDIGO.toUpperCase()])}`);

// all colors taken → falls back to the default (indigo), not undefined
check('all palette colors used → indigo fallback',
  pickColorForNewCourse([...COURSE_COLOR_PALETTE]) === INDIGO,
  `got ${pickColorForNewCourse([...COURSE_COLOR_PALETTE])}`);

// unknown/off-palette colors in the used set are ignored
check('off-palette colors ignored → indigo',
  pickColorForNewCourse(['#abcdef', '#123456']) === INDIGO,
  `got ${pickColorForNewCourse(['#abcdef', '#123456'])}`);

// duplicates in the used set behave the same as a single entry
check('duplicate used entries → amber',
  pickColorForNewCourse([INDIGO, INDIGO, RED, RED]) === AMBER,
  `got ${pickColorForNewCourse([INDIGO, INDIGO, RED, RED])}`);

// accepts any Iterable, not just arrays
check('accepts a Set of used colors',
  pickColorForNewCourse(new Set([INDIGO, RED, AMBER])) === EMERALD,
  `got ${pickColorForNewCourse(new Set([INDIGO, RED, AMBER]))}`);

// the result is always a member of the palette
const sampled = [
  pickColorForNewCourse([]),
  pickColorForNewCourse([INDIGO]),
  pickColorForNewCourse([...COURSE_COLOR_PALETTE]),
  pickColorForNewCourse(['#000000']),
];
check('every result is a palette color',
  sampled.every((c) => (COURSE_COLOR_PALETTE as readonly string[]).includes(c)),
  `got ${sampled.join(', ')}`);

console.log(`\ncolors.test.ts — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
