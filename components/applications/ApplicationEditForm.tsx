'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { updateApplication } from '@/lib/applications';
import { isoToDatetimeLocal, datetimeLocalToIso } from '@/lib/datetimeLocal';
import { useToast } from '@/components/ui/Toast';
import { humanizeError } from '@/lib/errorCopy';
import type { ApplicationCardData } from './ApplicationCard';

export interface ApplicationEditFormProps {
  application: ApplicationCardData;
  onCancel: () => void;
  onSaved: () => void;
}

// Inline edit form for a single application. Follows the AddApplicationForm
// template: local field state seeded from the row → updateApplication server
// action → ActionResult.ok branch → error banner → onSaved() + router.refresh()
// (refresh-to-truth; no manual optimistic rollback). Every field carries a real
// <label> — this is new UI, so it meets the a11y bar from day one.
export function ApplicationEditForm({ application: a, onCancel, onSaved }: ApplicationEditFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [company, setCompany] = useState(a.company);
  const [role, setRole] = useState(a.role);
  const [nextAction, setNextAction] = useState(a.next_action ?? '');
  const [nextActionLocal, setNextActionLocal] = useState(() => isoToDatetimeLocal(a.next_action_at));
  const [notes, setNotes] = useState(a.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!company.trim() || !role.trim()) {
      setError('Company and role are required.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateApplication(a.id, {
        company: company.trim(),
        role: role.trim(),
        nextAction: nextAction.trim() === '' ? null : nextAction.trim(),
        // empty datetime-local clears the timestamp (send null); otherwise the
        // browser-local wall time is converted to a UTC ISO instant.
        nextActionAt: datetimeLocalToIso(nextActionLocal),
        notes: notes.trim() === '' ? null : notes.trim(),
      });
      if (!res.ok) {
        toast(humanizeError(res.error ?? 'save_failed'));
        return;
      }
      onSaved();
      router.refresh();
    });
  }

  const fieldClass =
    'rounded border border-ink-faint bg-bg px-2 py-1 text-sm focus:border-ink focus:outline-none disabled:opacity-60';
  const labelClass = 'text-[10px] font-medium uppercase tracking-wide text-ink-faint';

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 text-sm">
      <label className="flex flex-col gap-0.5">
        <span className={labelClass}>company</span>
        <input
          type="text"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          disabled={pending}
          required
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className={labelClass}>role</span>
        <input
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          disabled={pending}
          required
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className={labelClass}>next action</span>
        <input
          type="text"
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          disabled={pending}
          placeholder="e.g. follow up with recruiter"
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className={labelClass}>next action at</span>
        <input
          type="datetime-local"
          value={nextActionLocal}
          onChange={(e) => setNextActionLocal(e.target.value)}
          disabled={pending}
          title="When the next action is due — drives the calendar feed + email reminders. Clear to remove."
          className={`${fieldClass} font-mono text-ink-soft`}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className={labelClass}>notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={pending}
          rows={2}
          maxLength={2000}
          placeholder="interviewer, prep links…"
          className={fieldClass}
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-ink px-3 py-1 text-xs font-medium text-bg hover:bg-ink-soft disabled:opacity-60"
        >
          {pending ? 'saving…' : 'save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded border border-ink-faint px-3 py-1 text-xs text-ink-soft hover:border-ink hover:text-ink disabled:opacity-60"
        >
          cancel
        </button>
      </div>
      {error ? <p className="text-xs text-urgent">{error}</p> : null}
    </form>
  );
}
