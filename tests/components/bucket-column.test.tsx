// @vitest-environment jsdom
//
// Component tests for the dashboard's guided empty states + prose counters
// (Task 5). BucketColumn is generic — labels are supplied by DashboardBuckets —
// so we assert:
//   • the prose counter renders (via a passed countLabel) for n>0,
//   • the celebration copy renders for an empty "today" bucket,
//   • DashboardBuckets renders the account-level "add your first deadline" line
//     when every bucket is empty.
// Seams (scout §9): global `fetch` + `next/navigation` mocked, real
// <ToastProvider> (DashboardBuckets calls useRouter + useToast).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { BucketColumn } from '@/components/dashboard/BucketColumn';
import { DashboardBuckets } from '@/components/dashboard/DashboardBuckets';
import { ToastProvider } from '@/components/ui/Toast';
import type { AssignmentCardData } from '@/components/dashboard/AssignmentCard';

const TZ = 'America/New_York';
const NOOP = () => {};
const EMPTY = new Set<string>();

function card(overrides: Partial<AssignmentCardData> = {}): AssignmentCardData {
  return {
    id: 'a1',
    title: 'Read ch 4',
    type: 'homework',
    due_at: '2026-07-15T18:00:00.000Z',
    completed_at: null,
    notes: null,
    estimated_hours: null,
    actual_hours: null,
    tags: [],
    course_id: null,
    recurrence_group_id: null,
    source: null,
    external_url: null,
    courses: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('BucketColumn', () => {
  it('renders the prose counter from countLabel when items are present', () => {
    render(
      <BucketColumn
        title="today"
        items={[card({ id: 'a1' }), card({ id: 'a2' })]}
        timezone={TZ}
        fadingIds={EMPTY}
        pendingIds={EMPTY}
        onToggleDone={NOOP}
        countLabel={(n) => `${n} due today`}
        emptyLabel="nothing due today 🎉"
      />,
    );
    expect(screen.getByText('2 due today')).toBeTruthy();
    // Prose counter replaced the old mono "N open" idiom.
    expect(screen.queryByText(/\bopen\b/)).toBeNull();
  });

  it('renders the per-bucket celebration copy when the today bucket is empty', () => {
    render(
      <BucketColumn
        title="today"
        items={[]}
        timezone={TZ}
        fadingIds={EMPTY}
        pendingIds={EMPTY}
        onToggleDone={NOOP}
        countLabel={(n) => `${n} due today`}
        emptyLabel="nothing due today 🎉"
      />,
    );
    expect(screen.getByText('nothing due today 🎉')).toBeTruthy();
    expect(screen.getByText('0 due today')).toBeTruthy();
    // The old "~" placeholder is gone.
    expect(screen.queryByText('~')).toBeNull();
  });
});

describe('DashboardBuckets', () => {
  it('shows the account-level nudge when every bucket is empty', () => {
    render(
      <ToastProvider>
        <DashboardBuckets assignments={[]} timezone={TZ} nowIso="2026-07-15T12:00:00.000Z" />
      </ToastProvider>,
    );
    expect(screen.getByText(/nothing yet —/)).toBeTruthy();
    const nudge = screen.getByRole('link', { name: 'add your first deadline' });
    expect(nudge.getAttribute('href')).toBe('/assignments');
  });

  it('hides the account-level nudge when at least one bucket has an item', () => {
    render(
      <ToastProvider>
        <DashboardBuckets
          assignments={[card({ id: 'a1', due_at: '2026-07-15T18:00:00.000Z' })]}
          timezone={TZ}
          nowIso="2026-07-15T12:00:00.000Z"
        />
      </ToastProvider>,
    );
    expect(screen.queryByText(/nothing yet —/)).toBeNull();
    expect(screen.getByText('1 due today')).toBeTruthy();
  });
});
