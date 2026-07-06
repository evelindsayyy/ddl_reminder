// SSRF guard for user-supplied URLs the server fetches (currently the Canvas
// .ics feed URL, fetched by the daily cron and the manual "Sync now" route with
// the service-role client and full server network access).
//
// This is a pure, string-level check: it rejects non-HTTPS schemes, embedded
// credentials, and hosts that are IP literals in private / loopback /
// link-local / reserved ranges (including the cloud metadata address
// 169.254.169.254) or obvious internal names (localhost, *.local, *.internal).
// It cannot catch a public hostname that later resolves to a private IP
// (DNS rebinding) — the fetch caller pairs it with `redirect: 'error'` so a
// redirect to an internal target can't be silently followed. Good enough for a
// single-tenant personal tool; revisit with DNS-resolution checks if this ever
// goes multi-user.

export type UrlCheck = { ok: true } | { ok: false; reason: string };

const BLOCKED_HOST_SUFFIXES = ['.local', '.internal', '.lan', '.home', '.corp', '.localhost'];
const BLOCKED_HOST_EXACT = ['localhost'];

/** Parse a dotted-quad IPv4 string into four octets, or null if not IPv4. */
function parseIpv4(host: string): [number, number, number, number] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets as [number, number, number, number];
}

/** True if an IPv4 address falls in a private / loopback / reserved range. */
function isPrivateIpv4(octets: [number, number, number, number]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 + 192.0.2.0/24 test
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18.0.0/15
  if (a === 198 && b === 51) return true; // 198.51.100.0/24 test
  if (a === 203 && b === 0) return true; // 203.0.113.0/24 test
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false;
}

/** True if an IPv6 literal (already stripped of brackets) is non-public. */
function isBlockedIpv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === '::1' || h === '::') return true; // loopback / unspecified
  // IPv4-mapped/compat in dotted form (::ffff:127.0.0.1, ::127.0.0.1).
  const mappedDotted = h.match(/^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mappedDotted) {
    const v4 = parseIpv4(mappedDotted[1]);
    return v4 ? isPrivateIpv4(v4) : true;
  }
  // IPv4-mapped in hex form — the WHATWG URL parser normalizes
  // ::ffff:127.0.0.1 to ::ffff:7f00:1. Decode the trailing 32 bits.
  const mappedHex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    const v4: [number, number, number, number] = [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];
    return isPrivateIpv4(v4);
  }
  if (h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb')) {
    return true; // fe80::/10 link-local
  }
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // fc00::/7 ULA
  if (h.startsWith('ff')) return true; // ff00::/8 multicast
  return false;
}

/**
 * Validate a user-supplied URL before the server fetches it.
 * HTTPS only; no credentials; host must not be an internal name or a
 * private/reserved IP literal.
 */
export function checkFetchableUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'scheme_not_https' };
  if (url.username || url.password) return { ok: false, reason: 'credentials_not_allowed' };

  // URL keeps IPv6 hosts in brackets; strip them for classification.
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) return { ok: false, reason: 'empty_host' };

  if (BLOCKED_HOST_EXACT.includes(host)) return { ok: false, reason: 'internal_host' };
  if (BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: 'internal_host' };
  }

  const v4 = parseIpv4(host);
  if (v4) {
    return isPrivateIpv4(v4) ? { ok: false, reason: 'private_ip' } : { ok: true };
  }
  if (host.includes(':')) {
    return isBlockedIpv6(host) ? { ok: false, reason: 'private_ip' } : { ok: true };
  }
  return { ok: true };
}
