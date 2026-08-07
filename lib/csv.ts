/**
 * CSV loading for the server side. Hand-rolled rather than pulling in papaparse:
 * these six files have no quoted fields and no embedded commas, and the parser is
 * fifteen lines. Scope discipline — no new dependencies after Block 4.
 *
 * The one thing you must not get wrong is the line split. See below.
 */

import fs from 'node:fs';
import path from 'node:path';

import type { DemandRow, InventoryRow, LimitRow, PlanInput, PriceRow } from './types';

export const DATA_DIR = path.join(process.cwd(), 'data');

export const SUBMISSION_FILES = [
  'sub_demand.csv',
  'sub_prices.csv',
  'sub_inv_yanbu.csv',
  'sub_inv_jazan.csv',
] as const;

export const REFERENCE_FILES = ['ref_limits.csv', 'history_baseline.csv'] as const;

/** Which stakeholder each file came from. Mirrors the table in the North prompt. */
export const SOURCE_BY_FILE: Record<string, string> = {
  'sub_demand.csv': 'OSPAS',
  'sub_prices.csv': 'Demand Planning',
  'sub_inv_yanbu.csv': 'Refinery YANBU',
  'sub_inv_jazan.csv': 'Refinery JAZAN',
};

export type CsvRow = Record<string, string>;

/**
 * NOTE: data/*.csv are CRLF. Splitting on '\n' alone leaves a trailing '\r' on the
 * LAST column of every row — which is exactly demand_kb, price_usd and
 * opening_inventory_kb. Number('30.3\r') is NaN, so every quantity silently becomes
 * zero and the plan comes out empty without throwing anything. Always /\r?\n/.
 */
export function parseCsv(text: string): { header: string[]; rows: CsvRow[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { header: [], rows: [] };

  const header = lines[0].split(',').map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? '').trim()]));
  });

  return { header, rows };
}

const readFile = (name: string) => fs.readFileSync(path.join(DATA_DIR, name), 'utf8');

export const readCsv = (name: string) => parseCsv(readFile(name));

/** Blank, missing and non-numeric all collapse to 0 — R3's job is to flag them, not ours. */
const num = (v: string | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ------------------------------------------------------------------ plan input

export function loadPlanInput(): PlanInput {
  const demand: DemandRow[] = readCsv('sub_demand.csv').rows.map((r) => ({
    refinery: r.refinery,
    bulkPlant: r.bulk_plant,
    product: r.product,
    month: r.month,
    demandKb: num(r.demand_kb),
  }));

  const prices: PriceRow[] = readCsv('sub_prices.csv').rows.map((r) => ({
    product: r.product,
    month: r.month,
    priceUsd: num(r.price_usd),
  }));

  const limits: LimitRow[] = readCsv('ref_limits.csv').rows.map((r) => ({
    refinery: r.refinery,
    bulkPlant: r.bulk_plant,
    product: r.product,
    minLevel: num(r.min_level),
    maxLevel: num(r.max_level),
    capacity: num(r.capacity),
  }));

  const inventory: InventoryRow[] = [
    ...readCsv('sub_inv_yanbu.csv').rows,
    ...readCsv('sub_inv_jazan.csv').rows,
  ].map((r) => ({
    bulkPlant: r.bulk_plant,
    product: r.product,
    openingInventoryKb: num(r.opening_inventory_kb),
  }));

  return { demand, prices, limits, inventory };
}

// ---------------------------------------------------------------- text bundles

/**
 * The `=== FILE: name ===` marker is not decoration — the source-attribution table
 * in the North prompt keys off it to set each flag's `source`. Change the format
 * here and you must change the prompt too.
 */
const bundle = (names: readonly string[]): string =>
  names.map((n) => `=== FILE: ${n} ===\n${readFile(n).trim()}`).join('\n\n');

export const buildSubmissionsText = () => bundle(SUBMISSION_FILES);
export const buildReferenceText = () => bundle(REFERENCE_FILES);

// -------------------------------------------------------------- pane 1 support

export interface SubmissionMeta {
  file: string;
  source: string;
  /** Column headers differ between files on purpose — that heterogeneity is the point. */
  columns: string[];
  rowCount: number;
}

export function loadSubmissionMeta(): SubmissionMeta[] {
  return SUBMISSION_FILES.map((file) => {
    const { header, rows } = readCsv(file);
    return {
      file,
      source: SOURCE_BY_FILE[file] ?? file,
      columns: header,
      rowCount: rows.length,
    };
  });
}
