/**
 * The SROP plan arithmetic. Pure, deterministic, no I/O.
 *
 * `buildPlan()` is called TWICE per request — once on the rows as submitted, once
 * with corrections applied. Never write a second version of this function: if the
 * two plans differ for any reason other than a corrected value, the demo's central
 * claim ("this is what would have shipped") is false.
 *
 * Verified target: correcting JAZAN/BP-JAZAN/DIESEL/2026-10 from 41.2 to 25.8 moves
 * exactly one row, swings October production by -15.4 kb and revenue by -$1.45M on
 * a $66.50M plan. See `scripts/plan.test.mjs`.
 */

import type {
  DemandRow,
  InventoryRow,
  LimitRow,
  PlanInput,
  PlanResult,
  PlanRow,
  PriceRow,
} from './types';

const SAFETY_FRACTION = 0.10;

/**
 * Volumes are in kb (thousands of barrels); prices are USD per barrel. Without this
 * the plan totals $0.07M instead of $66.50M — a units bug that looks like working
 * code, because every row is wrong by the same factor and nothing throws.
 */
const BARRELS_PER_KB = 1_000;

/** refinery|bulkPlant|product — the only correct join key. Product alone is a bug. */
const seriesKey = (r: { refinery: string; bulkPlant: string; product: string }) =>
  `${r.refinery}|${r.bulkPlant}|${r.product}`;

const limitKey = (l: LimitRow) => `${l.refinery}|${l.bulkPlant}|${l.product}`;
const inventoryKey = (i: InventoryRow) => `${i.bulkPlant}|${i.product}`;
const priceKey = (p: { product: string; month: string }) => `${p.product}|${p.month}`;

/**
 * Money and volumes are compared and displayed, so keep them off binary-float noise.
 * Three decimals is far below anything shown; it only kills 1e-13 drift.
 */
const round = (n: number, dp = 3) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

export function buildPlan(input: PlanInput): PlanResult {
  const limits = new Map<string, LimitRow>(input.limits.map((l) => [limitKey(l), l]));
  const inventory = new Map<string, InventoryRow>(
    input.inventory.map((i) => [inventoryKey(i), i])
  );
  const prices = new Map<string, PriceRow>(input.prices.map((p) => [priceKey(p), p]));

  // Group demand into series, each ordered by month.
  const series = new Map<string, DemandRow[]>();
  for (const row of input.demand) {
    const key = seriesKey(row);
    const bucket = series.get(key);
    if (bucket) bucket.push(row);
    else series.set(key, [row]);
  }

  const rows: PlanRow[] = [];
  const excluded: string[] = [];

  // Deterministic output order regardless of input order.
  for (const key of [...series.keys()].sort()) {
    const limit = limits.get(key);
    if (!limit) {
      // No reference limits, so no plan is possible. LPG-95 lands here.
      excluded.push(key);
      continue;
    }

    const months = series.get(key)!.slice().sort((a, b) => a.month.localeCompare(b.month));
    const opening = inventory.get(`${limit.bulkPlant}|${limit.product}`);
    const safety = SAFETY_FRACTION * limit.maxLevel;

    let closingPrev: number | null = null;

    for (const row of months) {
      const required: number = row.demandKb;
      const available: number = closingPrev ?? opening?.openingInventoryKb ?? 0;

      let production = Math.max(0, required + safety - available);
      production = Math.min(production, limit.capacity);

      const closing: number = available + production - required;
      const shortfall = Math.max(0, required - (available + production));
      const price = prices.get(priceKey(row))?.priceUsd ?? 0;
      const revenue = required * BARRELS_PER_KB * price;

      rows.push({
        month: row.month,
        refinery: row.refinery,
        product: row.product,
        production: round(production),
        closing: round(closing),
        shortfall: round(shortfall),
        revenue: round(revenue, 2),
      });

      closingPrev = closing;
    }
  }

  rows.sort(
    (a, b) =>
      a.month.localeCompare(b.month) ||
      a.refinery.localeCompare(b.refinery) ||
      a.product.localeCompare(b.product)
  );

  return { rows, excluded };
}

export const totalRevenue = (rows: PlanRow[]): number =>
  round(rows.reduce((sum, r) => sum + r.revenue, 0), 2);

/**
 * Applies a corrected demand value to the one row a flag points at.
 *
 * `rowRef` arrives from North as `refinery=JAZAN,bulk_plant=BP-JAZAN,product=DIESEL,month=2026-10`.
 * Parsing it is how a correction finds its row; matching on product alone would hit
 * every plant, which is exactly the class of bug that got the data interpreter cut.
 */
export function applyCorrection(
  input: PlanInput,
  rowRef: string,
  correctedValue: number
): PlanInput {
  const parts = new Map(
    rowRef.split(',').map((pair) => {
      const [k, ...rest] = pair.split('=');
      return [k.trim(), rest.join('=').trim()];
    })
  );

  const wanted = {
    refinery: parts.get('refinery'),
    bulkPlant: parts.get('bulk_plant'),
    product: parts.get('product'),
    month: parts.get('month'),
  };

  const matches = (row: DemandRow) =>
    (wanted.refinery === undefined || row.refinery === wanted.refinery) &&
    (wanted.bulkPlant === undefined || row.bulkPlant === wanted.bulkPlant) &&
    (wanted.product === undefined || row.product === wanted.product) &&
    (wanted.month === undefined || row.month === wanted.month);

  return {
    ...input,
    demand: input.demand.map((row) =>
      matches(row) ? { ...row, demandKb: correctedValue } : row
    ),
  };
}
