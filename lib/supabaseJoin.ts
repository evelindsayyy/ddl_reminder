// Normalizing Supabase (PostgREST) embedded to-one relationships.
//
// When you `.select('..., courses(code)')` a foreign-key relationship,
// PostgREST embeds the related row as either a single object or a
// one-element array, depending on how it infers the relationship's
// cardinality. TypeScript's generated/asserted types often widen this to
// `T | T[] | null`, so every join read has to defend against both shapes.
//
// This helper collapses that `T | T[] | null | undefined` union to a single
// row (or null), so call sites stop repeating
// `Array.isArray(x) ? x[0] ?? null : x` inline. Pure and dependency-free.

/**
 * Collapse a PostgREST embedded to-one relationship to a single row.
 *
 * - An array → its first element, or `null` if empty.
 * - A single object → itself.
 * - `null`/`undefined` → `null`.
 */
export function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
