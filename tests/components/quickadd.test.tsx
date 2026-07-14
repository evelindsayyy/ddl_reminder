// @vitest-environment jsdom
//
// Component test for QuickAdd (`components/assignments/QuickAdd.tsx`). Seams
// (scout §4): global `fetch` and `next/navigation` are mocked; the component is
// wrapped in a real <ToastProvider>. Fake timers drive the 300ms parse debounce.
// The distinction under test is the parse/save error split: PARSE failures stay
// inline (banner, no toast); SAVE failures toast via humanizeError.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
  useSearchParams: () => ({ get: () => null }),
}));

import QuickAdd from '@/components/assignments/QuickAdd';
import { ToastProvider } from '@/components/ui/Toast';

const DEBOUNCE_MS = 300;

// A parse preview with a due date (so Save is enabled) and no recurrence.
const PREVIEW = {
  courseCode: 'STA 240',
  title: 'HW5',
  type: 'homework',
  dueAt: '2026-04-28T23:59:00.000Z',
  tags: [],
  confidence: 0.9,
  recurrence: null,
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function mountQuickAdd() {
  return render(
    <ToastProvider>
      <QuickAdd timezone="America/New_York" />
    </ToastProvider>,
  );
}

function getTextarea() {
  return screen.getByPlaceholderText(/STA 240 HW5/) as HTMLTextAreaElement;
}

// Type a whole value in one input event, then let the 300ms debounce elapse and
// flush the parse fetch's promise chain (act awaits microtasks).
async function typeAndParse(value: string) {
  fireEvent.change(getTextarea(), { target: { value } });
  await act(async () => {
    vi.advanceTimersByTime(DEBOUNCE_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  refreshMock.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('QuickAdd', () => {
  it('fires a debounced POST to /api/parse with the typed input', async () => {
    fetchMock.mockResolvedValue(jsonResponse(PREVIEW));
    mountQuickAdd();

    fireEvent.change(getTextarea(), { target: { value: 'STA 240 HW5 due Friday' } });
    // Nothing before the debounce elapses.
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/parse');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ input: 'STA 240 HW5 due Friday' });

    // Preview rendered from the response.
    expect(screen.getByText('HW5')).toBeTruthy();
  });

  it('clears the input after a successful save', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/parse') return Promise.resolve(jsonResponse(PREVIEW));
      if (url === '/api/assignments') return Promise.resolve(jsonResponse({ id: 'a1' }));
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    mountQuickAdd();
    await typeAndParse('STA 240 HW5 due Friday');
    expect(getTextarea().value).toBe('STA 240 HW5 due Friday');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/assignments', expect.objectContaining({ method: 'POST' }));
    expect(getTextarea().value).toBe('');
    expect(refreshMock).toHaveBeenCalled();
  });

  it('toasts friendly copy when the save request fails (500)', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/parse') return Promise.resolve(jsonResponse(PREVIEW));
      if (url === '/api/assignments')
        return Promise.resolve(jsonResponse({ error: 'save_failed' }, false, 500));
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    mountQuickAdd();
    await typeAndParse('STA 240 HW5 due Friday');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(
      screen.getByText("Couldn't save your changes — check your connection and try again."),
    ).toBeTruthy();
    // Input is NOT cleared on failure.
    expect(getTextarea().value).toBe('STA 240 HW5 due Friday');
  });

  it('keeps parse failures inline (banner shown, no toast)', async () => {
    fetchMock.mockResolvedValue(jsonResponse('bad request', false, 400));
    mountQuickAdd();
    await typeAndParse('nonsense');

    // Inline banner carries the raw parse error…
    expect(screen.getByText(/parse 400/)).toBeTruthy();
    // …and NOTHING landed in the toast region (parse errors never toast).
    expect(screen.getByRole('status').children.length).toBe(0);
  });
});
