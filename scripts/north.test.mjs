/**
 * Unit tests for the mapping layer — lib/csv.ts and the pure half of lib/north.ts.
 *
 *   npm run test:north
 *
 * These run against scripts/out/last-execution.json, a REAL North response, so they
 * fail if the platform changes shape under us. They cover the three bugs that
 * actually cost time on this build:
 *
 *   - the agent envelope (payload at output.data, not output.flags)
 *   - CRLF line endings zeroing the last column of every CSV row
 *   - snake_case leaking past the boundary
 *
 * Nothing here touches the network.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { unwrapPayload, toValidateResponse } from '../lib/north.ts';
import { parseCsv, loadPlanInput, buildSubmissionsText, buildReferenceText, loadSubmissionMeta } from '../lib/csv.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const EXECUTION = path.join(ROOT, 'scripts', 'out', 'last-execution.json');

// lib/csv.ts resolves data/ from process.cwd(); under `npm run` that is the project root.
process.chdir(ROOT);

// ------------------------------------------------------------------- envelope

test('unwrapPayload finds the payload inside the agent envelope', { skip: !fs.existsSync(EXECUTION) && 'no last-execution.json — run npm run probe:execute' }, () => {
  const execution = JSON.parse(fs.readFileSync(EXECUTION, 'utf8'));
  const node = execution.nodes[0];

  assert.equal(node.output.kind, 'agent', 'output should be the agent envelope');
  assert.equal(node.output.flags, undefined, 'nothing lands at output.flags');

  const payload = unwrapPayload(node.output);
  assert.ok(payload, 'unwrapPayload must find it at output.data');
  assert.equal(payload.flags.length, 4);
});

test('unwrapPayload handles a bare object and a JSON string', () => {
  const bare = { flags: [], clean_sources: [], summary: 'x' };
  assert.deepEqual(unwrapPayload(bare), bare);

  const asString = { kind: 'agent', text: JSON.stringify(bare) };
  assert.deepEqual(unwrapPayload(asString), bare);

  assert.equal(unwrapPayload(null), null);
  assert.equal(unwrapPayload('nope'), null);
  assert.equal(unwrapPayload({ kind: 'agent', text: 'not json' }), null);
});

// -------------------------------------------------------------------- mapping

test('toValidateResponse maps snake_case to camelCase and stamps status', { skip: !fs.existsSync(EXECUTION) && 'no last-execution.json' }, () => {
  const execution = JSON.parse(fs.readFileSync(EXECUTION, 'utf8'));
  const payload = unwrapPayload(execution.nodes[0].output);
  const result = toValidateResponse(payload);

  assert.equal(result.flags.length, 4);

  for (const flag of result.flags) {
    assert.equal(flag.status, 'open');
    assert.ok(flag.rowRef, 'rowRef must be populated');
    assert.ok(flag.submittedValue, 'submittedValue must be populated');
    assert.ok(flag.plainEnglish, 'plainEnglish must be populated');
    // No snake_case may survive the boundary.
    for (const key of Object.keys(flag)) {
      assert.ok(!key.includes('_'), `snake_case leaked: ${key}`);
    }
  }

  const deviation = result.flags.find((f) => f.rule === 'HISTORICAL_DEVIATION');
  assert.ok(deviation.evidence.includes('41.2'), 'evidence must carry the submitted number');
  assert.ok(deviation.evidence.includes('25.1'), 'evidence must carry the comparison number');

  assert.deepEqual(result.cleanSources, ['Refinery YANBU']);
  assert.deepEqual(result.emails, {});
});

test('toValidateResponse drops invented rule names and caps the list', () => {
  const flag = (rule, id) => ({
    id, source: 'OSPAS', file: 'sub_demand.csv', rule, severity: 'high',
    field: 'demand_kb', row_ref: 'x', submitted_value: '1',
    evidence: 'e', plain_english: 'p',
  });

  const withInvented = toValidateResponse({
    flags: [flag('HISTORICAL_DEVIATION', 'a'), flag('VIBES_CHECK', 'b')],
    clean_sources: [], summary: '',
  });
  assert.equal(withInvented.flags.length, 1, 'a fifth rule name must be dropped');

  const many = toValidateResponse({
    flags: Array.from({ length: 12 }, (_, i) => flag('LIMIT_BREACH', `f${i}`)),
    clean_sources: [], summary: '',
  });
  assert.equal(many.flags.length, 6, 'the list is capped at 6');
});

test('severity falls back rather than admitting a bad value', () => {
  const result = toValidateResponse({
    flags: [{
      id: 'a', source: 'OSPAS', file: 'f', rule: 'LIMIT_BREACH', severity: 'catastrophic',
      field: 'x', row_ref: 'y', submitted_value: '1', evidence: 'e', plain_english: 'p',
    }],
    clean_sources: [], summary: '',
  });
  assert.equal(result.flags[0].severity, 'medium');
});

// ------------------------------------------------------------------------ csv

test('parseCsv strips CR — the last column must not be NaN', () => {
  const { header, rows } = parseCsv('a,b\r\n1,2.5\r\n3,4.5\r\n');
  assert.deepEqual(header, ['a', 'b']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].b, '2.5', 'a trailing \\r here silently zeroes every quantity');
  assert.equal(Number(rows[1].b), 4.5);
});

test('loadPlanInput reads real quantities, not zeroes', () => {
  const input = loadPlanInput();

  assert.equal(input.demand.length, 33);
  assert.equal(input.prices.length, 16);
  assert.equal(input.limits.length, 8);
  assert.equal(input.inventory.length, 8);

  // The CRLF bug's signature: everything parses, every number is 0.
  assert.ok(input.demand.every((r) => Number.isFinite(r.demandKb)), 'demandKb must be numeric');
  assert.ok(input.demand.some((r) => r.demandKb > 0), 'demandKb must not be all zero');
  assert.ok(input.inventory.some((r) => r.openingInventoryKb > 0), 'inventory must not be all zero');
  assert.ok(input.limits.every((l) => l.capacity > 0), 'every limit needs a capacity');

  const bad = input.demand.find(
    (r) => r.refinery === 'JAZAN' && r.product === 'DIESEL' && r.month === '2026-10'
  );
  assert.equal(bad.demandKb, 41.2, 'the planted defect must survive parsing');

  // JAZAN DIESEL capacity is 45.0 on purpose. At 40.0 the cap clips 41.2 and the
  // on-stage swing becomes 14.2, not 15.4.
  const jazanDiesel = input.limits.find(
    (l) => l.refinery === 'JAZAN' && l.product === 'DIESEL'
  );
  assert.equal(jazanDiesel.capacity, 45.0);
});

test('text bundles carry the FILE markers the prompt keys off', () => {
  const submissions = buildSubmissionsText();
  const reference = buildReferenceText();

  for (const f of ['sub_demand.csv', 'sub_prices.csv', 'sub_inv_yanbu.csv', 'sub_inv_jazan.csv']) {
    assert.ok(submissions.includes(`=== FILE: ${f} ===`), `missing marker for ${f}`);
  }
  for (const f of ['ref_limits.csv', 'history_baseline.csv']) {
    assert.ok(reference.includes(`=== FILE: ${f} ===`), `missing marker for ${f}`);
  }

  assert.ok(submissions.includes('41.2'), 'the planted defect must reach the model');

  // 25.1 is the MEAN — it is derived, never a literal in the file. Assert the twelve
  // JAZAN DIESEL rows are present and still sum to 301.2, which is what makes the
  // mean come out at exactly 25.1. That number is said out loud at 1:05.
  const historyBlock = reference.split('=== FILE: history_baseline.csv ===')[1] ?? '';
  const jazanDiesel = historyBlock
    .split(/\r?\n/)
    .filter((l) => l.startsWith('JAZAN,BP-JAZAN,DIESEL,'))
    .map((l) => Number(l.split(',').pop()));

  assert.equal(jazanDiesel.length, 12, 'twelve months of JAZAN DIESEL history must reach the model');
  assert.equal(
    Number(jazanDiesel.reduce((a, b) => a + b, 0).toFixed(1)),
    301.2,
    'history must still sum to 301.2 so the mean is exactly 25.1'
  );

  // Whole point of dropping the data interpreter: this has to stay small.
  const kb = (Buffer.byteLength(submissions) + Buffer.byteLength(reference)) / 1024;
  assert.ok(kb < 20, `bundles are ${kb.toFixed(1)} KB — should be ~6 KB`);
});

test('submission metadata exposes the heterogeneous headers Pane 1 shows', () => {
  const meta = loadSubmissionMeta();
  assert.equal(meta.length, 4);

  const bySource = Object.fromEntries(meta.map((m) => [m.source, m]));
  assert.ok(bySource['OSPAS'], 'sub_demand.csv must map to OSPAS');
  assert.ok(bySource['Demand Planning']);
  assert.ok(bySource['Refinery YANBU']);
  assert.ok(bySource['Refinery JAZAN']);

  // The headers differ between files on purpose — that heterogeneity is the point.
  const shapes = new Set(meta.map((m) => m.columns.join(',')));
  assert.ok(shapes.size > 1, 'submission headers must not all be identical');
});
