import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SignOutButton from './SignOutButton';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { MobileAddBar } from '@/components/layout/MobileAddBar';
import { NavLinks } from '@/components/layout/NavLinks';
import { ToastProvider } from '@/components/ui/Toast';

const NAV = [
  { href: '/', label: 'dashboard' },
  { href: '/assignments', label: 'assignments' },
  { href: '/applications', label: 'applications' },
  { href: '/settings', label: 'settings' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <ToastProvider>
      <div className="min-h-screen bg-bg text-ink">
        {/* Desktop top nav */}
      <header className="hidden border-b border-ink-faint/40 md:block">
        <nav className="mx-auto flex max-w-5xl items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="font-display text-2xl font-semibold leading-none">deadlines.</span>
          <NavLinks items={NAV} />
          <span className="font-mono text-xs text-ink-faint">{user.email}</span>
          <SignOutButton />
        </nav>
      </header>

      {/* Mobile compact header — brand + email */}
      <header className="flex items-center justify-between border-b border-ink-faint/40 px-4 py-3 md:hidden">
        <span className="font-display text-2xl font-semibold leading-none">deadlines.</span>
        <span className="font-mono text-xs text-ink-faint">{user.email}</span>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-32 pt-6 md:pb-12">{children}</main>

      <MobileAddBar />
      <MobileBottomNav />
      </div>
    </ToastProvider>
  );
}
