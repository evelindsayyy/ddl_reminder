'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  initialOffsets: number[];
}

const PRESETS = [168, 72, 48, 24, 12, 6, 1];

export default function RemindersForm({ initialOffsets }: Props) {
  const router = useRouter();
  const [offsets, setOffsets] = useState<number[]>(initialOffsets);
  const [draft, setDraft] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function add(value: number) {
    if (Number.isNaN(value) || value < 1) return;
    if (offsets.includes(value)) return;
    setOffsets([...offsets, value].sort((a, b) => b - a));
  }

  function remove(value: number) {
    setOffsets(offsets.filter((o) => o !== value));
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminderOffsetsHours: offsets }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `save ${res.status}`);
      }
      setMsg('saved.');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {offsets.map((h) => (
          <span
            key={h}
            className="inline-flex items-center gap-1 rounded border border-ink-faint/60 bg-bg-soft px-2 py-1 font-mono text-xs"
          >
            {h}h
            <button
              type="button"
              onClick={() => remove(h)}
              aria-label={`remove ${h}h reminder`}
              className="text-ink-faint hover:text-urgent"
            >
              ×
            </button>
          </span>
        ))}
        <span className="font-mono text-[11px] text-ink-faint">before due</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={1}
          max={720}
          placeholder="hours"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-20 rounded border border-ink-faint px-2 py-1 font-mono text-xs focus:border-ink focus:outline-none"
        />
        <button
          type="button"
          onClick={() => {
            add(Number(draft));
            setDraft('');
          }}
          className="rounded border border-ink-faint px-2 py-1 text-xs hover:border-ink"
        >
          + add
        </button>
        <span className="font-mono text-[11px] text-ink-faint">presets:</span>
        {PRESETS.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => add(h)}
            disabled={offsets.includes(h)}
            className="rounded border border-dashed border-ink-faint px-1.5 py-0.5 font-mono text-[11px] text-ink-soft hover:border-ink hover:text-ink disabled:opacity-40"
          >
            {h}h
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-ink px-3 py-1 text-xs font-medium text-bg hover:bg-ink-soft disabled:opacity-60"
        >
          {saving ? 'saving…' : 'save offsets'}
        </button>
        {msg ? <span className="font-mono text-[11px] text-success">{msg}</span> : null}
        {err ? <span className="font-mono text-[11px] text-urgent">{err}</span> : null}
      </div>
    </form>
  );
}
