'use client';

/**
 * Screen 1 — Cycle Home. version2.md §7.1.
 *
 * The status board. Y opens the platform here on the first of the month and returns
 * here to answer anything the platform needs a decision on. The decision queue is the
 * screen's reason to exist: everything the platform cannot decide on its own shows up
 * as a card that states its own consequence before the buttons.
 */

import Link from 'next/link';
import { useState } from 'react';

import { currentDraft, gate1, needsRerun, openFlags, PHASES, phaseIndex } from '@/lib/gates';
import { fallbackCandidates } from '@/lib/policy';

import { useCycle } from '../providers';
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  Grid,
  Input,
  Screen,
  Spinner,
  Stat,
  fmtMoney,
  prettyRef,
  relTime,
} from '../components/ui';

export default function CycleHome() {
  const { cycle, act, busy, loading } = useCycle();
  const [reasons, setReasons] = useState<Record<string, string>>({});

  if (loading) {
    return (
      <Screen title="Cycle Home">
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <Spinner /> Loading the cycle…
        </div>
      </Screen>
    );
  }

  if (!cycle) {
    return (
      <Screen
        title="Cycle Home"
        lede="No cycle is open. Starting one sets the four-month planning horizon and prepares the data requests for every source."
      >
        <Card tone="accent">
          <div className="flex flex-col items-start gap-4 py-6">
            <div className="flex flex-col gap-1">
              <p className="text-lg font-semibold text-zinc-50">Start the monthly SROP cycle</p>
              <p className="max-w-xl text-sm leading-relaxed text-zinc-400">
                One cycle covers one issue of the SROP and always plans four months ahead. The
                platform will request data from OSPAS, Demand Planning and all four refineries,
                validate every submission as it lands, and hold the plan behind four gates until
                you cross them.
              </p>
            </div>
            <Button tone="primary" onClick={() => act('create_cycle')} disabled={busy !== null}>
              {busy === 'create_cycle' ? 'Starting…' : 'Start new cycle'}
            </Button>
          </div>
        </Card>
      </Screen>
    );
  }

  const phase = phaseIndex(cycle);
  const flags = openFlags(cycle);
  const draft = currentDraft(cycle);
  const g1 = gate1(cycle);
  const submitted = cycle.submissions.filter((s) => s.versions.length > 0).length;
  const approvals = draft
    ? cycle.reviews.filter(
        (r) => r.draftId === draft.id && ['approved', 'confirmed', 'deemed_approved'].includes(r.status)
      ).length
    : 0;

  const fallbacks = fallbackCandidates(cycle);
  const pendingExclusions = cycle.excludedDecisions.filter((d) => d.decision === 'pending');
  const queueSize =
    cycle.revisions.filter((r) => r.status === 'pending').length +
    cycle.comments.filter((c) => c.status === 'open').length;
  const rerun = needsRerun(cycle);

  const decisions = fallbacks.length + pendingExclusions.length + (queueSize > 0 ? 1 : 0) + (rerun ? 1 : 0);

  return (
    <Screen
      title="Cycle Home"
      lede={`Cycle ${cycle.id}, planning ${cycle.horizon[0]} to ${cycle.horizon.at(-1)}. Everything the platform cannot decide on its own is below.`}
    >
      {/* Phase tracker with the four gates drawn between the steps. */}
      <Card title="Progress" subtitle="Seven phases, four gates. Nothing crosses a gate on its own.">
        <div className="flex flex-wrap items-center gap-1.5">
          {PHASES.map((name, i) => (
            <span key={name} className="flex items-center gap-1.5">
              <span
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  i < phase
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : i === phase
                      ? decisions > 0
                        ? 'bg-amber-500 text-zinc-950'
                        : 'bg-sky-500 text-zinc-950'
                      : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {i + 1}. {name}
              </span>
              {i < PHASES.length - 1 && <GateMark index={i} phase={phase} />}
            </span>
          ))}
        </div>
      </Card>

      <Grid cols={4}>
        <Stat
          label="Submissions"
          value={`${submitted}/${cycle.submissions.length}`}
          tone={submitted === cycle.submissions.length && submitted > 0 ? 'good' : 'neutral'}
          hint={cycle.submissions.length === 0 ? 'no requests sent yet' : 'received of requested'}
        />
        <Stat
          label="Open flags"
          value={flags.length}
          tone={flags.length > 0 ? 'bad' : cycle.flags.length > 0 ? 'good' : 'neutral'}
          hint={cycle.flags.length ? `of ${cycle.flags.length} raised` : 'nothing validated yet'}
        />
        <Stat
          label="Draft"
          value={draft ? `v${draft.version}` : '—'}
          hint={draft ? `${fmtMoney(draft.totalRevenue)} planned revenue` : 'not generated'}
        />
        <Stat
          label="Approvals"
          value={draft ? `${approvals}/${cycle.reviews.filter((r) => r.draftId === draft.id).length}` : '—'}
          tone={draft && approvals === cycle.reviews.filter((r) => r.draftId === draft.id).length && approvals > 0 ? 'good' : 'neutral'}
          hint="stakeholders settled"
        />
      </Grid>

      {/* ------------------------------------------------------- decision queue */}
      <Card
        title="Needs your decision"
        subtitle={decisions === 0 ? 'Nothing is waiting on you.' : `${decisions} open`}
      >
        {decisions === 0 ? (
          <p className="text-sm text-zinc-500">
            {g1.open
              ? 'Every flag is resolved and every source has reported. The plan is ready to run.'
              : `Nothing needs a decision — the cycle is simply in progress. ${g1.reason ?? ''}`}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {fallbacks.map((sub) => (
              <Banner
                key={sub.id}
                tone="warn"
                title={`${sub.source} has not responded in ${sub.daysWaiting} business days`}
                actions={
                  <>
                    <Button
                      tone="primary"
                      size="sm"
                      onClick={() => act('confirm_fallback', { source: sub.source })}
                      disabled={busy !== null}
                    >
                      Use last cycle&apos;s data
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => act('decline_fallback', { source: sub.source })}
                      disabled={busy !== null}
                    >
                      Hold the cycle
                    </Button>
                  </>
                }
              >
                Proceeding will copy last cycle&apos;s figures forward and mark them assumed on the
                draft SROP, where every stakeholder will see them.
              </Banner>
            ))}

            {pendingExclusions.map((decision) => (
              <Banner
                key={decision.key}
                tone="warn"
                title={`${decision.key.split('|')[2]} at ${decision.key.split('|')[1]} has no reference limits`}
                actions={
                  <Button
                    tone="primary"
                    size="sm"
                    disabled={busy !== null || !(reasons[decision.key] ?? '').trim()}
                    onClick={() => act('decide_excluded', { key: decision.key, reason: reasons[decision.key] })}
                  >
                    Confirm exclusion
                  </Button>
                }
              >
                <div className="flex flex-col gap-2">
                  <span>
                    Without a min, max and capacity this series cannot be planned. Confirming records
                    your reason on the draft, so the missing volume reads as a decision rather than
                    an oversight.
                  </span>
                  <Input
                    placeholder="Reason — e.g. new grade, limits not yet issued by JAZAN"
                    value={reasons[decision.key] ?? ''}
                    onChange={(e) => setReasons((r) => ({ ...r, [decision.key]: e.target.value }))}
                  />
                </div>
              </Banner>
            ))}

            {queueSize > 0 && (
              <Banner
                tone="info"
                title={`${queueSize} stakeholder ${queueSize === 1 ? 'response' : 'responses'} in your queue`}
                actions={
                  <Link href="/draft-review">
                    <Button tone="primary" size="sm">
                      Review revisions
                    </Button>
                  </Link>
                }
              >
                Updates and comments on the issued draft. Nothing has been applied — accepting a
                change is recorded against you.
              </Banner>
            )}

            {rerun && (
              <Banner
                tone="warn"
                title="Accepted revisions require a rerun"
                actions={
                  <Link href="/plan">
                    <Button tone="primary" size="sm">
                      Rebuild and rerun
                    </Button>
                  </Link>
                }
              >
                The data has moved since draft v{draft?.version} was generated. A stakeholder edit
                never reruns the model on its own — you do.
              </Banner>
            )}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Recent activity" subtitle="Every action, with who did it">
          {cycle.audit.length === 0 ? (
            <EmptyState title="Nothing has happened yet" />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {cycle.audit.slice(0, 10).map((entry, i) => (
                <li key={i} className="flex items-baseline gap-3 text-sm">
                  <span className="w-16 shrink-0 font-mono text-xs text-zinc-600">
                    {relTime(entry.at)}
                  </span>
                  <span className="flex-1">
                    <span className="font-medium text-zinc-200">{entry.actor}</span>{' '}
                    <span className="text-zinc-400">{entry.action}</span>{' '}
                    <span className="font-mono text-xs text-zinc-500">{prettyRef(entry.target)}</span>
                    {entry.note && (
                      <span className="mt-0.5 block truncate text-xs italic text-zinc-500">
                        {entry.note}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Demo controls"
          subtitle="Stand-ins for time passing and stakeholders acting"
        >
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-col gap-1.5">
              <Button onClick={() => act('advance_clock', { days: 1 })} disabled={busy !== null}>
                Advance one business day
              </Button>
              <p className="text-xs leading-relaxed text-zinc-500">
                Runs the SLA ladder: reminder at 3 days, escalation at 5, non-response fallback
                offered at 7.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Button
                onClick={() => act('advance_clock', { days: 7 })}
                disabled={busy !== null}
              >
                Skip a week
              </Button>
              <p className="text-xs leading-relaxed text-zinc-500">
                Jumps straight to the fallback decision for anyone still silent.
              </p>
            </div>
            <div className="mt-1 border-t border-zinc-800 pt-3">
              <Button
                tone="danger"
                size="sm"
                onClick={() => {
                  if (confirm('Delete this cycle and start over?')) act('reset');
                }}
                disabled={busy !== null}
              >
                Reset cycle
              </Button>
              <p className="mt-1.5 text-xs text-zinc-500">
                Clears all state. The fixture data in <code className="font-mono">data/</code> is
                untouched.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </Screen>
  );
}

/** The four gates, drawn between the phases they separate. */
function GateMark({ index, phase }: { index: number; phase: number }) {
  const gates: Record<number, string> = { 1: 'Gate 1', 3: 'Gate 2', 4: 'Gate 3', 5: 'Gate 4' };
  const label = gates[index + 1];
  if (!label) return <span className="text-zinc-700">→</span>;
  const passed = phase > index + 1;
  return (
    <Badge tone={passed ? 'good' : 'neutral'}>{passed ? `${label} ✓` : label}</Badge>
  );
}
