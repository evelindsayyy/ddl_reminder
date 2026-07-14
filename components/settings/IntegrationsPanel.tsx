'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { formatDueAt } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';
import { humanizeError } from '@/lib/errorCopy';

interface Props {
  appUrl: string;
  timezone: string;
  initialIcsToken: string | null;
  initialCanvasUrl: string | null;
  initialGradescopeToken: string | null;
  canvasLastSyncAt: string | null;
  canvasLastSyncError: string | null;
}

export default function IntegrationsPanel({
  appUrl,
  timezone,
  initialIcsToken,
  initialCanvasUrl,
  initialGradescopeToken,
  canvasLastSyncAt,
  canvasLastSyncError,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [icsToken, setIcsToken] = useState(initialIcsToken);
  const [gradescopeToken, setGradescopeToken] = useState(initialGradescopeToken);
  const [canvasUrl, setCanvasUrl] = useState(initialCanvasUrl ?? '');
  const [canvasMsg, setCanvasMsg] = useState<string | null>(null);
  const [canvasErr, setCanvasErr] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [bookmarkletJs, setBookmarkletJs] = useState<string | null>(null);

  const icsUrl = icsToken ? `${appUrl}/api/ics/${icsToken}` : null;
  const webcal = icsUrl?.replace(/^https?:\/\//, 'webcal://') ?? null;

  async function rotateIcs() {
    if (!confirm('Regenerate calendar URL? Old subscription will stop receiving updates.')) return;
    start(async () => {
      const res = await fetch('/api/ics-token/rotate', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.token) {
        setIcsToken(j.token);
      } else {
        toast(humanizeError(j.error ?? 'rotate_failed'));
      }
      router.refresh();
    });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied.', { tone: 'success' });
    } catch {
      toast(humanizeError('copy_failed'));
    }
  }

  async function saveCanvasUrl(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCanvasMsg(null);
    setCanvasErr(null);
    start(async () => {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvasIcsUrl: canvasUrl || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCanvasErr(j.error ?? `save ${res.status}`);
        return;
      }
      setCanvasMsg('saved.');
      router.refresh();
    });
  }

  async function syncCanvasNow() {
    setSyncMsg(null);
    setCanvasErr(null);
    start(async () => {
      const res = await fetch('/api/canvas/sync', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCanvasErr(j.error ?? `sync ${res.status}`);
        return;
      }
      setSyncMsg(
        `fetched ${j.fetched} · ${j.inserted} new · ${j.updated} updated · ${j.skipped} skipped`
      );
      router.refresh();
    });
  }

  async function generateBookmarklet() {
    setBookmarkletJs(null);
    start(async () => {
      const res = await fetch('/api/bookmarklet');
      if (!res.ok) {
        toast(humanizeError('bookmarklet_failed'));
        return;
      }
      const text = await res.text();
      setBookmarkletJs(text);
      // Always pull the (possibly newly-created) token in.
      const tokenRes = await fetch('/api/gradescope-token');
      if (tokenRes.ok) {
        const { token } = await tokenRes.json();
        setGradescopeToken(token);
      } else {
        toast(humanizeError('bookmarklet_failed'));
      }
    });
  }

  async function rotateGradescope() {
    if (!confirm('Regenerate Gradescope sync token? Old bookmarklet stops working.')) return;
    start(async () => {
      const res = await fetch('/api/gradescope-token/rotate', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.token) {
        setGradescopeToken(j.token);
      } else {
        toast(humanizeError('rotate_failed'));
        return;
      }
      // Also refresh the bookmarklet text to embed the new token.
      const blRes = await fetch('/api/bookmarklet');
      if (blRes.ok) setBookmarkletJs(await blRes.text());
      else toast(humanizeError('rotate_failed'));
    });
  }

  const bookmarkletHref = bookmarkletJs ? `javascript:${encodeURI(bookmarkletJs)}` : null;

  return (
    <div className="space-y-6">
      {/* ----- Apple / Google Calendar feed ----- */}
      <section className="space-y-2">
        <h3 className="font-display text-xl text-ink-soft">calendar feed</h3>
        <p className="text-sm text-ink-soft">
          subscribe in apple calendar / google calendar to see deadlines next to the rest of your week.
        </p>
        {icsUrl ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 truncate rounded border border-ink-faint bg-bg-soft px-2 py-1 font-mono text-[11px] text-ink-soft">
              {webcal}
            </code>
            <button
              type="button"
              onClick={() => webcal && copy(webcal)}
              className="rounded border border-ink-faint px-2 py-1 text-xs hover:border-ink"
            >
              copy
            </button>
            <button
              type="button"
              onClick={rotateIcs}
              disabled={pending}
              className="rounded border border-ink-faint px-2 py-1 text-xs text-urgent hover:border-urgent disabled:opacity-60"
            >
              regenerate
            </button>
          </div>
        ) : (
          <p className="font-mono text-xs text-ink-faint">no token yet — refresh the page to mint one.</p>
        )}
      </section>

      {/* ----- Canvas ----- */}
      <section className="space-y-2">
        <h3 className="font-display text-xl text-ink-soft">canvas import</h3>
        <p className="text-sm text-ink-soft">
          paste your canvas <code className="font-mono">.ics</code> calendar feed url. the daily cron picks
          up new and updated assignments. find it in canvas → calendar → calendar feed.
        </p>
        <form onSubmit={saveCanvasUrl} className="flex flex-wrap items-center gap-2">
          <input
            type="url"
            value={canvasUrl}
            onChange={(e) => setCanvasUrl(e.target.value)}
            placeholder="https://canvas.duke.edu/feeds/calendars/user_…"
            className="min-w-[16rem] flex-1 rounded border border-ink-faint px-2 py-1 font-mono text-xs focus:border-ink focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-ink px-3 py-1 text-xs font-medium text-bg hover:bg-ink-soft disabled:opacity-60"
          >
            save
          </button>
          <button
            type="button"
            onClick={syncCanvasNow}
            disabled={pending || !initialCanvasUrl}
            title={!initialCanvasUrl ? 'save a URL first' : 'pull from canvas now'}
            className="rounded border border-ink-faint px-3 py-1 text-xs hover:border-ink disabled:opacity-60"
          >
            sync now
          </button>
        </form>
        {canvasMsg ? <p className="font-mono text-[11px] text-success">{canvasMsg}</p> : null}
        {syncMsg ? <p className="font-mono text-[11px] text-success">{syncMsg}</p> : null}
        {canvasErr ? <p className="font-mono text-[11px] text-urgent">{canvasErr}</p> : null}
        {/* Persisted last-sync status (survives reloads; set by manual sync + daily cron). */}
        {canvasLastSyncError ? (
          <p className="font-mono text-[11px] text-urgent">
            ⚠ last sync failed
            {canvasLastSyncAt ? ` (${formatDueAt(canvasLastSyncAt, timezone)})` : ''}: {canvasLastSyncError}
          </p>
        ) : canvasLastSyncAt ? (
          <p className="font-mono text-[11px] text-ink-faint">
            last synced {formatDueAt(canvasLastSyncAt, timezone)}
          </p>
        ) : null}
      </section>

      {/* ----- Gradescope bookmarklet ----- */}
      <section className="space-y-2">
        <h3 className="font-display text-xl text-ink-soft">gradescope bookmarklet</h3>
        <p className="text-sm text-ink-soft">
          gradescope has no public API and uses duke sso, so we sync it via a one-click bookmarklet.
          drag the link below to your bookmarks bar, then click it on any gradescope course assignments page.
        </p>
        {bookmarkletHref ? (
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={bookmarkletHref}
              draggable
              onClick={(e) => e.preventDefault()}
              className="rounded border-2 border-ink bg-bg px-3 py-1.5 text-sm font-medium text-ink hover:bg-bg-dim"
            >
              ⤓ Sync to ddl
            </a>
            <button
              type="button"
              onClick={rotateGradescope}
              disabled={pending}
              className="rounded border border-ink-faint px-2 py-1 text-xs text-urgent hover:border-urgent disabled:opacity-60"
            >
              regenerate
            </button>
            <span className="font-mono text-[11px] text-ink-faint">drag → bookmarks bar</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={generateBookmarklet}
            disabled={pending}
            className="rounded border border-ink-faint px-3 py-1 text-xs hover:border-ink disabled:opacity-60"
          >
            generate bookmarklet
          </button>
        )}
        {gradescopeToken ? (
          <p className="font-mono text-[10px] text-ink-faint">
            token suffix: …{gradescopeToken.slice(-8)}
          </p>
        ) : null}
      </section>
    </div>
  );
}
