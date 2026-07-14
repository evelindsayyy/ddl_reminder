// Pure code -> human-copy map for async mutation failures (server-action error
// codes and fetch/Response fallback strings). Form-validation strings are NOT
// part of this map — they stay inline next to their field, they never toast.
//
// Never returns a raw code bare. An exact-match code always gets its written
// sentence; anything else falls through to the two regex checks below (which
// wrap the code in a "server said no" sentence, but only when the code looks
// HTTP-status-shaped); everything that matches neither collapses to one
// generic sentence.

const EXACT_MATCH: Record<string, string> = {
  move_failed: "Couldn't move it — check your connection and try again.",
  delete_failed: "Couldn't delete it — check your connection and try again.",
  save_failed: "Couldn't save your changes — check your connection and try again.",
  create_failed: "Couldn't create that — check your connection and try again.",
  update_failed: "Couldn't update it — check your connection and try again.",
  sync_failed: "Sync didn't go through — try again in a moment.",
  rotate_failed: "Couldn't generate a new token — try again in a moment.",
  bookmarklet_failed: "Couldn't build the bookmarklet — try again in a moment.",
  copy_failed: "Couldn't copy that — try again.",
  parse_failed: "Couldn't read that — check the format and try again.",
  invalid_input: "That didn't validate — check the fields and try again.",
  unauthenticated: 'Your session expired — sign in again.',
  not_found: 'That item no longer exists — it may have been deleted elsewhere.',
};

const GENERIC_FAILURE = 'Something went wrong — try again.';
const NETWORK_FAILURE =
  "Can't reach the server — check your connection and try again.";

// Browser fetch network failures surface as a thrown TypeError whose message is
// `Failed to fetch` (Chrome/Firefox), `Load failed` (Safari), or a
// `NetworkError ...` string. Call sites pass `err.message`, so this raw text
// reaches humanizeError — match case-insensitively as a substring so the
// wrapped Safari/Firefox variants are caught too. Word-bounded (`\b`) so
// action codes like `upload_failed` / "Upload failed: too large" don't false-
// match on "...oad failed" inside "upload failed" — "upload" has no boundary
// before "load".
const NETWORK_ERROR = /\b(failed to fetch|load failed|networkerror)\b/i;

// `PATCH 500`, `DELETE 404`, ... — the uppercase-HTTP-verb `verb ${status}` shape.
const HTTP_VERB_STATUS = /^(PATCH|DELETE|POST|GET) \d+$/;
// Any code with a bare trailing 3-digit status, including the lowercase custom
// action verbs (`save 500`, `sync 500`, `create 500`, `update 500`, `parse 400`).
const TRAILING_STATUS = /\b\d{3}$/;

/**
 * Turn a raw action/HTTP error code into a short, human sentence.
 *
 * - Known codes get a written sentence (never the code itself).
 * - Unknown codes that look HTTP-status-shaped (`PATCH 500`, `parse 400`, or
 *   any `verb ${status}` string) get wrapped in a generic "server said no"
 *   sentence that names the code, so the shape is at least recognizable.
 * - Everything else (null/undefined/empty, gibberish, anything unrecognized)
 *   collapses to one generic sentence. The raw code is never surfaced bare.
 */
export function humanizeError(code: string | null | undefined): string {
  if (!code) return GENERIC_FAILURE;

  const mapped = EXACT_MATCH[code];
  if (mapped) return mapped;

  // Connection failures map to the offline copy before the status-shape checks
  // and the generic fallback.
  if (NETWORK_ERROR.test(code)) return NETWORK_FAILURE;

  if (HTTP_VERB_STATUS.test(code) || TRAILING_STATUS.test(code)) {
    return `The server said no (${code}) — try again in a moment.`;
  }

  return GENERIC_FAILURE;
}
