// @vitest-environment jsdom
//
// Component test for NavLinks (`components/layout/NavLinks.tsx`), the desktop
// active-nav sub-component. Seam: `next/navigation`'s usePathname is mocked so
// each test drives the active-route matcher (exact match for '/', prefix match
// otherwise, copied from MobileBottomNav). Asserts the aria-current="page"
// wiring per route.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const { pathnameMock } = vi.hoisted(() => ({ pathnameMock: vi.fn(() => '/') }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}));

import { NavLinks } from '@/components/layout/NavLinks';

const NAV = [
  { href: '/', label: 'dashboard' },
  { href: '/assignments', label: 'assignments' },
  { href: '/applications', label: 'applications' },
  { href: '/settings', label: 'settings' },
];

function renderNav(pathname: string) {
  pathnameMock.mockReturnValue(pathname);
  render(<NavLinks items={NAV} />);
}

afterEach(() => {
  cleanup();
  pathnameMock.mockReset();
});

describe('NavLinks', () => {
  it('marks the assignments link current on /assignments and not the dashboard link', () => {
    renderNav('/assignments');
    expect(screen.getByRole('link', { name: 'assignments' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'dashboard' }).getAttribute('aria-current')).toBeNull();
  });

  it('marks the assignments link current on a nested assignments route (prefix match)', () => {
    renderNav('/assignments/123');
    expect(screen.getByRole('link', { name: 'assignments' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('marks only the dashboard link current on / (exact match for root)', () => {
    renderNav('/');
    expect(screen.getByRole('link', { name: 'dashboard' }).getAttribute('aria-current')).toBe(
      'page',
    );
    for (const label of ['assignments', 'applications', 'settings']) {
      expect(screen.getByRole('link', { name: label }).getAttribute('aria-current')).toBeNull();
    }
  });
});
