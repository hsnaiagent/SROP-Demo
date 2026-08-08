/**
 * Walks the whole monthly cycle against a running dev server and asserts the things
 * the demo depends on. Not a unit test — an end-to-end check that the gates hold, the
 * agents fire, and the numbers land where they should.
 *
 *   npm run dev          (in one terminal)
 *   npm run smoke        (in another)
 */

import assert from 'node:assert/strict';

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3000';
const PLANNER = 'Y - SROP Planner';

let failures = 0;
let checks = 0;

const step = (name) => console.log(`\n\x1b[36m▸ ${name}\x1b[0m`);

function check(label, fn) {
  checks += 1;
  try {
    fn();
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } catch (err) {
    failures += 1;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m`);
    console.log(`    ${err.message.split('\n')[0]}`);
  }
}

async function act(action, payload = {}, actor = PLANNER) {
  const res = await fetch(`${BASE}/api/cycle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, actor, payload }),
  });
  const data = await res.json();
  return { ok: res.ok, ...data };
}

const get = async () => (await fetch(`${BASE}/api/cycle`)).json();

const openFlags = (c) =>
  c.flags.filter((f) => ['open', 'awaiting_response', 'responded', 'escalated'].includes(f.status));

const SOURCES = [
  'OSPAS',
  'Demand Planning',
  'Refinery YANBU',
  'Refinery JAZAN',
  'Refinery RIYADH',
  // RABIGH deliberately never submits — defect 7.
];

// ---------------------------------------------------------------------------

step('Reset and create the cycle');
await act('reset');
let { cycle } = await act('create_cycle');
check('cycle created with a four-month horizon', () => {
  assert.equal(cycle.id, '2026-09');
  assert.deepEqual(cycle.horizon, ['2026-09', '2026-10', '2026-11', '2026-12']);
  assert.equal(cycle.status, 'not_started');
});

step('Phase 1 — the orchestrator drafts requests from chat');
let r = await act('chat', { text: 'Ask the refineries about limits.' });
check('an ambiguous ask produces a question, not a guess', () => {
  const reply = r.cycle.chat.at(-1);
  assert.equal(reply.role, 'orchestrator');
  assert.match(reply.text, /which refineries/i);
  assert.equal(r.cycle.requests.length, 0, 'nothing drafted from an ambiguous ask');
});

r = await act('chat', { text: 'Standard monthly pull. Also ask Jazan about the October outage.' });
cycle = r.cycle;
check('six requests drafted, JAZAN carrying the ad-hoc item', () => {
  assert.equal(cycle.requests.length, 6);
  const jazan = cycle.requests.find((x) => x.recipient === 'Refinery JAZAN');
  assert.equal(jazan.origin, 'new');
  assert.ok(jazan.items.some((i) => /outage/i.test(i)), 'the ad-hoc item is on the card');
  const others = cycle.requests.filter((x) => x.recipient !== 'Refinery JAZAN');
  assert.ok(others.every((x) => x.origin === 'standard'));
});

r = await act('send_requests');
check('sending is refused while a card is unreviewed', () => {
  assert.equal(r.ok, false);
  assert.match(r.error, /not yet reviewed/);
});

await act('update_request', { id: 'req-refinery-jazan', reviewed: true });
r = await act('send_requests');
cycle = r.cycle;
check('requests sent and the SLA clock started', () => {
  assert.ok(r.ok);
  assert.equal(cycle.requests.filter((x) => x.status === 'sent').length, 6);
  assert.equal(cycle.emails.filter((m) => m.kind === 'request').length, 6);
  assert.equal(cycle.status, 'requests_sent');
});

step('Phase 2 — stakeholders submit, one stays silent');
for (const source of SOURCES) {
  r = await act('submit', { source, note: '' }, source);
}
cycle = r.cycle;
check('five of six submitted', () => {
  assert.equal(cycle.submissions.filter((s) => s.versions.length > 0).length, 5);
  const rabigh = cycle.submissions.find((s) => s.source === 'Refinery RABIGH');
  assert.equal(rabigh.versions.length, 0);
});

