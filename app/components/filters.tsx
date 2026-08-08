'use client';

/**
 * The filter bar and pivot selector, shared by the Data Dashboard (inputs) and the
 * Plan screen (outputs). version2.md §7.5 and §7.6.
 *
 * Shared on purpose: they are two halves of one tool, split by which side of the model
 * they sit on. A selection made on one is carried to the other, so following a suspect
 * number from a plan row back to the submission that caused it is one click and no
 * re-filtering.
 */

import { useCallback } from 'react';

import type { Filters, PivotView, PlanRow } from '@/lib/types';
import { EMPTY_FILTERS, NO_FILTER, PIVOT_LABEL } from '@/lib/types';

import { createLocalStore, useLocalStore } from '../lib/local-store';
import { Chip, Field, Select } from './ui';

const filterStore = createLocalStore<Filters>('srop.filters', EMPTY_FILTERS);

/** Filters persist across screens and across a refresh. */
export function useFilters() {
  const [filters, setFilters] = useLocalStore(filterStore);

  const update = useCallback(
    (patch: Partial<Filters>) => setFilters({ ...filterStore.get(), ...patch }),
    [setFilters]
  );

  const reset = useCallback(() => setFilters(EMPTY_FILTERS), [setFilters]);

  const active = Object.values(filters).filter((v) => v !== NO_FILTER).length;

  return { filters, update, reset, active };
}

export interface Dimensioned {
  refinery: string;
  bulkPlant: string;
  product: string;
  month: string;
}

export function applyFilters<T extends Dimensioned>(rows: T[], filters: Filters): T[] {
  return rows.filter(
    (r) =>
      (filters.refinery === NO_FILTER || r.refinery === filters.refinery) &&
      (filters.bulkPlant === NO_FILTER || r.bulkPlant === filters.bulkPlant) &&
      (filters.product === NO_FILTER || r.product === filters.product) &&
      (filters.month === NO_FILTER || r.month === filters.month)
  );
}

