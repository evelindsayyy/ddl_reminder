'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatDueAt, formatRelative } from '@/lib/format';
import { toDisplayStage, type ApplicationCardData, type DisplayStage } from './ApplicationCard';

export interface PipelineFunnelProps {
  applications: ApplicationCardData[];
  timezone: string;
}

const STAGE_ORDER: DisplayStage[] = ['applied', 'interview', 'offer', 'rejected'];
const STAGE_TINT: Record<DisplayStage, string> = {
  applied: 'bg-stage-applied',
  interview: 'bg-stage-interview',
  offer: 'bg-stage-offer',
  rejected: 'bg-stage-rejected',
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function PipelineFunnel({ applications, timezone }: PipelineFunnelProps) {
  // Memoized so its identity is stable across renders — the responseRateText
  // useMemo below depends on it, and an object rebuilt every render would make
  // that memo (and any future consumer) recompute needlessly.
  const counts: Record<DisplayStage, number> = useMemo(() => {
    const tally: Record<DisplayStage, number> = {
      applied: 0,
      interview: 0,
      offer: 0,
      rejected: 0,
    };
    for (const a of applications) {
      tally[toDisplayStage(a.stage)] += 1;
    }
    return tally;
  }, [applications]);
  const total = applications.length;
  const max = Math.max(1, ...Object.values(counts));

  const thisWeek = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- intentional wall-clock read: `now` bounds the display-only "this week" filter; recomputed when applications change to stay fresh. The result is derived data, never state or an effect input.
    const now = Date.now();
    return applications
      .filter(
        (a) =>
          a.next_action_at !== null &&
          new Date(a.next_action_at).getTime() >= now &&
          new Date(a.next_action_at).getTime() <= now + 7 * DAY_MS
      )
      .sort(
        (a, b) =>
          new Date(a.next_action_at as string).getTime() -
          new Date(b.next_action_at as string).getTime()
      );
  }, [applications]);

  const responseRateText = useMemo(() => {
    const numerator = counts.interview + counts.offer;
    const denominator = counts.applied + counts.interview + counts.offer + counts.rejected;
    if (denominator === 0) return { rate: '—', detail: 'no applications yet' };
    const rate = Math.round((numerator / denominator) * 100);
    return {
      rate: `${rate}%`,
      detail: `${numerator} of ${denominator} got past applied`,
    };
  }, [counts]);

  const decisionDue = useMemo(() => {
    return applications
      .filter((a) => toDisplayStage(a.stage) === 'offer' && a.next_action_at)
      .sort(
        (a, b) =>
          new Date(a.next_action_at as string).getTime() -
          new Date(b.next_action_at as string).getTime()
      )[0];
  }, [applications]);

  if (total === 0) {
    return (
      <p className="py-8 text-center font-display text-2xl font-semibold text-ink-faint">
        no applications yet — add one above
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 font-display text-xl text-ink-soft">pipeline</h3>
        <div className="flex h-44 items-end gap-3 border-b border-ink-faint/60 pb-1">
          {STAGE_ORDER.map((s) => {
            const v = counts[s];
            const h = (v / max) * 100;
            return (
              <div key={s} className="flex flex-1 flex-col items-center gap-1">
                <div className="font-mono text-sm">{v}</div>
                <div
                  className={cn('w-3/4 border border-ink/60', STAGE_TINT[s])}
                  style={{ height: `${Math.max(4, h)}%` }}
                />
                <div className="text-xs">{s}</div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <article className="rounded border border-ink-faint/40 bg-bg-soft p-3">
          <h4 className="mb-1 font-display text-xl text-urgent">this week</h4>
          {thisWeek.length === 0 ? (
            <p className="font-mono text-xs text-ink-faint">nothing scheduled</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {thisWeek.map((a) => (
                <li key={a.id} className="leading-snug">
                  <span className="font-medium">{a.company}</span>
                  {a.next_action ? (
                    <span className="text-ink-soft"> · {a.next_action}</span>
                  ) : null}
                  <div className="font-mono text-xs text-ink-faint">
                    {formatDueAt(a.next_action_at as string, timezone)} · {formatRelative(a.next_action_at as string)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded border border-ink-faint/40 bg-bg-soft p-3">
          <h4 className="mb-1 font-display text-xl">response rate</h4>
          <div className="font-mono text-2xl font-semibold">{responseRateText.rate}</div>
          <div className="font-mono text-xs text-ink-faint">{responseRateText.detail}</div>
        </article>

        <article className="rounded border border-ink-faint/40 bg-bg-soft p-3">
          <h4 className="mb-1 font-display text-xl">decision due</h4>
          {decisionDue ? (
            <>
              <div className="font-mono text-sm font-medium">{decisionDue.company}</div>
              <div className="font-mono text-xs text-urgent">
                {formatDueAt(decisionDue.next_action_at as string, timezone)} ·{' '}
                {formatRelative(decisionDue.next_action_at as string)}
              </div>
            </>
          ) : (
            <p className="font-mono text-xs text-ink-faint">no offers waiting</p>
          )}
        </article>
      </div>
    </div>
  );
}
