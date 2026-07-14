// @vitest-environment jsdom
//
// Component test for the toast system (`components/ui/Toast.tsx`). Pins the three
// W3-ledgered improvements made while writing it:
//   1. memoized context value (stable identity across provider renders),
//   2. overflow eviction that clears the evicted toast's timer OUTSIDE the
//      setToasts updater (no ghost dismissal of survivors under StrictMode),
//   3. duplicate (message + tone) dedupe that resets the live toast's 5s timer
//      instead of stacking a second node.
//
// Uses fake timers to drive the 5s auto-dismiss deterministically. Assertions
// are user-visible (rendered text, aria region, node count) — no jest-dom
// matchers (not installed), plain truthy/null checks against RTL queries.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup, fireEvent, within } from '@testing-library/react';
import { ToastProvider, useToast, type ToastContextValue } from '@/components/ui/Toast';

// Capture the live `toast` fn so tests can fire toasts imperatively (more
// flexible than one button per message for the eviction case).
let toastFn: ToastContextValue['toast'];
let renderCount = 0;
function Capture() {
  const ctx = useToast();
  toastFn = ctx.toast;
  renderCount += 1;
  return null;
}

function mount() {
  return render(
    <ToastProvider>
      <Capture />
    </ToastProvider>,
  );
}

function fire(message: string, tone?: 'error' | 'success') {
  act(() => {
    toastFn(message, tone ? { tone } : undefined);
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function region() {
  return screen.getByRole('status');
}

beforeEach(() => {
  vi.useFakeTimers();
  renderCount = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ToastProvider', () => {
  it('renders a role="status" aria-live region', () => {
    mount();
    const r = region();
    expect(r).toBeTruthy();
    expect(r.getAttribute('aria-live')).toBe('polite');
  });

  it('auto-dismisses a toast after 5s', () => {
    mount();
    fire('Alpha');
    expect(screen.queryByText('Alpha')).not.toBeNull();

    advance(4999);
    expect(screen.queryByText('Alpha')).not.toBeNull();

    advance(1); // t = 5000 — timer fires
    expect(screen.queryByText('Alpha')).toBeNull();
  });

  it('caps at 3 toasts, evicting the oldest (its timer cleared, survivors intact)', () => {
    mount();
    fire('Alpha');
    fire('Bravo');
    fire('Charlie');
    fire('Delta'); // 4th → Alpha evicted

    expect(screen.queryByText('Alpha')).toBeNull();
    expect(screen.queryByText('Bravo')).not.toBeNull();
    expect(screen.queryByText('Charlie')).not.toBeNull();
    expect(screen.queryByText('Delta')).not.toBeNull();
    expect(region().children.length).toBe(3);

    // The three survivors still auto-dismiss cleanly on their own 5s timers —
    // proof the eviction only cleared Alpha's timer, not theirs.
    advance(5000);
    expect(region().children.length).toBe(0);
  });

  it('dedupes an identical message+tone: one node, timer reset (visible at 7s, gone by 8s)', () => {
    mount();
    fire('Same', 'error');
    advance(3000);

    fire('Same', 'error'); // re-toast at t=3s → reset, no stacking
    expect(screen.queryAllByText('Same')).toHaveLength(1);

    advance(4000); // t = 7s — original would have dismissed at 5s; reset holds it
    expect(screen.queryAllByText('Same')).toHaveLength(1);

    advance(1000); // t = 8s — reset timer (3s + 5s) fires
    expect(screen.queryByText('Same')).toBeNull();
  });

  it('treats same message with a different tone as distinct (no dedupe)', () => {
    mount();
    fire('Ping', 'error');
    fire('Ping', 'success');
    expect(screen.queryAllByText('Ping')).toHaveLength(2);
  });

  it('manual dismiss removes only its own toast', () => {
    mount();
    fire('Alpha');
    fire('Bravo');

    const alphaToast = screen.getByText('Alpha').closest('div') as HTMLElement;
    const dismiss = within(alphaToast).getByRole('button', { name: 'Dismiss' });
    fireEvent.click(dismiss);

    expect(screen.queryByText('Alpha')).toBeNull();
    expect(screen.queryByText('Bravo')).not.toBeNull();
  });

  it('clears timers on unmount without act warnings or errors', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = mount();
    fire('Alpha');
    unmount();

    // No pending timer should fire against an unmounted tree.
    advance(6000);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('exposes a stable (memoized) context value across provider renders', () => {
    mount();
    const first = toastFn;
    expect(renderCount).toBe(1);

    fire('Alpha'); // provider re-renders (state change) but the value is memoized

    // A fresh value object each render would notify context consumers and
    // re-render Capture (renderCount 2). The memo keeps identity stable, so the
    // consumer is NOT re-rendered and the toast fn is the same reference.
    expect(renderCount).toBe(1);
    expect(toastFn).toBe(first);
  });

  it('throws when useToast is used outside a provider', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Capture />)).toThrow(/ToastProvider/);
    errorSpy.mockRestore();
  });
});
