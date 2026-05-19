'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function SignOutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onClick() {
    start(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace('/login');
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="font-mono text-[11px] text-ink-faint underline hover:text-ink disabled:opacity-60"
    >
      {pending ? 'signing out…' : 'sign out'}
    </button>
  );
}
