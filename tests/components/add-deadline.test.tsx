// @vitest-environment jsdom
//
// Component test for AddDeadline (`components/assignments/AddDeadline.tsx`) —
// the quick/detailed toggle. Seams (scout §9): global `fetch` + `next/navigation`
// mocked, real <ToastProvider>. Covers: tab switch swaps panels + persists to
// localStorage; a remount honors the stored mode; a detailed submit with an
// empty title shows an inline error and does NOT fetch; a valid detailed submit
// POSTs the QuickAdd-shaped payload; a 500 surfaces friendly toast copy.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
  useSearchParams: () => ({ get: () => null }),
}));

import { AddDeadline } from '@/components/assignments/AddDeadline';
import { ToastProvider } from '@/components/ui/Toast';

const COURSES = [{ code: 'STA 240', name: 'Data Science', color: '#3366ff' }];

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

// Node 22's built-in localStorage shadows jsdom's here and is non-functional
// (no .clear). Install a small Map-backed store so the persistence assertions
// exercise the real read/write path AddDeadline uses.
function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => {
      map.clear();
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

function mount() {
  return render(
    <ToastProvider>
      <AddDeadline courses={COURSES} timezone="America/New_York" />
    </ToastProvider>,
  );
}

beforeEach(() => {
  refreshMock.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('localStorage', makeStorage());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AddDeadline', () => {
  it('defaults to the quick tab (QuickAdd shown, detailed form hidden)', () => {
    mount();
    expect(screen.getByPlaceholderText(/STA 240 HW5/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'save deadline' })).toBeNull();
  });

  it('switches to the detailed panel and persists the choice to localStorage', () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'detailed' }));

    // Detailed form now visible; QuickAdd textarea gone.
    expect(screen.getByRole('button', { name: 'save deadline' })).toBeTruthy();
    expect(screen.queryByPlaceholderText(/STA 240 HW5/)).toBeNull();
    expect(window.localStorage.getItem('ddl:add-mode')).toBe('detailed');
  });

  it('honors the stored mode on a fresh remount', () => {
    window.localStorage.setItem('ddl:add-mode', 'detailed');
    mount();
    // The mount effect reads localStorage and lands on the detailed tab.
    expect(screen.getByRole('button', { name: 'save deadline' })).toBeTruthy();
    expect(screen.queryByPlaceholderText(/STA 240 HW5/)).toBeNull();
  });

  it('shows an inline error and does NOT fetch when the title is empty', () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'detailed' }));
    fireEvent.click(screen.getByRole('button', { name: 'save deadline' }));

    expect(screen.getByText('Give it a title.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the QuickAdd-shaped payload on a valid detailed submit', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'a1' }));
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'detailed' }));

    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'Read ch 4' } });
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-04-28' } });
    fireEvent.change(screen.getByLabelText('Due time'), { target: { value: '23:59' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'save deadline' }));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/assignments');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      courseCode: null,
      title: 'Read ch 4',
      type: 'homework',
      tags: [],
    });
    expect(typeof body.dueAt).toBe('string');
    expect(body.dueAt.endsWith('Z')).toBe(true);
    expect(refreshMock).toHaveBeenCalled();
  });

  it('toasts friendly copy when the detailed save fails (500)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'save_failed' }, false, 500));
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'detailed' }));

    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'Read ch 4' } });
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-04-28' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'save deadline' }));
    });

    expect(
      screen.getByText("Couldn't save your changes — check your connection and try again."),
    ).toBeTruthy();
  });
});
