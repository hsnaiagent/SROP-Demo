'use client';

/**
 * Screen 6 — Master File & Plan Run. version2.md §7.6.
 *
 * Two panels, because they are two halves of one decision: what goes into the model,
 * and what came out.
 *
 * There is NO submitted-against-validated table. Version 1 had one, and across ~32 rows
 * exactly one showed a non-zero delta — it answered a question the planner had already
 * answered himself, one correction at a time, on the Validation screen. What he needs
 * here is whether the plan is any good, so every comparison on this screen is against a
 * constraint he can act on: capacity, the min-max band, unmet demand, or history.
 */

import Link from 'next/link';
import { useState } from 'react';

import { currentDraft, gate1, gate2, needsRerun } from '@/lib/gates';
import { feasibilityStatus, reasonablenessStatus } from '@/lib/plan';
import { DEFAULT_DEVIATION_THRESHOLD, thresholdFor } from '@/lib/policy';
import type { PivotView, PlanRow, PlanTab, ThresholdOverride } from '@/lib/types';

import { useCycle } from '../providers';
import {
  FilterBar,
  applyFilters,
  isDetailView,
  pivot,
  pivotHeaders,
  useFilters,
  type PivotRow,
} from '../components/filters';
import {
  Badge,
  BandBar,
  Banner,
  Button,
  Card,
  Cell,
  EmptyState,
  Field,
  Grid,
  Input,
  Row,
  Screen,
  Stat,
  Table,
  Tabs,
  fmtKb,
  fmtMoney,
  fmtPct,
  prettyRef,
  relTime,
} from '../components/ui';

const VIEWS: PivotView[] = ['series', 'refinery', 'product', 'price', 'revenue', 'inventory'];

