/**
 * The SROP plan arithmetic. Pure, deterministic, no I/O.
 *
 * The arithmetic is version 1's, unchanged. What changed in version 2 is that the
 * row now carries out the values the loop already had in hand — bulk plant, demand,
 * opening, capacity, the min/max band and the price. Version 1 computed all of them
 * and then threw five away, which is why its plan table could not be checked
 * against a single constraint.
 *
 * Verified target, unchanged: correcting JAZAN/BP-JAZAN/DIESEL/2026-10 from 41.2 to
 * 25.8 moves exactly one row, swings October production by -15.4 kb and revenue by
 * -$1.45M. See `scripts/plan.test.mjs`.
 */

import type {
  DemandRow,
  ExcludedSeries,
  InventoryRow,
  LimitRow,
  PlanInput,
  PlanResult,
  PlanRow,
  PriceRow,
} from './types';

/**
 * Production targets ending the month at the minimum tank level.
 *
 * Version 1 used 10% of max_level as the safety stock, which for every series in the
 * dataset is below min_level — so every closing level was technically a breach. It
 * never showed, because version 1's plan table did not display closing inventory at
 * all. Displaying it made the bug obvious in one screen.
 *
 * Targeting min_level is also the right behaviour: produce enough to serve demand and
 * finish at the floor. It leaves the pinned demo numbers untouched, because in steady
 * state available equals the target and production comes out equal to demand either way.
 */
const safetyStock = (limit: LimitRow) => limit.minLevel;

/**
 * Volumes are in kb (thousands of barrels); prices are USD per barrel. Without this
 * the plan totals $0.07M instead of tens of millions — a units bug that looks like
 * working code, because every row is wrong by the same factor and nothing throws.
 */
const BARRELS_PER_KB = 1_000;

/** refinery|bulkPlant|product — the only correct join key. Product alone is a bug. */
export const seriesKey = (r: { refinery: string; bulkPlant: string; product: string }) =>
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
  const assumed = new Set(input.assumedPlants ?? []);

  // Group demand into series, each ordered by month.
  const series = new Map<string, DemandRow[]>();
  for (const row of input.demand) {
    const key = seriesKey(row);
    const bucket = series.get(key);
    if (bucket) bucket.push(row);
    else series.set(key, [row]);
  }

  const rows: PlanRow[] = [];
  const excluded: ExcludedSeries[] = [];

  // Deterministic output order regardless of input order.
  for (const key of [...series.keys()].sort()) {
    const months = series.get(key)!.slice().sort((a, b) => a.month.localeCompare(b.month));
    const limit = limits.get(key);

    if (!limit) {
      // No reference limits, so no plan is possible. LPG-95 lands here. The series is
      // carried with the volume at stake, never silently dropped.
      const first = months[0];
      excluded.push({
        key,
        refinery: first.refinery,
        bulkPlant: first.bulkPlant,
        product: first.product,
        months: months.map((m) => m.month),
        demandKb: round(months.reduce((sum, m) => sum + m.demandKb, 0), 1),
        reason: 'no reference limits',
      });
      continue;
    }

    const opening = inventory.get(`${limit.bulkPlant}|${limit.product}`);
    const safety = safetyStock(limit);
    const baselineMean = input.baseline?.[key] ?? null;
    const isAssumed = assumed.has(limit.bulkPlant);

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
        bulkPlant: row.bulkPlant,
        product: row.product,
        demand: round(required),
        opening: round(available),
        production: round(production),
        closing: round(closing),
        shortfall: round(shortfall),
        capacity: limit.capacity,
        minLevel: limit.minLevel,
        maxLevel: limit.maxLevel,
        price,
        revenue: round(revenue, 2),
        baselineMean: baselineMean === null ? null : round(baselineMean, 1),
        lastCycleValue: input.lastCycle?.[`${key}|${row.month}`] ?? null,
        assumed: isAssumed,
      });

      closingPrev = closing;
    }
  }

  rows.sort(
    (a, b) =>
      a.month.localeCompare(b.month) ||
      a.refinery.localeCompare(b.refinery) ||
      a.bulkPlant.localeCompare(b.bulkPlant) ||
      a.product.localeCompare(b.product)
  );

  return { rows, excluded };
}

export const totalRevenue = (rows: PlanRow[]): number =>
  round(rows.reduce((sum, r) => sum + r.revenue, 0), 2);

export const totalVolume = (rows: PlanRow[]): number =>
  round(rows.reduce((sum, r) => sum + r.demand, 0), 1);

/** Rows the planner has to look at. Both are zero on a healthy plan. */
export const shortfallRows = (rows: PlanRow[]): PlanRow[] => rows.filter((r) => r.shortfall > 0);

export const bandBreachRows = (rows: PlanRow[]): PlanRow[] =>
  rows.filter((r) => r.closing < r.minLevel || r.closing > r.maxLevel);

export type RowStatus = 'critical' | 'warning' | 'ok';

/** Feasibility severity for one row. Drives the coloured left edge and the sort. */
export function feasibilityStatus(row: PlanRow): RowStatus {
  if (row.shortfall > 0 || row.closing < row.minLevel) return 'critical';
  if (row.closing > row.maxLevel || row.capacity > 0 && row.production / row.capacity > 0.95) {
    return 'warning';
  }
  return 'ok';
}

/** Reasonableness severity for one row, against the threshold that applies to it. */
export function reasonablenessStatus(row: PlanRow, threshold: number): RowStatus {
  const devs: number[] = [];
  if (row.baselineMean) devs.push(Math.abs(row.demand - row.baselineMean) / row.baselineMean);
  if (row.lastCycleValue) devs.push(Math.abs(row.demand - row.lastCycleValue) / row.lastCycleValue);
  return devs.some((d) => d > threshold) ? 'warning' : 'ok';
}

/**
 * Applies a corrected demand value to the one row a flag points at.
 *
 * `rowRef` is `refinery=JAZAN,bulk_plant=BP-JAZAN,product=DIESEL,month=2026-10`.
 * Parsing it is how a correction finds its row; matching on product alone would hit
 * every plant, which is exactly the class of bug that got the data interpreter cut.
 */
export function parseRowRef(rowRef: string): Map<string, string> {
  return new Map(
    rowRef.split(',').map((pair) => {
      const [k, ...rest] = pair.split('=');
      return [k.trim(), rest.join('=').trim()];
    })
  );
}

export function applyCorrection(
  input: PlanInput,
  rowRef: string,
  correctedValue: number
): PlanInput {
  const parts = parseRowRef(rowRef);

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

/** Applies a corrected price. Used by draft-review revisions on price fields. */
export function applyPriceCorrection(
  input: PlanInput,
  rowRef: string,
  correctedValue: number
): PlanInput {
  const parts = parseRowRef(rowRef);
  const product = parts.get('product');
  const month = parts.get('month');
  return {
    ...input,
    prices: input.prices.map((row) =>
      (product === undefined || row.product === product) &&
      (month === undefined || row.month === month)
        ? { ...row, priceUsd: correctedValue }
        : row
    ),
  };
}

/** Applies a corrected opening inventory level. */
export function applyInventoryCorrection(
  input: PlanInput,
  rowRef: string,
  correctedValue: number
): PlanInput {
  const parts = parseRowRef(rowRef);
  const bulkPlant = parts.get('bulk_plant');
  const product = parts.get('product');
  return {
    ...input,
    inventory: input.inventory.map((row) =>
      (bulkPlant === undefined || row.bulkPlant === bulkPlant) &&
      (product === undefined || row.product === product)
        ? { ...row, openingInventoryKb: correctedValue }
        : row
    ),
  };
}