step('Phase 3 — validation, one instance per source');
r = await act('validate');
cycle = r.cycle;
check('exactly the three planted validation flags', () => {
  assert.equal(cycle.flags.length, 3, `got ${cycle.flags.length}`);
  const byRule = {};
  for (const f of cycle.flags) byRule[f.rule] = (byRule[f.rule] ?? 0) + 1;
  assert.deepEqual(byRule, {
    HISTORICAL_DEVIATION: 1,
    LIMIT_BREACH: 1,
    ZERO_OR_MISSING: 1,
  });
});
check('YANBU and RIYADH are clean', () => {
  for (const name of ['Refinery YANBU', 'Refinery RIYADH']) {
    assert.equal(cycle.submissions.find((s) => s.source === name).status, 'clean');
  }
});
check('the headline flag carries both numbers', () => {
  const flag = cycle.flags.find(
    (f) => f.rule === 'HISTORICAL_DEVIATION' && f.rowRef.includes('product=DIESEL,month=2026-10')
  );
  assert.match(flag.evidence, /41\.2 kb/);
  assert.match(flag.evidence, /25\.1 kb/);
  assert.match(flag.evidence, /\+64%/);
});

step('Gate 1 refuses while flags are open');
r = await act('build_master');
check('the workbook cannot be built with open flags', () => {
  assert.equal(r.ok, false);
  assert.match(r.error, /Gate 1 is closed/);
});

step('Correction materiality is known before it is committed');
const jazanFlag = cycle.flags.find(
  (f) => f.rule === 'HISTORICAL_DEVIATION' && f.rowRef.includes('product=DIESEL,month=2026-10')
);
r = await act('impact_preview', { field: 'demand_kb', rowRef: jazanFlag.rowRef, value: 25.8 });
check('the plan impact of the JAZAN correction is −15.4 kb and −$1.45M', () => {
  assert.equal(r.impact.productionDelta, -15.4, `got ${r.impact.productionDelta}`);
  assert.equal(r.impact.revenueDelta, -1445136, `got ${r.impact.revenueDelta}`);
  assert.match(r.sentence, /−15\.4 kb/);
  assert.match(r.sentence, /−\$1\.45M/);
});

step('Phase 3 — triage: query, reply, accept');
await act('flag_query', { id: jazanFlag.id });
r = await act('flag_reply', { id: jazanFlag.id }, 'OSPAS');
check('the reply arrives and the flag is responded', () => {
  const f = r.cycle.flags.find((x) => x.id === jazanFlag.id);
  assert.equal(f.status, 'responded');
  assert.match(f.response, /25\.8 kb/);
});
r = await act('flag_accept', { id: jazanFlag.id });
cycle = r.cycle;
check('accepting records the correction and its plan impact', () => {
  const f = cycle.flags.find((x) => x.id === jazanFlag.id);
  assert.equal(f.status, 'corrected');
  assert.equal(f.correctedValue, '25.8');
  assert.equal(f.impact.productionDelta, -15.4);
  assert.equal(f.impact.revenueDelta, -1445136);
});

step('Justify the remaining flags');
for (const flag of openFlags(cycle)) {
  r = await act('flag_justify', { id: flag.id, note: `Confirmed by ${flag.source} — intentional.` });
}
cycle = r.cycle;
check('no flags remain open', () => assert.equal(openFlags(cycle).length, 0));

r = await act('flag_justify', { id: cycle.flags[0].id, note: '   ' });
check('an empty reason is rejected — the note is the audit trail', () => {
  assert.equal(r.ok, false);
  assert.match(r.error, /reason is required/);
});

step('Gate 1 still refuses: RABIGH has not reported');
r = await act('build_master');
check('a missing source blocks the gate even with no open flags', () => {
  assert.equal(r.ok, false);
  assert.match(r.error, /waiting on Refinery RABIGH/);
});

