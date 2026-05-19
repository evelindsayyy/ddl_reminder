export function formatDueAt(iso: string, timezone = 'America/New_York'): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatRelative(iso: string, now = new Date()): string {
  const target = new Date(iso).getTime();
  const diffMs = target - now.getTime();
  const diffHours = diffMs / 3_600_000;
  const diffDays = diffHours / 24;

  if (diffHours < -24) return `${Math.round(-diffDays)}d overdue`;
  if (diffHours < 0) return `${Math.round(-diffHours)}h overdue`;
  if (diffHours < 1) return `in ${Math.max(1, Math.round(diffMs / 60_000))}m`;
  if (diffHours < 24) return `in ${Math.round(diffHours)}h`;
  if (diffDays < 7) return `in ${Math.round(diffDays)}d`;
  return `in ${Math.round(diffDays / 7)}w`;
}