export default function PlanPage() {
  const { cycle, act, busy } = useCycle();
  const { filters, update, reset, active } = useFilters();
  const [tab, setTab] = useState<PlanTab>('feasibility');
  const [view, setView] = useState<PivotView>('series');
  const [only, setOnly] = useState<'all' | 'shortfall' | 'band'>('all');
  const [refused, setRefused] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<string | null>(null);

  if (!cycle) {
    return (
      <Screen title="Master File & Plan Run">
        <EmptyState title="No cycle open">Start a new cycle from Requests.</EmptyState>
      </Screen>
    );
  }

  const g1 = gate1(cycle);
  const g2 = gate2(cycle);
  const master = cycle.masterFile;
  const draft = currentDraft(cycle);
  const rerun = needsRerun(cycle);

  const refuse = () => {
    setRefused(true);
    window.setTimeout(() => setRefused(false), 500);
  };

  return (
    <Screen
      title="Master File & Plan Run"
      lede="What goes into the model, and what came out. The run is held behind two gates: no unresolved flags, and your explicit approval of a fresh workbook."
    >
      {/* ============================================ Panel A — master workbook */}
      <Card
        title="Master workbook"
        subtitle={
          master
            ? master.stale
              ? `Stale — ${master.staleReason}`
              : `Built ${relTime(master.builtAt)} from ${cycle.submissions.length} sources, ${cycle.flags.length} flags resolved`
            : 'Not built yet'
        }
        actions={
          <>
            {master && (
              <a
                href="/api/master"
                download={`SROP_master_${cycle.id}.csv`}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text hover:border-blue-accent/50 dark:hover:border-green-accent/50"
              >
                Download
              </a>
            )}
            <Button
              size="sm"
              disabled={busy !== null || !g1.open}
              title={g1.open ? undefined : `Gate 1 is closed — ${g1.reason}`}
              onClick={() => act('build_master')}
            >
              {master ? 'Rebuild' : 'Build workbook'}
            </Button>
            <Button
              size="sm"
              tone={master && !master.stale && !master.approvedByPlanner ? 'primary' : 'ghost'}
              disabled={busy !== null || !master || master.stale || master.approvedByPlanner}
              onClick={() => act('approve_master')}
            >
              {master?.approvedByPlanner ? 'Approved for run ✓' : 'Approve for run'}
            </Button>
          </>
        }
      >
        {!g1.open && (
          <Banner tone="warn" title={`Gate 1 is closed — ${g1.reason}`} actions={
            <Link href="/validation"><Button size="sm">Go to validation</Button></Link>
          }>
            Only validated data enters the workbook: every value must be clean, justified,
            corrected, or explicitly assumed.
          </Banner>
        )}

        {master && (
          <div className="mt-1 flex flex-col gap-3">
            {master.stale && (
              <Banner tone="warn" title="This build is stale">
                {master.staleReason}. Rebuild before running — Gate 2 will not pass on a stale
                workbook.
              </Banner>
            )}
            <Table columns={['Sheet', 'Rows', 'Source trace', '']} align={[1]}>
              {master.sheets.map((s) => (
                <Row key={s.name}>
                  <Cell>
                    <span className="font-medium text-text">{s.name}</span>
                  </Cell>
                  <Cell right mono tone="muted">
                    {s.rowCount}
                  </Cell>
                  <Cell tone="muted" className="max-w-md truncate">
                    {s.sourceTrace}
                  </Cell>
                  <Cell right>
                    <button
                      type="button"
                      onClick={() => setSheet(sheet === s.name ? null : s.name)}
                      className="text-xs text-text-muted underline decoration-dotted hover:text-text"
                    >
                      {sheet === s.name ? 'hide' : 'preview'}
                    </button>
                  </Cell>
                </Row>
              ))}
            </Table>

            {sheet && (
              <div className="overflow-x-auto rounded-lg border border-border bg-surface p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {sheet} — first 10 rows
                </p>
                <table className="text-xs">
                  <thead>
                    <tr>
                      {master.sheets.find((s) => s.name === sheet)!.columns.map((c) => (
                        <th key={c} className="px-2 py-1 text-left font-semibold text-text-muted">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {master.sheets
                      .find((s) => s.name === sheet)!
                      .rows.slice(0, 10)
                      .map((r, i) => (
                        <tr key={i} className="border-t border-border/60">
                          {r.map((cellValue, j) => (
                            <td key={j} className="px-2 py-1 font-mono tabular-nums text-text">
                              {cellValue}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ================================================ Panel B — the plan run */}
      <Card
        title="Plan run"
        subtitle={
          draft
            ? `Draft v${draft.version}, generated ${relTime(draft.generatedAt)}`
            : g2.open
              ? 'Ready to run'
              : `Gate 2 is closed — ${g2.reason}`
        }
        actions={
          <>
            <Button
              tone={g2.open ? 'primary' : 'ghost'}
              disabled={busy === 'run_plan'}
              className={refused ? 'animate-shake' : ''}
              onClick={() => (g2.open ? act('run_plan') : refuse())}
            >
              {!g2.open && '🔒 '}
              {busy === 'run_plan' ? 'Running…' : draft ? 'Rerun plan' : 'Run plan'}
            </Button>
            {draft && draft.status === 'generated' && (
              <Button tone="good" disabled={busy !== null} onClick={() => act('issue_draft')}>
                Issue to stakeholders
              </Button>
            )}
          </>
        }
      >
        {!g2.open && !draft && (
          <p className="text-sm text-text-muted">
            {g1.open
              ? 'Build the workbook and approve it for the run. Building and running are separate acts on purpose — the Intake Agent never triggers the model on its own.'
              : `Resolve all ${cycle.flags.length} flags to run — ${g1.reason}.`}
          </p>
        )}

        {rerun && (
          <Banner tone="warn" title="Accepted revisions require a rerun">
            The data has moved since draft v{draft?.version} was generated. Rebuild the workbook,
            approve it, and rerun — a stakeholder edit never reruns the model on its own.
          </Banner>
        )}

        {draft && (
          <div className="mt-1 flex flex-col gap-4">
            {/* The headline strip. The last two are the reason to read further. */}
            <Grid cols={4}>
              <Stat label="Planned revenue" value={fmtMoney(draft.totalRevenue)} />
              <Stat label="Planned volume" value={fmtKb(draft.totalVolume)} />
              <Stat
                label="Rows with a shortfall"
                value={draft.shortfallRowCount}
                tone={draft.shortfallRowCount > 0 ? 'bad' : 'good'}
                hint={draft.shortfallRowCount > 0 ? 'demand the plan does not meet — click to filter' : 'all demand served'}
                onClick={() => {
                  setTab('feasibility');
                  setOnly(only === 'shortfall' ? 'all' : 'shortfall');
                }}
              />
              <Stat
                label="Rows outside their band"
                value={draft.bandBreachRowCount}
                tone={draft.bandBreachRowCount > 0 ? 'warn' : 'good'}
                hint={draft.bandBreachRowCount > 0 ? 'closing level outside min–max — click to filter' : 'every tank inside its band'}
                onClick={() => {
                  setTab('feasibility');
                  setOnly(only === 'band' ? 'all' : 'band');
                }}
              />
            </Grid>

            {draft.changesFromPrevious.length > 0 && (
              <Card tone="accent" title={`What changed since v${draft.version - 1}`}>
                <ul className="flex flex-col gap-1.5">
                  {draft.changesFromPrevious.map((change) => (
                    <li key={change.rowRef} className="flex flex-wrap items-baseline gap-2 text-sm">
                      <span className="font-mono text-xs text-text-muted">{prettyRef(change.rowRef)}</span>
                      <span className="font-mono text-text">
                        {change.before} → {change.after} kb
                      </span>
                      <Badge tone="info">{change.causedBy}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <PlanReview
              rows={draft.planRows}
              tab={tab}
              setTab={setTab}
              view={view}
              setView={setView}
              only={only}
              setOnly={setOnly}
              filters={filters}
              update={update}
              reset={reset}
              active={active}
            />

            {/* Not planned — states the volume at stake and the way out. */}
            {draft.excluded.length > 0 && (
              <Card title="Not planned" subtitle="Series with no reference limits">
                <div className="flex flex-col gap-3">
                  {draft.excluded.map((series) => {
                    const decision = cycle.excludedDecisions.find((d) => d.key === series.key);
                    const decided = decision && decision.decision !== 'pending';
                    return (
                      <div
                        key={series.key}
                        className={`rounded-lg border px-4 py-3 ${
                          decided ? 'border-border bg-surface' : 'border-warn/40 bg-warn/[0.05]'
                        }`}
                      >
                        <p className="text-sm">
                          <span className="font-semibold text-text">
                            {series.product} · {series.bulkPlant} · {series.refinery}
                          </span>{' '}
                          — <span className="font-mono text-warn">{fmtKb(series.demandKb)}</span> of
                          demand across {series.months.join(', ')} is not planned. No min, max or
                          capacity exists for this series.
                        </p>
                        {decided ? (
                          <p className="mt-1.5 text-xs text-text-muted">
                            Exclusion confirmed by {decision!.decidedBy} — &ldquo;{decision!.reason}
                            &rdquo;. Stakeholders see this reason on the draft.
                          </p>
                        ) : (
                          <div className="mt-2.5 flex flex-wrap items-end gap-2">
                            <Field label="Reason for excluding">
                              <Input
                                value={reasons[series.key] ?? ''}
                                placeholder="e.g. new grade, limits not yet issued"
                                onChange={(e) =>
                                  setReasons((r) => ({ ...r, [series.key]: e.target.value }))
                                }
                                className="w-80"
                              />
                            </Field>
                            <Button
                              size="sm"
                              tone="primary"
                              disabled={busy !== null || !(reasons[series.key] ?? '').trim()}
                              onClick={() =>
                                act('decide_excluded', { key: series.key, reason: reasons[series.key] })
                              }
                            >
                              Confirm exclusion
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        )}
      </Card>
    </Screen>
  );
}

// -------------------------------------------------------------- the two tabs

function PlanReview({
  rows,
  tab,
  setTab,
  view,
  setView,
  only,
  setOnly,
  filters,
  update,
  reset,
  active,
}: {
  rows: PlanRow[];
  tab: PlanTab;
  setTab: (t: PlanTab) => void;
  view: PivotView;
  setView: (v: PivotView) => void;
  only: 'all' | 'shortfall' | 'band';
  setOnly: (v: 'all' | 'shortfall' | 'band') => void;
  filters: ReturnType<typeof useFilters>['filters'];
  update: ReturnType<typeof useFilters>['update'];
  reset: ReturnType<typeof useFilters>['reset'];
  active: number;
}) {
  const { cycle } = useCycle();

  let working = applyFilters(rows, filters);
  if (only === 'shortfall') working = working.filter((r) => r.shortfall > 0);
  if (only === 'band') working = working.filter((r) => r.closing < r.minLevel || r.closing > r.maxLevel);

  const pivoted = pivot(working, view);
  const detail = isDetailView(view);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'feasibility', label: 'Feasibility' },
            { value: 'reasonableness', label: 'Reasonableness' },
          ]}
        />
        {only !== 'all' && (
          <Badge tone="warn">
            showing only rows {only === 'shortfall' ? 'with a shortfall' : 'outside their band'} —{' '}
            <button type="button" onClick={() => setOnly('all')} className="underline">
              clear
            </button>
          </Badge>
        )}
      </div>

      <Card>
        <FilterBar
          rows={rows}
          filters={filters}
          update={update}
          reset={reset}
          active={active}
          view={view}
          onView={setView}
          views={VIEWS}
        />
      </Card>

      <p className="text-xs leading-relaxed text-text-muted">
        {tab === 'feasibility'
          ? 'Can this plan be executed, and does it serve the demand? Worst rows first — a red edge is a shortfall or a tank below minimum, amber is above maximum or above 95% utilization.'
          : 'Is this plan plausible against what has happened before? This catches a plan that is perfectly feasible and still wrong — every constraint satisfied, but a series quietly running at twice its history.'}
      </p>

      {pivoted.length === 0 ? (
        <EmptyState title="No rows match">Clear a filter to see more.</EmptyState>
      ) : tab === 'feasibility' ? (
        <FeasibilityTable rows={pivoted} view={view} detail={detail} />
      ) : (
        <ReasonablenessTable rows={pivoted} detail={detail} overrides={cycle!.thresholdOverrides} />
      )}
    </div>
  );
}

function FeasibilityTable({
  rows,
  view,
  detail,
}: {
  rows: PivotRow[];
  view: PivotView;
  detail: boolean;
}) {
  const headers = pivotHeaders(view);

  if (view === 'price') {
    return (
      <Table columns={[...headers, 'Price', 'Volume', 'Revenue']} align={[headers.length, headers.length + 1, headers.length + 2]}>
        {rows.map((r) => (
          <Row key={r.key} tone={r.price === 0 ? 'critical' : 'ok'}>
            {r.labels.map((l, i) => (
              <Cell key={i}>{l}</Cell>
            ))}
            <Cell right mono tone={r.price === 0 ? 'bad' : undefined}>
              {r.price === 0 ? 'no price' : `$${r.price.toFixed(2)}`}
            </Cell>
            <Cell right mono tone="muted">{r.demand.toFixed(1)}</Cell>
            <Cell right mono>{fmtMoney(r.revenue)}</Cell>
          </Row>
        ))}
      </Table>
    );
  }

  if (view === 'revenue') {
    return (
      <Table columns={[...headers, 'Volume', 'Revenue']} align={[headers.length, headers.length + 1]}>
        {rows.map((r) => (
          <Row key={r.key}>
            {r.labels.map((l, i) => (
              <Cell key={i}>{l}</Cell>
            ))}
            <Cell right mono tone="muted">{r.demand.toFixed(1)}</Cell>
            <Cell right mono>{fmtMoney(r.revenue)}</Cell>
          </Row>
        ))}
      </Table>
    );
  }

  const cols = detail
    ? [...headers, 'Demand', 'Production', 'Capacity', 'Util', 'Opening', 'Closing', 'Band', 'Shortfall']
    : [...headers, 'Demand', 'Production', 'Capacity', 'Util', 'Shortfall'];
  const numeric = cols.map((_, i) => i).filter((i) => i >= headers.length && cols[i] !== 'Band');

  return (
    <Table columns={cols} align={numeric}>
      {rows
        .slice()
        .sort((a, b) => score(b) - score(a) || a.key.localeCompare(b.key))
        .map((r) => {
          const util = r.capacity > 0 ? r.production / r.capacity : 0;
          const tone = statusOf(r);
          return (
            <Row key={r.key} tone={tone}>
              {r.labels.map((l, i) => (
                <Cell key={i}>
                  {l}
                  {i === r.labels.length - 1 && r.assumed && (
                    <Badge tone="warn">assumed</Badge>
                  )}
                </Cell>
              ))}
              <Cell right mono>{r.demand.toFixed(1)}</Cell>
              <Cell right mono>{r.production.toFixed(1)}</Cell>
              <Cell right mono tone="muted">{r.capacity.toFixed(1)}</Cell>
              <Cell right mono tone={util > 0.95 ? 'warn' : 'muted'}>
                {Math.round(util * 100)}%
              </Cell>
              {detail && <Cell right mono tone="muted">{r.opening.toFixed(1)}</Cell>}
              {detail && (
                <Cell right mono tone={r.closing < r.minLevel || r.closing > r.maxLevel ? 'bad' : undefined}>
                  {r.closing.toFixed(1)}
                </Cell>
              )}
              {detail && (
                <Cell>
                  <BandBar value={r.closing} min={r.minLevel} max={r.maxLevel} />
                </Cell>
              )}
              <Cell right mono tone={r.shortfall > 0 ? 'bad' : 'muted'}>
                {r.shortfall > 0 ? r.shortfall.toFixed(1) : '—'}
              </Cell>
            </Row>
          );
        })}
    </Table>
  );
}

function ReasonablenessTable({
  rows,
  detail,
  overrides,
}: {
  rows: PivotRow[];
  detail: boolean;
  overrides: ThresholdOverride[];
}) {
  const cols = ['Month', ...(detail ? ['Refinery', 'Bulk plant', 'Product'] : ['Group']), 'Planned', 'Baseline', 'Deviation', 'Last cycle', 'Change', 'Note'];

  return (
    <Table columns={cols} align={[cols.indexOf('Planned'), cols.indexOf('Baseline'), cols.indexOf('Deviation'), cols.indexOf('Last cycle'), cols.indexOf('Change')]}>
      {rows.map((r) => {
        const { value: threshold, override } = thresholdFor(r.source, overrides);
        const tone = reasonablenessStatus(r.source, threshold) === 'warning' ? 'warning' : 'ok';
        const dev = r.baselineMean ? (r.demand - r.baselineMean) / r.baselineMean : null;
        const change = r.lastCycleValue ? (r.demand - r.lastCycleValue) / r.lastCycleValue : null;

        return (
          <Row key={r.key} tone={r.count > 1 ? 'ok' : tone}>
            {r.labels.map((l, i) => (
              <Cell key={i}>{l}</Cell>
            ))}
            {!detail && r.labels.length < 2 && <Cell tone="muted">—</Cell>}
            <Cell right mono>{r.demand.toFixed(1)}</Cell>
            <Cell right mono tone="muted">{r.baselineMean?.toFixed(1) ?? '—'}</Cell>
            <Cell right mono tone={dev !== null && Math.abs(dev) > threshold ? 'warn' : 'muted'}>
              {dev === null ? '—' : fmtPct(dev)}
            </Cell>
            <Cell right mono tone="muted">{r.lastCycleValue?.toFixed(1) ?? '—'}</Cell>
            <Cell right mono tone={change !== null && Math.abs(change) > threshold ? 'warn' : 'muted'}>
              {change === null ? '—' : fmtPct(change)}
            </Cell>
            <Cell tone="muted">
              <span className="flex gap-1">
                {r.assumed && <Badge tone="warn">assumed</Badge>}
                {override && (
                  <Badge tone="info" >
                    override {Math.round(override.deviation * 100)}%
                  </Badge>
                )}
                {!r.assumed && !override && threshold === DEFAULT_DEVIATION_THRESHOLD && '—'}
              </span>
            </Cell>
          </Row>
        );
      })}
    </Table>
  );
}

const statusOf = (r: PivotRow): 'critical' | 'warning' | 'ok' => {
  if (r.count === 1) return feasibilityStatus(r.source);
  if (r.shortfall > 0) return 'critical';
  if (r.capacity > 0 && r.production / r.capacity > 0.95) return 'warning';
  return 'ok';
};

const score = (r: PivotRow) => {
  const s = statusOf(r);
  return s === 'critical' ? 2 : s === 'warning' ? 1 : 0;
};
