/**
 * The Intake Agent. version2.md §9.3.
 *
 * Takes six unrelated shapes and produces the one multi-sheet workbook the LP model
 * reads. Four content rules, all enforced here:
 *
 *   1. only validated data enters — clean, justified, corrected, or explicitly assumed
 *   2. every sheet is traceable back to a submission and a version
 *   3. excluded series are carried and marked, never dropped
 *   4. assumed data is marked in the workbook itself, not only in the platform
 *
 * Rule 5, staleness, is not here: the agent holds no state between runs and so cannot
 * know it has been superseded. The platform tracks that and refuses Gate 2.
 *
 * The workbook is emitted as a sheet model plus CSV text per sheet. A real .xlsx would
 * need a dependency this project does not carry, and the demo shows and downloads the
 * workbook rather than reading one back.
 */

import { loadInventory, loadLimits, loadOutage, refineries } from './csv';
import { buildPlan, seriesKey } from './plan';
import { now } from './store';
import type { CycleRecord, MasterFile, MasterSheet, PlanInput } from './types';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/**
 * Applies every resolved correction the planner made, so the workbook carries the
 * validated numbers rather than the submitted ones.
 */
export function resolvedPlanInput(cycle: CycleRecord, base: PlanInput): PlanInput {
  let input = base;
  const assumedPlants: string[] = [];

  for (const submission of cycle.submissions) {
    if (!submission.assumed) continue;
    const s = refineries().find((r) => r.name === submission.source);
    if (s) assumedPlants.push(...s.ownsPlants);
  }

  for (const flag of cycle.flags) {
    if (flag.status !== 'corrected' || !flag.correctedValue) continue;
    const value = Number(flag.correctedValue);
    if (!Number.isFinite(value)) continue;
    input = applyToField(input, flag.field, flag.rowRef, value);
  }

  for (const revision of cycle.revisions) {
    if (revision.status !== 'accepted') continue;
    for (const change of revision.changes) {
      if (change.verdict === 'out_of_scope') continue;
      input = applyToField(input, change.field, change.rowRef, change.after);
    }
  }

  for (const comment of cycle.comments) {
    if (comment.status !== 'accepted' || comment.proposedValue === null) continue;
    input = applyToField(input, 'demand_kb', comment.rowRef, comment.proposedValue);
  }

  return { ...input, assumedPlants };
}

function applyToField(input: PlanInput, field: string, rowRef: string, value: number): PlanInput {
  const parts = new Map(
    rowRef.split(',').map((p) => {
      const [k, ...rest] = p.split('=');
      return [k.trim(), rest.join('=').trim()];
    })
  );

  if (field === 'demand_kb') {
    return {
      ...input,
      demand: input.demand.map((r) =>
        r.refinery === parts.get('refinery') &&
        r.bulkPlant === parts.get('bulk_plant') &&
        r.product === parts.get('product') &&
        r.month === parts.get('month')
          ? { ...r, demandKb: value }
          : r
      ),
    };
  }
  if (field === 'price_usd') {
    return {
      ...input,
      prices: input.prices.map((r) =>
        r.product === parts.get('product') && r.month === parts.get('month')
          ? { ...r, priceUsd: value }
          : r
      ),
    };
  }
  if (field === 'opening_inventory_kb') {
    return {
      ...input,
      inventory: input.inventory.map((r) =>
        r.bulkPlant === parts.get('bulk_plant') && r.product === parts.get('product')
          ? { ...r, openingInventoryKb: value }
          : r
      ),
    };
  }
  return input;
}

