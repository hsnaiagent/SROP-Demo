/**
 * Unit test for lib/plan.ts. No test framework — node:test is built in.
 *
 *   npm run test:plan
 *
 * Runs against the real CSVs in data/, so it fails loudly if the fixtures drift.
 * Three things it guards:
 *   1. Determinism — same input twice must produce byte-identical output. That is
 *      the whole reason the plan arithmetic lives in TypeScript and not in a model.
 *   2. The numbers said out loud on stage: -15.4 kb and -$1.45M.
 *   3. That every row can be checked against a constraint — the version 1 defect
 *      where PlanRow dropped the bulk plant that its limits are defined on.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPlan, totalRevenue, applyCorrection, feasibilityStatus } from '../lib/plan.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.join(ROOT, 'data');

// ------------------------------------------------------------- tiny CSV reader
// Deliberately minimal: these files have no quoted fields or embedded commas.
// Split on /\r?\n/ — the files are CRLF and a trailing '\r' turns every quantity
// into NaN, which empties the plan without throwing.
const readCsv = (name) => {
  const lines = fs.readFileSync(path.join(DATA, name), 'utf8').trim().split(/\r?\n/);
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  });
};

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Discovered from the directory, not hardcoded — version 2 has four refineries. */
const inventoryFiles = () =>
  readJson('stakeholders.json')
    .filter((s) => s.kind === 'refinery')
    .map((s) => `sub_inv_${s.refinery.toLowerCase()}.csv`)
    .filter((f) => fs.existsSync(path.join(DATA, f)));

