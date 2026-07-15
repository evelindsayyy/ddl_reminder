'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { cn } from '@/lib/utils';
import { CourseChip } from '@/components/ui/CourseChip';
import { TypePill } from '@/components/ui/TypePill';
import { formatDueAt, formatRelative } from '@/lib/format';
import type {
  AssignmentCardData,
  AssignmentEditPatch,
} from '@/components/dashboard/AssignmentCard';

// Variant C — Gantt / swim-lane timeline.
//
// Time math invariants (DST-safe):
//   - Axis position is computed in absolute UTC milliseconds; DST shifts
//     do NOT move chips because we never call Date.getHours/setHours.
//   - Day labels along the axis are formatted in the user's IANA timezone
//     via Intl.DateTimeFormat, which handles DST correctly.

const PAST_BUFFER_DAYS = 3; // visible window for recently-overdue items
const FORWARD_DAYS = 14;
const TOTAL_DAYS = PAST_BUFFER_DAYS + FORWARD_DAYS;
const DAY_MS = 24 * 60 * 60 * 1000;

const LANE_LEFT_PX = 130; // course-label column width
const LANE_PAD_Y = 4;
const CHIP_HEIGHT_PX = 22;
const CHIP_GAP_PX = 2;
const LANE_MIN_HEIGHT_PX = 42;

interface ChipPlacement {
  assignment: AssignmentCardData;
  xPercent: number; // 0..100 along the lane
  stackRow: number; // 0 = top
  past: boolean;
}

interface Lane {
  course: { code: string; name: string | null; color: string };
  placements: ChipPlacement[];
  height: number;
}

export interface SwimLaneTimelineProps {
  assignments: AssignmentCardData[];
  timezone: string;
  // Optional: handler for chip-click edits. Mirrors AssignmentsView's signature.
  onEdit?: (id: string, patch: AssignmentEditPatch) => void;
}

