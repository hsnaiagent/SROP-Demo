/**
 * Block 2.1 — Auth / IAP go-no-go.
 *
 * The single most consequential unknown in the build. GATES.md tested the whole
 * platform through the browser UI and never touched the REST API, so nobody has
 * confirmed a bearer token works from a backend on this instance.
 *
 *   node scripts/probe-1-auth.mjs
 *
 * Outcomes:
 *   200            -> the API is reachable. Proceed to probe 2.
 *   401 + IAP      -> deployment sits behind an Identity-Aware Proxy. Fixable with
 *                     an extra header; see the printed instructions.
 *   401 plain      -> bad or expired token. Re-copy from /developer.
 *   403 / 404      -> token is valid but lacks API scope, or the path is wrong.
 */

import { BASE, HOST, authHeaders, fail, head, info, pass, requireEnv, safe, warn } from './north.mjs';

requireEnv('NORTH_TOKEN');

head(`Probe 2.1 — auth / IAP   ${BASE}/chat`);

const started = Date.now();
let res;
let body = '';

try {
  res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'ping' }],
      stream: false,
      thinking: { type: 'disabled' },
    }),
  });
  body = await res.text();
} catch (err) {
  fail(`Network error: ${err.message}`);
  info('Check NORTH_HOST, VPN, and that the instance is up.');
  process.exit(1);
}

const ms = Date.now() - started;
info(`HTTP ${res.status} in ${ms}ms`);

if (res.ok) {
  let parsed;
  try { parsed = JSON.parse(body); } catch { /* ignore */ }
  pass('Bearer token works against the REST API from a backend.');
  if (parsed?.finish_reason) info(`finish_reason=${parsed.finish_reason}`);
  info('MOCK_MODE stays a fallback, not the architecture. Proceed to probe 2.');
  process.exit(0);
}

const isIap = /IAP|Identity-Aware|JWT signature is invalid/i.test(body);

if (res.status === 401 && isIap) {
  fail('401 — the deployment sits behind an Identity-Aware Proxy.');
  info(safe(body).slice(0, 300));
  console.log(`
  This is the documented IAP case. Two ways forward:

    1. Read  https://private.docs.cohere.com/reference/iap-authentication
       Obtain the IAP token, then add to .env.local:
         NORTH_IAP_HEADER=__Host-GCP_IAP_AUTH_TOKEN_xxx     (exact name from the docs)
         NORTH_IAP_TOKEN=<the IAP token>
       Re-run this probe. north.mjs already forwards both.

    2. Time-box it to 30 minutes. If it is not solved by then, MOCK_MODE becomes
       the architecture:
         - still build the North automation; demo it live in the North builder
           as its own beat, which is honest and works
         - capture its JSON once by hand into lib/mock/validate-response.json
         - the Next app runs entirely on the mock
       That is a survivable demo. Deciding it now is what makes it survivable —
       deciding it on Day 2 at hour 11 is not.
`);
  process.exit(1);
}

if (res.status === 401) {
  fail('401 — token rejected, and it does not look like IAP.');
  info(`Re-copy the token from https://${HOST}/developer -> "Retrieve your token".`);
  info('Check for a trailing newline or quotes in .env.local.');
  info(safe(body).slice(0, 300));
  process.exit(1);
}

if (res.status === 403) {
  fail('403 — token is authenticated but not authorised for this endpoint.');
  info('Likely a permissions scope. See "Managing user permissions" in the docs.');
  info(safe(body).slice(0, 300));
  process.exit(1);
}

fail(`Unexpected HTTP ${res.status}.`);
warn('If this is 404, double-check the /api/v1 prefix — the plan originally wrote /v1.');
info(safe(body).slice(0, 500));
process.exit(1);
