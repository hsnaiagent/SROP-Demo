/**
 * Block 2.2 + 2.3 + 2.4 — one run answers all three.
 *
 *   2.2  Does an LLM node's Structured output land in nodes[].output as a parsed
 *        object matching the JSON schema?
 *   2.3  Can one node read runtime-uploaded files (@submissions) AND the
 *        srop-ref library at the same time? GATES.md G7 only proved the library.
 *   2.4  Does the whole run finish under 90 seconds?
 *
 *   node scripts/probe-2-execute.mjs
 *
 * Needs NORTH_TOKEN and NORTH_AUTOMATION_ID. See PROBE-AUTOMATION.md for the
 * throwaway automation to point this at.
 *
 * Writes the raw execution to scripts/out/last-execution.json — that file is the
 * seed for lib/mock/validate-response.json and for typing lib/types.ts against
 * reality instead of against the schema you hoped for.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  BASE, DATA, ROOT, authHeaders, fail, head, info, pass, requireEnv, safe, sleep, truncate, warn,
} from './north.mjs';

requireEnv('NORTH_TOKEN', 'NORTH_AUTOMATION_ID');

const AUTOMATION_ID = process.env.NORTH_AUTOMATION_ID;
const SUBMISSIONS = ['sub_demand.csv', 'sub_prices.csv', 'sub_inv_yanbu.csv', 'sub_inv_jazan.csv'];
const REFERENCES = ['ref_limits.csv', 'history_baseline.csv'];
const SOURCE_LABEL = 'OSPAS demand + Demand Planning prices + Yanbu/Jazan inventory';
const RULES = ['HISTORICAL_DEVIATION', 'LIMIT_BREACH', 'ZERO_OR_MISSING', 'UNKNOWN_ENTITY'];
const POLL_MS = 2000;
const TARGET_MS = 90_000;
// Overridable: a slow instance shouldn't force a blind re-run. `PROBE_TIMEOUT_MS=300000 npm run probe:execute`
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 180_000);

// `--execution <id>` re-attaches to an execution that is already running or has
// already finished, skipping upload + execute. Use this instead of paying another
// full run when a poll timed out — the work carries on server-side regardless.
const argv = process.argv.slice(2);
const flagIdx = argv.findIndex((a) => a === '--execution' || a.startsWith('--execution='));
const RESUME_ID = flagIdx === -1 ? null
  : (argv[flagIdx].includes('=') ? argv[flagIdx].split('=')[1] : argv[flagIdx + 1]);

const outDir = path.join(ROOT, 'scripts', 'out');
fs.mkdirSync(outDir, { recursive: true });

let failures = 0;
const bad = (m) => { fail(m); failures++; };

// ------------------------------------------------------------- 1. inline CSVs
// No uploads, no data interpreter. Three runs through the agentic DI loop gave
// three different wrong answers at temperature 0 — a merge artifact inventing
// NaN flags, then a cross-plant limit lookup, then three missed defects. The
// loop was writing different pandas each time. Handing the model the rows as
// text removes the whole class of bug: it cannot misjoin what it never joins.
// ~6 KB total, against the 172k input tokens the loop was burning.
head(RESUME_ID ? `1/4  Skipped — re-attaching to execution ${RESUME_ID}` : '1/4  Inline the CSVs as text');

const readCsv = (name) => {
  const abs = path.join(DATA, name);
  if (!fs.existsSync(abs)) {
    bad(`${name} not found in data/ — run scripts/generate_data.py first`);
    process.exit(1);
  }
  return fs.readFileSync(abs, 'utf8').trim();
};

/** One marker per file so the model can attribute a row to its source. */
const bundle = (names) => names
  .map((n) => `=== FILE: ${n} ===\n${readCsv(n)}`)
  .join('\n\n');

let submissionsText = '';
let referenceText = '';

if (!RESUME_ID) {
  submissionsText = bundle(SUBMISSIONS);
  referenceText = bundle(REFERENCES);
  for (const n of [...SUBMISSIONS, ...REFERENCES]) {
    const rows = readCsv(n).split('\n').length - 1;
    info(`${n.padEnd(22)} ${rows} rows`);
  }
  const kb = (s) => (Buffer.byteLength(s, 'utf8') / 1024).toFixed(1);
  pass(`inlined ${SUBMISSIONS.length + REFERENCES.length} files — submissions ${kb(submissionsText)} KB, reference ${kb(referenceText)} KB`);
}

