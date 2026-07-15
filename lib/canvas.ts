// Canvas .ics calendar feed importer.
//
// Per the design spec (docs/superpowers/specs/2026-04-23-imports-and-recurring-design.md §4),
// users paste their Canvas calendar feed URL into Settings, the daily
// cron fetches it, parses VEVENTs, and upserts assignments by
// (user_id, source='canvas', external_id=<UID>).
//
// Course-code extraction strategy:
//   1. SUMMARY pattern `[CODE] title` → code = "CODE"
//   2. CATEGORIES first item if it looks like a course code
//   3. Otherwise null

import type { SupabaseClient } from '@supabase/supabase-js';
import { pickColorForNewCourse } from '@/lib/colors';
import { checkFetchableUrl } from '@/lib/urlGuard';

export interface CanvasEvent {
  uid: string;
  summary: string;
  dtStart: Date;
  url: string | null;
  categories: string[];
}

export interface CanvasParseResult {
  events: CanvasEvent[];
}

const COURSE_CODE_RE = /^([A-Z]{2,8})\s?(\d{1,4}[A-Z]?)$/;

/**
 * Parse a Canvas-style ICS body. Minimal hand-roll — Canvas emits clean
 * RFC5545 with `\n` line endings, folding continuation lines with leading
 * whitespace. We only need: UID, SUMMARY, DTSTART, URL, CATEGORIES.
 *
 * Designed to be tolerant of Canvas's specific shape, not a general parser.
 */
export function parseCanvasIcs(body: string): CanvasParseResult {
  const events: CanvasEvent[] = [];
  // RFC5545 line-folding: a line beginning with space/tab is a continuation
  // of the previous line. Unfold first.
  const unfolded = body.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  let inEvent = false;
  let cur: Partial<CanvasEvent> | null = null;
  for (const raw of lines) {
    if (raw === 'BEGIN:VEVENT') {
      inEvent = true;
      cur = { categories: [] };
      continue;
    }
    if (raw === 'END:VEVENT') {
      if (inEvent && cur && cur.uid && cur.summary && cur.dtStart) {
        events.push(cur as CanvasEvent);
      }
      inEvent = false;
      cur = null;
      continue;
    }
    if (!inEvent || !cur) continue;

    // Property lines are `KEY[;PARAM=VALUE]:VALUE`.
    const colon = raw.indexOf(':');
    if (colon === -1) continue;
    const left = raw.slice(0, colon);
    const value = unescapeIcsText(raw.slice(colon + 1));
    const semi = left.indexOf(';');
    const key = (semi === -1 ? left : left.slice(0, semi)).toUpperCase();
    const params = semi === -1 ? '' : left.slice(semi + 1);

    switch (key) {
      case 'UID':
        cur.uid = value;
        break;
      case 'SUMMARY':
        cur.summary = value;
        break;
      case 'URL':
        cur.url = value;
        break;
      case 'CATEGORIES':
        cur.categories = value.split(',').map((s) => s.trim()).filter(Boolean);
        break;
      case 'DTSTART': {
        const date = parseDtValue(value, params);
        if (date) cur.dtStart = date;
        break;
      }
      default:
        break;
    }
  }

  return { events };
}

