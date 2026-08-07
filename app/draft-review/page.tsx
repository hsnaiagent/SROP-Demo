'use client';

/**
 * Screen 7 — Draft SROP Review. version2.md §7.7.
 *
 * Y's side of the review loop: who has responded, what they want changed, and whether
 * to accept it. Out-of-scope changes are never applied silently — they sit in the queue
 * with their red verdict until Y explicitly accepts, and accepting one is recorded
 * against Y rather than the stakeholder who proposed it.
 */

import Link from 'next/link';
import { useState } from 'react';

import { currentDraft, gate4, needsRerun } from '@/lib/gates';
import type { AuthorityVerdict } from '@/lib/types';

import { useCycle } from '../providers';
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  Grid,
  Input,
  Screen,
  Stat,
  Textarea,
  fmtMoney,
  prettyRef,
  relTime,
} from '../components/ui';

const VERDICT: Record<AuthorityVerdict, { tone: 'good' | 'bad' | 'warn'; label: string }> = {
  within_authority: { tone: 'good', label: 'within authority' },
  out_of_scope: { tone: 'bad', label: 'out of scope' },
  extreme_value: { tone: 'warn', label: 'extreme value' },
};

export default function DraftReviewPage() {
  const { cycle, act, busy } = useCycle();
  const [notes, setNotes] = useState<Record<string, string>>({});

  if (!cycle) {
    return (
      <Screen title="Draft SROP Review">
        <EmptyState title="No cycle open">Start a cycle on Cycle Home first.</EmptyState>
      </Screen>
    );
  }

  const draft = currentDraft(cycle);
  if (!draft || draft.status === 'generated') {
    return (
      <Screen title="Draft SROP Review">
        <EmptyState title="No draft is out for review">
          Generate a plan and issue it from the Master File &amp; Plan screen.
        </EmptyState>
      </Screen>
    );
  }

  const reviews = cycle.reviews.filter((r) => r.draftId === draft.id);
  const g4 = gate4(cycle);
  const rerun = needsRerun(cycle);
  const pendingRevisions = cycle.revisions.filter((r) => r.status === 'pending');
  const openComments = cycle.comments.filter((c) => c.status === 'open');
  const settled = reviews.filter((r) =>
    ['approved', 'confirmed', 'deemed_approved'].includes(r.status)
  ).length;

  const anyOutstanding = reviews.some((r) => ['notified', 'viewed'].includes(r.status));

  return (
    <Screen
      title="Draft SROP Review"
      lede={`Draft v${draft.version}, issued ${draft.issuedAt ? relTime(draft.issuedAt) : ''}. Nothing a stakeholder proposes is applied until you accept it.`}
      actions={
        <>
          {anyOutstanding && (
            <Button disabled={busy !== null} onClick={() => act('simulate_responses')}>
              Simulate stakeholder responses
            </Button>
          )}
          <Button
            tone={g4.open ? 'good' : 'ghost'}
            disabled={busy !== null || !g4.open}
            title={g4.open ? undefined : `Gate 4 is closed — ${g4.reason}`}
            onClick={() => act('publish_final')}
          >
            {!g4.open && '🔒 '}Publish final SROP
          </Button>
        </>
      }
    >
      {cycle.finalisedAt && (
        <Banner tone="good" title="Final SROP published">
          Published {relTime(cycle.finalisedAt)} from draft v{draft.version} at{' '}
          {fmtMoney(draft.totalRevenue)}. Everything is archived on the{' '}
          <Link href="/history" className="underline">
            History
          </Link>{' '}
          screen.
        </Banner>
      )}

      <Grid cols={4}>
        <Stat label="Version" value={`v${draft.version}`} hint={`of ${cycle.drafts.length} generated`} />
        <Stat
          label="Settled"
          value={`${settled}/${reviews.length}`}
          tone={settled === reviews.length ? 'good' : 'neutral'}
          hint="approved or resolved"
        />
        <Stat
          label="In your queue"
          value={pendingRevisions.length + openComments.length}
          tone={pendingRevisions.length + openComments.length > 0 ? 'warn' : 'good'}
          hint="updates and comments"
        />
        <Stat label="Planned revenue" value={fmtMoney(draft.totalRevenue)} />
      </Grid>

      {rerun && (
        <Banner
          tone="warn"
          title="Rerun required before publishing"
          actions={
            <Link href="/plan">
              <Button size="sm" tone="primary">
                Rebuild and rerun
              </Button>
            </Link>
          }
        >
          You have accepted changes that move the data. Publishing on top of a stale plan would ship
          numbers the model never produced.
        </Banner>
      )}

      {/* --------------------------------------------------------- revision queue */}
      <Card
        title="Revision queue"
        subtitle={
          pendingRevisions.length + openComments.length === 0
            ? 'Nothing pending'
            : `${pendingRevisions.length + openComments.length} proposed changes`
        }
      >
        {pendingRevisions.length + openComments.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No stakeholder has proposed a change to this version.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {pendingRevisions.map((revision) => (
              <div key={revision.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-100">{revision.author}</span>
                    <Badge tone="info">{revision.channel}</Badge>
                    {revision.recognisedAs && (
                      <Badge>recognised as {revision.recognisedAs}</Badge>
                    )}
                  </span>
                  <span className="font-mono text-xs text-zinc-500">{revision.fileName}</span>
                </div>

                <ul className="mt-3 flex flex-col gap-2">
                  {revision.changes.map((change, i) => {
                    const v = VERDICT[change.verdict];
                    return (
                      <li
                        key={i}
                        className={`rounded-md border px-3 py-2 ${
                          change.verdict === 'out_of_scope'
                            ? 'border-red-900/60 bg-red-500/[0.05]'
                            : change.verdict === 'extreme_value'
                              ? 'border-amber-900/60 bg-amber-500/[0.05]'
                              : 'border-zinc-800'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-zinc-400">
                            {prettyRef(change.rowRef)} · {change.field}
                          </span>
                          <Badge tone={v.tone}>{v.label}</Badge>
                        </div>
                        <p className="mt-1 font-mono text-sm text-zinc-100">
                          {change.before} → {change.after}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-400">{change.reason}</p>
                      </li>
                    );
                  })}
                </ul>

                {revision.changes.some((c) => c.verdict === 'out_of_scope') && (
                  <p className="mt-2.5 text-xs text-red-300">
                    Out-of-scope changes are held, not applied. Accepting one is recorded against
                    you, not {revision.author}.
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <Field label="Note (required to decline)">
                    <Input
                      value={notes[revision.id] ?? ''}
                      placeholder="Reason, emailed to the author"
                      onChange={(e) => setNotes((n) => ({ ...n, [revision.id]: e.target.value }))}
                      className="w-80"
                    />
                  </Field>
                  <Button
                    size="sm"
                    tone="primary"
                    disabled={busy !== null}
                    onClick={() => act('revision_accept', { id: revision.id, note: notes[revision.id] ?? '' })}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    tone="danger"
                    disabled={busy !== null || !(notes[revision.id] ?? '').trim()}
                    onClick={() => act('revision_decline', { id: revision.id, note: notes[revision.id] })}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}

            {openComments.map((comment) => (
              <div key={comment.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-100">{comment.author}</span>
                    <Badge tone="info">comment</Badge>
                  </span>
                  <span className="font-mono text-xs text-zinc-500">{prettyRef(comment.rowRef)}</span>
                </div>
                <p className="mt-2 font-mono text-sm text-zinc-100">
                  currently {comment.quotedValue}
                  {comment.proposedValue !== null && ` → proposed ${comment.proposedValue} kb`}
                </p>
                <p className="mt-1.5 text-sm italic leading-relaxed text-zinc-300">
                  &ldquo;{comment.text}&rdquo;
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <Field label="Your response">
                    <Input
                      value={notes[comment.id] ?? ''}
                      placeholder="Accepted — replanned at the proposed figure"
                      onChange={(e) => setNotes((n) => ({ ...n, [comment.id]: e.target.value }))}
                      className="w-80"
                    />
                  </Field>
                  <Button
                    size="sm"
                    tone="primary"
                    disabled={busy !== null}
                    onClick={() =>
                      act('comment_accept', {
                        id: comment.id,
                        note: notes[comment.id] || 'Accepted — applied to the plan.',
                        proposedValue: comment.proposedValue,
                      })
                    }
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    tone="danger"
                    disabled={busy !== null || !(notes[comment.id] ?? '').trim()}
                    onClick={() => act('comment_decline', { id: comment.id, note: notes[comment.id] })}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ---------------------------------------------------------- response board */}
      <Card title="Response board" subtitle="What Gate 4 counts">
        <Grid cols={3}>
          {reviews.map((review) => {
            const tone =
              ['approved', 'confirmed', 'deemed_approved'].includes(review.status)
                ? 'good'
                : review.status === 'escalated'
                  ? 'bad'
                  : review.status === 'notified' || review.status === 'viewed'
                    ? 'default'
                    : 'warn';
            return (
              <Card
                key={review.id}
                tone={tone}
                title={review.stakeholder}
                subtitle={review.status.replace(/_/g, ' ')}
              >
                <div className="flex flex-col gap-2 text-sm">
                  {review.respondedAt ? (
                    <span className="text-xs text-zinc-500">responded {relTime(review.respondedAt)}</span>
                  ) : (
                    <span className="text-xs text-zinc-500">
                      {review.daysWaiting === 0
                        ? 'notified, no response yet'
                        : `waiting ${review.daysWaiting} business day${review.daysWaiting === 1 ? '' : 's'}`}
                    </span>
                  )}

                  {review.note && <p className="text-xs italic text-zinc-400">{review.note}</p>}

                  {['notified', 'viewed'].includes(review.status) && (
                    <Button
                      size="sm"
                      tone="quiet"
                      disabled={busy !== null}
                      onClick={() => act('advance_clock', { days: 1 })}
                    >
                      Advance a day
                    </Button>
                  )}

                  {review.status === 'escalated' && (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-red-300">
                        No response in {review.daysWaiting} business days. Silence is not approval.
                      </p>
                      <Textarea
                        rows={2}
                        value={notes[review.id] ?? ''}
                        placeholder="Reason for recording a deemed approval"
                        onChange={(e) => setNotes((n) => ({ ...n, [review.id]: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        disabled={busy !== null || !(notes[review.id] ?? '').trim()}
                        onClick={() => act('deem_approved', { id: review.id, note: notes[review.id] })}
                      >
                        Record as deemed approved
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </Grid>
      </Card>

      {!g4.open && !cycle.finalisedAt && (
        <Banner tone="warn" title={`Gate 4 is closed — ${g4.reason}`}>
          The draft becomes final when every stakeholder has either approved or had their comment
          resolved and re-confirmed. You cannot publish over an unresolved comment.
        </Banner>
      )}
    </Screen>
  );
}