step('The SLA ladder runs, then the fallback is offered — not taken');
r = await act('advance_clock', { days: 3 });
check('a reminder goes out at 3 business days', () => {
  assert.equal(r.cycle.emails.filter((m) => m.kind === 'reminder').length, 1);
  assert.equal(r.cycle.submissions.find((s) => s.source === 'Refinery RABIGH').status, 'reminded');
});
r = await act('advance_clock', { days: 2 });
check('escalation goes to the department head at 5', () => {
  const mail = r.cycle.emails.find((m) => m.kind === 'escalation');
  assert.ok(mail, 'an escalation email exists');
  assert.match(mail.to, /rabigh\.manager/);
  assert.equal(r.cycle.submissions.find((s) => s.source === 'Refinery RABIGH').status, 'escalated');
});
r = await act('advance_clock', { days: 2 });
cycle = r.cycle;
check('at 7 days the fallback is prepared but not applied', () => {
  const rabigh = cycle.submissions.find((s) => s.source === 'Refinery RABIGH');
  assert.equal(rabigh.daysWaiting, 7);
  assert.equal(rabigh.assumed, false, 'carrying stale data is Y\'s decision, not a timeout');
});

r = await act('confirm_fallback', { source: 'Refinery RABIGH' });
cycle = r.cycle;
check('confirming marks the source assumed', () => {
  const rabigh = cycle.submissions.find((s) => s.source === 'Refinery RABIGH');
  assert.equal(rabigh.assumed, true);
  assert.equal(rabigh.status, 'assumed');
});

step('Phase 4 — the Intake Agent builds the workbook');
r = await act('build_master');
cycle = r.cycle;
check('the workbook is built with a sheet per source plus reference sheets', () => {
  assert.ok(r.ok, r.error);
  const names = cycle.masterFile.sheets.map((s) => s.name);
  assert.ok(names.includes('Demand'));
  assert.ok(names.includes('Prices'));
  assert.ok(names.includes('Limits'));
  assert.ok(names.includes('Excluded'), 'excluded series are carried, never dropped');
  assert.equal(names.filter((n) => n.startsWith('Inventory ')).length, 4);
});
check('every sheet is traceable to a submission and a version', () => {
  for (const sheet of cycle.masterFile.sheets) {
    assert.ok(sheet.sourceTrace.length > 0, `${sheet.name} has no source trace`);
  }
  const rabigh = cycle.masterFile.sheets.find((s) => s.name === 'Inventory RABIGH');
  assert.match(rabigh.sourceTrace, /assumed/, 'assumed data is marked in the workbook itself');
});
check('the corrected value is what entered the workbook, not the submitted one', () => {
  const demand = cycle.masterFile.sheets.find((s) => s.name === 'Demand');
  const row = demand.rows.find(
    (x) => x[0] === 'JAZAN' && x[2] === 'DIESEL' && x[3] === '2026-10'
  );
  assert.equal(row[4], '25.8', 'the workbook carries the validated number');
});

step('Gate 2 — the model does not run on the agent\'s word');
r = await act('run_plan');
check('running is refused before the planner approves the workbook', () => {
  assert.equal(r.ok, false);
  assert.match(r.error, /Gate 2 is closed/);
});
await act('approve_master');