/** Builds the workbook. Throws rather than emitting a partial one. */
export function buildMasterFile(cycle: CycleRecord, input: PlanInput): MasterFile {
  const unresolved = cycle.flags.filter(
    (f) => f.status === 'open' || f.status === 'awaiting_response' || f.status === 'responded' || f.status === 'escalated'
  );
  if (unresolved.length > 0) {
    throw new Error(
      `${unresolved.length} flags are still unresolved. Only validated data enters the workbook.`
    );
  }

  const version = (source: string) => {
    const sub = cycle.submissions.find((s) => s.source === source);
    if (!sub) return 'not submitted';
    if (sub.assumed) return 'assumed — carried from cycle 2026-08';
    return `v${sub.versions.length}, received ${sub.versions.at(-1)?.receivedAt.slice(0, 10) ?? '—'}`;
  };

  const assumed = new Set(input.assumedPlants ?? []);
  const mark = (plant: string) => (assumed.has(plant) ? 'ASSUMED' : '');

  const sheets: MasterSheet[] = [];

  // 1. Demand
  sheets.push({
    name: 'Demand',
    columns: ['refinery', 'bulk_plant', 'product', 'month', 'demand_kb', 'basis'],
    sourceTrace: `OSPAS — ${version('OSPAS')}`,
    rows: input.demand.map((r) => [
      r.refinery, r.bulkPlant, r.product, r.month, fmt(r.demandKb), mark(r.bulkPlant) || 'submitted',
    ]),
    rowCount: input.demand.length,
  });

  // 2. Prices
  sheets.push({
    name: 'Prices',
    columns: ['product', 'month', 'price_usd'],
    sourceTrace: `Demand Planning — ${version('Demand Planning')}`,
    rows: input.prices.map((r) => [r.product, r.month, fmt(r.priceUsd)]),
    rowCount: input.prices.length,
  });

  // 3. One inventory sheet per refinery, so the source trace stays per-source
  for (const s of refineries()) {
    const rows = loadInventory(s.refinery!).map((r) => {
      const current = input.inventory.find(
        (i) => i.bulkPlant === r.bulkPlant && i.product === r.product
      );
      return [
        r.bulkPlant,
        r.product,
        fmt(current?.openingInventoryKb ?? r.openingInventoryKb),
        mark(r.bulkPlant) || 'submitted',
      ];
    });
    sheets.push({
      name: `Inventory ${s.refinery}`,
      columns: ['bulk_plant', 'product', 'opening_inventory_kb', 'basis'],
      sourceTrace: `${s.name} — ${version(s.name)}`,
      rows,
      rowCount: rows.length,
    });
  }

  // 4. Reference limits
  const limits = loadLimits();
  sheets.push({
    name: 'Limits',
    columns: ['refinery', 'bulk_plant', 'product', 'min_level', 'max_level', 'capacity'],
    sourceTrace: 'Reference tables — refinery-maintained',
    rows: limits.map((r) => [
      r.refinery, r.bulkPlant, r.product, fmt(r.minLevel), fmt(r.maxLevel), fmt(r.capacity),
    ]),
    rowCount: limits.length,
  });

  // 5. Outage
  const outage = loadOutage();
  sheets.push({
    name: 'Outage',
    columns: ['bulk_plant', 'month', 'outage_days'],
    sourceTrace: 'Reference tables — refinery-maintained',
    rows: outage.map((r) => [r.bulkPlant, r.month, fmt(r.outageDays)]),
    rowCount: outage.length,
  });

  // 6. Excluded series — carried and marked, never dropped, so the model can report
  // them as excluded instead of silently omitting the volume.
  const { excluded } = buildPlan(input);
  sheets.push({
    name: 'Excluded',
    columns: ['refinery', 'bulk_plant', 'product', 'months', 'demand_kb', 'reason'],
    sourceTrace: 'Derived — series with no reference limits',
    rows: excluded.map((e) => [
      e.refinery, e.bulkPlant, e.product, e.months.join(' '), fmt(e.demandKb), e.reason,
    ]),
    rowCount: excluded.length,
  });

  return {
    builtAt: now(),
    builtFromFlagCount: cycle.flags.length,
    sheets,
    stale: false,
    staleReason: null,
    approvedByPlanner: false,
    approvedAt: null,
  };
}

/** One CSV per sheet, concatenated with sheet markers. What Download produces. */
export function masterFileText(master: MasterFile): string {
  return master.sheets
    .map((sheet) => {
      const head = `=== SHEET: ${sheet.name} === (${sheet.rowCount} rows · ${sheet.sourceTrace})`;
      const body = [sheet.columns.join(','), ...sheet.rows.map((r) => r.join(','))].join('\n');
      return `${head}\n${body}`;
    })
    .join('\n\n');
}

/** Any change to underlying data makes the build stale, and Gate 2 will not pass. */
export function markStale(cycle: CycleRecord, reason: string): void {
  if (!cycle.masterFile) return;
  cycle.masterFile.stale = true;
  cycle.masterFile.staleReason = reason;
  cycle.masterFile.approvedByPlanner = false;
  cycle.masterFile.approvedAt = null;
}

export const seriesKeyOf = seriesKey;
