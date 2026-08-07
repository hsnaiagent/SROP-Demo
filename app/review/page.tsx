'use client';

/**
 * Screen 8.3 — Review Draft SROP. version2.md §8.3.
 *
 * The stakeholder's rows shown with the same Feasibility columns the planner sees. A
 * refinery cannot judge whether a production figure is achievable without seeing it next
 * to its own capacity, which is exactly the comparison version 1's plan table omitted.
 *
 * Three actions, side by side and equally weighted, plus a chat that reaches the same
 * three outcomes and always confirms before filing anything.
 */

import { useEffect, useState } from 'react';

import { currentDraft } from '@/lib/gates';
import { feasibilityStatus } from '@/lib/plan';
import type { PlanRow } from '@/lib/types';

import { useCycle } from '../providers';
import {
  Badge,
  BandBar,
  Banner,
  Button,
  Card,
  Cell,
  EmptyState,
  Field,
  Input,
  Row,
  Screen,
  Select,
  Table,
  Textarea,
  fmtKb,
  fmtMoney,
  prettyRef,
  relTime,
} from '../components/ui';

export default function ReviewPage() {
  const { cycle, role, me, act, busy } = useCycle();
  const [mode, setMode] = useState<'none' | 'comment' | 'update' | 'chat'>('none');
  const [rowRef, setRowRef] = useState('');
  const [text, setText] = useState('');
  const [proposed, setProposed] = useState('');
  const [chat, setChat] = useState<Array<{ role: 'me' | 'ai'; text: string }>>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [verdict, setVerdict] = useState<string | null>(null);

  const draft = cycle ? currentDraft(cycle) : null;
  const review = cycle?.reviews.find((r) => r.stakeholder === role && draft && r.draftId === draft.id);

  useEffect(() => {
    if (review?.status === 'notified') act('mark_viewed');
  }, [review?.status, act]);

  // Authority decides what you see: a refinery sees its own rows, Finance sees them all.
  const mine = !draft || !me
    ? []
    : me.kind === 'refinery'
      ? draft.planRows.filter((r) => r.refinery === me.refinery)
      : draft.planRows;

  if (!cycle || !draft || draft.status === 'generated' || !review) {
    return (
      <Screen title="Review Draft SROP">
        <EmptyState title="No draft has been issued to you yet">
          When the planner issues a draft SROP you will be emailed, and it will appear here with
          only the rows that concern you.
        </EmptyState>
      </Screen>
    );
  }

  const settled = ['approved', 'confirmed', 'deemed_approved'].includes(review.status);
  const responded = review.status !== 'notified' && review.status !== 'viewed' && review.status !== 'escalated';

  const assumedSources = cycle.submissions.filter((s) => s.assumed);
  const myExclusions = draft.excluded.filter((e) => !me || me.kind !== 'refinery' || e.refinery === me.refinery);

  const shortfalls = mine.filter((r) => r.shortfall > 0).length;
  const breaches = mine.filter((r) => r.closing < r.minLevel || r.closing > r.maxLevel).length;

  const askAi = async () => {
    const question = chatDraft;
    setChat((c) => [...c, { role: 'me', text: question }]);
    setChatDraft('');
    const res = await act('review_chat', { text: question });
    const outcome = res.extra as
      | { intent: string; reply: string; rowHint: string | null; proposedValue: number | null }
      | undefined;
    setChat((c) => [...c, { role: 'ai', text: outcome?.reply ?? res.message ?? '' }]);
    if (outcome?.intent === 'comment') {
      setMode('comment');
      if (outcome.proposedValue) setProposed(String(outcome.proposedValue));
      const guess = mine.find((r) => !outcome.rowHint || r.product === outcome.rowHint);
      if (guess) setRowRef(refOf(guess));
      setText(question);
    } else if (outcome?.intent === 'approve') {
      setMode('none');
    } else if (outcome?.intent === 'update') {
      setMode('update');
    }
  };

  return (
    <Screen
      title={`Draft SROP v${draft.version}`}
      lede={`Issued ${draft.issuedAt ? relTime(draft.issuedAt) : 'recently'}, planning ${cycle.horizon[0]} to ${cycle.horizon.at(-1)}.`}
    >
      {/* What you are being asked to check — without this a stakeholder is handed a
          spreadsheet and left to guess what approval means. */}
      <Banner tone="info" title="What you are being asked to check">
        {me?.kind === 'refinery'
          ? `Can ${me.ownsPlants.join(' and ')} produce these volumes, and are the closing tank levels workable?`
          : me?.name === 'Finance'
            ? `Do these revenue figures hold? Total planned revenue is ${fmtMoney(draft.totalRevenue)} across the four months.`
            : 'Are the demand figures in this plan the ones you submitted, and are they still right?'}
      </Banner>

      {settled && (
        <Banner tone="good" title={`You have already responded — ${review.status.replace(/_/g, ' ')}`}>
          {review.note ?? 'Nothing further is needed from you on this version.'}
        </Banner>
      )}

      {assumedSources.length > 0 && (
        <Banner
          tone="warn"
          title="Part of this draft rests on carried-forward data"
        >
          {assumedSources.map((s) => s.source).join(', ')} did not submit this cycle, so last
          cycle&apos;s figures were carried forward and are marked assumed. Rows built on them are
          tagged in the table below.
        </Banner>
      )}

      {myExclusions.length > 0 && (
        <Banner tone="warn" title="Volume that is not planned">
          {myExclusions.map((e) => {
            const decision = cycle.excludedDecisions.find((d) => d.key === e.key);
            return (
              <span key={e.key} className="block">
                {e.product} at {e.bulkPlant} — {fmtKb(e.demandKb)} across {e.months.join(', ')} is
                absent from this plan.{' '}
                {decision?.reason
                  ? `Planner's reason: “${decision.reason}”.`
                  : 'No reference limits exist for it.'}
              </span>
            );
          })}
        </Banner>
      )}

      {/* --------------------------------------------------------- your section */}
      <Card
        title="Your section"
        subtitle={`${mine.length} rows · ${shortfalls} with a shortfall · ${breaches} outside their tank band`}
      >
        <Table
          columns={['Month', 'Bulk plant', 'Product', 'Demand', 'Production', 'Capacity', 'Util', 'Closing', 'Band', 'Shortfall']}
          align={[3, 4, 5, 6, 7, 9]}
        >
          {mine
            .slice()
            .sort((a, b) => rank(b) - rank(a) || a.month.localeCompare(b.month))
            .map((r) => {
              const util = r.capacity > 0 ? r.production / r.capacity : 0;
              const changed = draft.changesFromPrevious.some((c) => c.rowRef === refOf(r));
              return (
                <Row key={refOf(r)} tone={changed ? 'changed' : feasibilityStatus(r)}>
                  <Cell>{r.month}</Cell>
                  <Cell>
                    {r.bulkPlant}
                    {r.assumed && <Badge tone="warn">assumed</Badge>}
                  </Cell>
                  <Cell>{r.product}</Cell>
                  <Cell right mono>{r.demand.toFixed(1)}</Cell>
                  <Cell right mono>{r.production.toFixed(1)}</Cell>
                  <Cell right mono tone="muted">{r.capacity.toFixed(1)}</Cell>
                  <Cell right mono tone={util > 0.95 ? 'warn' : 'muted'}>{Math.round(util * 100)}%</Cell>
                  <Cell right mono tone={r.closing < r.minLevel || r.closing > r.maxLevel ? 'bad' : undefined}>
                    {r.closing.toFixed(1)}
                  </Cell>
                  <Cell>
                    <BandBar value={r.closing} min={r.minLevel} max={r.maxLevel} />
                  </Cell>
                  <Cell right mono tone={r.shortfall > 0 ? 'bad' : 'muted'}>
                    {r.shortfall > 0 ? r.shortfall.toFixed(1) : '—'}
                  </Cell>
                </Row>
              );
            })}
        </Table>
      </Card>

      {draft.changesFromPrevious.length > 0 && (
        <Card title={`Since version ${draft.version - 1}`} subtitle="What changed, and why">
          <ul className="flex flex-col gap-2">
            {draft.changesFromPrevious.map((c) => (
              <li key={c.rowRef} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="font-mono text-xs text-zinc-400">{prettyRef(c.rowRef)}</span>
                <span className="font-mono text-zinc-100">
                  {c.before} → {c.after} kb
                </span>
                <Badge tone="info">{c.causedBy}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ------------------------------------------------------- three actions */}
      {!responded && (
        <Card title="Your response" subtitle="All three take under a minute">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Button tone="good" disabled={busy !== null} onClick={() => act('review_approve')}>
                Approve
              </Button>
              <Button tone="ghost" onClick={() => setMode(mode === 'update' ? 'none' : 'update')}>
                Propose an update
              </Button>
              <Button tone="ghost" onClick={() => setMode(mode === 'comment' ? 'none' : 'comment')}>
                Raise a comment
              </Button>
            </div>

            {mode === 'comment' && (
              <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                <Field label="Which row is wrong">
                  <Select
                    value={rowRef}
                    onChange={setRowRef}
                    options={[
                      { value: '', label: 'Pick a row…' },
                      ...mine.map((r) => ({
                        value: refOf(r),
                        label: `${r.month} · ${r.bulkPlant} · ${r.product} — ${r.demand.toFixed(1)} kb`,
                      })),
                    ]}
                  />
                </Field>
                <Field label="Why is it wrong" hint="This goes straight to the planner's queue.">
                  <Textarea
                    rows={3}
                    value={text}
                    placeholder="e.g. BP-JAZAN has a 12-day turnaround in October, we cannot lift this volume."
                    onChange={(e) => setText(e.target.value)}
                  />
                </Field>
                <Field label="What it should be (optional)">
                  <Input
                    value={proposed}
                    placeholder="e.g. 19.4"
                    onChange={(e) => setProposed(e.target.value)}
                    className="w-32"
                  />
                </Field>
                <div>
                  <Button
                    tone="primary"
                    size="sm"
                    disabled={busy !== null || !rowRef || !text.trim()}
                    onClick={() =>
                      act('review_comment', {
                        rowRef,
                        text,
                        proposedValue: proposed ? Number(proposed) : null,
                      })
                    }
                  >
                    Send comment
                  </Button>
                </div>
              </div>
            )}

            {mode === 'update' && (
              <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                <p className="text-sm leading-relaxed text-zinc-300">
                  Upload a changed file. Before it reaches the planner, it is checked against what
                  you own and against your own limits — and you are told the result first.
                </p>
                <div className="rounded-lg border border-dashed border-zinc-700 px-5 py-6 text-center">
                  <p className="text-sm text-zinc-400">
                    {me?.name === 'Refinery RABIGH'
                      ? 'RABIGH_tank_levels_rev2.xlsx'
                      : 'Drop your revised file here'}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Demo: the scripted revision for {role} is used.
                  </p>
                </div>
                <div>
                  <Button
                    tone="primary"
                    size="sm"
                    disabled={busy !== null}
                    onClick={async () => {
                      const res = await act('review_upload', {});
                      setVerdict(res.message ?? null);
                    }}
                  >
                    Check and submit
                  </Button>
                </div>
                {verdict && (
                  <Banner tone="warn" title="File-Recognition Agent">
                    {verdict}
                  </Banner>
                )}
              </div>
            )}

            {/* The chat reaches the same three outcomes, and never files without a
                confirmation step. */}
            <details className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-zinc-400">
                Or just tell the assistant what is wrong
              </summary>
              <div className="mt-3 flex flex-col gap-3">
                {chat.map((m, i) => (
                  <div
                    key={i}
                    className={`rounded-lg px-3 py-2 text-sm ${
                      m.role === 'me' ? 'ml-8 bg-amber-500/10 text-amber-50' : 'mr-4 bg-zinc-900 text-zinc-200'
                    }`}
                  >
                    {m.text}
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    value={chatDraft}
                    placeholder="October diesel for Jazan is too high, we have a turnaround"
                    onChange={(e) => setChatDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && chatDraft.trim()) askAi();
                    }}
                  />
                  <Button size="sm" disabled={busy !== null || !chatDraft.trim()} onClick={askAi}>
                    Send
                  </Button>
                </div>
              </div>
            </details>
          </div>
        </Card>
      )}

      <details className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-5 py-3">
        <summary className="cursor-pointer text-sm font-medium text-zinc-400">
          Full draft — all {draft.planRows.length} rows
        </summary>
        <div className="mt-3">
          <Table columns={['Month', 'Refinery', 'Bulk plant', 'Product', 'Demand', 'Production', 'Revenue']} align={[4, 5, 6]}>
            {draft.planRows.map((r) => (
              <Row key={refOf(r)}>
                <Cell>{r.month}</Cell>
                <Cell>{r.refinery}</Cell>
                <Cell>{r.bulkPlant}</Cell>
                <Cell>{r.product}</Cell>
                <Cell right mono>{r.demand.toFixed(1)}</Cell>
                <Cell right mono>{r.production.toFixed(1)}</Cell>
                <Cell right mono tone="muted">{fmtMoney(r.revenue)}</Cell>
              </Row>
            ))}
          </Table>
        </div>
      </details>
    </Screen>
  );
}

const refOf = (r: PlanRow) =>
  `refinery=${r.refinery},bulk_plant=${r.bulkPlant},product=${r.product},month=${r.month}`;

const rank = (r: PlanRow) => {
  const s = feasibilityStatus(r);
  return s === 'critical' ? 2 : s === 'warning' ? 1 : 0;
};