// --------------------------------------------------------------- 2. execute
head(RESUME_ID ? '2/4  Skipped — execution already exists' : '2/4  Execute the published automation');

// The `inputs` map is keyed by input_id, and input_id is NOT the name you typed
// in the builder — it is a generated id (the docs' own example pairs
// input_id "param-001" with name "Ticket Text"). Sending the display name gets
// you a 400 AUTOMATION_MISSING_REQUIRED_INPUTS listing that very name, which
// reads exactly like the input does not exist. Resolve name -> input_id first.
const autoRes = await fetch(`${BASE}/automations/${AUTOMATION_ID}`, { headers: authHeaders() });
const autoText = await autoRes.text();
if (!autoRes.ok) {
  bad(`get automation -> HTTP ${autoRes.status}`);
  info(safe(autoText).slice(0, 400));
  info('404 here means the id in NORTH_AUTOMATION_ID is wrong.');
  process.exit(1);
}
const automation = JSON.parse(autoText);
const params = automation.input_parameters ?? [];
if (params.length === 0) {
  bad('automation reports no input_parameters — was it published with its inputs?');
  process.exit(1);
}

const idByName = new Map(params.map((p) => [p.name, p.input_id]));
for (const p of params) {
  info(`input "${p.name}"  input_id=${p.input_id}  type=${p.input_type}  required=${p.required}`);
}

const resolve = (name) => {
  const id = idByName.get(name);
  if (!id) {
    bad(`no input named "${name}" on the published automation`);
    info(`available: ${[...idByName.keys()].join(', ') || '(none)'}`);
    process.exit(1);
  }
  return id;
};

// inputs is a map of input_id -> TYPED WRAPPER {type, value}. All three are text
// now; no file variant, no upload, nothing to wait on.
const payload = {
  inputs: {
    [resolve('submissions_text')]: { type: 'text', value: submissionsText },
    [resolve('reference_text')]: { type: 'text', value: referenceText },
    [resolve('source_label')]: { type: 'text', value: SOURCE_LABEL },
  },
};
info(`POST ${BASE}/automations/${AUTOMATION_ID}/execute`);

