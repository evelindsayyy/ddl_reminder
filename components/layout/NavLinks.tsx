'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface NavLinksProps {
  items: { href: string; label: string }[];
}

// Active-route matcher copied from MobileBottomNav: exact match for the root,
// prefix match for every other section.
function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ items }: NavLinksProps) {
  const pathname = usePathname();
  return (
    <div className="flex flex-1 gap-x-5 text-ink-soft">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'px-2 py-2.5 text-lg',
              active
                ? 'text-ink underline decoration-wavy underline-offset-8'
                : 'text-ink-soft hover:text-ink'
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
