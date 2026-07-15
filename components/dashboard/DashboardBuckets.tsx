'use client';

import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { bucketAssignments } from '@/lib/bucket';
import { compareDueThenEffort } from '@/lib/score';
import { BucketColumn } from '@/components/dashboard/BucketColumn';
import type { AssignmentCardData } from '@/components/dashboard/AssignmentCard';
import { useToast } from '@/components/ui/Toast';
import { humanizeError } from '@/lib/errorCopy';

interface ToggleAction {
  id: string;
  completedAt: string | null;
}

const FADE_MS = 200;

export interface DashboardBucketsProps {
  assignments: AssignmentCardData[];
  timezone: string;
  // ISO of the request — used so the bucket boundaries don't shift between
  // server render and client hydration.
  nowIso: string;
}

export function DashboardBuckets({
  assignments,
  timezone,
  nowIso,
}: DashboardBucketsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [optimistic, applyOptimistic] = useOptimistic<AssignmentCardData[], ToggleAction>(
    assignments,
    (state, action) =>
      state.map((a) => (a.id === action.id ? { ...a, completed_at: action.completedAt } : a))
  );
  const [fadingIds, setFadingIds] = useState<ReadonlySet<string>>(new Set());
  // Per-item in-flight set — the card dims + its checkbox disables while the
  // PATCH is outstanding (mirrors the existing fade-by-id pattern).
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());

  // Stable bucket boundary — derived from nowIso so SSR and CSR agree on
  // which row counts as "today". Refreshes naturally when the server rerenders.
  const now = useMemo(() => new Date(nowIso), [nowIso]);

  function onToggleDone(id: string, completedAt: string | null) {
    // Optimistic mark-done is for the dashboard's "open list" — we don't
    // support toggling done items back from the dashboard (the list view
    // owns that). If completedAt is null we just refresh and let the server
    // be authoritative.
    if (completedAt) {
      setFadingIds((prev) => new Set(prev).add(id));
    }
    setPendingIds((prev) => new Set(prev).add(id));
    startTransition(() => {
      applyOptimistic({ id, completedAt });
    });

    void (async () => {
      try {
        const res = await fetch(`/api/assignments/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completedAt }),
        });
        if (!res.ok) throw new Error(`PATCH ${res.status}`);
      } catch (err) {
        // Optimistic state is rolled back by the refresh below; the toast is
        // the only user-facing signal that the mark-done didn't stick.
        toast(humanizeError(err instanceof Error ? err.message : 'save_failed'));
      } finally {
        // Wait for the fade animation to complete, then revalidate.
        setTimeout(() => {
          setFadingIds((prev) => {
            const n = new Set(prev);
            n.delete(id);
            return n;
          });
          setPendingIds((prev) => {
            const n = new Set(prev);
            n.delete(id);
            return n;
          });
          router.refresh();
        }, FADE_MS);
      }
    })();
  }

  const buckets = useMemo(() => {
    const sorted = [...optimistic].sort(compareDueThenEffort());
    return bucketAssignments(sorted, { now, timezone, excludeCompleted: false });
  }, [optimistic, now, timezone]);

  // Open-only display (dashboard hides done). Fading items remain rendered
  // briefly so the transition can play out.
  const openOnly = (items: AssignmentCardData[]) =>
    items.filter((a) => !a.completed_at || fadingIds.has(a.id));

  // When every bucket is empty (no open assignments anywhere) the dashboard is
  // a blank slate — nudge the user toward the add panel above.
  const allEmpty =
    openOnly(buckets.overdue).length === 0 &&
    openOnly(buckets.today).length === 0 &&
    openOnly(buckets.thisWeek).length === 0 &&
    openOnly(buckets.later).length === 0;

  return (
    <div className="space-y-5">
      {buckets.overdue.length > 0 ? (
        <OverdueBanner
          items={openOnly(buckets.overdue)}
          timezone={timezone}
          fadingIds={fadingIds}
          pendingIds={pendingIds}
          onToggleDone={onToggleDone}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
        <BucketColumn
          title="today"
          urgent
          items={buckets.today}
          timezone={timezone}
          fadingIds={fadingIds}
          pendingIds={pendingIds}
          onToggleDone={onToggleDone}
          countLabel={(n) => `${n} due today`}
          emptyLabel="nothing due today 🎉"
        />
        <BucketColumn
          title="this week"
          items={buckets.thisWeek}
          timezone={timezone}
          fadingIds={fadingIds}
          pendingIds={pendingIds}
          onToggleDone={onToggleDone}
          countLabel={(n) => `${n} due this week`}
          emptyLabel="nothing here"
        />
        <BucketColumn
          title="later"
          items={buckets.later}
          timezone={timezone}
          fadingIds={fadingIds}
          pendingIds={pendingIds}
          onToggleDone={onToggleDone}
          countLabel={(n) => `${n} later`}
          emptyLabel="nothing here"
        />
      </div>

      {allEmpty ? (
        <p className="font-display text-xl text-ink-soft">
          nothing yet — add your first deadline above.
        </p>
      ) : null}
    </div>
  );
}

function OverdueBanner({
  items,
  timezone,
  fadingIds,
  pendingIds,
  onToggleDone,
}: {
  items: AssignmentCardData[];
  timezone: string;
  fadingIds: ReadonlySet<string>;
  pendingIds: ReadonlySet<string>;
  onToggleDone: (id: string, completedAt: string | null) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section
      aria-label="Overdue"
      className="rounded-md border border-urgent/60 bg-urgent/5 p-3"
    >
      <header className="mb-2 flex items-baseline justify-between">
        <h2 className="font-display text-2xl font-semibold leading-none text-urgent">overdue</h2>
        <span className="font-mono text-xs text-urgent">{items.length}</span>
      </header>
      <BucketColumn
        title="overdue-list"
        urgent
        flat
        items={items}
        timezone={timezone}
        fadingIds={fadingIds}
        pendingIds={pendingIds}
        onToggleDone={onToggleDone}
        countLabel={(n) => `${n} overdue`}
        emptyLabel="nothing here"
      />
    </section>
  );
}
