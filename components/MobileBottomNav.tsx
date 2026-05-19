'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/', label: 'home' },
  { href: '/assignments', label: 'assigns' },
  { href: '/applications', label: 'apps' },
  { href: '/settings', label: 'more' },
] as const;

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-ink-faint/40 bg-bg pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {TABS.map((t) => {
        const active = isActive(pathname, t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'flex h-14 flex-1 items-center justify-center font-mono text-xs',
              active ? 'bg-ink text-bg' : 'text-ink-soft hover:bg-bg-dim'
            )}
            aria-current={active ? 'page' : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
