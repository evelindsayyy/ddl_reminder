'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatDueAt } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';
import { humanizeError } from '@/lib/errorCopy';

interface Recurrence {
  interval: 1 | 2;
  byweekday: number[];
  until: string | null;
}

interface ParsePreview {
  courseCode: string | null;
  title: string;
  type: string;
  dueAt: string | null;
  tags: string[];
  confidence: number;
  recurrence: Recurrence | null;
}

interface KnownCourse {
  code: string;
  name: string | null;
  color: string;
}

const DEBOUNCE_MS = 300;
const WEEKDAY_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Weekday index (0=Sun..6=Sat) of an ISO instant as seen in the user's zone.
// Used to seed the manual recurrence form from the parsed first occurrence.
function weekdayInTz(iso: string, tz: string): number {
  const short = new Date(iso).toLocaleDateString('en-US', { timeZone: tz, weekday: 'short' });
  const idx = WEEKDAY_NAME.indexOf(short);
  return idx === -1 ? 1 : idx;
}

export default function QuickAdd({
  timezone,
  knownCourses = [],
  semesterEndDate = null,
}: {
  timezone: string;
  knownCourses?: KnownCourse[];
  semesterEndDate?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<ParsePreview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrideUntil, setOverrideUntil] = useState<string>('');
  // Manual recurrence editor — lets a series be set/corrected when the NL
  // parser misses it. Seeded from detection (see effect below) but editable.
  const [recurring, setRecurring] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [repeatInterval, setRepeatInterval] = useState<1 | 2>(1);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // When navigated here with ?focus=add (e.g. from MobileAddBar), focus
  // the input so the user lands typing.
  useEffect(() => {
    if (searchParams?.get('focus') === 'add') {
      textareaRef.current?.focus();
    }
  }, [searchParams]);

  useEffect(() => {
    if (!input.trim()) {
      setPreview(null);
      setError(null);
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setParsing(true);
      setError(null);
      try {
        const res = await fetch('/api/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const msg = await res.text().catch(() => 'parse_failed');
          throw new Error(`parse ${res.status}: ${msg}`);
        }
        const json = (await res.json()) as ParsePreview;
        setPreview(json);
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Unexpected error');
        setPreview(null);
      } finally {
        setParsing(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input]);

  // When the parser detects a series, seed the manual form from it so the
  // controls reflect (and can correct) the detection. A parse that finds no
  // recurrence leaves any manual toggle the user set intact.
  useEffect(() => {
    if (preview?.recurrence) {
      setRecurring(true);
      setWeekdays(preview.recurrence.byweekday);
      setRepeatInterval(preview.recurrence.interval);
    }
  }, [preview?.recurrence]);

  function toggleWeekday(day: number) {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  function toggleRecurring() {
    setRecurring((prev) => {
      // Turning on with no weekday chosen yet: seed from the due date.
      if (!prev && weekdays.length === 0 && preview?.dueAt) {
        setWeekdays([weekdayInTz(preview.dueAt, timezone)]);
      }
      return !prev;
    });
  }

  // The series actually saved: built from the manual editor (which is seeded
  // from any NL detection). Null when recurrence is off or no weekday is set.
  const effectiveRecurrence = useMemo<Recurrence | null>(() => {
    if (!recurring || weekdays.length === 0) return null;
    return {
      interval: repeatInterval,
      byweekday: [...weekdays].sort((a, b) => a - b),
      until: overrideUntil || preview?.recurrence?.until || null,
    };
  }, [recurring, weekdays, repeatInterval, overrideUntil, preview?.recurrence?.until]);

  async function onSave() {
    if (!preview?.dueAt) {
      setError('No due date — add one and try again.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const recurrence = effectiveRecurrence ?? undefined;
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseCode: preview.courseCode,
          title: preview.title,
          type: preview.type,
          dueAt: preview.dueAt,
          tags: preview.tags,
          ...(recurrence ? { recurrence } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'save_failed' }));
        throw new Error(body.error ?? `save ${res.status}`);
      }
      setInput('');
      setPreview(null);
      setOverrideUntil('');
      setRecurring(false);
      setWeekdays([]);
      setRepeatInterval(1);
      router.refresh();
    } catch (err: unknown) {
      // SAVE failures toast (they're an async mutation outcome, not form
      // validation). The parse warning + confidence hint below stay inline.
      toast(humanizeError(err instanceof Error ? err.message : 'save_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  const canSave = preview !== null && preview.dueAt !== null && !submitting;
  const lowConfidence = preview !== null && preview.confidence < 0.6;

  const courseIndex = useMemo(() => {
    const m = new Map<string, KnownCourse>();
    for (const c of knownCourses) m.set(c.code.toUpperCase(), c);
    return m;
  }, [knownCourses]);
  const matchedCourse = preview?.courseCode
    ? courseIndex.get(preview.courseCode.toUpperCase()) ?? null
    : null;
  const courseIsNew =
    preview?.courseCode !== null && preview?.courseCode !== undefined && matchedCourse === null;

  // Compute a human-readable series summary for the preview.
  const recurrenceSummary = useMemo(() => {
    if (!effectiveRecurrence || !preview?.dueAt) return null;
    const rec = effectiveRecurrence;
    const dayNames = rec.byweekday.map((d) => WEEKDAY_NAME[d]).join('/');
    const freq = rec.interval === 2 ? 'every other week' : 'weekly';
    const effectiveUntil = overrideUntil || rec.until || semesterEndDate || '(15 weeks)';
    return { text: `🔁 ${freq} on ${dayNames} · through ${effectiveUntil}`, freq, dayNames };
  }, [effectiveRecurrence, preview?.dueAt, overrideUntil, semesterEndDate]);

  return (
    <section className="rounded-lg border border-ink-faint/40 p-4">
      <label className="font-display text-xl text-ink-soft">quick add</label>
      <textarea
        ref={textareaRef}
        rows={2}
        placeholder='e.g. "STA 240 HW5 due Friday 11:59pm" or "COMPSCI 372 hw every Tuesday 11:59pm"'
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (canSave) void onSave();
          }
        }}
        className="mt-2 w-full resize-none rounded-md border border-ink-faint px-3 py-2 text-sm font-sans focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
      />

      {preview ? (
        <div className="mt-3 rounded-md bg-bg-soft p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {preview.courseCode ? (
              <span
                className="rounded px-2 py-0.5 text-xs font-medium"
                style={
                  matchedCourse
                    ? { backgroundColor: `${matchedCourse.color}20`, color: matchedCourse.color }
                    : {
                        backgroundColor: 'rgb(var(--color-info) / 0.125)',
                        color: 'rgb(var(--color-info))',
                      }
                }
                title={matchedCourse?.name ?? undefined}
              >
                {preview.courseCode}
                {courseIsNew ? <span className="ml-1 opacity-70">(new)</span> : null}
              </span>
            ) : (
              <span className="rounded bg-bg-dim px-2 py-0.5 text-xs text-ink-soft">
                no course
              </span>
            )}
            <span className="rounded bg-bg-dim px-2 py-0.5 text-xs text-ink-soft">
              {preview.type}
            </span>
            {preview.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-warn/15 px-2 py-0.5 text-xs text-warn"
              >
                #{tag}
              </span>
            ))}
            <span className="ml-auto text-xs text-ink-faint">
              conf {preview.confidence.toFixed(2)}
            </span>
          </div>
          <div className="mt-2 font-medium">{preview.title}</div>
          <div className="text-xs text-ink-soft">
            {preview.dueAt ? formatDueAt(preview.dueAt, timezone) : 'no due date'}
            <span className="ml-1 text-ink-faint">(first occurrence)</span>
          </div>

          {preview.dueAt ? (
            <div className="mt-2 rounded border border-info/30 bg-info/5 p-2 text-xs">
              <label className="flex items-center gap-2 text-ink">
                <input type="checkbox" checked={recurring} onChange={toggleRecurring} />
                <span className="font-medium">🔁 Repeat weekly</span>
              </label>

              {recurring ? (
                <div className="mt-2 space-y-2 text-ink-soft">
                  <div className="flex flex-wrap gap-1">
                    {WEEKDAY_NAME.map((name, idx) => {
                      const on = weekdays.includes(idx);
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => toggleWeekday(idx)}
                          aria-pressed={on}
                          className={
                            on
                              ? 'rounded bg-info px-2 py-0.5 text-[11px] text-bg'
                              : 'rounded border border-info/40 bg-bg px-2 py-0.5 text-[11px] text-info'
                          }
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2">
                    <label htmlFor="repeat_interval" className="text-[11px]">
                      Frequency:
                    </label>
                    <select
                      id="repeat_interval"
                      value={repeatInterval}
                      onChange={(e) => setRepeatInterval(Number(e.target.value) === 2 ? 2 : 1)}
                      className="rounded border border-ink-faint bg-bg px-1.5 py-0.5 text-[11px]"
                    >
                      <option value={1}>weekly</option>
                      <option value={2}>every other week</option>
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="override_until" className="text-[11px]">
                      End date:
                    </label>
                    <input
                      id="override_until"
                      type="date"
                      value={overrideUntil}
                      onChange={(e) => setOverrideUntil(e.target.value)}
                      className="rounded border border-ink-faint bg-bg px-1.5 py-0.5 text-[11px]"
                    />
                    {overrideUntil ? (
                      <button
                        type="button"
                        onClick={() => setOverrideUntil('')}
                        className="text-[11px] underline"
                      >
                        clear
                      </button>
                    ) : null}
                  </div>

                  {recurrenceSummary ? (
                    <div className="font-medium text-ink">{recurrenceSummary.text}</div>
                  ) : (
                    <div className="text-[11px] text-warn">
                      Pick at least one weekday to save as a series.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {lowConfidence ? (
            <div className="mt-2 text-xs text-warn">
              Low confidence — double-check the fields before saving.
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <div className="mt-2 text-sm text-urgent">{error}</div> : null}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : effectiveRecurrence ? 'Save series' : 'Save'}
        </button>
        <span className="text-xs text-ink-faint">
          {parsing ? 'parsing…' : 'tip: ⌘↵ to save'}
        </span>
      </div>
    </section>
  );
}
