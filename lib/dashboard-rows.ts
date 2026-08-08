/**
 * Input-side rows for the Data Dashboard. version2.md §7.5.
 *
 * Built from validated submissions (with planner corrections applied), not from plan
 * outputs — so the screen is useful after validation and before the model runs.
 */

import { resolvedPlanInput } from './resolved-input';
import { buildPlan, seriesKey } from './plan';
import type { CycleRecord, Flag, ReferenceData } from './types';

export interface DashboardRow {
  key: string;
  refinery: string;
  bulkPlant: string;
  product: string;
  month: string;
  submitted: number | null;
  baseline: number | null;
  lastCycle: number | null;
  minLevel: number;
  maxLevel: number;
  capacity: number;
  price: number;
  outageDays: number;
  source: string;
  assumed: boolean;
  flagStatus: string | null;
  excluded: boolean;
}

function flagForDemandRow(
  flags: Flag[],
  row: { refinery: string; bulkPlant: string; product: string; month: string }
): Flag | undefined {
  return flags.find(
    (f) =>
      f.field === 'demand_kb' &&
      f.rowRef.includes(`refinery=${row.refinery}`) &&
      f.rowRef.includes(`bulk_plant=${row.bulkPlant}`) &&
      f.rowRef.includes(`product=${row.product}`) &&
      f.rowRef.includes(`month=${row.month}`)
  );
}

function submissionsReceived(cycle: CycleRecord): boolean {
  return cycle.submissions.some((s) => s.versions.length > 0 || s.assumed);
}

export function buildDashboardRows(cycle: CycleRecord, reference: ReferenceData): DashboardRow[] {
  const outage = new Map(reference.outage.map((o) => [`${o.bulkPlant}|${o.month}`, o.outageDays]));
  const assumedPlants = new Set(
    cycle.submissions
      .filter((s) => s.assumed)
      .flatMap((s) => reference.stakeholders.find((x) => x.name === s.source)?.ownsPlants ?? [])
  );

  if (submissionsReceived(cycle)) {
    const input = resolvedPlanInput(cycle, reference.planInput, reference.stakeholders);
    const { rows: planned, excluded } = buildPlan(input);
    const out: DashboardRow[] = planned.map((r) => {
      const flag = flagForDemandRow(cycle.flags, r);
      return {
        key: `${r.refinery}|${r.bulkPlant}|${r.product}|${r.month}`,
        refinery: r.refinery,
        bulkPlant: r.bulkPlant,
        product: r.product,
        month: r.month,
        submitted: r.demand,
        baseline: r.baselineMean,
        lastCycle: r.lastCycleValue,
        minLevel: r.minLevel,
        maxLevel: r.maxLevel,
        capacity: r.capacity,
        price: r.price,
        outageDays: outage.get(`${r.bulkPlant}|${r.month}`) ?? 0,
        source: 'OSPAS',
        assumed: r.assumed,
        flagStatus: flag?.status ?? null,
        excluded: false,
      };
    });

    for (const series of excluded) {
      for (const month of series.months) {
        const flag = flagForDemandRow(cycle.flags, {
          refinery: series.refinery,
          bulkPlant: series.bulkPlant,
          product: series.product,
          month,
        });
        out.push({
          key: `${series.key}|${month}`,
          refinery: series.refinery,
          bulkPlant: series.bulkPlant,
          product: series.product,
          month,
          submitted: series.demandKb / series.months.length,
          baseline: null,
          lastCycle: null,
          minLevel: 0,
          maxLevel: 0,
          capacity: 0,
          price: 0,
          outageDays: outage.get(`${series.bulkPlant}|${month}`) ?? 0,
          source: 'OSPAS',
          assumed: assumedPlants.has(series.bulkPlant),
          flagStatus: flag?.status ?? null,
          excluded: true,
        });
      }
    }

    return out;
  }

  // Before any submission lands: reference bands and history only (version2.md §7.5).
  const prices = new Map(
    reference.planInput.prices.map((p) => [`${p.product}|${p.month}`, p.priceUsd])
  );
  const out: DashboardRow[] = [];

  for (const limit of reference.limits) {
    const sk = seriesKey(limit);
    const baseline = reference.baseline[sk] ?? null;
    for (const month of reference.horizon) {
      out.push({
        key: `${limit.refinery}|${limit.bulkPlant}|${limit.product}|${month}`,
        refinery: limit.refinery,
        bulkPlant: limit.bulkPlant,
        product: limit.product,
        month,
        submitted: null,
        baseline,
        lastCycle: reference.lastCycle[`${sk}|${month}`] ?? null,
        minLevel: limit.minLevel,
        maxLevel: limit.maxLevel,
        capacity: limit.capacity,
        price: prices.get(`${limit.product}|${month}`) ?? 0,
        outageDays: outage.get(`${limit.bulkPlant}|${month}`) ?? 0,
        source: '—',
        assumed: assumedPlants.has(limit.bulkPlant),
        flagStatus: null,
        excluded: false,
      });
    }
  }

  return out;
}
