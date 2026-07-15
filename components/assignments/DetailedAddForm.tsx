'use client';

// The "detailed" tab of the add-deadline panel: labeled fields for everything
// QuickAdd infers from a natural-language line. It assembles the SAME payload
// via buildAssignmentDraft and POSTs it to the SAME /api/assignments endpoint,
// so the two entry modes are wire-identical. Validation errors render inline
// next to their field (they never toast); only a failed/thrown save toasts
// (humanizeError), mirroring the QuickAdd + ApplicationEditForm idiom.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { buildAssignmentDraft, type AssignmentType, type RepeatMode } from '@/lib/assignmentDraft';
import { ASSIGNMENT_TYPES } from '@/lib/schemas';
import { useToast } from '@/components/ui/Toast';
import { humanizeError } from '@/lib/errorCopy';

export interface DetailedAddFormCourse {
  code: string;
  name: string | null;
  color: string;
}

export interface DetailedAddFormProps {
  courses: DetailedAddFormCourse[];
  /** The user's IANA timezone pref — the zone the due wall time is read in,
   *  matching how /api/parse resolves QuickAdd's wall times. */
  timezone: string;
}

// Sentinel select value that swaps the course dropdown for a free-text input.
const NEW_COURSE = '__new__';

const fieldClass =
  'min-h-[44px] rounded border border-ink-faint bg-bg px-3 py-2 text-sm focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink disabled:opacity-60';
const labelClass = 'text-xs font-medium uppercase tracking-wide text-ink-faint';

// Split QuickAdd-style comma tags: trim, lowercase, drop empties. The API
// re-normalizes (lib/tags.normalizeTags) so this only needs to be array-shaped.
function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function DetailedAddForm({ courses, timezone }: DetailedAddFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [courseSelect, setCourseSelect] = useState('');
  const [newCourse, setNewCourse] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<AssignmentType>('homework');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('23:59');
  const [repeats, setRepeats] = useState<RepeatMode>('never');
  const [until, setUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  function reset() {
    setCourseSelect('');
    setNewCourse('');
    setTitle('');
    setType('homework');
    setDate('');
    setTime('23:59');
    setRepeats('never');
    setUntil('');
    setNotes('');
    setTags('');
    setEstimatedHours('');
    setErrors({});
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const courseCode = courseSelect === NEW_COURSE ? newCourse : courseSelect;
    const hoursTrimmed = estimatedHours.trim();
    const hoursNum = hoursTrimmed === '' ? null : Number(hoursTrimmed);

    const result = buildAssignmentDraft({
      courseCode,
      title,
      type,
      date,
      time,
      repeats,
      timezone,
      until,
      notes,
      tags: parseTags(tags),
      estimatedHours: hoursNum,
    });

    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'save_failed' }));
        throw new Error(body.error ?? `save ${res.status}`);
      }
      reset();
      router.refresh();
    } catch (err: unknown) {
      // Async mutation outcome → toast (validation stays inline above).
      toast(humanizeError(err instanceof Error ? err.message : 'save_failed'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {/* course */}
      <label className="flex flex-col gap-1">
        <span className={labelClass}>course</span>
        <select
          value={courseSelect}
          onChange={(e) => setCourseSelect(e.target.value)}
          disabled={pending}
          className={fieldClass}
        >
          <option value="">no course</option>
          {courses.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name ? `${c.code} — ${c.name}` : c.code}
            </option>
          ))}
          <option value={NEW_COURSE}>new course…</option>
        </select>
      </label>
      {courseSelect === NEW_COURSE ? (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>new course code</span>
          <input
            type="text"
            value={newCourse}
            onChange={(e) => setNewCourse(e.target.value)}
            disabled={pending}
            placeholder="e.g. STA 240"
            maxLength={32}
            className={fieldClass}
          />
        </label>
      ) : null}

      {/* title */}
      <label className="flex flex-col gap-1">
        <span className={labelClass}>title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={pending}
          placeholder="e.g. HW5 — chapters 4-6"
          maxLength={200}
          aria-invalid={errors.title ? true : undefined}
          className={fieldClass}
        />
        {errors.title ? <span className="text-xs text-urgent">{errors.title}</span> : null}
      </label>

      {/* type */}
      <label className="flex flex-col gap-1">
        <span className={labelClass}>type</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as AssignmentType)}
          disabled={pending}
          className={fieldClass}
        >
          {ASSIGNMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      {/* due: separate date + time */}
      <fieldset className="flex flex-col gap-1">
        <legend className={labelClass}>due</legend>
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={pending}
            aria-label="Due date"
            aria-invalid={errors.due ? true : undefined}
            className={`${fieldClass} flex-1`}
          />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={pending}
            aria-label="Due time"
            aria-invalid={errors.due ? true : undefined}
            className={`${fieldClass} flex-1`}
          />
        </div>
        {errors.due ? <span className="text-xs text-urgent">{errors.due}</span> : null}
      </fieldset>

      {/* repeats + conditional until */}
      <div className="flex flex-wrap gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className={labelClass}>repeats</span>
          <select
            value={repeats}
            onChange={(e) => setRepeats(e.target.value as RepeatMode)}
            disabled={pending}
            className={fieldClass}
          >
            <option value="never">never</option>
            <option value="weekly">weekly</option>
            <option value="biweekly">every other week</option>
          </select>
        </label>
        {repeats !== 'never' ? (
          <label className="flex flex-1 flex-col gap-1">
            <span className={labelClass}>until</span>
            <input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              disabled={pending}
              aria-label="Repeat until"
              className={fieldClass}
            />
          </label>
        ) : null}
      </div>

      {/* collapsed extras — forced open when a field inside has an error, so
          the inline message can't hide behind a collapsed summary */}
      <details
        open={errors.estimatedHours ? true : undefined}
        className="rounded border border-ink-faint/40 px-3 py-2"
      >
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-ink-soft">
          more
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={pending}
              rows={2}
              maxLength={2000}
              placeholder="readings, links, reminders…"
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>tags</span>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              disabled={pending}
              placeholder="comma,separated"
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>estimated hours</span>
            <input
              type="number"
              min={0}
              max={999}
              step="0.5"
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value)}
              disabled={pending}
              placeholder="e.g. 3"
              aria-invalid={errors.estimatedHours ? true : undefined}
              className={fieldClass}
            />
            {errors.estimatedHours ? (
              <span className="text-xs text-urgent">{errors.estimatedHours}</span>
            ) : null}
          </label>
        </div>
      </details>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="min-h-[44px] rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'saving…' : 'save deadline'}
        </button>
      </div>
    </form>
  );
}
