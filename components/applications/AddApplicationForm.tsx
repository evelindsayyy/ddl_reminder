'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createApplication } from '@/lib/applications';

export function AddApplicationForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCompany('');
    setRole('');
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
