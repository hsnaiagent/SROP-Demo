/**
 * The Validation Agent's logic. version2.md §4 and §9.2.
 *
 * Deterministic on purpose. Every rule here is arithmetic — a deviation percentage,
 * a min/max comparison, an empty-or-negative check, a set-membership test — and a
 * validation a planner cannot reproduce is one he cannot defend. This was measured
 * rather than assumed: version 1's validator was first built to compute the same
 * rules inside a model-driven sandbox, and three runs at temperature zero produced
 * three different wrong answers. See CHECKLIST.md.
 *
 * THE MATCHING RULE, which is the bug that got that approach cut: a submitted row
 * matches a reference row only when refinery AND bulk_plant AND product all match.
 * Never compare a row against a different plant's limits. An unmatched row is
 * UNKNOWN_ENTITY, not a limit breach.
 *
 * Rule order is structural -> bounded -> statistical -> relational, and it matters:
 * a missing price must report as missing, not as a 100% deviation.
 */

import {
  loadBaseline,
  loadDemand,
  loadInventory,
  loadLimits,
  loadPrices,
  loadStakeholders,
  plantOwners,
} from './csv';
import { seriesKey } from './plan';
import { DEFAULT_DEVIATION_THRESHOLD, HIGH_DEVIATION_THRESHOLD, thresholdFor } from './policy';
import type {
  Flag,
  LimitRow,
  Rule,
  Severity,
  Stakeholder,
  SubmissionKind,
  ThresholdOverride,
} from './types';

export { DEFAULT_DEVIATION_THRESHOLD, thresholdFor };

