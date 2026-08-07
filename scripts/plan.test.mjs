/**
 * Unit test for lib/plan.ts. No test framework — node:test is built in.
 *
 *   npm run test:plan
 *
 * Runs against the real CSVs in data/, so it fails loudly if the fixtures drift.
 * Two things it guards:
 *   1. Determinism — same input twice must produce byte-identical output. That is
 *      the whole reason the plan arithmetic lives in TypeScript and not in the LLM.
 *   2. The three numbers said out loud on stage: -15.4 kb, -$1.45M, $66.50M.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPlan, totalRevenue, applyCorrection } from '../lib/plan.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.join(ROOT, 'data');

// ------------------------------------------------------------- tiny CSV reader
// Deliberately minimal: these files have no quoted fields or embedded commas.
//
// NOTE: data/*.csv are CRLF. Splitting on '\n' alone leaves a trailing '\r' on the
// LAST column of every row — which is exactly demand_kb, price_usd and
// opening_inventory_kb. Number('30.3\r') is NaN, so every quantity silently became
// zero and the whole plan came out empty. Split on /\r?\n/.
const readCsv = (name) => {
  const lines = fs.readFileSync(path.join(DATA, name), 'utf8').trim().split(/\r?\n/);
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  });
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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
  inventory: [
    ...readCsv('sub_inv_yanbu.csv'),
    ...readCsv('sub_inv_jazan.csv'),
  ].map((r) => ({
    bulkPlant: r.bulk_plant,
    product: r.product,
    openingInventoryKb: num(r.opening_inventory_kb),
  })),
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

test('LPG-95 is excluded, not silently dropped', () => {
  const { rows, excluded } = buildPlan(loadInput());
  assert.deepEqual(excluded, ['JAZAN|BP-JAZAN|LPG-95']);
  assert.equal(
    rows.some((r) => r.product === 'LPG-95'),
    false,
    'an unplannable series must not appear in the plan rows'
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
      (r) => r.month === '2026-10' && r.refinery === 'JAZAN' && r.product === 'DIESEL'
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

  assert.equal(swing, -15.4, 'October production swing must be -15.4 kb');
  assert.equal(deltaM, -1.45, 'revenue delta must be -$1.45M');
  assert.equal(
    Number((rawRevenue / 1_000_000).toFixed(2)),
    66.50,
    'headline plan revenue must be $66.50M'
  );
});
