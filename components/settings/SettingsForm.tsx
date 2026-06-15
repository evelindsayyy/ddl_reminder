'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  initialSemesterEndDate: string | null;
}

export default function SettingsForm({ initialSemesterEndDate }: Props) {
  const router = useRouter();
  const [semesterEnd, setSemesterEnd] = useState(initialSemesterEndDate ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ semesterEndDate: semesterEnd || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'save_failed' }));
        throw new Error(body.error ?? `save ${res.status}`);
      }
      setMessage('saved.');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input
        id="semester_end_date"
        type="date"
        value={semesterEnd}
        onChange={(e) => setSemesterEnd(e.target.value)}
        disabled={saving}
        className="rounded border border-ink-faint px-2 py-1 font-mono text-sm focus:border-ink focus:outline-none"
      />
      <button
        type="submit"
        disabled={saving}
        className="rounded bg-ink px-3 py-1 text-xs font-medium text-bg hover:bg-ink-soft disabled:opacity-60"
      >
        {saving ? 'saving…' : 'save'}
      </button>
      {message ? <span className="font-mono text-[11px] text-success">{message}</span> : null}
      {error ? <span className="font-mono text-[11px] text-urgent">{error}</span> : null}
    </form>
  );
}