export function SwimLaneTimeline({
  assignments,
  timezone,
  onEdit,
}: SwimLaneTimelineProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { lanes, axisStartMs, axisEndMs, todayPercent, axisLabels } = useMemo(
    () => buildLanes(assignments, timezone),
    [assignments, timezone]
  );

  const selected = selectedId
    ? assignments.find((a) => a.id === selectedId) ?? null
    : null;

  if (lanes.length === 0) {
    return (
      <p className="py-8 text-center font-display text-2xl font-semibold text-ink-faint">
        no open assignments in the next {FORWARD_DAYS} days
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded border border-ink-faint/60 bg-bg">
        {/* axis header */}
        <div className="flex border-b border-ink-faint/60 bg-bg-dim/50">
          <div
            className="shrink-0 border-r border-ink-faint/40 px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink-soft"
            style={{ width: LANE_LEFT_PX }}
          >
            course
          </div>
          <div className="relative flex-1">
            {axisLabels.map((m) => (
              <div
                key={m.iso}
                className="absolute top-0 -translate-x-1/2 px-1 py-2 font-mono text-[10px] text-ink-soft"
                style={{ left: `${m.percent}%` }}
              >
                {m.label}
              </div>
            ))}
            <div className="invisible py-2 font-mono text-[10px]">.</div>
          </div>
        </div>

        {/* lanes */}
        {lanes.map((lane) => (
          <div
            key={lane.course.code}
            className="flex border-b border-ink-faint/30 last:border-b-0"
            style={{ minHeight: lane.height }}
          >
            <div
              className="flex shrink-0 items-center border-r border-ink-faint/30 px-3"
              style={{ width: LANE_LEFT_PX }}
            >
              <CourseChip
                code={lane.course.code}
                color={lane.course.color}
                size="lg"
                title={lane.course.name ?? undefined}
              />
            </div>
            <div
              className="relative flex-1"
              style={{ minHeight: lane.height }}
            >
              {/* faint horizontal "no-data" line for empty lanes */}
              {lane.placements.length === 0 ? (
                <div
                  className="absolute left-2 right-2 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-ink-faint/40"
                  aria-hidden
                />
              ) : null}

              {/* today line */}
              <div
                className="pointer-events-none absolute top-0 bottom-0 border-l-[1.5px] border-dashed border-urgent"
                style={{ left: `${todayPercent}%` }}
                aria-hidden
              />

              {/* chips */}
              {lane.placements.map((p) => {
                const top = LANE_PAD_Y + p.stackRow * (CHIP_HEIGHT_PX + CHIP_GAP_PX);
                return (
                  <button
                    type="button"
                    key={p.assignment.id}
                    onClick={() => setSelectedId(p.assignment.id)}
                    title={tooltipFor(p.assignment, timezone)}
                    className={cn(
                      'absolute truncate rounded-sm border-[1.5px] px-2 text-left text-[13px] leading-none transition-opacity duration-150 hover:z-10 hover:shadow-sm',
                      p.past && 'opacity-60'
                    )}
                    style={{
                      left: `calc(${p.xPercent}% - 4px)`,
                      top,
                      height: CHIP_HEIGHT_PX,
                      lineHeight: `${CHIP_HEIGHT_PX}px`,
                      maxWidth: '40%',
                      background: p.assignment.courses!.color + '40',
                      borderColor: p.assignment.courses!.color,
                    }}
                  >
                    {p.assignment.title}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* legend */}
      <div className="flex items-center gap-4 font-mono text-[11px] text-ink-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-px w-4 border-t-[1.5px] border-dashed border-urgent" />
          today
        </span>
        <span>
          showing next {FORWARD_DAYS} days · click a chip to edit ·{' '}
          {new Date(axisStartMs).toLocaleDateString('en-US', {
            timeZone: timezone,
            month: 'short',
            day: 'numeric',
          })}
          {' – '}
          {new Date(axisEndMs).toLocaleDateString('en-US', {
            timeZone: timezone,
            month: 'short',
            day: 'numeric',
          })}
        </span>
      </div>

      {selected ? (
        <EditPanel
          assignment={selected}
          timezone={timezone}
          onCancel={() => setSelectedId(null)}
          onSave={(patch) => {
            if (onEdit) onEdit(selected.id, patch);
            setSelectedId(null);
          }}
        />
      ) : null}
    </div>
  );
}

// --- helpers ---

function tooltipFor(a: AssignmentCardData, timezone: string): string {
  const lines = [
    a.title,
    `${a.type} · ${formatDueAt(a.due_at, timezone)} (${formatRelative(a.due_at)})`,
  ];
  if (a.estimated_hours) lines.push(`~${a.estimated_hours}h estimated`);
  return lines.join('\n');
}

interface BuildResult {
  lanes: Lane[];
  axisStartMs: number;
  axisEndMs: number;
  todayPercent: number;
  axisLabels: { iso: string; percent: number; label: string }[];
}

function buildLanes(
  assignments: readonly AssignmentCardData[],
  timezone: string
): BuildResult {
  const nowMs = Date.now();
  const axisStartMs = nowMs - PAST_BUFFER_DAYS * DAY_MS;
  const axisEndMs = nowMs + FORWARD_DAYS * DAY_MS;
  const span = axisEndMs - axisStartMs;
  const todayPercent = ((nowMs - axisStartMs) / span) * 100;

  // Group open assignments by course code; only those within [axisStart, axisEnd].
  // Out-of-scope per spec: "completed items" — show open only.
  const groups = new Map<string, Lane>();
  for (const a of assignments) {
    if (a.completed_at) continue;
    if (!a.courses) continue; // SwimLaneTimeline is by-course; skip uncategorized
    const dueMs = new Date(a.due_at).getTime();
    if (dueMs < axisStartMs || dueMs > axisEndMs) continue;
    if (!groups.has(a.courses.code)) {
      groups.set(a.courses.code, {
        course: a.courses,
        placements: [],
        height: LANE_MIN_HEIGHT_PX,
      });
    }
    const lane = groups.get(a.courses.code)!;
    const xPercent = Math.max(0, Math.min(100, ((dueMs - axisStartMs) / span) * 100));
    lane.placements.push({
      assignment: a,
      xPercent,
      stackRow: 0, // assigned next pass
      past: dueMs < nowMs,
    });
  }

  // Resolve overlap stacking per lane: any two chips whose x-positions are
  // within ~4 percentage points (~16h on the 17-day axis) bump down a row.
  const OVERLAP_TOL = 4;
  for (const lane of groups.values()) {
    lane.placements.sort((a, b) => a.xPercent - b.xPercent);
    const rows: number[] = []; // rightmost x in each row
    for (const p of lane.placements) {
      let placed = false;
      for (let r = 0; r < rows.length; r++) {
        if (p.xPercent - rows[r] > OVERLAP_TOL) {
          p.stackRow = r;
          rows[r] = p.xPercent;
          placed = true;
          break;
        }
      }
      if (!placed) {
        p.stackRow = rows.length;
        rows.push(p.xPercent);
      }
    }
    const stacks = Math.max(1, ...lane.placements.map((p) => p.stackRow + 1));
    lane.height = Math.max(
      LANE_MIN_HEIGHT_PX,
      LANE_PAD_Y * 2 + stacks * CHIP_HEIGHT_PX + (stacks - 1) * CHIP_GAP_PX
    );
  }

  // Include lanes for any course present in the dataset (so empty lanes
  // still render as horizontal dashed lines per spec).
  for (const a of assignments) {
    if (a.completed_at) continue;
    if (!a.courses) continue;
    if (!groups.has(a.courses.code)) {
      groups.set(a.courses.code, {
        course: a.courses,
        placements: [],
        height: LANE_MIN_HEIGHT_PX,
      });
    }
  }

  const lanes = Array.from(groups.values()).sort((a, b) =>
    a.course.code.localeCompare(b.course.code)
  );

  // Axis labels every ~3 days, formatted in user's tz.
  const axisLabels: BuildResult['axisLabels'] = [];
  const labelStep = 3;
  for (let d = 0; d <= TOTAL_DAYS; d += labelStep) {
    const ms = axisStartMs + d * DAY_MS;
    const label = new Date(ms).toLocaleDateString('en-US', {
      timeZone: timezone,
      month: 'short',
      day: 'numeric',
    });
    axisLabels.push({
      iso: new Date(ms).toISOString(),
      percent: (d / TOTAL_DAYS) * 100,
      label,
    });
  }

  return { lanes, axisStartMs, axisEndMs, todayPercent, axisLabels };
}

// Inline edit panel reused for chip-click. Same fields as the list view's
// inline editor — kept here to avoid coupling SwimLane to the card.
function EditPanel({
  assignment: a,
  timezone,
  onCancel,
  onSave,
}: {
  assignment: AssignmentCardData;
  timezone: string;
  onCancel: () => void;
  onSave: (patch: { title: string; dueAt: string }) => void;
}) {
  const [title, setTitle] = useState(a.title);
  const [localDt, setLocalDt] = useState(() => {
    const d = new Date(a.due_at);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title: title.trim(), dueAt: new Date(localDt).toISOString() });
  }

  return (
    <form
      onSubmit={submit}
      className="rounded border border-ink-faint/60 bg-bg-soft p-3"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {a.courses ? (
          <CourseChip code={a.courses.code} color={a.courses.color} size="sm" />
        ) : null}
        <TypePill type={a.type as Parameters<typeof TypePill>[0]['type']} />
        <span className="font-mono text-[11px] text-ink-soft">
          {formatDueAt(a.due_at, timezone)} · {formatRelative(a.due_at)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Title"
          className="min-w-[12rem] flex-1 rounded border border-ink-faint px-2 py-1 text-base focus:border-ink focus:outline-none"
        />
        <input
          type="datetime-local"
          value={localDt}
          onChange={(e) => setLocalDt(e.target.value)}
          aria-label="Due date"
          className="rounded border border-ink-faint px-2 py-1 font-mono text-sm focus:border-ink focus:outline-none"
        />
        <button
          type="submit"
          className="rounded bg-ink px-3 py-1 text-xs font-medium text-bg hover:bg-ink-soft"
        >
          save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-ink-faint px-3 py-1 text-xs text-ink-soft hover:border-ink hover:text-ink"
        >
          cancel
        </button>
      </div>
    </form>
  );
}