export function FilterBar({
  rows,
  filters,
  update,
  reset,
  active,
  view,
  onView,
  views,
}: {
  rows: Dimensioned[];
  filters: Filters;
  update: (patch: Partial<Filters>) => void;
  reset: () => void;
  active: number;
  view?: PivotView;
  onView?: (v: PivotView) => void;
  views?: PivotView[];
}) {
  const opts = (key: keyof Dimensioned, label: string) => [
    { value: NO_FILTER, label },
    ...[...new Set(rows.map((r) => r[key]))].sort().map((v) => ({ value: v, label: v })),
  ];

  const productOptions = [...new Set(rows.map((r) => r.product))].sort();
  const monthOptions = [...new Set(rows.map((r) => r.month))].sort();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Refinery">
          <Select
            value={filters.refinery}
            onChange={(v) => update({ refinery: v, bulkPlant: NO_FILTER })}
            options={opts('refinery', 'All refineries')}
          />
        </Field>
        <Field label="Bulk plant">
          <Select
            value={filters.bulkPlant}
            onChange={(v) => update({ bulkPlant: v })}
            options={opts(
              'bulkPlant',
              'All plants'
            )}
          />
        </Field>
        {productOptions.length <= 6 ? (
          <Field label="Product">
            <div className="flex flex-wrap gap-1.5">
              <Chip
                active={filters.product === NO_FILTER}
                onClick={() => update({ product: NO_FILTER })}
              >
                All
              </Chip>
              {productOptions.map((p) => (
                <Chip
                  key={p}
                  active={filters.product === p}
                  onClick={() => update({ product: p })}
                >
                  {p}
                </Chip>
              ))}
            </div>
          </Field>
        ) : (
          <Field label="Product">
            <Select
              value={filters.product}
              onChange={(v) => update({ product: v })}
              options={opts('product', 'All products')}
            />
          </Field>
        )}
        {monthOptions.length <= 6 ? (
          <Field label="Month">
            <div className="flex flex-wrap gap-1.5">
              <Chip
                active={filters.month === NO_FILTER}
                onClick={() => update({ month: NO_FILTER })}
              >
                All
              </Chip>
              {monthOptions.map((m) => (
                <Chip
                  key={m}
                  active={filters.month === m}
                  onClick={() => update({ month: m })}
                >
                  {m}
                </Chip>
              ))}
            </div>
          </Field>
        ) : (
          <Field label="Month">
            <Select
              value={filters.month}
              onChange={(v) => update({ month: v })}
              options={opts('month', 'All months')}
            />
          </Field>
        )}

        {view && onView && views && (
          <Field label="View">
            <Select
              value={view}
              onChange={(v) => onView(v as PivotView)}
              options={views.map((v) => ({ value: v, label: PIVOT_LABEL[v] }))}
            />
          </Field>
        )}

        {active > 0 && (
          <button
            type="button"
            onClick={reset}
            className="mb-0.5 text-xs text-text-muted underline decoration-dotted hover:text-text"
          >
            clear {active} filter{active === 1 ? '' : 's'}
          </button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- pivoting

export interface PivotRow {
  key: string;
  labels: string[];
  demand: number;
  production: number;
  capacity: number;
  opening: number;
  closing: number;
  shortfall: number;
  minLevel: number;
  maxLevel: number;
  price: number;
  revenue: number;
  baselineMean: number | null;
  lastCycleValue: number | null;
  assumed: boolean;
  /** How many plan rows were folded into this one. 1 means no aggregation. */
  count: number;
  source: PlanRow;
}

const VIEW_KEYS: Record<PivotView, { headers: string[]; key: (r: PlanRow) => string; labels: (r: PlanRow) => string[] }> = {
  series: {
    headers: ['Month', 'Refinery', 'Bulk plant', 'Product'],
    key: (r) => `${r.month}|${r.refinery}|${r.bulkPlant}|${r.product}`,
    labels: (r) => [r.month, r.refinery, r.bulkPlant, r.product],
  },
  refinery: {
    headers: ['Month', 'Refinery'],
    key: (r) => `${r.month}|${r.refinery}`,
    labels: (r) => [r.month, r.refinery],
  },
  product: {
    headers: ['Month', 'Product'],
    key: (r) => `${r.month}|${r.product}`,
    labels: (r) => [r.month, r.product],
  },
  price: {
    headers: ['Month', 'Product'],
    key: (r) => `${r.month}|${r.product}`,
    labels: (r) => [r.month, r.product],
  },
  revenue: {
    headers: ['Month', 'Refinery'],
    key: (r) => `${r.month}|${r.refinery}`,
    labels: (r) => [r.month, r.refinery],
  },
  inventory: {
    headers: ['Month', 'Bulk plant', 'Product'],
    key: (r) => `${r.month}|${r.bulkPlant}|${r.product}`,
    labels: (r) => [r.month, r.bulkPlant, r.product],
  },
};

export const pivotHeaders = (view: PivotView) => VIEW_KEYS[view].headers;

export const isDetailView = (view: PivotView) => view === 'series' || view === 'inventory';

export function pivot(rows: PlanRow[], view: PivotView): PivotRow[] {
  const spec = VIEW_KEYS[view];
  const buckets = new Map<string, PivotRow>();

  for (const row of rows) {
    const key = spec.key(row);
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        key,
        labels: spec.labels(row),
        demand: row.demand,
        production: row.production,
        capacity: row.capacity,
        opening: row.opening,
        closing: row.closing,
        shortfall: row.shortfall,
        minLevel: row.minLevel,
        maxLevel: row.maxLevel,
        price: row.price,
        revenue: row.revenue,
        baselineMean: row.baselineMean,
        lastCycleValue: row.lastCycleValue,
        assumed: row.assumed,
        count: 1,
        source: row,
      });
      continue;
    }
    existing.demand = round(existing.demand + row.demand);
    existing.production = round(existing.production + row.production);
    existing.capacity = round(existing.capacity + row.capacity);
    existing.opening = round(existing.opening + row.opening);
    existing.closing = round(existing.closing + row.closing);
    existing.shortfall = round(existing.shortfall + row.shortfall);
    existing.minLevel = round(existing.minLevel + row.minLevel);
    existing.maxLevel = round(existing.maxLevel + row.maxLevel);
    existing.revenue = round(existing.revenue + row.revenue, 2);
    existing.baselineMean =
      existing.baselineMean === null || row.baselineMean === null
        ? existing.baselineMean
        : round(existing.baselineMean + row.baselineMean);
    existing.lastCycleValue =
      existing.lastCycleValue === null || row.lastCycleValue === null
        ? existing.lastCycleValue
        : round(existing.lastCycleValue + row.lastCycleValue);
    existing.assumed = existing.assumed || row.assumed;
    existing.count += 1;
  }

  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

const round = (n: number, dp = 1) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};
