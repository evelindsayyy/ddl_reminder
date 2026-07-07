'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createApplication } from '@/lib/applications';
import { APPLICATION_STAGES } from '@/lib/schemas';

const STAGE_LABELS: Record<(typeof APPLICATION_STAGES)[number], string> = {
  applied: 'Applied',
  oa: 'OA',
  phone_screen: 'Phone screen',
  technical: 'Technical',
  onsite: 'Onsite',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export function AddApplicationForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [stage, setStage] = useState<(typeof APPLICATION_STAGES)[number]>('applied');
  const [nextAction, setNextAction] = useState('');
  const [nextActionAt, setNextActionAt] = useState(''); // datetime-local value
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCompany('');
    setRole('');
    setStage('applied');
    setNextAction('');
    setNextActionAt('');
    setNotes('');
    setError(null);
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!company.trim() || !role.trim()) {
      setError('Company and role are required.');
      return;
    }
    setError(null);
    start(async () => {
      const res = await createApplication({
        company: company.trim(),
        role: role.trim(),
        stage,
        nextAction: nextAction.trim() || null,
        // datetime-local is browser-local wall time; toISOString() converts it
        // to the UTC instant (stored as timestamptz per CLAUDE.md §5).
        nextActionAt: nextActionAt ? new Date(nextActionAt).toISOString() : null,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        setError(res.error ?? 'create_failed');
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-dashed border-ink-faint px-3 py-1.5 font-mono text-xs text-ink-soft hover:border-ink hover:text-ink"
      >
        + add application
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-center gap-2 rounded border border-ink-faint/60 bg-bg-soft p-2"
    >
      <input
        type="text"
        autoFocus
        placeholder="Company"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        disabled={pending}
        className="min-w-[10rem] flex-1 rounded border border-ink-faint px-2 py-1 text-sm focus:border-ink focus:outline-none"
      />
      <input
        type="text"
        placeholder="Role"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        disabled={pending}
        className="min-w-[12rem] flex-[2] rounded border border-ink-faint px-2 py-1 text-sm focus:border-ink focus:outline-none"
      />
      <select
        value={stage}
        onChange={(e) => setStage(e.target.value as (typeof APPLICATION_STAGES)[number])}
        disabled={pending}
        aria-label="Stage"
        className="rounded border border-ink-faint bg-bg px-2 py-1 text-sm focus:border-ink focus:outline-none"
      >
        {APPLICATION_STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Next action (e.g. follow up)"
        value={nextAction}
        onChange={(e) => setNextAction(e.target.value)}
        disabled={pending}
        className="min-w-[12rem] flex-1 rounded border border-ink-faint px-2 py-1 text-sm focus:border-ink focus:outline-none"
      />
      <input
        type="datetime-local"
        value={nextActionAt}
        onChange={(e) => setNextActionAt(e.target.value)}
        disabled={pending}
        aria-label="Next action at"
        title="When the next action is due — drives the calendar feed + email reminders"
        className="rounded border border-ink-faint bg-bg px-2 py-1 text-sm text-ink-soft focus:border-ink focus:outline-none"
      />
      <input
        type="text"
        placeholder="Notes (interviewer, prep links…)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={pending}
        className="min-w-[14rem] flex-[2] rounded border border-ink-faint px-2 py-1 text-sm focus:border-ink focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-ink px-3 py-1 text-xs font-medium text-bg hover:bg-ink-soft disabled:opacity-60"
      >
        {pending ? 'saving…' : 'add'}
      </button>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(false);
        }}
        disabled={pending}
        className="rounded border border-ink-faint px-3 py-1 text-xs text-ink-soft hover:border-ink hover:text-ink"
      >
        cancel
      </button>
      {error ? <span className="w-full text-xs text-urgent">{error}</span> : null}
    </form>
  );
}
