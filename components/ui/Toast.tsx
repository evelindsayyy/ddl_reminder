'use client';

// Dependency-free toast system: a context provider + `useToast()` hook + a
// fixed, bottom-anchored `aria-live` region. Async mutation failures surface
// here (paired with `humanizeError` at the call sites); form-validation strings
// stay inline next to their field and never toast.
//
// - Region clears the mobile add bar + nav safe-area
//   (`bottom-[calc(7rem+env(safe-area-inset-bottom))] md:bottom-4`).
// - `role="status"` + `aria-live="polite"` so screen readers announce toasts
//   without interrupting; there is no aria-live precedent elsewhere in the app.
// - Max 3 stacked (oldest is dropped when a 4th arrives).
// - Each toast auto-dismisses after 5s; a manual × button dismisses early.
// - All timeouts are tracked and cleared on unmount (no leaks / no setState on
//   an unmounted tree).
// - Tone styling is token-only (`urgent`/`success`/`bg`/`ink`).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastTone = 'error' | 'success';

export interface ToastOptions {
  tone?: ToastTone;
}

interface ToastRecord {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface ToastContextValue {
  toast: (message: string, opts?: ToastOptions) => void;
}

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 5000;

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const idRef = useRef(0);
  // Ref mirror of `toasts`, kept in lockstep with every state write below. It
  // lets `toast()` compute the next list (dedupe + eviction) OUTSIDE the
  // `setToasts` updater — so no side effect (clearTimeout) ever runs inside a
  // reducer that React double-invokes under StrictMode.
  const toastsRef = useRef<ToastRecord[]>([]);
  // id -> pending auto-dismiss timeout, so we can cancel on manual dismiss,
  // on overflow eviction, and on unmount.
  const timeouts = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimeoutFor = useCallback((id: number) => {
    const handle = timeouts.current.get(id);
    if (handle !== undefined) {
      clearTimeout(handle);
      timeouts.current.delete(id);
    }
  }, []);

  // Single funnel for removals (manual dismiss + auto-dismiss + eviction): keep
  // the ref mirror and React state consistent by driving both from the ref.
  const removeToast = useCallback((id: number) => {
    toastsRef.current = toastsRef.current.filter((t) => t.id !== id);
    setToasts(toastsRef.current);
  }, []);

  const scheduleDismiss = useCallback(
    (id: number) => {
      const handle = setTimeout(() => {
        timeouts.current.delete(id);
        removeToast(id);
      }, AUTO_DISMISS_MS);
      timeouts.current.set(id, handle);
    },
    [removeToast]
  );

  const dismiss = useCallback(
    (id: number) => {
      clearTimeoutFor(id);
      removeToast(id);
    },
    [clearTimeoutFor, removeToast]
  );

  const toast = useCallback(
    (message: string, opts?: ToastOptions) => {
      const tone: ToastTone = opts?.tone ?? 'error';

      // Dedupe: an identical (message + tone) toast already on screen doesn't
      // stack a second node — it just resets its own 5s auto-dismiss timer.
      const existing = toastsRef.current.find(
        (t) => t.message === message && t.tone === tone
      );
      if (existing) {
        clearTimeoutFor(existing.id);
        scheduleDismiss(existing.id);
        return;
      }

      const id = idRef.current++;
      const record: ToastRecord = { id, message, tone };
      // Compute the next list (append + evict overflow) OUTSIDE the updater.
      const next = [...toastsRef.current, record];
      const evicted: ToastRecord[] = [];
      while (next.length > MAX_TOASTS) {
        const gone = next.shift();
        if (gone) evicted.push(gone);
      }
      // Un-schedule evicted toasts here (side effect lives outside setToasts).
      for (const gone of evicted) clearTimeoutFor(gone.id);
      toastsRef.current = next;
      setToasts(next);
      scheduleDismiss(id);
    },
    [clearTimeoutFor, scheduleDismiss]
  );

  // Clear every outstanding timeout when the provider unmounts.
  useEffect(() => {
    const map = timeouts.current;
    return () => {
      for (const handle of map.values()) clearTimeout(handle);
      map.clear();
    };
  }, []);

  // Memoize the context value so consumers don't re-render on every provider
  // render (the value object was previously reconstructed each time).
  const value = useMemo<ToastContextValue>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(7rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 md:bottom-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-md border bg-bg px-3 py-2 text-sm text-ink shadow-md',
              t.tone === 'error' ? 'border-urgent/40' : 'border-success/40'
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 font-mono text-xs leading-5',
                t.tone === 'error' ? 'text-urgent' : 'text-success'
              )}
            >
              {t.tone === 'error' ? '!' : '✓'}
            </span>
            <span className="flex-1 leading-5">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="-mr-1 rounded p-0.5 text-ink-faint hover:text-ink"
            >
              <CloseIcon />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>. Mount it in app/(app)/layout.tsx.');
  }
  return ctx;
}

// Local tiny classnames join — the app's `cn` (lib/utils) pulls in
// tailwind-merge; this file needs only a conditional join, kept dependency-free.
function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M3 3l6 6M9 3l-6 6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
