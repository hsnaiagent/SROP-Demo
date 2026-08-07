/**
 * Correction materiality. version2.md §7.4.
 *
 * The same arithmetic version 1 put in a 32-row before/after table, moved to the one
 * place it is useful: the confirmation step, before the planner commits. On the plan
 * screen it told him about corrections he had already made. Here it tells him what a
 * correction is worth while he is deciding whether to make it — and until the number
 * is on screen, a flag worth $1.45M and one worth $200 look identical.
 */

import { loadPlanInput } from './csv';
import {
  applyCorrection,
  applyInventoryCorrection,
  applyPriceCorrection,
  buildPlan,
  parseRowRef,
  totalRevenue,
} from './plan';
import type { PlanImpact, PlanInput } from './types';

const round = (n: number, dp = 1) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Which of the three inputs a field lives in. Fields not listed do not reach the plan. */
function applyByField(input: PlanInput, field: string, rowRef: string, value: number): PlanInput | null {
  if (field === 'demand_kb') return applyCorrection(input, rowRef, value);
  if (field === 'price_usd') return applyPriceCorrection(input, rowRef, value);
  if (field === 'opening_inventory_kb') return applyInventoryCorrection(input, rowRef, value);
  return null;
}

/**
 * Runs the plan with and without one change and reports the difference.
 *
 * Deliberately synchronous and cheap — it is ~85 demand rows of arithmetic, so it can
 * run on every keystroke of the confirmation dialog without anyone noticing.
 */
export function correctionImpact(
  field: string,
  rowRef: string,
  correctedValue: number
): PlanImpact {
  const parts = parseRowRef(rowRef);
  const monthLabel = parts.get('month') ?? 'the horizon';
  const plantLabel = parts.get('bulk_plant') ?? parts.get('product') ?? 'this series';

  const base: PlanImpact = {
    rowRef,
    productionDelta: 0,
    revenueDelta: 0,
    monthLabel,
    plantLabel,
    reachesPlan: false,
  };

  const input = loadPlanInput();
  const corrected = applyByField(input, field, rowRef, correctedValue);
  if (!corrected) return base;

  const before = buildPlan(input);
  const after = buildPlan(corrected);

  // Sum the production movement rather than picking one row: a change in month one
  // rolls through the closing inventory of every later month in the same series.
  let productionDelta = 0;
  for (let i = 0; i < before.rows.length; i += 1) {
    productionDelta += after.rows[i].production - before.rows[i].production;
  }

  return {
    ...base,
    reachesPlan: true,
    productionDelta: round(productionDelta),
    revenueDelta: round(totalRevenue(after.rows) - totalRevenue(before.rows), 2),
  };
}

/** The one-line sentence shown on the confirmation step. */
export function impactSentence(impact: PlanImpact, correctedValue: string): string {
  if (!impact.reachesPlan) {
    return `Applying ${correctedValue} changes reference data only — it does not move the plan.`;
  }
  if (impact.productionDelta === 0 && impact.revenueDelta === 0) {
    return `Applying ${correctedValue} leaves the plan unchanged — the value is absorbed by existing inventory.`;
  }
  const vol = `${impact.productionDelta > 0 ? '+' : '−'}${Math.abs(impact.productionDelta)} kb`;
  const money = formatMoneyDelta(impact.revenueDelta);
  return `Applying ${correctedValue} changes ${impact.monthLabel} production at ${impact.plantLabel} by ${vol} and plan revenue by ${money}.`;
}

export function formatMoneyDelta(delta: number): string {
  const sign = delta < 0 ? '−' : '+';
  const abs = Math.abs(delta);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}