const pct = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n * 100)}%`;
const kb = (n: number) => `${round1(n)} kb`;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Deterministic and stable across runs, so re-validating a source after a correction
 * recognises the flags it already raised instead of duplicating them.
 */
const flagId = (rule: Rule, rowRef: string) => `${rule}|${rowRef}`;

interface FlagSeed {
  rule: Rule;
  severity: Severity;
  source: string;
  file: string;
  field: string;
  rowRef: string;
  submittedValue: string;
  evidence: string;
  plainEnglish: string;
}

function toFlag(seed: FlagSeed): Flag {
  return {
    id: flagId(seed.rule, seed.rowRef),
    ...seed,
    origin: 'validation',
    status: 'open',
    daysWaiting: 0,
    history: [],
  };
}

// ------------------------------------------------------------------- the rules

interface ValidateContext {
  limits: LimitRow[];
  baseline: Record<string, number>;
  overrides: ThresholdOverride[];
  /** Sources whose submission has arrived. Relational rules wait for their inputs. */
  arrived: string[];
  stakeholders: Stakeholder[];
}

export interface SourceValidation {
  flags: Flag[];
  /** True when a relational rule could not run yet because a dependency is missing. */
  crossSourcePending: boolean;
}

function limitIndex(limits: LimitRow[]) {
  return new Map(limits.map((l) => [`${l.refinery}|${l.bulkPlant}|${l.product}`, l]));
}

/** OSPAS: demand per series per month. */
function validateDemand(ctx: ValidateContext): SourceValidation {
  const file = 'OSPAS_demand_4month.csv';
  const limits = limitIndex(ctx.limits);
  const flags: Flag[] = [];

  for (const row of loadDemand()) {
    const key = seriesKey(row);
    const rowRef = `refinery=${row.refinery},bulk_plant=${row.bulkPlant},product=${row.product},month=${row.month}`;
    const base = { source: 'OSPAS', file, field: 'demand_kb', rowRef };

    // 1. structural — a missing value is reported as missing, never as a deviation
    if (!Number.isFinite(row.demandKb) || row.demandKb <= 0) {
      flags.push(
        toFlag({
          ...base,
          rule: 'ZERO_OR_MISSING',
          severity: 'medium',
          submittedValue: String(row.demandKb),
          evidence: `demand_kb is ${row.demandKb} for ${row.product} at ${row.bulkPlant}, ${row.month}`,
          plainEnglish: `No demand was submitted for ${row.product} at ${row.bulkPlant} in ${row.month}. A zero here plans no production at all.`,
        })
      );
      continue;
    }

    // 2. structural — unknown entity, checked on the full three-part key
    if (!limits.has(key)) {
      flags.push(
        toFlag({
          ...base,
          rule: 'UNKNOWN_ENTITY',
          severity: 'medium',
          submittedValue: kb(row.demandKb),
          evidence: `${row.product} at ${row.bulkPlant} is not present in ref_limits.csv — submitted ${kb(row.demandKb)}`,
          plainEnglish: `${row.product} is not a known series at ${row.bulkPlant}. Without min, max and capacity it cannot be planned, so this ${kb(row.demandKb)} would go unserved.`,
        })
      );
      continue;
    }

    // 3. statistical — deviation from the 12-month mean for THIS series
    const mean = ctx.baseline[key];
    if (mean && mean > 0) {
      const { value: threshold, override } = thresholdFor(row, ctx.overrides);
      const deviation = (row.demandKb - mean) / mean;
      if (Math.abs(deviation) > threshold) {
        flags.push(
          toFlag({
            ...base,
            rule: 'HISTORICAL_DEVIATION',
            severity: Math.abs(deviation) > HIGH_DEVIATION_THRESHOLD ? 'high' : 'medium',
            submittedValue: kb(row.demandKb),
            evidence: `submitted ${kb(row.demandKb)} vs 12-month mean ${kb(mean)} (${pct(deviation)})`,
            plainEnglish: `${row.product} demand at ${row.bulkPlant} for ${row.month} is ${pct(deviation)} against its own 12-month history${override ? ` and past the ${Math.round(threshold * 100)}% threshold set for this series` : ''}. Either something changed, or a digit did.`,
          })
        );
      }
    }
  }

  return { flags, crossSourcePending: false };
}

/** Demand Planning: prices per product per month, plus the relational price check. */
function validatePrices(ctx: ValidateContext): SourceValidation {
  const file = 'DP_product_prices.csv';
  const flags: Flag[] = [];
  const prices = loadPrices();

  for (const row of prices) {
    const rowRef = `product=${row.product},month=${row.month}`;
    if (!Number.isFinite(row.priceUsd) || row.priceUsd <= 0) {
      flags.push(
        toFlag({
          rule: 'ZERO_OR_MISSING',
          severity: 'high',
          source: 'Demand Planning',
          file,
          field: 'price_usd',
          rowRef,
          submittedValue: String(row.priceUsd),
          evidence: `price_usd is ${row.priceUsd.toFixed(1)} for ${row.product}, ${row.month}`,
          plainEnglish: `${row.product} has no price for ${row.month}. Every barrel planned that month books zero revenue, so the plan understates itself.`,
        })
      );
    }
  }

  // 4. relational — demand exists for a product nobody priced. Needs OSPAS to have
  // arrived, otherwise its absence would look like a missing product.
  const ospasArrived = ctx.arrived.includes('OSPAS');
  if (!ospasArrived) return { flags, crossSourcePending: true };

  const limits = limitIndex(ctx.limits);
  const priced = new Set(prices.map((p) => p.product));
  const demandedByProduct = new Map<string, number>();
  for (const row of loadDemand()) {
    if (!limits.has(seriesKey(row))) continue;
    demandedByProduct.set(row.product, (demandedByProduct.get(row.product) ?? 0) + row.demandKb);
  }

  for (const [product, volume] of [...demandedByProduct].sort()) {
    if (priced.has(product)) continue;
    flags.push(
      toFlag({
        rule: 'CROSS_SOURCE_CONFLICT',
        severity: 'medium',
        source: 'Demand Planning',
        file,
        field: 'price_usd',
        rowRef: `product=${product}`,
        submittedValue: 'absent',
        evidence: `${product} carries ${kb(volume)} of demand across the horizon but has no price in ${file}`,
        plainEnglish: `OSPAS submitted ${kb(volume)} of ${product} demand and Demand Planning submitted no price for it. The plan will produce it and book nothing.`,
      })
    );
  }

  return { flags, crossSourcePending: false };
}

/** A refinery: opening tank levels for the plants it owns. */
function validateInventory(source: string, ctx: ValidateContext): SourceValidation {
  const refinery = source.replace(/^Refinery\s+/, '');
  const file = `${refinery}_tank_levels.csv`;
  const limits = limitIndex(ctx.limits);
  const owners = plantOwners();
  const flags: Flag[] = [];

  for (const row of loadInventory(refinery)) {
    const owner = owners[row.bulkPlant];
    const rowRef = `bulk_plant=${row.bulkPlant},product=${row.product}`;
    const base = { source, file, field: 'opening_inventory_kb', rowRef };

    if (!Number.isFinite(row.openingInventoryKb) || row.openingInventoryKb < 0) {
      flags.push(
        toFlag({
          ...base,
          rule: 'ZERO_OR_MISSING',
          severity: 'medium',
          submittedValue: String(row.openingInventoryKb),
          evidence: `opening_inventory_kb is ${row.openingInventoryKb} for ${row.product} at ${row.bulkPlant}`,
          plainEnglish: `No opening tank level for ${row.product} at ${row.bulkPlant}. The plan will assume an empty tank and over-produce.`,
        })
      );
      continue;
    }

    // THE MATCHING RULE. All three parts, or it is an unknown entity.
    const limit = owner ? limits.get(`${owner}|${row.bulkPlant}|${row.product}`) : undefined;
    if (!limit) {
      flags.push(
        toFlag({
          ...base,
          rule: 'UNKNOWN_ENTITY',
          severity: 'medium',
          submittedValue: kb(row.openingInventoryKb),
          evidence: `${row.product} at ${row.bulkPlant} is not present in ref_limits.csv — submitted ${kb(row.openingInventoryKb)}`,
          plainEnglish: `${row.product} at ${row.bulkPlant} has no reference limits, so this level cannot be checked against anything.`,
        })
      );
      continue;
    }

    if (row.openingInventoryKb > limit.maxLevel) {
      flags.push(
        toFlag({
          ...base,
          rule: 'LIMIT_BREACH',
          severity: 'high',
          submittedValue: kb(row.openingInventoryKb),
          evidence: `opening inventory ${kb(row.openingInventoryKb)} is above max_level ${kb(limit.maxLevel)} at ${row.bulkPlant}`,
          plainEnglish: `${row.product} at ${row.bulkPlant} opens ${kb(row.openingInventoryKb - limit.maxLevel)} over its own maximum tank level. Either the tank is genuinely over-filled or the figure is wrong.`,
        })
      );
    } else if (row.openingInventoryKb < limit.minLevel) {
      flags.push(
        toFlag({
          ...base,
          rule: 'LIMIT_BREACH',
          severity: 'high',
          submittedValue: kb(row.openingInventoryKb),
          evidence: `opening inventory ${kb(row.openingInventoryKb)} is below min_level ${kb(limit.minLevel)} at ${row.bulkPlant}`,
          plainEnglish: `${row.product} at ${row.bulkPlant} opens ${kb(limit.minLevel - row.openingInventoryKb)} below its minimum tank level, which is a supply risk before the month even starts.`,
        })
      );
    }
  }

  return { flags, crossSourcePending: false };
}

// ------------------------------------------------------------------ the driver

export function kindForSource(source: string, stakeholders: Stakeholder[]): SubmissionKind | null {
  const s = stakeholders.find((x) => x.name === source);
  return s?.submits[0] ?? null;
}

/**
 * One source, one call. Instances are independent: a crash here leaves every other
 * source untouched, which is what "in parallel" means in §9.2.
 *
 * There is deliberately no default return value on failure. An empty flag list is
 * indistinguishable from a clean submission, and would mark a source clean precisely
 * because its validation broke. The caller must let the throw surface.
 */
export function validateSource(
  source: string,
  opts: { overrides?: ThresholdOverride[]; arrived?: string[] } = {}
): SourceValidation {
  const stakeholders = loadStakeholders();
  const ctx: ValidateContext = {
    limits: loadLimits(),
    baseline: loadBaseline(),
    overrides: opts.overrides ?? [],
    arrived: opts.arrived ?? [],
    stakeholders,
  };

  const kind = kindForSource(source, stakeholders);
  if (kind === 'demand') return validateDemand(ctx);
  if (kind === 'prices') return validatePrices(ctx);
  if (kind === 'inventory') return validateInventory(source, ctx);

  throw new Error(`${source} submits no data, so there is nothing to validate`);
}

/** Human summary for the header. Counts, not prose about counts. */
export function summarise(flags: Flag[], cleanSources: string[]): string {
  if (flags.length === 0) {
    return `All ${cleanSources.length} submissions clean — no anomalies against history or reference limits.`;
  }
  const sources = new Set(flags.map((f) => f.source)).size;
  const high = flags.filter((f) => f.severity === 'high').length;
  return `${flags.length} anomalies across ${sources} ${sources === 1 ? 'source' : 'sources'}${
    high ? `, ${high} high severity` : ''
  }. ${cleanSources.length} ${cleanSources.length === 1 ? 'submission' : 'submissions'} clean.`;
}
