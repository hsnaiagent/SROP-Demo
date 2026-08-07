/**
 * Guards the one place Block 5 duplicates a source of truth.
 *
 * app/demo-data.ts hand-copies data/corrections.json, because data/ is server-only
 * (read via fs in lib/csv.ts) and the frontend can't import it without a new API
 * route. That duplication is deliberate and documented — but it can drift silently,
 * and the failure mode is nasty: `Simulate response` would return a stale reply or a
 * stale corrected value, and the -15.4 kb / -$1.45M swing would quietly stop matching
 * what the plan computes.
 *
 * If this test fails, fix app/demo-data.ts — data/corrections.json is authoritative.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CORRECTIONS } from '../app/demo-data.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const onDisk = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'corrections.json'), 'utf8')
);

test('demo-data CORRECTIONS matches data/corrections.json', () => {
  assert.deepEqual(
    Object.keys(CORRECTIONS).sort(),
    Object.keys(onDisk).sort(),
    'same four rules must be present'
  );

  for (const [rule, expected] of Object.entries(onDisk)) {
    const actual = CORRECTIONS[rule];
    assert.ok(actual, `missing rule ${rule}`);
    assert.equal(actual.from, expected.from, `${rule}.from drifted`);
    assert.equal(actual.reply, expected.reply, `${rule}.reply drifted`);
    assert.equal(
      actual.correctedValue,
      expected.correctedValue,
      `${rule}.correctedValue drifted — this is what moves the plan`
    );
    assert.equal(actual.movesThePlan, expected.movesThePlan, `${rule}.movesThePlan drifted`);
  }
});

test('exactly one correction moves the plan, and it is 25.8', () => {
  const movers = Object.entries(CORRECTIONS).filter(([, c]) => c.movesThePlan);

  assert.equal(movers.length, 1, 'exactly one flag may move the plan');
  assert.equal(movers[0][0], 'HISTORICAL_DEVIATION');
  assert.equal(movers[0][1].correctedValue, 25.8);

  // The other three resolve without changing data — that ratio is the honest claim
  // that most queries end in a justification, not a correction.
  for (const [rule, c] of Object.entries(CORRECTIONS)) {
    if (rule === 'HISTORICAL_DEVIATION') continue;
    assert.equal(c.correctedValue, null, `${rule} must not carry a corrected value`);
  }
});