function unescapeIcsText(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseDtValue(value: string, params: string): Date | null {
  // Cases:
  //   20260428T235900Z              → UTC
  //   20260428T235900               → floating local (treat as UTC for safety)
  //   TZID=America/New_York:20260428T235900 → tz-qualified (params has TZID)
  //   20260428                      → date-only → midnight UTC
  if (/^\d{8}$/.test(value)) {
    return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00Z`);
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}`;
  if (z === 'Z') return new Date(`${iso}Z`);
  // Has TZID? Use it via toLocaleString-ish parsing — use the global Date()
  // path that lets `Intl` handle it. Simpler: build the iso then offset by
  // querying date-fns-tz. Avoid adding a runtime dep here — for Canvas's
  // student-side feed, DTSTART comes back as UTC `Z` in practice.
  // Fall back: treat as UTC.
  return new Date(`${iso}Z`);
}

/**
 * Extract `[CODE] title` from a Canvas SUMMARY. Returns the bare title
 * and the course code if any.
 */
export function splitCanvasSummary(
  summary: string,
  categories: string[]
): { courseCode: string | null; title: string } {
  const bracket = summary.match(/^\[\s*([A-Z]{2,8})\s?(\d{1,4}[A-Z]?)\s*\]\s*(.+)$/);
  if (bracket) {
    return { courseCode: `${bracket[1]} ${bracket[2]}`, title: bracket[3].trim() };
  }
  for (const cat of categories) {
    const m = cat.match(COURSE_CODE_RE);
    if (m) return { courseCode: `${m[1]} ${m[2]}`, title: summary.trim() };
  }
  return { courseCode: null, title: summary.trim() };
}

// ---- live sync (called from /api/canvas/sync and /api/cron/daily) ----

export interface SyncSummary {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  error?: string;
}

const FETCH_TIMEOUT_MS = 30_000;

/**
 * Fetch + parse + upsert a Canvas feed for one user, then record the outcome
 * on `user_prefs` (canvas_last_sync_at / canvas_last_sync_error) so the UI can
 * surface sync health. Both the manual "Sync now" route and the daily cron go
 * through here, so recording centrally covers both.
 *
 * `serviceClient` is the supabase service-role client — required when
 * called from the cron, where there's no user session. The user's
 * `user_id` is passed explicitly so RLS isn't relied upon.
 */
export async function syncCanvasForUser(
  serviceClient: SupabaseClient,
  userId: string,
  canvasIcsUrl: string
): Promise<SyncSummary> {
  const result = await performCanvasSync(serviceClient, userId, canvasIcsUrl);
  // Best-effort status write: a failure to record status must not mask the
  // sync result, and a pre-0004 DB without these columns must not break syncing.
  try {
    await serviceClient
      .from('user_prefs')
      .update({
        canvas_last_sync_at: new Date().toISOString(),
        canvas_last_sync_error: result.error ?? null,
      })
      .eq('user_id', userId);
  } catch {
    // ignore — sync status is best-effort
  }
  return result;
}

// Internal: the actual fetch + parse + upsert. Returns a summary; only
// syncCanvasForUser calls this and persists the outcome.
async function performCanvasSync(
  serviceClient: SupabaseClient,
  userId: string,
  canvasIcsUrl: string
): Promise<SyncSummary> {
  // SSRF guard: this URL is user-supplied and fetched with the service-role
  // client. Reject non-HTTPS, credentialed, or internal/private-IP targets
  // before making any request.
  const guard = checkFetchableUrl(canvasIcsUrl);
  if (!guard.ok) {
    return { fetched: 0, inserted: 0, updated: 0, skipped: 0, error: `blocked_url:${guard.reason}` };
  }

  let body: string;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(canvasIcsUrl, {
      headers: { 'User-Agent': 'DDLReminder-Canvas-Sync/1.0' },
      signal: ctrl.signal,
      cache: 'no-store',
      redirect: 'error', // don't follow redirects to an internal target
    });
    clearTimeout(t);
    if (!res.ok) return { fetched: 0, inserted: 0, updated: 0, skipped: 0, error: `fetch ${res.status}` };
    body = await res.text();
  } catch (err) {
    return {
      fetched: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      error: err instanceof Error ? err.message : 'fetch_failed',
    };
  }

  const parsed = parseCanvasIcs(body);

  // Pre-fetch existing imported rows so we can decide insert vs update without
  // a per-row DB hit, and existing courses for color reuse.
  const { data: existingRows, error: existingErr } = await serviceClient
    .from('assignments')
    .select('id, external_id, completed_at, notes, estimated_hours, actual_hours')
    .eq('user_id', userId)
    .eq('source', 'canvas');
  if (existingErr) {
    return { fetched: parsed.events.length, inserted: 0, updated: 0, skipped: 0, error: existingErr.message };
  }
  const existingByExt = new Map<string, (typeof existingRows)[number]>();
  for (const row of existingRows ?? []) {
    if (row.external_id) existingByExt.set(row.external_id, row);
  }

  const { data: existingCourses } = await serviceClient
    .from('courses')
    .select('id, code, color')
    .eq('user_id', userId);
  const courseByCode = new Map<string, { id: string; color: string }>();
  for (const c of existingCourses ?? []) courseByCode.set(c.code, { id: c.id, color: c.color });

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const ev of parsed.events) {
    const { courseCode, title } = splitCanvasSummary(ev.summary, ev.categories);

    // Resolve course → may need to insert.
    let courseId: string | null = null;
    if (courseCode) {
      const trimmed = courseCode.trim();
      const existingCourse = courseByCode.get(trimmed);
      if (existingCourse) {
        courseId = existingCourse.id;
      } else {
        const usedColors = Array.from(courseByCode.values()).map((c) => c.color);
        const color = pickColorForNewCourse(usedColors);
        const ins = await serviceClient
          .from('courses')
          .insert({ user_id: userId, code: trimmed, color })
          .select('id, color')
          .single();
        if (!ins.error && ins.data) {
          courseId = ins.data.id;
          courseByCode.set(trimmed, { id: ins.data.id, color: ins.data.color });
        }
      }
    }

    const dueIso = ev.dtStart.toISOString();
    const externalId = ev.uid;

    const existing = existingByExt.get(externalId);
    if (existing) {
      // Canvas wins on title/due_at/external_url. Preserve user-owned fields —
      // including `type`: it's derived (`'other'`) only on INSERT, so a
      // user-edited type survives every re-sync rather than being clobbered.
      const { error } = await serviceClient
        .from('assignments')
        .update({
          title,
          due_at: dueIso,
          external_url: ev.url ?? null,
          course_id: courseId,
        })
        .eq('id', existing.id)
        .eq('user_id', userId);
      if (error) skipped++;
      else updated++;
    } else {
      const { error } = await serviceClient.from('assignments').insert({
        user_id: userId,
        course_id: courseId,
        title,
        type: 'other',
        due_at: dueIso,
        source: 'canvas',
        external_id: externalId,
        external_url: ev.url ?? null,
      });
      if (error) skipped++;
      else inserted++;
    }
  }

  return { fetched: parsed.events.length, inserted, updated, skipped };
}