const t0 = Date.now();
const execRes = RESUME_ID
  ? { ok: true, status: 200, text: async () => JSON.stringify({ id: RESUME_ID, status: 'running' }) }
  : await fetch(`${BASE}/automations/${AUTOMATION_ID}/execute`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
const execText = await execRes.text();

if (!execRes.ok) {
  bad(`execute -> HTTP ${execRes.status}`);
  info(safe(execText).slice(0, 600));
  if (execRes.status === 404) {
    info('404 usually means the automation id is wrong OR it was never published.');
    info('/execute only runs the live PUBLISHED version.');
  }
  if (execRes.status === 400 || execRes.status === 422) {
    info('The inputs map did not match the automation\'s input panel.');
    info('Keys must be input_id values (printed above), never the display names.');
  }
  process.exit(1);
}

const execution = JSON.parse(execText);
pass(`execution id ${execution.id}  status=${execution.status}`);

// ------------------------------------------------------------------ 3. poll
head('3/4  Poll to completion');

const TERMINAL = ['completed', 'failed', 'cancelled'];
let final = execution;

while (!TERMINAL.includes(final.status)) {
  if (Date.now() - t0 > TIMEOUT_MS) {
    bad(`still ${final.status} after ${Math.round(TIMEOUT_MS / 1000)}s — giving up`);
    break;
  }
  await sleep(POLL_MS);
  const r = await fetch(
    `${BASE}/automations/executions/${execution.id}?include_nodes=true`,
    { headers: authHeaders() }
  );
  if (!r.ok) {
    bad(`poll -> HTTP ${r.status}`);
    info(safe(await r.text()).slice(0, 400));
    break;
  }
  final = JSON.parse(await r.text());
  process.stdout.write(`\r        ${((Date.now() - t0) / 1000).toFixed(0)}s  status=${final.status}   `);
}
process.stdout.write('\n');

// Prefer the server's own clock — it is the honest number, it survives a resumed
// poll, and it excludes our upload time. Fall back to the wall clock.
const serverMs = (final.queued_at && final.ended_at)
  ? Date.parse(final.ended_at) - Date.parse(final.queued_at)
  : null;
const elapsed = serverMs ?? (Date.now() - t0);
if (serverMs != null) {
  info(`server-side queued->ended: ${(serverMs / 1000).toFixed(1)}s  (run_time_seconds=${final.run_time_seconds})`);
}
fs.writeFileSync(
  path.join(outDir, 'last-execution.json'),
  JSON.stringify(final, null, 2)
);
info(`raw execution saved to scripts/out/last-execution.json`);

if (final.status !== 'completed') {
  bad(`final status = ${final.status}`);
  if (final.nodes) {
    for (const n of final.nodes) {
      if (n.error) info(`node ${n.node_id} error: ${truncate(n.error, 400)}`);
    }
  }
}

// ------------------------------------------------------------- 4. assertions
head('4/4  Verdict');

// --- 2.4 wall time ---
if (elapsed <= TARGET_MS) {
  pass(`2.4  wall time ${(elapsed / 1000).toFixed(1)}s (target <90s) — keep Node 2`);
} else {
  bad(`2.4  wall time ${(elapsed / 1000).toFixed(1)}s exceeds the 90s target`);
  info('Kill switch: cut Node 2 and hardcode the email templates from the flag fields.');
  info('A 90s spinner on stage is dead air. Nobody can tell the emails were templated.');
}

if (!final.nodes || final.nodes.length === 0) {
  bad('no nodes[] in the response — did you pass include_nodes=true? (this script does)');
  info('If nodes is genuinely empty, fall back to GET /automations/executions/{id}/nodes/{selector}');
  process.exit(1);
}

info(`nodes returned: ${final.nodes.map((n) => n.node_id).join(', ')}`);
info('^ these node_id values are what /api/validate keys on. Write them down.');

// --- 2.2 structured output ---
// A node's output is NOT the bare schema object. Even an LLM node comes back in
// the agent envelope: { kind:'agent', rendered_prompt, text, data, chat_response,
// error }. The structured payload lands in `.data`; `.text` is the same JSON as a
// raw string. Unwrap before asserting, and keep the bare-object case for the day
// the platform changes its mind.
const unwrap = (o) => {
  if (!o || typeof o !== 'object') return null;
  if (Array.isArray(o.flags)) return o;                    // bare schema object
  if (o.data && Array.isArray(o.data.flags)) return o.data; // agent envelope
  if (typeof o.text === 'string') {                         // last resort
    try {
      const p = JSON.parse(o.text);
      if (Array.isArray(p.flags)) return p;
    } catch { /* not JSON */ }
  }
  return null;
};

let structured = null;
const withFlags = final.nodes.find((n) => (structured = unwrap(n.output)));

if (withFlags) {
  const shape = Array.isArray(withFlags.output.flags) ? 'bare object'
    : withFlags.output.data && Array.isArray(withFlags.output.data.flags) ? `envelope kind=${withFlags.output.kind} -> output.data`
      : 'parsed from output.text';
  info(`structured payload found at: ${shape}`);
}

if (final.status !== 'completed') {
  // Nothing below is meaningful on a half-finished run, and every assertion would
  // fire a misleading FAIL. Say so once and stop.
  bad(`2.2 / 2.3  not assessable — execution is still "${final.status}"`);
  info(`Re-attach without paying for another run:`);
  info(`  node scripts/probe-2-execute.mjs --execution ${final.id}`);
  info(`Or give it longer:  PROBE_TIMEOUT_MS=360000 npm run probe:execute`);
} else if (!withFlags) {
  bad('2.2  no node returned an object with a flags[] array');
  const shapes = final.nodes.map((n) => `${n.node_id} [${n.status ?? '?'}]: ${
    n.output == null ? `no output yet (${n.output === undefined ? 'undefined' : 'null'})`
      : typeof n.output === 'string' ? `STRING (${n.output.length} chars)`
      : `object keys=[${Object.keys(n.output).join(', ')}]`
  }`);
  shapes.forEach((s) => info(s));
  info('');
  info('If a node returned a STRING, structured output was not honoured. Kill switch:');
  info('  "return only JSON, no prose" + JSON.parse with a repair pass in the route handler.');
} else {
  pass(`2.2  node "${withFlags.node_id}" returned a PARSED OBJECT with flags[] — no JSON.parse needed`);

  const flags = structured.flags;
  const clean = structured.clean_sources ?? [];
  info(`flags=${flags.length}  clean_sources=${JSON.stringify(clean)}`);

  if (flags.length === 4) {
    pass(`2.3  exactly 4 flags — matches check_data.py`);
  } else {
    bad(`2.3  ${flags.length} flags, expected 4`);
    info('More than 4: the model invented a rule, or your data grew a fifth anomaly.');
    info('Fewer than 4: it missed one, or it could not read the library reference files.');
  }

  const seen = flags.map((f) => f.rule);
  for (const rule of RULES) {
    if (seen.includes(rule)) pass(`     ${rule}`);
    else bad(`     ${rule} MISSING`);
  }
  const unknown = seen.filter((r) => !RULES.includes(r));
  if (unknown.length) bad(`     invented rule name(s): ${unknown.join(', ')}`);

  // The +64% flag can only exist if the node read history_baseline.csv from the
  // library AND sub_demand.csv from the upload. That is exactly gate 2.3.
  const dev = flags.find((f) => f.rule === 'HISTORICAL_DEVIATION');
  if (dev) {
    const ev = String(dev.evidence ?? '');
    const has41 = ev.includes('41.2');
    const has25 = ev.includes('25.1');
    if (has41 && has25) {
      pass('2.3  evidence cites BOTH 41.2 (submission) and 25.1 (12-mo mean) — it read across both bundles');
    } else {
      bad(`2.3  evidence is missing a number: "${ev}"`);
      info('Both numbers must appear. The evidence line is the whole credibility claim at 1:05.');
      if (!has25) info('25.1 missing suggests it never used history_baseline.csv from reference_text.');
    }
  }

  if (clean.some((s) => /yanbu/i.test(s))) {
    pass('     Yanbu reported clean — the "three flagged, one clean" contrast holds');
  } else {
    warn('     Yanbu not listed in clean_sources — check the contrast still reads on stage');
  }

  const missingEvidence = flags.filter((f) => !f.evidence || !f.plain_english);
  if (missingEvidence.length) {
    bad(`     ${missingEvidence.length} flag(s) missing evidence or plain_english`);
  }

  console.log('\n--- flags ---');
  for (const f of flags) {
    console.log(`  [${f.severity ?? '?'}] ${f.rule} · ${f.source ?? '?'} · ${f.row_ref ?? '?'}`);
    console.log(`      ${f.evidence ?? '(no evidence)'}`);
  }
}

// --- Node 2 emails, if present ---
// Look INSIDE the agent envelope: the structured payload is at output.data, so a
// top-level Object.values() scan finds nothing. lib/north.ts reads data.emails /
// data.drafts — keep the two in step.
const emailList = (node) => {
  const o = node.output;
  if (!o || typeof o !== 'object') return null;
  const candidates = [o, o.data].filter((x) => x && typeof x === 'object');
  for (const c of candidates) {
    const v = Array.isArray(c) ? c : Object.values(c).find(Array.isArray);
    if (Array.isArray(v) && v.some((x) => x && typeof x === 'object' && 'subject' in x)) return v;
  }
  return null;
};

let emails = null;
const withEmails = final.nodes.find((n) => (emails = emailList(n)));

if (withEmails) {
  pass(`     Node 2 emails present on "${withEmails.node_id}" — ${emails.length} draft(s)`);
  const keyed = emails.filter((e) => typeof e.flag_id === 'string').length;
  if (keyed === emails.length) {
    pass('     every draft carries a flag_id — the UI can key on it');
  } else {
    bad(`     ${emails.length - keyed} draft(s) missing flag_id`);
    info('lib/north.ts keys emails by flag_id; without it the UI silently falls back to its template.');
  }
  for (const e of emails.slice(0, 2)) {
    const words = String(e.body ?? '').trim().split(/\s+/).length;
    info(`  → ${e.flag_id ?? '(no flag_id)'}  to=${e.to ?? '?'}  ${words} words`);
    if (words > 90) warn(`     that draft is ${words} words; the brief says under 90`);
  }
} else {
  warn('     no email node output found — fine if you have not built Node 2 yet');
}

head(failures === 0 ? 'ALL PROBES PASSED' : `${failures} PROBE FAILURE(S)`);
if (failures === 0) {
  info('Block 2 is closed. Next: build the real SROP Validator (Block 3), then lib/types.ts');
  info('Type lib/types.ts against scripts/out/last-execution.json, not against the schema doc.');
}
process.exit(failures === 0 ? 0 : 1);
