'use client';

/**
 * Screen 8.1 — My Tasks. version2.md §8.1.
 *
 * The landing screen for every non-planner identity. Deliberately small: a refinery
 * engineer should be able to finish their obligation in under two minutes without
 * being taught the system. One card per outstanding obligation, one primary button
 * each.
 */

import Link from 'next/link';
import { useState } from 'react';

import { currentDraft } from '@/lib/gates';
import { slaLabel } from '@/lib/policy';

import { useCycle } from '../providers';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Screen,
  Textarea,
  prettyRef,
  relTime,
} from '../components/ui';

export default function MyTasks() {
  const { cycle, role, act, busy } = useCycle();
  const [replies, setReplies] = useState<Record<string, string>>({});

  if (!cycle) {
    return (
      <Screen title={`Welcome, ${role}`} lede="No SROP cycle is open yet. You will be emailed when data is requested.">
        <EmptyState title="Nothing to do" placeholder>
          The planner has not opened this month&apos;s cycle. Nothing is expected from you.
        </EmptyState>
      </Screen>
    );
  }

  const submission = cycle.submissions.find((s) => s.source === role);
  const draft = currentDraft(cycle);
  const review = cycle.reviews.find((r) => r.stakeholder === role && draft && r.draftId === draft.id);
  const queries = cycle.flags.filter(
    (f) => f.source === role && (f.status === 'awaiting_response' || f.status === 'escalated')
  );
  const answered = cycle.comments.filter((c) => c.author === role && c.status !== 'open');

  const request = cycle.requests.find((r) => r.recipient === role);
  const dataDue = submission && submission.versions.length === 0 && request?.status === 'sent';
  const draftDue = review && ['notified', 'viewed', 'escalated'].includes(review.status);

  const tasks = [dataDue, queries.length > 0, draftDue, answered.length > 0].filter(Boolean).length;

  return (
    <Screen
      title={`Your tasks — ${role}`}
      lede={
        tasks === 0
          ? `Nothing outstanding for cycle ${cycle.id}. You are up to date.`
          : `${tasks} thing${tasks === 1 ? '' : 's'} need your attention for cycle ${cycle.id}.`
      }
    >
      {tasks === 0 && (
        <EmptyState title="You are up to date" placeholder>
          Nothing is expected from you right now. You will be emailed when the planner needs
          something, and any draft SROP issued to you will appear here.
        </EmptyState>
      )}

      {/* 1. Data requested */}
      {dataDue && submission && request && (
        <Card
          tone={submission.daysWaiting >= 5 ? 'bad' : submission.daysWaiting >= 3 ? 'warn' : 'accent'}
          title="Data requested"
          subtitle={slaLabel(submission, request)}
          actions={
            <Link href="/submit">
              <Button tone="primary" size="sm">
                Submit data
              </Button>
            </Link>
          }
        >
          <ul className="flex flex-col gap-1.5 text-sm text-text">
            {request.items.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-text-muted/70">•</span>
                {item}
              </li>
            ))}
          </ul>
          {submission.daysWaiting >= 5 && (
            <p className="mt-3 text-sm text-bad">
              This has been escalated to your department head. The cycle is currently blocked on you.
            </p>
          )}
        </Card>
      )}

      {/* 2. Question about your submission */}
      {queries.map((flag) => (
        <Card
          key={flag.id}
          tone={flag.status === 'escalated' ? 'bad' : 'warn'}
          title="Question about your submission"
          subtitle={`${flag.file} · ${prettyRef(flag.rowRef)}`}
        >
          <div className="flex flex-col gap-3">
            <p className="font-mono text-base text-text">{flag.evidence}</p>
            <p className="text-sm italic text-text-muted">&ldquo;{flag.plainEnglish}&rdquo;</p>
            <p className="text-sm text-text-muted">
              Confirm the figure is intentional, or reply with the corrected value. You can also
              re-upload the file on <Link href="/submit" className="text-blue-accent underline">Submit Data</Link>.
            </p>
            <Textarea
              rows={2}
              placeholder="Your reply to the planner…"
              value={replies[flag.id] ?? ''}
              onChange={(e) => setReplies((r) => ({ ...r, [flag.id]: e.target.value }))}
            />
            <div>
              <Button
                tone="primary"
                size="sm"
                disabled={busy !== null}
                onClick={() => act('flag_reply', { id: flag.id, text: replies[flag.id] ?? '' })}
              >
                Send reply
              </Button>
            </div>
            {flag.status === 'escalated' && (
              <p className="text-xs text-bad">
                No reply was received within 5 business days, so your department head has been copied.
              </p>
            )}
          </div>
        </Card>
      ))}

      {/* 3. Draft SROP ready for review */}
      {draftDue && draft && (
        <Card
          tone={review?.status === 'escalated' ? 'bad' : 'accent'}
          title={`Draft SROP v${draft.version} ready for your review`}
          subtitle={`Issued ${draft.issuedAt ? relTime(draft.issuedAt) : 'recently'}${
            review && review.daysWaiting > 0 ? ` · waiting ${review.daysWaiting} business days` : ''
          }`}
          actions={
            <Link href="/review">
              <Button tone="primary" size="sm">
                Review draft
              </Button>
            </Link>
          }
        >
          <p className="text-sm text-text">
            Your section shows only the rows that concern you, checked against your own capacity and
            tank limits. You can approve it, propose a change to your own data, or reject a specific
            value with a comment.
          </p>
        </Card>
      )}

      {/* 4. Your comment was answered */}
      {answered.map((comment) => (
        <Card
          key={comment.id}
          tone={comment.status === 'accepted' ? 'good' : 'warn'}
          title={comment.status === 'accepted' ? 'Your comment was accepted' : 'Your comment was declined'}
          subtitle={prettyRef(comment.rowRef)}
        >
          <div className="flex flex-col gap-2 text-sm">
            <p className="italic text-text-muted">You wrote: &ldquo;{comment.text}&rdquo;</p>
            <p className="text-text">
              <span className="text-text-muted">Planner: </span>
              {comment.plannerResponse}
            </p>
            {comment.status === 'accepted' && comment.proposedValue !== null && (
              <Badge tone="good" mono>
                applied at {comment.proposedValue} kb
              </Badge>
            )}
          </div>
        </Card>
      ))}

      {/* Completed, collapsed */}
      {(submission?.versions.length || review) && (
        <details className="rounded-xl border border-border bg-surface-2/30 px-5 py-3">
          <summary className="cursor-pointer text-sm font-medium text-text-muted">
            What you have already done this cycle
          </summary>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-text-muted">
            {submission?.versions.map((v) => (
              <li key={v.n} className="flex items-baseline gap-3">
                <Badge tone="good">v{v.n}</Badge>
                <span>
                  Submitted {v.files.map((f) => f.name).join(', ')} — {relTime(v.receivedAt)}
                  {v.note && <span className="italic"> · &ldquo;{v.note}&rdquo;</span>}
                </span>
              </li>
            ))}
            {review && review.respondedAt && (
              <li className="flex items-baseline gap-3">
                <Badge tone="good">{review.status.replace(/_/g, ' ')}</Badge>
                <span>
                  Responded to draft — {relTime(review.respondedAt)}
                </span>
              </li>
            )}
          </ul>
        </details>
      )}
    </Screen>
  );
}
