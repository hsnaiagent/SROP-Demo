'use client';

/**
 * Screen 5 — Data Dashboard. version2.md §7.5.
 *
 * The inputs half of the same tool the Plan screen is the outputs half of. Independent
 * of flag status: this is where Y checks the whole picture is sane, whether or not
 * anything was flagged. Filters and the pivot selector are shared with the Plan screen
 * and a selection carries between them.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { thresholdFor } from '@/lib/policy';
import type { PivotView } from '@/lib/types';
import { NO_FILTER } from '@/lib/types';

import { useCycle } from '../providers';
import { FilterBar, useFilters, type Dimensioned } from '../components/filters';
import {
  Badge,
  Banner,
  Button,
  Card,
  Cell,
  EmptyState,
  Row,
  Screen,
  Select,
  Table,
  fmtPct,
  relTime,
} from '../components/ui';

interface DataRow extends Dimensioned {
  key: string;
  submitted: number;
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

const VIEWS: PivotView[] = ['series', 'refinery', 'product', 'price'];

export default function DashboardPage() {
  const { cycle, reference, act, busy } = useCycle();
  const { filters, update, reset, active } = useFilters();
  const [view, setView] = useState<PivotView>('series');
  const [showOk, setShowOk] = useState(true);

  const rows = useMemo<DataRow[]>(() => {
    if (!cycle || !reference) return [];

    const limits = new Map(
      reference.limits.map((l) => [`${l.refinery}|${l.bulkPlant}|${l.product}`, l])
    );
    const outage = new Map(reference.outage.map((o) => [`${o.bulkPlant}|${o.month}`, o.outageDays]));
    const assumedPlants = new Set(
      cycle.submissions
        .filter((s) => s.assumed)
        .flatMap((s) => reference.stakeholders.find((x) => x.name === s.source)?.ownsPlants ?? [])
    );

    // Submitted demand comes from the plan rows once a draft exists, and from the
    // reference baseline before that — the screen is useful before the model runs.
    const draft = cycle.drafts.at(-1);
    const planned = draft?.planRows ?? [];

    const seen = new Set<string>();
    const out: DataRow[] = [];

    for (const r of planned) {
      const key = `${r.refinery}|${r.bulkPlant}|${r.product}|${r.month}`;
      seen.add(key);
      const flag = cycle.flags.find((f) => f.rowRef.includes(`product=${r.product},month=${r.month}`) && f.rowRef.includes(`bulk_plant=${r.bulkPlant}`));
      out.push({
        key,
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
      });
    }

    // Excluded series still belong on the dashboard — they have demand, just no limits.
    for (const series of draft?.excluded ?? []) {
      for (const month of series.months) {
        const key = `${series.key}|${month}`;
        if (seen.has(key)) continue;
        out.push({
          key,
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
          flagStatus: cycle.flags.find((f) => f.rowRef.includes(`product=${series.product}`))?.status ?? null,
          excluded: true,
        });
      }
    }

    void limits;
    return out;
  }, [cycle, reference]);

  if (!cycle || !reference) {
    return (
      <Screen title="Data Dashboard">
        <EmptyState title="No cycle open">Start a cycle on Cycle Home first.</EmptyState>
      </Screen>
    );
  }

  const filtered = rows.filter(
    (r) =>
      (filters.refinery === NO_FILTER || r.refinery === filters.refinery) &&
      (filters.bulkPlant === NO_FILTER || r.bulkPlant === filters.bulkPlant) &&
      (filters.product === NO_FILTER || r.product === filters.product) &&
      (filters.month === NO_FILTER || r.month === filters.month)
  );

  const visible = showOk ? filtered : filtered.filter((r) => r.flagStatus || r.excluded || r.assumed);

  return (
    <Screen
      title="Data Dashboard"
      lede="The inputs, against history and against the reference limits. This is the check that precedes approving a run — independent of whether anything was flagged."
      actions={
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={showOk}
            onChange={(e) => setShowOk(e.target.checked)}
            className="size-3.5 accent-amber-500"
          />
          show rows with nothing to look at
        </label>
      }
    >
      {rows.length === 0 && (
        <Banner tone="info" title="Submitted values appear once the plan has been run">
          Before then, the reference bands and the twelve-month history are all the platform has.
          Validate the submissions and run the plan to populate this screen.
        </Banner>
      )}

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <FilterBar
            rows={rows}
            filters={filters}
            update={update}
            reset={reset}
            active={active}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">View</span>
            <Select
              value={view}
              onChange={(v) => setView(v as PivotView)}
              options={VIEWS.map((v) => ({
                value: v,
                label:
                  v === 'series'
                    ? 'Series by month'
                    : v === 'refinery'
                      ? 'Volume by refinery'
                      : v === 'product'
                        ? 'Volume by product'
                        : 'Price by product',
              }))}
            />
          </label>
        </div>
      </Card>

      {/* Threshold overrides — listed so they never become invisible policy. */}
      <Card
        title="Threshold overrides"
        subtitle={
          cycle.thresholdOverrides.length === 0
            ? 'None — every series uses the 50% default'
            : `${cycle.thresholdOverrides.length} in force, persisting into future cycles`
        }
      >
        {cycle.thresholdOverrides.length === 0 ? (
          <p className="text-sm text-zinc-500">
            The deviation threshold is 50% globally. Raising it for a series is standing policy, so
            any override you set appears here with its reason.
          </p>
        ) : (
          <Table columns={['Scope', 'Key', 'Threshold', 'Reason', 'Set by', 'When']} align={[2]}>
            {cycle.thresholdOverrides.map((o) => (
              <Row key={o.id}>
                <Cell>
                  <Badge tone="info">{o.scope}</Badge>
                </Cell>
                <Cell mono>{o.key}</Cell>
                <Cell right mono>{Math.round(o.deviation * 100)}%</Cell>
                <Cell tone="muted" className="max-w-md whitespace-normal">
                  {o.reason}
                </Cell>
                <Cell tone="muted">{o.setBy}</Cell>
                <Cell tone="muted">{relTime(o.setAt)}</Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      {visible.length > 0 && (
        <Card
          title={view === 'price' ? 'Prices' : 'Submitted values against history and limits'}
          subtitle={`${visible.length} of ${rows.length} rows`}
        >
          {view === 'price' ? (
            <PriceTable rows={visible} />
          ) : view === 'series' ? (
            <SeriesTable rows={visible} overrides={cycle.thresholdOverrides} />
          ) : (
            <AggregateTable rows={visible} by={view === 'refinery' ? 'refinery' : 'product'} />
          )}
        </Card>
      )}

      {cycle.flags.some((f) => f.status === 'open') && (
        <Banner
          tone="warn"
          title="Some values are still flagged"
          actions={
            <Link href="/validation">
              <Button size="sm">Go to validation</Button>
            </Link>
          }
        >
          Rows with an open flag are marked below. The dashboard is deliberately independent of
          triage — it shows what the data looks like either way.
        </Banner>
      )}

      <p className="text-xs text-zinc-500">
        Advance the shared clock from Cycle Home to move the SLA ladder.{' '}
        <button
          type="button"
          className="underline decoration-dotted hover:text-zinc-300"
          disabled={busy !== null}
          onClick={() => act('advance_clock', { days: 1 })}
        >
          Advance a day now
        </button>
      </p>
    </Screen>
  );
}

function SeriesTable({
  rows,
  overrides,
}: {
  rows: DataRow[];
  overrides: Parameters<typeof thresholdFor>[1];
}) {
  return (
    <Table
      columns={['Month', 'Refinery', 'Bulk plant', 'Product', 'Submitted', 'Baseline', 'Dev', 'Last cycle', 'Band', 'Capacity', 'Outage', 'Status']}
      align={[4, 5, 6, 7, 9, 10]}
    >
      {rows.map((r) => {
        const { value: threshold, override } = thresholdFor(r, overrides);
        const dev = r.baseline ? (r.submitted - r.baseline) / r.baseline : null;
        const beyond = dev !== null && Math.abs(dev) > threshold;
        return (
          <Row key={r.key} tone={r.excluded ? 'warning' : beyond ? 'warning' : 'ok'}>
            <Cell>{r.month}</Cell>
            <Cell>{r.refinery}</Cell>
            <Cell>{r.bulkPlant}</Cell>
            <Cell>{r.product}</Cell>
            <Cell right mono>{r.submitted.toFixed(1)}</Cell>
            <Cell right mono tone="muted">{r.baseline?.toFixed(1) ?? '—'}</Cell>
            <Cell right mono tone={beyond ? 'warn' : 'muted'}>
              {dev === null ? '—' : fmtPct(dev)}
            </Cell>
            <Cell right mono tone="muted">{r.lastCycle?.toFixed(1) ?? '—'}</Cell>
            <Cell mono tone="muted">
              {r.maxLevel > 0 ? `${r.minLevel}–${r.maxLevel}` : 'none'}
            </Cell>
            <Cell right mono tone="muted">{r.capacity > 0 ? r.capacity.toFixed(1) : '—'}</Cell>
            <Cell right mono tone={r.outageDays > 0 ? 'warn' : 'muted'}>
              {r.outageDays > 0 ? `${r.outageDays}d` : '—'}
            </Cell>
            <Cell>
              <span className="flex flex-wrap gap-1">
                {r.excluded && <Badge tone="warn">excluded</Badge>}
                {r.assumed && <Badge tone="warn">assumed</Badge>}
                {override && <Badge tone="info">override {Math.round(override.deviation * 100)}%</Badge>}
                {r.flagStatus && (
                  <Badge tone={['justified', 'corrected'].includes(r.flagStatus) ? 'good' : 'bad'}>
                    {r.flagStatus.replace(/_/g, ' ')}
                  </Badge>
                )}
                {!r.excluded && !r.assumed && !override && !r.flagStatus && (
                  <span className="text-xs text-zinc-600">ok</span>
                )}
              </span>
            </Cell>
          </Row>
        );
      })}
    </Table>
  );
}

function AggregateTable({ rows, by }: { rows: DataRow[]; by: 'refinery' | 'product' }) {
  const buckets = new Map<string, { label: string; month: string; submitted: number; baseline: number }>();
  for (const r of rows) {
    const key = `${r.month}|${r[by]}`;
    const hit = buckets.get(key);
    if (hit) {
      hit.submitted += r.submitted;
      hit.baseline += r.baseline ?? 0;
    } else {
      buckets.set(key, { label: r[by], month: r.month, submitted: r.submitted, baseline: r.baseline ?? 0 });
    }
  }
  const list = [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month) || a.label.localeCompare(b.label));

  return (
    <Table columns={['Month', by === 'refinery' ? 'Refinery' : 'Product', 'Submitted', 'Baseline', 'Dev']} align={[2, 3, 4]}>
      {list.map((r) => {
        const dev = r.baseline ? (r.submitted - r.baseline) / r.baseline : null;
        return (
          <Row key={`${r.month}|${r.label}`} tone={dev !== null && Math.abs(dev) > 0.5 ? 'warning' : 'ok'}>
            <Cell>{r.month}</Cell>
            <Cell>{r.label}</Cell>
            <Cell right mono>{r.submitted.toFixed(1)}</Cell>
            <Cell right mono tone="muted">{r.baseline > 0 ? r.baseline.toFixed(1) : '—'}</Cell>
            <Cell right mono tone={dev !== null && Math.abs(dev) > 0.5 ? 'warn' : 'muted'}>
              {dev === null ? '—' : fmtPct(dev)}
            </Cell>
          </Row>
        );
      })}
    </Table>
  );
}

function PriceTable({ rows }: { rows: DataRow[] }) {
  const seen = new Map<string, { product: string; month: string; price: number }>();
  for (const r of rows) {
    const key = `${r.month}|${r.product}`;
    if (!seen.has(key)) seen.set(key, { product: r.product, month: r.month, price: r.price });
  }
  const list = [...seen.values()].sort((a, b) => a.product.localeCompare(b.product) || a.month.localeCompare(b.month));

  return (
    <Table columns={['Product', 'Month', 'Price', 'Status']} align={[2]}>
      {list.map((r) => (
        <Row key={`${r.product}|${r.month}`} tone={r.price === 0 ? 'critical' : 'ok'}>
          <Cell>{r.product}</Cell>
          <Cell>{r.month}</Cell>
          <Cell right mono tone={r.price === 0 ? 'bad' : undefined}>
            {r.price === 0 ? 'no price' : `$${r.price.toFixed(2)}`}
          </Cell>
          <Cell>
            {r.price === 0 ? (
              <Badge tone="bad">zero or missing</Badge>
            ) : (
              <span className="text-xs text-zinc-600">ok</span>
            )}
          </Cell>
        </Row>
      ))}
    </Table>
  );
}