const baseline = () => {
  const buckets = new Map();
  for (const r of readCsv('history_baseline.csv')) {
    const key = `${r.refinery}|${r.bulk_plant}|${r.product}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(num(r.demand_kb));
  }
  return Object.fromEntries(
    [...buckets].map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length])
  );
};

const loadInput = () => ({
  demand: readCsv('sub_demand.csv').map((r) => ({
    refinery: r.refinery,
    bulkPlant: r.bulk_plant,
    product: r.product,
    month: r.month,
    demandKb: num(r.demand_kb),
  })),
  prices: readCsv('sub_prices.csv').map((r) => ({
    product: r.product,
    month: r.month,
    priceUsd: num(r.price_usd),
  })),
  limits: readCsv('ref_limits.csv').map((r) => ({
    refinery: r.refinery,
    bulkPlant: r.bulk_plant,
    product: r.product,
    minLevel: num(r.min_level),
    maxLevel: num(r.max_level),
    capacity: num(r.capacity),
  })),
  inventory: inventoryFiles()
    .flatMap((f) => readCsv(f))
    .map((r) => ({
      bulkPlant: r.bulk_plant,
      product: r.product,
      openingInventoryKb: num(r.opening_inventory_kb),
    })),
  baseline: baseline(),
  lastCycle: readJson('prev_cycle.json').demand,
});

/** The one flag that moves the plan. Mirrors corrections.json. */
const DEVIATION_ROW = 'refinery=JAZAN,bulk_plant=BP-JAZAN,product=DIESEL,month=2026-10';
const CORRECTED_VALUE = 25.8;

// --------------------------------------------------------------------- tests

test('same input twice produces identical output', () => {
  const a = buildPlan(loadInput());
  const b = buildPlan(loadInput());
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'output must be byte-identical');
});

test('buildPlan does not mutate its input', () => {
  const input = loadInput();
  const before = JSON.stringify(input);
  buildPlan(input);
  assert.equal(JSON.stringify(input), before);
});

test('every series in demand has reference limits', () => {
  const { excluded } = buildPlan(loadInput());
  assert.equal(excluded.length, 0, 'no unplannable series in the trimmed dataset');
});

test('every plan row can be checked against its own limits', () => {
  const { rows } = buildPlan(loadInput());
  const limits = new Map(
    readCsv('ref_limits.csv').map((r) => [`${r.refinery}|${r.bulk_plant}|${r.product}`, r])
  );

  for (const row of rows) {
    // The version 1 defect: without bulkPlant, this join is impossible and a row at
    // one plant gets validated against another plant's limits.
    assert.ok(row.bulkPlant, 'every row must carry its bulk plant');
    const key = `${row.refinery}|${row.bulkPlant}|${row.product}`;
    const limit = limits.get(key);
    assert.ok(limit, `no limit row for ${key}`);
    assert.equal(row.capacity, num(limit.capacity));
    assert.equal(row.minLevel, num(limit.min_level));
    assert.equal(row.maxLevel, num(limit.max_level));
    assert.ok(Number.isFinite(row.demand), 'demand must be carried out');
    assert.ok(Number.isFinite(row.opening), 'opening must be carried out');
    assert.ok(feasibilityStatus(row), 'every row must resolve to a status');
  }
});

test("YANBU's two bulk plants stay distinct rows", () => {
  const { rows } = buildPlan(loadInput());
  const yanbuDieselSept = rows.filter(
    (r) => r.refinery === 'YANBU' && r.product === 'DIESEL' && r.month === '2026-09'
  );
  assert.equal(yanbuDieselSept.length, 2, 'BP-YANBU and BP-MADINAH are separate series');
  assert.deepEqual(
    yanbuDieselSept.map((r) => r.bulkPlant).sort(),
    ['BP-MADINAH', 'BP-YANBU']
  );
});

test('applyCorrection touches exactly one row', () => {
  const input = loadInput();
  const corrected = applyCorrection(input, DEVIATION_ROW, CORRECTED_VALUE);

  const changed = input.demand.filter(
    (row, i) => row.demandKb !== corrected.demand[i].demandKb
  );
  assert.equal(changed.length, 1, 'exactly one demand row may change');
  assert.equal(changed[0].refinery, 'JAZAN');
  assert.equal(changed[0].bulkPlant, 'BP-JAZAN');
  assert.equal(changed[0].product, 'DIESEL');
  assert.equal(changed[0].month, '2026-10');
  assert.equal(changed[0].demandKb, 41.2, 'the original value must be the bad one');
});

test('the October swing is -15.4 kb and the plan moves by -$1.45M', () => {
  const input = loadInput();
  const raw = buildPlan(input);
  const resolved = buildPlan(applyCorrection(input, DEVIATION_ROW, CORRECTED_VALUE));

  const differing = raw.rows.filter((r, i) => {
    const s = resolved.rows[i];
    return (
      r.production !== s.production ||
      r.closing !== s.closing ||
      r.shortfall !== s.shortfall ||
      r.revenue !== s.revenue
    );
  });

  const octoberDiesel = (rows) =>
    rows.find(
      (r) =>
        r.month === '2026-10' &&
        r.refinery === 'JAZAN' &&
        r.bulkPlant === 'BP-JAZAN' &&
        r.product === 'DIESEL'
    );

  const swing = Number(
    (octoberDiesel(resolved.rows).production - octoberDiesel(raw.rows).production).toFixed(1)
  );

  const rawRevenue = totalRevenue(raw.rows);
  const resolvedRevenue = totalRevenue(resolved.rows);
  const deltaM = Number(((resolvedRevenue - rawRevenue) / 1_000_000).toFixed(2));

  console.log(`\n  rows that move:   ${differing.length}`);
  console.log(`  October swing:    ${swing} kb`);
  console.log(`  raw revenue:      $${(rawRevenue / 1_000_000).toFixed(2)}M`);
  console.log(`  resolved revenue: $${(resolvedRevenue / 1_000_000).toFixed(2)}M`);
  console.log(`  delta:            $${deltaM}M\n`);

  // The two numbers the demo says out loud. They depend only on the JAZAN DIESEL
  // series and its October price, so expanding the dataset does not move them.
  assert.equal(swing, -15.4, 'October production swing must be -15.4 kb');
  assert.equal(deltaM, -1.45, 'revenue delta must be -$1.45M');

  // The correction must not leak into any other series.
  assert.equal(differing.length, 1, 'exactly one plan row may move');
});

test('ASPHALT plans with the submitted monthly price', () => {
  const { rows } = buildPlan(loadInput());
  const asphalt = rows.filter((r) => r.product === 'ASPHALT');
  assert.ok(asphalt.length > 0, 'ASPHALT is planned — it has limits');
  assert.ok(
    asphalt.every((r) => r.price > 0 && r.revenue > 0),
    'ASPHALT now carries a monthly price in the trimmed dataset'
  );
});
