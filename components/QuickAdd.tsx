'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatDueAt } from '@/lib/format';

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
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<ParsePreview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrideUntil, setOverrideUntil] = useState<string>('');
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

  async function onSave() {
    if (!preview?.dueAt) {
      setError('No due date — add one and try again.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const recurrence =
        preview.recurrence !== null
          ? {
              ...preview.recurrence,
              until: overrideUntil || preview.recurrence.until || null,
            }
          : undefined;
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
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
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
    if (!preview?.recurrence || !preview.dueAt) return null;
    const rec = preview.recurrence;
    const dayNames = rec.byweekday.map((d) => WEEKDAY_NAME[d]).join('/');
    const freq = rec.interval === 2 ? 'every other week' : 'weekly';
    const effectiveUntil = overrideUntil || rec.until || semesterEndDate || '(15 weeks)';
    return { text: `🔁 ${freq} on ${dayNames} · through ${effectiveUntil}`, freq, dayNames };
  }, [preview, overrideUntil, semesterEndDate]);

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
        <div className="mt-3 rounded-md bg-neutral-50 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {preview.courseCode ? (
              <span
                className="rounded px-2 py-0.5 text-xs font-medium"
                style={
                  matchedCourse
                    ? { backgroundColor: `${matchedCourse.color}20`, color: matchedCourse.color }
                    : { backgroundColor: '#6366f120', color: '#6366f1' }
                }
                title={matchedCourse?.name ?? undefined}
              >
                {preview.courseCode}
                {courseIsNew ? <span className="ml-1 opacity-70">(new)</span> : null}
              </span>
            ) : (
              <span className="rounded bg-neutral-200 px-2 py-0.5 text-xs text-neutral-700">
                no course
              </span>
            )}
            <span className="rounded bg-neutral-200 px-2 py-0.5 text-xs text-neutral-700">
              {preview.type}
            </span>
            {preview.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
              >
                #{tag}
              </span>
            ))}
            <span className="ml-auto text-xs text-neutral-500">
              conf {preview.confidence.toFixed(2)}
            </span>
          </div>
          <div className="mt-2 font-medium">{preview.title}</div>
          <div className="text-xs text-neutral-600">
            {preview.dueAt ? formatDueAt(preview.dueAt, timezone) : 'no due date'}
            <span className="ml-1 text-neutral-400">(first occurrence)</span>
          </div>

          {recurrenceSummary ? (
            <div className="mt-2 rounded border border-indigo-200 bg-indigo-50 p-2 text-xs">
              <div className="font-medium text-indigo-900">{recurrenceSummary.text}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-indigo-800">
                <label htmlFor="override_until" className="text-[11px]">
                  Override end date:
                </label>
                <input
                  id="override_until"
                  type="date"
                  value={overrideUntil}
                  onChange={(e) => setOverrideUntil(e.target.value)}
                  className="rounded border border-indigo-300 bg-white px-1.5 py-0.5 text-[11px]"
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
            </div>
          ) : null}

          {lowConfidence ? (
            <div className="mt-2 text-xs text-amber-700">
              Low confidence — double-check the fields before saving.
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : preview?.recurrence ? 'Save series' : 'Save'}
        </button>
        <span className="text-xs text-neutral-500">
          {parsing ? 'parsing…' : 'tip: ⌘↵ to save'}
        </span>
      </div>
    </section>
  );
}
