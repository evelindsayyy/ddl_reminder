'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { humanizeError } from '@/lib/errorCopy';

interface Props {
  initialSemesterEndDate: string | null;
}

export default function SettingsForm({ initialSemesterEndDate }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [semesterEnd, setSemesterEnd] = useState(initialSemesterEndDate ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
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
      toast(humanizeError(err instanceof Error ? err.message : 'save_failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input
        id="semester_end_date"
        type="date"
        aria-label="Semester end date"
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
    </form>
  );
}
