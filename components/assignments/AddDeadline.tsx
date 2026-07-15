'use client';

// The add-deadline panel: a quick/detailed toggle over two entry modes. The
// "quick line" tab is the existing QuickAdd (natural-language line, unchanged);
// the "detailed" tab is DetailedAddForm (labeled fields). Both POST the same
// /api/assignments payload. The chosen tab persists in localStorage
// (`ddl:add-mode`, default 'quick') via the safe read/write pattern from
// lib/theme.ts + ThemeToggle (guarded for window + try/catch, since
// localStorage throws in private mode / on quota).

import { useEffect, useState } from 'react';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import QuickAdd from '@/components/assignments/QuickAdd';
import { DetailedAddForm } from '@/components/assignments/DetailedAddForm';

export interface AddDeadlineCourse {
  code: string;
  name: string | null;
  color: string;
}

export interface AddDeadlineProps {
  courses: AddDeadlineCourse[];
  timezone: string;
  semesterEndDate?: string | null;
}

type AddMode = 'quick' | 'detailed';

const ADD_MODE_KEY = 'ddl:add-mode';
const PANEL_ID = 'add-deadline-panel';

// Coerce a raw localStorage read (possibly null / stale) to a valid mode,
// defaulting to 'quick'. Mirrors lib/theme.ts's readStoredPreference.
function readStoredMode(raw: string | null | undefined): AddMode {
  return raw === 'detailed' ? 'detailed' : 'quick';
}

export function AddDeadline({ courses, timezone, semesterEndDate = null }: AddDeadlineProps) {
  // Default 'quick' for the server render / first paint; the stored choice is
  // read on mount (below) to stay hydration-safe.
  const [mode, setMode] = useState<AddMode>('quick');

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot sync of the persisted tab choice from localStorage on mount; runs once (empty deps), a deliberate external-store → state read, not a render loop.
      setMode(readStoredMode(window.localStorage.getItem(ADD_MODE_KEY)));
    } catch {
      // localStorage can throw (private mode / quota) — keep the default.
    }
  }, []);

  function onChange(next: AddMode) {
    setMode(next);
    try {
      window.localStorage.setItem(ADD_MODE_KEY, next);
    } catch {
      // Ignore write failures (private mode / quota) — state still updates.
    }
  }

  return (
    <section className="rounded-lg border border-ink-faint/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl text-ink-soft">add a deadline</h2>
        <SegmentedControl<AddMode>
          label="Add mode"
          controls={PANEL_ID}
          options={[
            { value: 'quick', label: 'quick line' },
            { value: 'detailed', label: 'detailed' },
          ]}
          value={mode}
          onChange={onChange}
        />
      </div>

      <div id={PANEL_ID} role="tabpanel" aria-labelledby={`${PANEL_ID}-${mode}`}>
        {mode === 'quick' ? (
          <QuickAdd
            timezone={timezone}
            knownCourses={courses}
            semesterEndDate={semesterEndDate}
          />
        ) : (
          <DetailedAddForm courses={courses} timezone={timezone} />
        )}
      </div>
    </section>
  );
}
