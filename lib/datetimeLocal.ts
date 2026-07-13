// iso<->datetime-local conversion for nullable timestamps.
// datetime-local values are browser-local WALL TIME; ISO strings are UTC instants.
// Extracted from the inline block in AssignmentCard's EditForm so nullable
// fields (applications.next_action_at) share one tested implementation.

export function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function datetimeLocalToIso(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(v); // interpreted in the browser's local zone
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