step('Phase 5 — the LP run');
r = await act('run_plan');
cycle = r.cycle;
let draft = cycle.drafts.at(-1);
check('draft v1 is generated', () => {
  assert.ok(r.ok, r.error);
  assert.equal(draft.version, 1);
  assert.equal(draft.status, 'generated');
  assert.ok(draft.planRows.length > 60, `${draft.planRows.length} rows`);
});
check('every plan row carries its bulk plant and its own limits', () => {
  for (const row of draft.planRows) {
    assert.ok(row.bulkPlant, 'a row without a bulk plant cannot be checked against a limit');
    assert.ok(Number.isFinite(row.capacity));
    assert.ok(Number.isFinite(row.minLevel));
    assert.ok(Number.isFinite(row.demand));
  }
});
check("YANBU's two plants are distinct rows", () => {
  const sept = draft.planRows.filter(
    (r2) => r2.refinery === 'YANBU' && r2.product === 'DIESEL' && r2.month === '2026-09'
  );
  assert.equal(sept.length, 2);
  assert.deepEqual(sept.map((x) => x.bulkPlant).sort(), ['BP-MADINAH', 'BP-YANBU']);
});
check('the excluded series sheet is present but empty in the trimmed dataset', () => {
  const excluded = cycle.masterFile.sheets.find((s) => s.name === 'Excluded');
  assert.ok(excluded);
  assert.equal(excluded.rowCount, 0);
});
check('the assumed source is marked on the plan rows', () => {
  const rabighRows = draft.planRows.filter((x) => x.bulkPlant === 'BP-RABIGH');
  assert.ok(rabighRows.length > 0);
  assert.ok(rabighRows.every((x) => x.assumed), 'carried-forward data travels onto the draft');
});
console.log(
  `    plan: ${draft.planRows.length} rows · $${(draft.totalRevenue / 1e6).toFixed(2)}M · ` +
    `${draft.totalVolume} kb · ${draft.shortfallRowCount} shortfall · ${draft.bandBreachRowCount} band breach`
);

step('Gate 3 — issue to stakeholders');
r = await act('issue_draft');
cycle = r.cycle;
draft = cycle.drafts.at(-1);
check('every non-planner stakeholder gets a review row', () => {
  // OSPAS, Demand Planning, four refineries, Finance.
  assert.equal(cycle.reviews.filter((x) => x.draftId === draft.id).length, 7);
  assert.equal(draft.status, 'issued');
  assert.ok(cycle.emails.some((m) => m.kind === 'draft'));
});

step('Phase 6 — stakeholders respond');
r = await act('simulate_responses');
cycle = r.cycle;
check('Finance approves, OSPAS comments, RABIGH uploads', () => {
  const byName = Object.fromEntries(cycle.reviews.map((x) => [x.stakeholder, x.status]));
  assert.equal(byName.Finance, 'approved');
  assert.equal(byName.OSPAS, 'comment_submitted');
  assert.equal(byName['Refinery RABIGH'], 'update_submitted');
});
check('the File-Recognition Agent identified the upload by its columns', () => {
  const revision = cycle.revisions.find((x) => x.author === 'Refinery RABIGH');
  assert.equal(revision.recognisedAs, 'inventory');
  assert.equal(revision.changes.length, 3);
});
check('the out-of-scope price edit is quarantined, not applied', () => {
  const revision = cycle.revisions.find((x) => x.author === 'Refinery RABIGH');
  const price = revision.changes.find((ch) => ch.field === 'price_usd');
  assert.equal(price.verdict, 'out_of_scope');
  assert.match(price.reason, /owned by Demand Planning/);
  const within = revision.changes.filter((ch) => ch.verdict === 'within_authority');
  assert.equal(within.length, 2, 'the tank levels are within RABIGH authority');
});
check('the out-of-scope edit raised a flag for the planner', () => {
  assert.ok(cycle.flags.some((f) => f.rule === 'OUT_OF_SCOPE_EDIT'));
});

step('Gate 4 refuses while the queue is not empty');
r = await act('publish_final');
check('publishing is refused with a pending revision', () => {
  assert.equal(r.ok, false);
  assert.match(r.error, /Gate 4 is closed/);
});

step('The planner works the queue');
const revision = cycle.revisions.find((x) => x.author === 'Refinery RABIGH');
r = await act('revision_accept', { id: revision.id, note: 'Tank levels accepted; price raised with DP separately.' });
const comment = r.cycle.comments.find((x) => x.status === 'open');
r = await act('comment_accept', {
  id: comment.id,
  note: 'Accepted — October turnaround confirmed, replanned at 19.4.',
  proposedValue: comment.proposedValue,
});
cycle = r.cycle;
check('accepting an out-of-scope change is recorded against the planner', () => {
  const entry = cycle.audit.find((a) => a.action === 'accepted an out-of-scope change');
  assert.ok(entry, 'the audit names who accepted it');
  assert.equal(entry.actor, PLANNER);
  assert.match(entry.note, /proposed by Refinery RABIGH/);
});
check('the workbook is now stale and Gate 4 demands a rerun', () => {
  assert.equal(cycle.masterFile.stale, true);
  assert.equal(cycle.masterFile.approvedByPlanner, false, 'staleness revokes the run approval');
});

