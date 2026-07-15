'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { humanizeError } from '@/lib/errorCopy';

interface Props {
  initialSemesterEndDate: string | null;
  initialTimezone: string;
}

// IANA zone list for the picker. `Intl.supportedValuesOf` is available in every
// runtime we target (Node ≥18, all modern browsers); fall back to the current
// value alone if a stray engine lacks it.
function supportedTimezones(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = [];
  }
  // Ensure the current value is present and listed first/selected.
  const rest = zones.filter((z) => z !== current);
  return [current, ...rest];
}

export default function SettingsForm({
  initialSemesterEndDate,
  initialTimezone,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [semesterEnd, setSemesterEnd] = useState(initialSemesterEndDate ?? '');
  const [timezone, setTimezone] = useState(initialTimezone);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const timezones = useMemo(() => supportedTimezones(initialTimezone), [initialTimezone]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          semesterEndDate: semesterEnd || null,
          timezone,
        }),
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
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="semester_end_date" className="font-mono text-xs text-ink-faint">
          semester end date
        </label>
        <input
          id="semester_end_date"
          type="date"
          aria-label="Semester end date"
          value={semesterEnd}
          onChange={(e) => setSemesterEnd(e.target.value)}
          disabled={saving}
          className="w-fit rounded border border-ink-faint px-2 py-1 font-mono text-sm focus:border-ink focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="timezone" className="font-mono text-xs text-ink-faint">
          timezone
        </label>
        <select
          id="timezone"
          aria-label="Timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          disabled={saving}
          className="w-fit max-w-full rounded border border-ink-faint px-2 py-1 font-mono text-sm focus:border-ink focus:outline-none"
        >
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-ink px-3 py-1 text-xs font-medium text-bg hover:bg-ink-soft disabled:opacity-60"
        >
          {saving ? 'saving…' : 'save'}
        </button>
        {message ? <span className="font-mono text-xs text-success">{message}</span> : null}
      </div>
    </form>
  );
}
