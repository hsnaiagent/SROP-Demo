'use client';

/**
 * Screen 4 — Validation. version2.md §7.4.
 *
 * Version 1's FlagsPane, essentially intact: the flag card, the evidence line carrying
 * both numbers, the five statuses and every transition behave as they did. What version
 * 2 adds is the plan-impact line on the confirmation step, the direct edit, the
 * threshold override, the SLA state on queried flags, and the history strip.
 *
 * The impact line is the version 1 before/after table, relocated. There it described
 * corrections the planner had already made. Here it tells him what a correction is
 * worth while he is deciding whether to make it.
 */

import Link from 'next/link';
import { useState } from 'react';

import { gate1, isOpen, openFlags } from '@/lib/gates';
import { prettyRowRef } from '@/lib/language';
import { RULE_LABEL, type Flag, type Rule } from '@/lib/types';

import { useCycle } from '../providers';
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Screen,
  Select,
  Textarea,
  fmtMoneyDelta,
  relTime,
} from '../components/ui';

const ALL = 'all';

export default function ValidationPage() {
  const { cycle, act, busy } = useCycle();
  const [source, setSource] = useState(ALL);
  const [rule, setRule] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [selected, setSelected] = useState<string[]>([]);

  if (!cycle) {
    return (
      <Screen title="Validation">
        <EmptyState title="No cycle open">Start a cycle on Cycle Home first.</EmptyState>
      </Screen>
    );
  }

  const live = cycle.flags.filter((f) => f.status !== 'superseded');
  const open = openFlags(cycle);
  const g1 = gate1(cycle);

  const filtered = live.filter(
    (f) =>
      (source === ALL || f.source === source) &&
      (rule === ALL || f.rule === rule) &&
      (status === ALL || (status === 'open' ? isOpen(f) : f.status === status))
  );

  const bySource = new Map<string, Flag[]>();
  for (const flag of filtered) {
    const bucket = bySource.get(flag.source);
    if (bucket) bucket.push(flag);
    else bySource.set(flag.source, [flag]);
  }
  // Worst first, so the problems are at the top and nobody has to scan for them.
  const groups = [...bySource.entries()].sort(
    (a, b) => severityScore(b[1]) - severityScore(a[1])
  );

  const cleanSources = cycle.submissions
    .filter((s) => s.status === 'clean' || s.assumed)
    .map((s) => s.source);

  const selectedFlags = live.filter((f) => selected.includes(f.id) && f.status === 'open');
  const canBulk = selectedFlags.length > 1 && new Set(selectedFlags.map((f) => f.source)).size === 1;

  if (live.length === 0) {
    return (
      <Screen title="Validation">
        <EmptyState title="Nothing validated yet">
          Run validation from the Submissions screen. Each source is validated independently.
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen
      title="Validation"
      lede={
        <>
          <span className="font-mono text-zinc-300">
            {open.length} of {live.length} flags open
          </span>
          . Every flag carries the submitted number and the number it was compared against — the
          rules are arithmetic, so you can check any of them yourself.
        </>
      }
      actions={
        g1.open ? (
          <Link href="/plan">
            <Button tone="good">Gate 1 open — build the master file</Button>
          </Link>
        ) : (
          <Badge tone="warn">Gate 1 closed — {g1.reason}</Badge>
        )
      }
    >
      {/* ----------------------------------------------------------- filters */}
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Source">
            <Select
              value={source}
              onChange={setSource}
              options={[
                { value: ALL, label: 'All sources' },
                ...[...new Set(live.map((f) => f.source))].map((s) => ({ value: s, label: s })),
              ]}
            />
          </Field>
          <Field label="Rule">
            <Select
              value={rule}
              onChange={setRule}
              options={[
                { value: ALL, label: 'All rules' },
                ...[...new Set(live.map((f) => f.rule))].map((r) => ({
                  value: r,
                  label: RULE_LABEL[r as Rule],
                })),
              ]}
            />
          </Field>
          <Field label="Status">
            <Select
              value={status}
              onChange={setStatus}
              options={[
                { value: ALL, label: 'Everything' },
                { value: 'open', label: 'Still open' },
                { value: 'justified', label: 'Justified' },
                { value: 'corrected', label: 'Corrected' },
                { value: 'escalated', label: 'Escalated' },
              ]}
            />
          </Field>

          {canBulk && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-zinc-400">{selectedFlags.length} selected</span>
              <Button
                size="sm"
                tone="primary"
                disabled={busy !== null}
                onClick={() => {
                  act('flag_query', { ids: selectedFlags.map((f) => f.id) });
                  setSelected([]);
                }}
              >
                Query as one email
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* ---------------------------------------------------------- the flags */}
      {groups.map(([sourceName, flags]) => (
        <div key={sourceName} className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            {sourceName}
            <Badge tone={flags.some(isOpen) ? 'bad' : 'good'} mono>
              {flags.filter(isOpen).length} open / {flags.length}
            </Badge>
          </h2>
          {flags.map((flag) => (
            <FlagCard
              key={flag.id}
              flag={flag}
              selected={selected.includes(flag.id)}
              onSelect={(on) =>
                setSelected((s) => (on ? [...s, flag.id] : s.filter((id) => id !== flag.id)))
              }
            />
          ))}
        </div>
      ))}

      {cleanSources.length > 0 && (
        <div className="flex flex-col gap-3">
          {cleanSources.map((name) => (
            <div key={name} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">{name}</h2>
              <div className="rounded-xl border border-emerald-900/60 bg-emerald-500/[0.04] px-4 py-3 text-sm text-emerald-300">
                No issues found — clean submission.
              </div>
            </div>
          ))}
        </div>
      )}

      {open.length === 0 && (
        <Banner tone="good" title="Every flag is resolved">
          {cycle.thresholdOverrides.length > 0 &&
            `${cycle.thresholdOverrides.length} threshold override${cycle.thresholdOverrides.length === 1 ? '' : 's'} in force — visible on the Data Dashboard. `}
          Gate 1 {g1.open ? 'is open. The master workbook can be built.' : `is still closed: ${g1.reason}.`}
        </Banner>
      )}
    </Screen>
  );
}

const severityScore = (flags: Flag[]) =>
  flags.reduce((score, f) => score + (f.severity === 'high' ? 100 : f.severity === 'medium' ? 10 : 1), 0);

// ---------------------------------------------------------------------- the card

type Panel = 'reason' | 'email' | 'edit' | 'threshold' | null;

function FlagCard({
  flag,
  selected,
  onSelect,
}: {
  flag: Flag;
  selected: boolean;
  onSelect: (on: boolean) => void;
}) {
  const { cycle, reference, act, ask, busy } = useCycle();
  const [panel, setPanel] = useState<Panel>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [email, setEmail] = useState({ to: '', subject: '', body: '' });
  const [editText, setEditText] = useState('');
  const [editValue, setEditValue] = useState<number | null>(null);
  const [editNote, setEditNote] = useState('');
  const [editHint, setEditHint] = useState<string | null>(null);
  const [threshold, setThreshold] = useState('120');
  const [impact, setImpact] = useState<string | null>(null);

  const stakeholder = reference?.stakeholders.find((s) => s.name === flag.source);
  const prior = cycle?.learned.find(
    (l) => l.key === `${flag.rule}|${flag.rowRef.replace(/,month=[^,]*/, '')}` && flag.status === 'open'
  );

  const severityTone = flag.severity === 'high' ? 'bad' : flag.severity === 'medium' ? 'warn' : 'neutral';

  // The value the flag would be corrected to if the reply is accepted.
  const replyValue = flag.status === 'responded'
    ? Number(flag.response?.match(/(\d+\.\d+)\s*kb/i)?.[1] ?? Number.NaN)
    : Number.NaN;

  // For a reply, the materiality was computed server-side when the reply arrived and
  // rides on the flag. For a direct edit it is fetched as the value resolves, below.
  const replyImpact =
    flag.status === 'responded' && flag.impact?.reachesPlan
      ? `Applying ${flag.impact.rowRef.includes('month') ? replyValue : replyValue} changes ${flag.impact.monthLabel} production at ${flag.impact.plantLabel} by ${flag.impact.productionDelta > 0 ? '+' : '−'}${Math.abs(flag.impact.productionDelta)} kb and plan revenue by ${fmtMoneyDelta(flag.impact.revenueDelta)}.`
      : null;

  const openEmail = () => {
    setEmail({
      to: stakeholder?.email ?? '',
      subject: `SROP query — ${RULE_LABEL[flag.rule]} in ${flag.file}`,
      body:
        `Hello ${flag.source},\n\n` +
        `Validation flagged one value in your submission and we would like to confirm it before ` +
        `it goes into the plan.\n\n` +
        `  Row:      ${prettyRowRef(flag.rowRef)}\n` +
        `  Field:    ${flag.field}\n` +
        `  Evidence: ${flag.evidence}\n\n` +
        `${flag.plainEnglish}\n\n` +
        `If the figure is correct, reply confirming and we will log your reason against it. ` +
        `If it is not, reply with the corrected value or upload a new file.\n\n` +
        `— SROP Planning`,
    });
    setPanel('email');
  };

  const resolveEdit = async (text: string) => {
    setEditText(text);
    if (!text.trim()) {
      setEditValue(null);
      setEditHint(null);
      setImpact(null);
      return;
    }
    const res = await act('interpret_edit', { id: flag.id, text });
    const outcome = res.extra as { value: number | null; explanation: string } | undefined;
    const value = outcome?.value ?? null;
    setEditValue(value);
    setEditHint(outcome?.explanation ?? null);

    // What is this edit worth? Answered before it is committed, not after.
    if (value === null) {
      setImpact(null);
      return;
    }
    const preview = await ask('impact_preview', { field: flag.field, rowRef: flag.rowRef, value });
    setImpact(typeof preview.sentence === 'string' ? preview.sentence : null);
  };

  return (
    <Card tone={isOpen(flag) ? 'default' : 'good'}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            {flag.status === 'open' && (
              <input
                type="checkbox"
                checked={selected}
                onChange={(e) => onSelect(e.target.checked)}
                className="size-3.5 accent-amber-500"
                aria-label="select flag"
              />
            )}
            <Badge tone={severityTone}>{flag.severity}</Badge>
            <span className="text-sm font-medium text-zinc-100">{RULE_LABEL[flag.rule]}</span>
            {flag.origin === 'draft_review' && <Badge tone="info">from draft review</Badge>}
          </span>
          <span className="flex items-center gap-2">
            {flag.status === 'escalated' && <Badge tone="bad">escalated</Badge>}
            {flag.status === 'awaiting_response' && (
              <Badge tone="warn">
                queried {flag.daysWaiting === 0 ? 'just now' : `${flag.daysWaiting}d ago`}
              </Badge>
            )}
            <span className="font-mono text-xs text-zinc-500">{flag.file}</span>
          </span>
        </div>

        <span className="font-mono text-sm text-zinc-400">{prettyRowRef(flag.rowRef)}</span>

        {/* The credibility line. Both numbers, largest thing on the card. */}
        <p className="font-mono text-lg leading-snug text-zinc-50">{flag.evidence}</p>

        <p className="text-sm italic leading-relaxed text-zinc-400">&ldquo;{flag.plainEnglish}&rdquo;</p>

        {prior && (
          <Banner tone="info" title="Justified in an earlier cycle">
            &ldquo;{prior.reason}&rdquo; — raised again anyway, because suppressing it would hide a
            real change behind an old reason.
          </Banner>
        )}

        {/* ---------------------------------------------------------- actions */}
        {flag.status === 'open' && panel === null && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setPanel('reason')}>
              Accept as justified
            </Button>
            <Button size="sm" tone="primary" onClick={openEmail}>
              Send query email
            </Button>
            <Button size="sm" onClick={() => setPanel('edit')}>
              Edit the value
            </Button>
            {flag.rule === 'HISTORICAL_DEVIATION' && (
              <Button size="sm" tone="quiet" onClick={() => setPanel('threshold')}>
                Raise threshold for this series
              </Button>
            )}
          </div>
        )}

        {panel === 'reason' && (
          <Panel>
            <Field label="Reason (required)" hint="This becomes the audit trail and is reused next cycle.">
              <Textarea
                rows={2}
                value={reason}
                placeholder="Why is this acceptable as-is?"
                onChange={(e) => {
                  setReason(e.target.value);
                  if (e.target.value.trim()) setReasonError(false);
                }}
              />
            </Field>
            {reasonError && (
              <p className="text-xs text-red-400">A reason is required — this is the audit trail.</p>
            )}
            <PanelActions
              onCancel={() => setPanel(null)}
              confirmLabel="Confirm"
              busy={busy !== null}
              onConfirm={() => {
                if (!reason.trim()) {
                  setReasonError(true);
                  return;
                }
                act('flag_justify', { id: flag.id, note: reason });
                setPanel(null);
              }}
            />
          </Panel>
        )}

        {panel === 'email' && (
          <Panel>
            <Field label="To">
              <Input value={email.to} onChange={(e) => setEmail({ ...email, to: e.target.value })} className="font-mono text-xs" />
            </Field>
            <Field label="Subject">
              <Input value={email.subject} onChange={(e) => setEmail({ ...email, subject: e.target.value })} />
            </Field>
            <Field label="Body" hint="Drafted with the numbers already in it — you do not retype them.">
              <Textarea
                rows={9}
                value={email.body}
                onChange={(e) => setEmail({ ...email, body: e.target.value })}
                className="text-xs leading-relaxed"
              />
            </Field>
            <PanelActions
              onCancel={() => setPanel(null)}
              confirmLabel="Send"
              busy={busy !== null}
              onConfirm={() => {
                act('flag_query', { id: flag.id, emailDraft: email });
                setPanel(null);
              }}
            />
          </Panel>
        )}

        {panel === 'edit' && (
          <Panel>
            <Field
              label="New value"
              hint="Type a number, or describe it — “the historical mean”, “last cycle”, “25.8”."
            >
              <Input
                value={editText}
                placeholder="e.g. use the 12-month mean"
                onChange={(e) => resolveEdit(e.target.value)}
              />
            </Field>
            {editHint && (
              <p className="text-xs text-zinc-400">
                {editValue !== null ? (
                  <>
                    <span className="font-mono text-zinc-200">
                      {flag.submittedValue} → {editValue}
                    </span>{' '}
                    — {editHint}
                  </>
                ) : (
                  editHint
                )}
              </p>
            )}
            {impact && <ImpactLine text={impact} />}
            <Field label="Reason (required)">
              <Input
                value={editNote}
                placeholder="Why are you changing it yourself rather than asking?"
                onChange={(e) => setEditNote(e.target.value)}
              />
            </Field>
            <PanelActions
              onCancel={() => setPanel(null)}
              confirmLabel={editValue === null ? 'Resolve a value first' : `Apply ${editValue}`}
              busy={busy !== null || editValue === null || !editNote.trim()}
              onConfirm={() => {
                act('flag_edit', { id: flag.id, value: editValue, note: editNote });
                setPanel(null);
              }}
            />
          </Panel>
        )}

        {panel === 'threshold' && (
          <Panel>
            <p className="text-xs leading-relaxed text-zinc-400">
              Raising the threshold for this series is standing policy — it persists into future
              cycles and is listed on the Data Dashboard, so it never becomes invisible. Sibling
              flags the new threshold no longer catches will close with your reason attached.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Threshold %">
                <Input
                  type="number"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="w-24"
                />
              </Field>
              <Field label="Scope">
                <Input readOnly value={seriesOf(flag.rowRef)} className="font-mono text-xs" />
              </Field>
            </div>
            <Field label="Reason (required)">
              <Input
                value={reason}
                placeholder="e.g. Hajj season uplift, recurring and confirmed"
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <PanelActions
              onCancel={() => setPanel(null)}
              confirmLabel="Save override"
              busy={busy !== null || !reason.trim()}
              onConfirm={() => {
                act('override_threshold', {
                  scope: 'series',
                  key: seriesOf(flag.rowRef),
                  deviation: Number(threshold) / 100,
                  reason,
                });
                setPanel(null);
              }}
            />
          </Panel>
        )}

        {flag.status === 'awaiting_response' && (
          <Panel>
            <p className="text-sm text-zinc-400">
              Query sent to <span className="font-mono text-zinc-300">{stakeholder?.email}</span> —
              awaiting response.
            </p>
            <p className="text-xs text-zinc-500">
              {flag.daysWaiting === 0
                ? 'Sent just now. A reminder goes out at 3 business days and it escalates at 5.'
                : `Waiting ${flag.daysWaiting} business day${flag.daysWaiting === 1 ? '' : 's'}.`}
            </p>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy !== null} onClick={() => act('flag_reply', { id: flag.id })}>
                Simulate reply
              </Button>
              <Button size="sm" tone="quiet" disabled={busy !== null} onClick={() => act('advance_clock', { days: 1 })}>
                Advance a day
              </Button>
            </div>
          </Panel>
        )}

        {flag.status === 'escalated' && (
          <Panel tone="bad">
            <p className="text-sm text-red-200">
              No reply in {flag.daysWaiting} business days. Escalated to{' '}
              <span className="font-mono">{stakeholder?.escalationContact}</span>. You can still
              resolve it yourself at any point.
            </p>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy !== null} onClick={() => act('flag_reply', { id: flag.id })}>
                Simulate reply
              </Button>
              <Button size="sm" onClick={() => setPanel('reason')}>
                Accept as justified
              </Button>
            </div>
          </Panel>
        )}

        {flag.status === 'responded' && (
          <Panel>
            <p className="font-mono text-sm leading-relaxed text-zinc-100">
              &ldquo;{flag.response}&rdquo;
            </p>
            {replyImpact && <ImpactLine text={replyImpact} />}
            <div>
              <Button
                size="sm"
                tone="primary"
                disabled={busy !== null}
                onClick={() => act('flag_accept', { id: flag.id })}
              >
                {Number.isFinite(replyValue) ? `Accept correction (${replyValue})` : 'Accept response'}
              </Button>
            </div>
          </Panel>
        )}

        {flag.status === 'justified' && (
          <p className="text-sm text-emerald-300">Justified — &ldquo;{flag.note}&rdquo;</p>
        )}

        {flag.status === 'corrected' && (
          <div className="flex flex-col gap-1.5">
            <p className="font-mono text-sm text-emerald-300">
              {flag.correctedValue
                ? `Corrected — ${flag.submittedValue} → ${flag.correctedValue}`
                : 'Resolved — confirmed, no data change'}
            </p>
            {flag.impact?.reachesPlan && (
              <p className="font-mono text-xs text-zinc-400">
                plan effect: {flag.impact.productionDelta > 0 ? '+' : ''}
                {flag.impact.productionDelta} kb · {fmtMoneyDelta(flag.impact.revenueDelta)}
              </p>
            )}
            {flag.note && <p className="text-xs italic text-zinc-500">&ldquo;{flag.note}&rdquo;</p>}
          </div>
        )}

        {flag.history.length > 0 && (
          <details className="border-t border-zinc-800 pt-2">
            <summary className="cursor-pointer text-xs text-zinc-500">
              {flag.history.length} transition{flag.history.length === 1 ? '' : 's'}
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {flag.history.map((h, i) => (
                <li key={i} className="font-mono text-[11px] text-zinc-500">
                  {relTime(h.at)} · {h.actor} · {h.from} → {h.to}
                  {h.note && ` · ${h.note}`}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Card>
  );
}

/** The line that makes materiality visible before the planner commits. */
function ImpactLine({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-amber-900/60 bg-amber-500/[0.06] px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-500/80">Plan impact</p>
      <p className="mt-0.5 text-sm leading-relaxed text-amber-100">{text}</p>
    </div>
  );
}

function Panel({ children, tone }: { children: React.ReactNode; tone?: 'bad' }) {
  return (
    <div
      className={`flex flex-col gap-2.5 rounded-lg border px-3.5 py-3 ${
        tone === 'bad' ? 'border-red-900/70 bg-red-500/[0.05]' : 'border-zinc-800 bg-zinc-950/60'
      }`}
    >
      {children}
    </div>
  );
}

function PanelActions({
  onConfirm,
  onCancel,
  confirmLabel,
  busy,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel: string;
  busy: boolean;
}) {
  return (
    <div className="flex gap-2">
      <Button size="sm" tone="primary" onClick={onConfirm} disabled={busy}>
        {confirmLabel}
      </Button>
      <Button size="sm" tone="quiet" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function seriesOf(rowRef: string): string {
  const parts = new Map(
    rowRef.split(',').map((p) => {
      const [k, ...rest] = p.split('=');
      return [k.trim(), rest.join('=').trim()];
    })
  );
  return `${parts.get('refinery')}|${parts.get('bulk_plant')}|${parts.get('product')}`;
}
