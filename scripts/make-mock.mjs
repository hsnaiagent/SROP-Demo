/**
 * Derives lib/mock/validate-response.json from a REAL North execution.
 *
 *   npm run mock
 *
 * Reads scripts/out/last-execution.json — whatever the last probe run produced —
 * unwraps the agent envelope, maps snake_case to camelCase, and writes a
 * ValidateResponse. This is the fixture all frontend work runs against, and it is
 * derived rather than hand-written on purpose: a hand-written mock drifts from the
 * live shape, and you find out at hour 11.
 *
 * Re-run it whenever the automation's output changes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, 'scripts', 'out', 'last-execution.json');
const DEST_DIR = path.join(ROOT, 'lib', 'mock');
const DEST = path.join(DEST_DIR, 'validate-response.json');

const RULES = ['HISTORICAL_DEVIATION', 'LIMIT_BREACH', 'ZERO_OR_MISSING', 'UNKNOWN_ENTITY'];
const MAX_FLAGS = 6;

const die = (msg) => {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
};

if (!fs.existsSync(SRC)) die(`${path.relative(ROOT, SRC)} not found — run npm run probe:execute first.`);

const execution = JSON.parse(fs.readFileSync(SRC, 'utf8'));

if (execution.status !== 'completed') {
  die(`that execution is "${execution.status}", not completed — re-run the probe.`);
}

/** Same unwrap order as probe-2-execute.mjs and lib/north.ts. See CHECKLIST G-new-5. */
const unwrap = (o) => {
  if (!o || typeof o !== 'object') return null;
  if (Array.isArray(o.flags)) return o;
  if (o.data && Array.isArray(o.data.flags)) return o.data;
  if (typeof o.text === 'string') {
    try {
      const p = JSON.parse(o.text);
      if (Array.isArray(p.flags)) return p;
    } catch { /* not JSON */ }
  }
  return null;
};

let payload = null;
for (const node of execution.nodes ?? []) {
  payload = unwrap(node.output);
  if (payload) break;
}
if (!payload) die('no node in that execution returned a flags[] array.');

// The backend filters to the four known rule names and caps the list. A fifth
// invented rule name would break the UI's grouping; a runaway list would break
// the "3 of 4 flags open" counter.
const kept = payload.flags.filter((f) => RULES.includes(f.rule)).slice(0, MAX_FLAGS);
const dropped = payload.flags.length - kept.length;

const response = {
  flags: kept.map((f) => ({
    id: f.id,
    source: f.source,
    file: f.file,
    rule: f.rule,
    severity: f.severity,
    field: f.field,
    rowRef: f.row_ref,
    submittedValue: f.submitted_value,
    evidence: f.evidence,
    plainEnglish: f.plain_english,
    status: 'open',
  })),
  cleanSources: payload.clean_sources ?? [],
  summary: payload.summary ?? '',
  emails: {}, // populated once Node 2 (draft_emails) exists
};

fs.mkdirSync(DEST_DIR, { recursive: true });
fs.writeFileSync(DEST, `${JSON.stringify(response, null, 2)}\n`);

console.log(`\n  wrote ${path.relative(ROOT, DEST)}`);
console.log(`  from execution ${execution.id} (${execution.run_time_seconds}s)`);
console.log(`  ${response.flags.length} flags, clean: ${JSON.stringify(response.cleanSources)}`);
if (dropped > 0) console.log(`  dropped ${dropped} flag(s) with unrecognised rule names`);
if (response.flags.length !== 4) {
  console.log(`\n  WARNING: expected 4 flags, got ${response.flags.length}. check_data.py says 4.`);
}
console.log();
