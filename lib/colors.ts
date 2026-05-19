// Distinct-by-hue palette for auto-assigning colors to new courses.
// Indigo = default if everything else is taken.
export const COURSE_COLOR_PALETTE = [
  '#6366f1', // indigo
  '#ef4444', // red
  '#f59e0b', // amber
  '#10b981', // emerald
  '#0ea5e9', // sky
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#84cc16', // lime
] as const;

export function pickColorForNewCourse(usedColors: Iterable<string>): string {
  const used = new Set(Array.from(usedColors).map((c) => c.toLowerCase()));
  for (const color of COURSE_COLOR_PALETTE) {
    if (!used.has(color.toLowerCase())) return color;
  }
  return COURSE_COLOR_PALETTE[0];
}