r = await act('publish_final');
check('publishing is refused until the plan is rerun', () => {
  assert.equal(r.ok, false);
  assert.match(r.error, /rerun/);
});

step('Rerun produces draft v2');
await act('build_master');
await act('approve_master');
r = await act('run_plan');
cycle = r.cycle;
const v2 = cycle.drafts.at(-1);
check('v2 supersedes v1 and names what changed and why', () => {
  assert.equal(v2.version, 2);
  assert.equal(cycle.drafts.find((d) => d.version === 1).status, 'superseded');
  assert.ok(v2.changesFromPrevious.length > 0, 'the change strip is populated');
  const change = v2.changesFromPrevious.find((ch) => ch.rowRef.includes('product=DIESEL,month=2026-10'));
  assert.ok(change, 'the commented row moved');
  assert.equal(change.after, 19.4);
  assert.match(change.causedBy, /comment, accepted/);
});
check('the accepted tank-level change reached the plan', () => {
  const row = v2.planRows.find((x) => x.bulkPlant === 'BP-RABIGH' && x.product === 'DIESEL' && x.month === '2026-09');
  assert.equal(row.opening, 11.8, 'RABIGH diesel opening was accepted at 11.8');
});
check('the quarantined price was NOT applied', () => {
  const row = v2.planRows.find((x) => x.product === 'GASOLINE-91' && x.month === '2026-11');
  assert.notEqual(row.price, 94.2, 'an out-of-scope edit must not reach the plan');
});

step('Phase 7 — finalise');
await act('issue_draft');
r = await act('simulate_responses');
cycle = r.cycle;
r = await act('publish_final');
cycle = r.cycle;
check('the final SROP is published and the cycle archived', () => {
  assert.ok(r.ok, r.error);
  assert.ok(cycle.finalisedAt);
  assert.equal(cycle.status, 'archived');
  assert.equal(cycle.drafts.at(-1).status, 'finalized');
  assert.ok(cycle.emails.some((m) => m.kind === 'final'));
});
check('the audit trail records the whole cycle', () => {
  assert.ok(cycle.audit.length > 30, `${cycle.audit.length} entries`);
  const actors = new Set(cycle.audit.map((a) => a.actor));
  for (const expected of ['Validation Agent', 'Intake Agent', 'File-Recognition Agent', 'Orchestrator', 'LP model', PLANNER]) {
    assert.ok(actors.has(expected), `${expected} never appears in the audit`);
  }
});

step('The master workbook downloads');
const download = await fetch(`${BASE}/api/master`);
const text = await download.text();
check('the workbook is a real multi-sheet file', () => {
  assert.equal(download.status, 200);
  assert.ok(text.includes('=== SHEET: Demand ==='));
  assert.ok(text.includes('=== SHEET: Excluded ==='));
  assert.ok(text.includes('ASSUMED'), 'assumed data is marked in the file itself');
});

step('State survives a refresh');
const reloaded = await get();
check('the cycle reads back identically from disk', () => {
  assert.equal(reloaded.cycle.id, cycle.id);
  assert.equal(reloaded.cycle.status, 'archived');
  assert.equal(reloaded.cycle.flags.length, cycle.flags.length);
  assert.equal(reloaded.cycle.drafts.length, 2);
});

// ---------------------------------------------------------------------------

console.log(
  `\n${failures === 0 ? '\x1b[32mPASS' : '\x1b[31mFAIL'}\x1b[0m — ${checks - failures}/${checks} checks passed\n`
);
process.exit(failures === 0 ? 0 : 1);
