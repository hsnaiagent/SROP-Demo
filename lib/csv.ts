/**
 * Server-side reads of `data/`. Nothing here touches the network and nothing here
 * mutates a file — `data/` is the fixture set and is read-only at runtime.
 *
 * Version 2 discovers the refinery inventory files from `stakeholders.json` rather
 * than hardcoding two of them, so adding a refinery is a data change.
 */

import fs from 'node:fs';
import path from 'node:path';

import type {
  InventoryRow,
  LimitRow,
  OutageRow,
  PlanInput,
  PriceRow,
  ReferenceData,
  Stakeholder,
  SubmissionFile,
  SubmissionKind,
} from './types';

export const DATA_DIR = path.join(process.cwd(), 'data');

export type CsvRow = Record<string, string>;

/**
 * Hand-rolled because these files have no quoted fields or embedded commas.
 *
 * data/*.csv are CRLF on Windows. Splitting on '\n' alone leaves a trailing '\r' on
 * the last column of every row — which is exactly demand_kb, price_usd and
 * opening_inventory_kb. Number('30.3\r') is NaN, so every quantity silently becomes
 * zero and the whole plan comes out empty. Split on /\r?\n/.
 */
export function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const header = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? '').trim()]));
  });
}

const cache = new Map<string, CsvRow[]>();

export function readCsv(name: string): CsvRow[] {
  const hit = cache.get(name);
  if (hit) return hit;
  const rows = parseCsv(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
  cache.set(name, rows);
  return rows;
}

export function readJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8')) as T;
}

export function fileExists(name: string): boolean {
  return fs.existsSync(path.join(DATA_DIR, name));
}

const num = (v: string | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ------------------------------------------------------------------- directory

export function loadStakeholders(): Stakeholder[] {
  return readJson<Stakeholder[]>('stakeholders.json');
}

export function refineries(): Stakeholder[] {
  return loadStakeholders().filter((s) => s.kind === 'refinery');
}

export function inventoryFileFor(refinery: string): string {
  return `sub_inv_${refinery.toLowerCase()}.csv`;
}

/** Bulk plant -> the refinery that owns it. The authority check depends on this. */
export function plantOwners(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of refineries()) {
    for (const plant of s.ownsPlants) out[plant] = s.refinery!;
  }
  return out;
}

// --------------------------------------------------------------- typed loaders

export const loadLimits = (): LimitRow[] =>
  readCsv('ref_limits.csv').map((r) => ({
    refinery: r.refinery,
    bulkPlant: r.bulk_plant,
    product: r.product,
    minLevel: num(r.min_level),
    maxLevel: num(r.max_level),
    capacity: num(r.capacity),
  }));

export const loadPrices = (): PriceRow[] =>
  readCsv('sub_prices.csv').map((r) => ({
    product: r.product,
    month: r.month,
    priceUsd: num(r.price_usd),
  }));

export const loadDemand = () =>
  readCsv('sub_demand.csv').map((r) => ({
    refinery: r.refinery,
    bulkPlant: r.bulk_plant,
    product: r.product,
    month: r.month,
    demandKb: num(r.demand_kb),
  }));

export const loadOutage = (): OutageRow[] =>
  readCsv('ref_outage.csv').map((r) => ({
    bulkPlant: r.bulk_plant,
    month: r.month,
    outageDays: num(r.outage_days),
  }));

export function loadInventory(refinery?: string): InventoryRow[] {
  const files = refinery
    ? [inventoryFileFor(refinery)]
    : refineries().map((s) => inventoryFileFor(s.refinery!));
  return files
    .filter(fileExists)
    .flatMap((f) => readCsv(f))
    .map((r) => ({
      bulkPlant: r.bulk_plant,
      product: r.product,
      openingInventoryKb: num(r.opening_inventory_kb),
    }));
}

/** `REFINERY|PLANT|PRODUCT` -> 12-month mean. The deviation rule's denominator. */
export function loadBaseline(): Record<string, number> {
  const buckets = new Map<string, number[]>();
  for (const r of readCsv('history_baseline.csv')) {
    const key = `${r.refinery}|${r.bulk_plant}|${r.product}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(num(r.demand_kb));
    else buckets.set(key, [num(r.demand_kb)]);
  }
  const out: Record<string, number> = {};
  for (const [key, values] of buckets) {
    out[key] = values.reduce((a, b) => a + b, 0) / values.length;
  }
  return out;
}

/** The same history, kept as a series, for the dashboard chart. */
export function loadBaselineSeries(): Record<string, Array<{ month: string; value: number }>> {
  const out: Record<string, Array<{ month: string; value: number }>> = {};
  for (const r of readCsv('history_baseline.csv')) {
    const key = `${r.refinery}|${r.bulk_plant}|${r.product}`;
    (out[key] ??= []).push({ month: r.month, value: num(r.demand_kb) });
  }
  for (const series of Object.values(out)) series.sort((a, b) => a.month.localeCompare(b.month));
  return out;
}

interface PrevCycle {
  id: string;
  horizon: string[];
  demand: Record<string, number>;
  requestTemplate: Array<{ recipient: string; items: string[] }>;
}

export const loadPrevCycle = (): PrevCycle => readJson<PrevCycle>('prev_cycle.json');

export function loadPlanInput(): PlanInput {
  return {
    demand: loadDemand(),
    prices: loadPrices(),
    limits: loadLimits(),
    inventory: loadInventory(),
    baseline: loadBaseline(),
    lastCycle: loadPrevCycle().demand,
  };
}

export function loadReference(): ReferenceData {
  const prev = loadPrevCycle();
  return {
    limits: loadLimits(),
    outage: loadOutage(),
    baseline: loadBaseline(),
    baselineSeries: loadBaselineSeries(),
    stakeholders: loadStakeholders(),
    lastCycle: prev.demand,
    requestTemplate: prev.requestTemplate,
  };
}

// ------------------------------------------------------------- submission meta

/** What a source's submission looks like on the Submissions card. */
export function submissionFilesFor(source: string, kind: SubmissionKind): SubmissionFile[] {
  const describe = (name: string, rows: CsvRow[]): SubmissionFile => ({
    name,
    kind: name.endsWith('.xlsx') ? 'xlsx' : 'csv',
    sizeKb: Math.max(1, Math.round(rows.length * 0.06 * 10) / 10),
    rowCount: rows.length,
    columns: Object.keys(rows[0] ?? {}),
  });

  if (kind === 'demand') return [describe('OSPAS_demand_4month.csv', readCsv('sub_demand.csv'))];
  if (kind === 'prices') return [describe('DP_product_prices.csv', readCsv('sub_prices.csv'))];

  const refinery = source.replace(/^Refinery\s+/, '');
  const file = inventoryFileFor(refinery);
  if (!fileExists(file)) return [];
  return [describe(`${refinery}_tank_levels.csv`, readCsv(file))];
}
