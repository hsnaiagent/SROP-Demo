/**
 * Applies planner corrections to fixture submission data. Pure — safe for client bundles.
 */

import type { CycleRecord, PlanInput, Stakeholder } from './types';

export function resolvedPlanInput(
  cycle: CycleRecord,
  base: PlanInput,
  stakeholders: Stakeholder[]
): PlanInput {
  let input = base;
  const assumedPlants: string[] = [];

  for (const submission of cycle.submissions) {
    if (!submission.assumed) continue;
    const s = stakeholders.find((r) => r.name === submission.source);
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
