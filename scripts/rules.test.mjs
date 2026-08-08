/**
 * Unit tests for lib/rules.ts.
 *
 *   npm run test:rules
 *
 * `scripts/check_data.py` derives the same three flags in Python without importing
 * anything from the generator. This file must agree with it. If the two disagree,
 * one of them is wrong and the demo is not safe to give.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { validateSource, thresholdFor, DEFAULT_DEVIATION_THRESHOLD, summarise } from '../lib/rules.ts';

const ALL_SOURCES = [
  'OSPAS',
  'Demand Planning',
  'Refinery YANBU',
  'Refinery JAZAN',
  'Refinery RIYADH',
  'Refinery RABIGH',
];

const validateAll = (opts = {}) => {
  const flags = [];
  for (const source of ALL_SOURCES) {
    flags.push(...validateSource(source, { arrived: ALL_SOURCES, ...opts }).flags);
  }
  return flags;
};

test('the three planted validation flags, and only those', () => {
  const flags = validateAll();

  const byRule = {};
  for (const f of flags) byRule[f.rule] = (byRule[f.rule] ?? 0) + 1;

  assert.deepEqual(byRule, {
    HISTORICAL_DEVIATION: 1, // JAZAN DIESEL Oct
    LIMIT_BREACH: 1,
    ZERO_OR_MISSING: 1,
  });
  assert.equal(flags.length, 3);
});

test('YANBU and RIYADH are clean', () => {
  for (const source of ['Refinery YANBU', 'Refinery RIYADH']) {
    const { flags } = validateSource(source, { arrived: ALL_SOURCES });
    assert.equal(flags.length, 0, `${source} must be clean — its green check is on screen all demo`);
  }
});

test('the JAZAN October flag carries both numbers in its evidence', () => {
  const flags = validateAll();
  const flag = flags.find(
    (f) => f.rule === 'HISTORICAL_DEVIATION' && f.rowRef.includes('product=DIESEL,month=2026-10')
  );

  assert.ok(flag, 'the headline flag must exist');
  assert.equal(flag.source, 'OSPAS');
  assert.equal(flag.severity, 'medium');
  assert.match(flag.evidence, /41\.2 kb/, 'evidence must carry the submitted number');
  assert.match(flag.evidence, /25\.1 kb/, 'evidence must carry the number compared against');
  assert.match(flag.evidence, /\+64%/, 'evidence must carry the deviation');
  assert.ok(flag.plainEnglish.length > 40, 'a non-analyst must be able to act on it');
});

test('every flag carries evidence and plain English — the output contract', () => {
  for (const flag of validateAll()) {
    assert.ok(flag.evidence?.trim(), `${flag.id} has no evidence`);
    assert.ok(flag.plainEnglish?.trim(), `${flag.id} has no plain English`);
    assert.ok(flag.rowRef?.trim(), `${flag.id} has no row reference`);
    assert.ok(flag.id.includes('|'), 'ids must be deterministic rule|rowRef');
    assert.equal(flag.status, 'open');
    assert.equal(flag.origin, 'validation');
  }
});

test('flag ids are stable across runs so re-validation preserves triage', () => {
  const a = validateAll().map((f) => f.id);
  const b = validateAll().map((f) => f.id);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length, 'ids must be unique');
});

test('the matching rule: JAZAN inventory is never checked against YANBU limits', () => {
  // BP-JAZAN FUEL-OIL opens at 11.2 kb. YANBU's FUEL-OIL band is 2.5-10.0, so a
  // product-only join flags it. JAZAN's own band is 4.0-16.0, so it is fine.
  // This exact misjoin is the bug that got the model-driven validator cut.
  const { flags } = validateSource('Refinery JAZAN', { arrived: ALL_SOURCES });
  const fuelOil = flags.filter((f) => f.rowRef.includes('product=FUEL-OIL'));
  assert.equal(fuelOil.length, 0, 'BP-JAZAN FUEL-OIL at 11.2 is inside its own 4.0-16.0 band');

  const breaches = flags.filter((f) => f.rule === 'LIMIT_BREACH');
  assert.equal(breaches.length, 1);
  assert.match(breaches[0].rowRef, /product=GASOLINE-91/);
});

test('no unknown-entity rows in the trimmed dataset', () => {
  const flags = validateAll().filter((f) => f.rule === 'UNKNOWN_ENTITY');
  assert.equal(flags.length, 0);
});

test('cross-source rules defer until their dependency has arrived', () => {
  const alone = validateSource('Demand Planning', { arrived: ['Demand Planning'] });
  assert.equal(alone.crossSourcePending, true);
  assert.equal(
    alone.flags.filter((f) => f.rule === 'CROSS_SOURCE_CONFLICT').length,
    0,
    'the relational rule must not fire while OSPAS is missing'
  );

  const together = validateSource('Demand Planning', { arrived: ALL_SOURCES });
  assert.equal(together.crossSourcePending, false);
  assert.equal(together.flags.filter((f) => f.rule === 'CROSS_SOURCE_CONFLICT').length, 0);
});

test('a threshold override on another series does not silence JAZAN DIESEL', () => {
  const override = {
    id: 'o1',
    scope: 'series',
    key: 'RIYADH|BP-QASSIM|JET-A1',
    deviation: 1.2,
    reason: 'Hajj season uplift, recurring and confirmed',
    setBy: 'Y - SROP Planner',
    setAt: new Date().toISOString(),
  };

  const flags = validateAll({ overrides: [override] });
  assert.equal(flags.length, 3);
  assert.ok(
    flags.some((f) => f.rule === 'HISTORICAL_DEVIATION' && f.rowRef.includes('BP-JAZAN')),
    'an override on one series must not silence another'
  );
});

test('thresholdFor resolves most-specific-wins', () => {
  const row = { refinery: 'RIYADH', bulkPlant: 'BP-QASSIM', product: 'JET-A1' };
  const base = { id: 'x', reason: 'r', setBy: 'Y', setAt: 'now' };

  assert.equal(thresholdFor(row, []).value, DEFAULT_DEVIATION_THRESHOLD);
  assert.equal(thresholdFor(row, [{ ...base, scope: 'product', key: 'JET-A1', deviation: 0.8 }]).value, 0.8);
  assert.equal(
    thresholdFor(row, [
      { ...base, scope: 'product', key: 'JET-A1', deviation: 0.8 },
      { ...base, scope: 'series', key: 'RIYADH|BP-QASSIM|JET-A1', deviation: 1.2 },
    ]).value,
    1.2,
    'series beats product'
  );
  assert.equal(
    thresholdFor(row, [{ ...base, scope: 'product', key: 'DIESEL', deviation: 0.9 }]).value,
    DEFAULT_DEVIATION_THRESHOLD,
    'an override for another product must not apply'
  );
});

test('validating a source that submits nothing throws rather than reporting clean', () => {
  // Finance submits nothing. Returning an empty flag list here would render as a
  // green check mark, which is the failure mode §9.2 forbids.
  assert.throws(() => validateSource('Finance', { arrived: ALL_SOURCES }), /submits no data/);
});

test('summarise counts rather than editorialising', () => {
  const flags = validateAll();
  const summary = summarise(flags, ['Refinery YANBU', 'Refinery RIYADH']);
  assert.match(summary, /3 anomalies/);
  assert.match(summary, /2 submissions clean/);
  assert.match(summarise([], ['A']), /clean/);
});
