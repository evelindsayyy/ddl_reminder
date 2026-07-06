// Assertion-based unit tests for lib/urlGuard.ts.
// Run: npx tsx lib/urlGuard.test.ts   (exits non-zero on any failure)
//
// The guard protects the server-side Canvas .ics fetch from SSRF. The high-value
// cases are the cloud metadata address (169.254.169.254), loopback, RFC1918
// ranges, and non-HTTPS schemes — each must be rejected — while ordinary public
// Canvas feed URLs must pass.

import { checkFetchableUrl } from './urlGuard';

let passed = 0;
let failed = 0;
function allow(url: string): void {
  const r = checkFetchableUrl(url);
  if (r.ok) passed++;
  else {
    failed++;
    console.error(`  ✗ expected ALLOW, got block(${r.reason}) — ${url}`);
  }
}
function block(url: string, reason?: string): void {
  const r = checkFetchableUrl(url);
  if (!r.ok && (reason === undefined || r.reason === reason)) passed++;
  else {
    failed++;
    const got = r.ok ? 'ALLOW' : `block(${r.reason})`;
    console.error(`  ✗ expected BLOCK${reason ? `(${reason})` : ''}, got ${got} — ${url}`);
  }
}

// ---- allowed: real public Canvas-style feeds ----
allow('https://canvas.duke.edu/feeds/calendars/user_abc123.ics');
allow('https://example.instructure.com/feeds/calendars/user_x.ics');
allow('https://sub.domain.example.com:8443/path?query=1');

// ---- scheme ----
block('http://canvas.duke.edu/feed.ics', 'scheme_not_https');
block('ftp://example.com/feed.ics', 'scheme_not_https');
block('file:///etc/passwd', 'scheme_not_https');
block('gopher://example.com/', 'scheme_not_https');

// ---- credentials ----
block('https://user:pass@example.com/feed.ics', 'credentials_not_allowed');

// ---- cloud metadata + link-local (the headline SSRF target) ----
block('https://169.254.169.254/latest/meta-data/', 'private_ip');
block('https://169.254.170.2/', 'private_ip');

// ---- loopback / private / reserved IPv4 ----
block('https://127.0.0.1/feed.ics', 'private_ip');
block('https://127.1.2.3/', 'private_ip');
block('https://10.0.0.5/', 'private_ip');
block('https://172.16.4.4/', 'private_ip');
block('https://172.31.255.1/', 'private_ip');
block('https://192.168.1.1/', 'private_ip');
block('https://0.0.0.0/', 'private_ip');
block('https://100.64.1.1/', 'private_ip'); // CGNAT
block('https://224.0.0.1/', 'private_ip'); // multicast

// ---- a public IP literal is fine ----
allow('https://8.8.8.8/feed.ics');
allow('https://172.32.0.1/'); // just outside the 172.16/12 private block

// ---- IPv6 ----
block('https://[::1]/feed.ics', 'private_ip'); // loopback
block('https://[fe80::1]/', 'private_ip'); // link-local
block('https://[fc00::1]/', 'private_ip'); // ULA
block('https://[::ffff:127.0.0.1]/', 'private_ip'); // IPv4-mapped loopback
allow('https://[2606:4700:4700::1111]/'); // public (Cloudflare)

// ---- internal names ----
block('https://localhost/feed.ics', 'internal_host');
block('https://db.internal/feed.ics', 'internal_host');
block('https://printer.local/', 'internal_host');

// ---- malformed ----
block('not a url', 'invalid_url');
block('', 'invalid_url');

console.log(`\nurlGuard.test.ts — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
