// @vitest-environment jsdom
//
// Component test for ApplicationActions (`components/applications/ApplicationActions.tsx`).
// Seams (scout §5): the server actions `@/lib/applications` and `next/navigation`
// are mocked; the component is wrapped in a real <ToastProvider> so failure
// copy actually renders. buildStageChangePatch (@/lib/applicationPatch) and
// humanizeError (@/lib/errorCopy) run REAL — the value is that the exact patch
// (including the terminal→active nextActionAt carry) and the exact human copy
// are pinned end-to-end.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/applications', () => ({
  updateApplication: vi.fn(),
  deleteApplication: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ApplicationActions } from '@/components/applications/ApplicationActions';
import { ToastProvider } from '@/components/ui/Toast';
import { updateApplication, deleteApplication } from '@/lib/applications';
import type { ApplicationCardData } from '@/components/applications/ApplicationCard';

const updateMock = vi.mocked(updateApplication);
const deleteMock = vi.mocked(deleteApplication);

// A rejected (terminal) application that still carries a next action — the
// fixture that exercises the buildStageChangePatch reactivation carry. Note the
// PostgREST `+00:00` offset form, which the patch normalizes to a Z instant.
function rejectedApp(): ApplicationCardData {
  return {
    id: 'app-1',
    company: 'Acme',
    role: 'SWE Intern',
    stage: 'rejected',
    next_action: 'Follow up',
    next_action_at: '2026-08-01T12:00:00+00:00',
    notes: null,
    applied_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
  };
}

function renderActions(app: ApplicationCardData) {
  return render(
    <ToastProvider>
      <ApplicationActions application={app} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  updateMock.mockReset();
  deleteMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('ApplicationActions', () => {
  it('calls updateApplication with the buildStageChangePatch output (terminal→active carries nextActionAt)', async () => {
    updateMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderActions(rejectedApp());

    await user.selectOptions(screen.getByRole('combobox', { name: 'Stage' }), 'applied');

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith('app-1', {
        stage: 'applied',
        // '+00:00' offset normalized to the Z instant the update schema accepts.
        nextActionAt: '2026-08-01T12:00:00.000Z',
      }),
    );
  });

  it('sends a bare {stage} patch for a non-reactivating move (no nextActionAt carry)', async () => {
    updateMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    const app: ApplicationCardData = { ...rejectedApp(), stage: 'applied', next_action_at: null };
    renderActions(app);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Stage' }), 'oa');

    await waitFor(() => expect(updateMock).toHaveBeenCalledWith('app-1', { stage: 'oa' }));
  });

  it('shows friendly toast copy when the action returns ok:false', async () => {
    updateMock.mockResolvedValue({ ok: false, error: 'move_failed' });
    const user = userEvent.setup();
    renderActions(rejectedApp());

    await user.selectOptions(screen.getByRole('combobox', { name: 'Stage' }), 'applied');

    expect(
      await screen.findByText("Couldn't move it — check your connection and try again."),
    ).toBeTruthy();
  });

  it('shows friendly toast copy when the action throws', async () => {
    updateMock.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderActions(rejectedApp());

    await user.selectOptions(screen.getByRole('combobox', { name: 'Stage' }), 'applied');

    expect(
      await screen.findByText("Couldn't move it — check your connection and try again."),
    ).toBeTruthy();
  });

  it('does not call deleteApplication when window.confirm is declined', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderActions(rejectedApp());

    await user.click(screen.getByRole('button', { name: 'Delete application' }));

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
