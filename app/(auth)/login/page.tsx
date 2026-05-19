'use client';

import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string }
  | { kind: 'error'; message: string };

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setStatus({ kind: 'error', message: 'Enter an email.' });
      return;
    }
    setStatus({ kind: 'sending' });

    try {
      const supabase = createClient();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: `${appUrl}/auth/callback`,
          shouldCreateUser: true,
        },
      });
      if (error) {
        setStatus({ kind: 'error', message: error.message });
        return;
      }
      setStatus({ kind: 'sent', email: trimmed });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unexpected error.';
      setStatus({ kind: 'error', message });
    }
  }

  const sending = status.kind === 'sending';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold leading-none">deadlines.</h1>
        <p className="mt-2 text-sm text-ink-soft">
          sign in with a magic link — no password required.
        </p>
      </div>

      {status.kind === 'sent' ? (
        <div className="w-full rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm">
          <p className="font-medium">Check your inbox.</p>
          <p className="mt-1 text-neutral-600">
            We sent a sign-in link to <strong>{status.email}</strong>. Click it to continue.
          </p>
          <button
            type="button"
            onClick={() => setStatus({ kind: 'idle' })}
            className="mt-3 text-xs text-neutral-500 underline hover:text-neutral-900"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
          <input
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={sending}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {sending ? 'Sending…' : 'Send magic link'}
          </button>
          {status.kind === 'error' ? (
            <p className="text-sm text-red-600">{status.message}</p>
          ) : null}
        </form>
      )}
    </main>
  );
}
