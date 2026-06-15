'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Sticky `+ add` bar above the bottom nav on mobile only. Tapping it
// navigates to `/assignments` where the QuickAdd field has autoFocus
// behavior. Hidden on the assignments page itself (no point in linking
// you there from there) and on desktop.
export function MobileAddBar() {
  const pathname = usePathname();
  if (pathname === '/assignments') return null;
  return (
    <div className="fixed inset-x-0 bottom-14 z-20 px-3 pb-[env(safe-area-inset-bottom)] md:hidden">
      <Link
        href="/assignments?focus=add"
        className="flex h-12 items-center justify-center rounded-md border border-dashed border-ink-faint/60 bg-bg/95 font-mono text-sm text-ink-soft backdrop-blur"
      >
        + add deadline…
      </Link>
    </div>
  );
}
