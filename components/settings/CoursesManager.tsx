'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { COURSE_COLOR_PALETTE } from '@/lib/colors';
import { CourseChip } from '@/components/ui/CourseChip';
import { useToast } from '@/components/ui/Toast';
import { humanizeError } from '@/lib/errorCopy';

export interface CourseRow {
  id: string;
  code: string;
  name: string | null;
  color: string;
}

interface Props {
  courses: CourseRow[];
}

export default function CoursesManager({ courses }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Id of the row with an outstanding update/delete — its controls disable
  // while the request is in flight (create has its own `busy`).
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Enter a course code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed, name: name.trim() || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'create_failed' }));
        throw new Error(body.error ?? `create ${res.status}`);
      }
      setCode('');
      setName('');
      router.refresh();
    } catch (err: unknown) {
      toast(humanizeError(err instanceof Error ? err.message : 'create_failed'));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(course: CourseRow) {
    if (!confirm(`Delete course ${course.code}? Assignments keep their data but lose the color label.`)) return;
    setPendingId(course.id);
    try {
      const res = await fetch(`/api/courses/${course.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`DELETE ${res.status}`);
      router.refresh();
    } catch (err: unknown) {
      toast(humanizeError(err instanceof Error ? err.message : 'delete_failed'));
    } finally {
      setPendingId(null);
    }
  }

  async function onUpdate(course: CourseRow, patch: Partial<Pick<CourseRow, 'code' | 'name' | 'color'>>) {
    setPendingId(course.id);
    try {
      const res = await fetch(`/api/courses/${course.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'update_failed' }));
        throw new Error(body.error ?? `update ${res.status}`);
      }
      setEditingId(null);
      router.refresh();
    } catch (err: unknown) {
      toast(humanizeError(err instanceof Error ? err.message : 'update_failed'));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={onCreate} className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Code (e.g. STA 240)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={busy}
          className="min-w-[10rem] flex-1 rounded border border-ink-faint px-2 py-1 text-sm focus:border-ink focus:outline-none"
        />
        <input
          type="text"
          placeholder="Full name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          className="min-w-[12rem] flex-[2] rounded border border-ink-faint px-2 py-1 text-sm focus:border-ink focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-ink px-3 py-1 text-xs font-medium text-bg hover:bg-ink-soft disabled:opacity-60"
        >
          {busy ? 'adding…' : '+ add course'}
        </button>
      </form>

      {error ? <div className="font-mono text-[11px] text-urgent">{error}</div> : null}

      {courses.length === 0 ? (
        <p className="font-mono text-xs text-ink-faint">
          no courses yet. one is auto-created the first time you save an assignment.
        </p>
      ) : (
        <ul className="space-y-2">
          {courses.map((c) => {
            const isEditing = editingId === c.id;
            const rowPending = pendingId === c.id;
            return (
              <li
                key={c.id}
                className={`flex flex-wrap items-center gap-3 rounded border border-ink-faint/40 bg-bg p-2${
                  rowPending ? ' pointer-events-none opacity-60' : ''
                }`}
              >
                <ColorPicker
                  value={c.color}
                  disabled={rowPending}
                  onChange={(color) => onUpdate(c, { color })}
                />
                {isEditing ? (
                  <EditForm
                    course={c}
                    onCancel={() => setEditingId(null)}
                    onSave={(patch) => onUpdate(c, patch)}
                  />
                ) : (
                  <>
                    <CourseChip code={c.code} color={c.color} size="sm" />
                    <span className="flex-1 text-sm text-ink">
                      {c.name ?? <span className="italic text-ink-faint">no name</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingId(c.id)}
                      disabled={rowPending}
                      className="font-mono text-[11px] text-ink-soft hover:text-ink disabled:opacity-60"
                    >
                      edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(c)}
                      disabled={rowPending}
                      className="font-mono text-[11px] text-ink-faint hover:text-urgent disabled:opacity-60"
                    >
                      delete
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-label="Change color"
        className="h-6 w-6 rounded-full border border-ink-faint disabled:opacity-60"
        style={{ backgroundColor: value }}
      />
      {open ? (
        <div
          className="absolute left-0 top-8 z-10 flex flex-wrap gap-1 rounded-md border border-ink-faint bg-bg p-2 shadow-sm"
          style={{ width: '10rem' }}
        >
          {COURSE_COLOR_PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => {
                onChange(color);
                setOpen(false);
              }}
              aria-label={`Pick ${color}`}
              className={`h-6 w-6 rounded-full border ${
                color.toLowerCase() === value.toLowerCase()
                  ? 'border-ink'
                  : 'border-ink-faint'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EditForm({
  course,
  onCancel,
  onSave,
}: {
  course: CourseRow;
  onCancel: () => void;
  onSave: (patch: { code?: string; name?: string | null }) => void;
}) {
  const [code, setCode] = useState(course.code);
  const [name, setName] = useState(course.name ?? '');
  return (
    <div className="flex flex-1 flex-wrap gap-2">
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="min-w-[8rem] rounded border border-ink-faint px-2 py-1 text-sm"
      />
      <input
        type="text"
        placeholder="Full name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 min-w-[8rem] rounded border border-ink-faint px-2 py-1 text-sm"
      />
      <button
        type="button"
        onClick={() => onSave({ code: code.trim(), name: name.trim() || null })}
        className="rounded bg-ink px-3 py-1 text-xs font-medium text-bg hover:bg-ink-soft"
      >
        save
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded border border-ink-faint px-3 py-1 text-xs text-ink-soft hover:border-ink hover:text-ink"
      >
        cancel
      </button>
    </div>
  );
}
