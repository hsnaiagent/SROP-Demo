'use client';

/**
 * Screen 3 — Submissions. version2.md §7.3.
 *
 * Version 1's SubmissionsPane grown into the collection tracker: one card per requested
 * source rather than one per file, with the SLA state on the ones that have not arrived.
 * Validation is per source and runs independently, so one source's spinner says nothing
 * about another's.
 */

import Link from 'next/link';

import { slaLabel } from '@/lib/policy';
import type { Submission } from '@/lib/types';

import { useCycle } from '../providers';
import {
  Badge,
  Banner,
  Button,
  Card,
  Dot,
  EmptyState,
  Grid,
  Screen,
  Spinner,
  relTime,
} from '../components/ui';

export default function SubmissionsPage() {
  const { cycle, act, busy } = useCycle();

  if (!cycle) {
    return (
      <Screen title="Submissions">
        <EmptyState title="No cycle open">Start a new cycle from Requests.</EmptyState>
      </Screen>
    );
  }

  const received = cycle.submissions.filter((s) => s.versions.length > 0);
  const unvalidated = received.filter((s) => s.status === 'submitted');
  const awaitingReceive = cycle.submissions.filter(
    (s) =>
      s.versions.length === 0 &&
      cycle.requests.find((r) => r.recipient === s.source)?.status === 'sent'
  );
  const validating =
    busy === 'validate' ||
    busy === 'receive_and_validate' ||
    busy === 'receive_and_validate_all';

  return (
    <Screen
      title="Submissions"
      lede={`${received.length} of ${cycle.submissions.length} received. Validation runs one instance per source, in parallel — a failure on one leaves the rest untouched.`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {awaitingReceive.length > 0 && (
            <Button
              tone="primary"
              disabled={busy !== null}
              title="Demo shortcut: attach fixture files and run validation for every source still waiting"
              onClick={() => act('receive_and_validate_all')}
            >
              {busy === 'receive_and_validate_all'
                ? 'Receiving…'
                : `Receive & validate all (${awaitingReceive.length})`}
            </Button>
          )}
          <Button
            tone={awaitingReceive.length > 0 ? 'ghost' : 'primary'}
            disabled={busy !== null || unvalidated.length === 0}
            onClick={() => act('validate')}
          >
            {validating && busy === 'validate'
              ? 'Validating…'
              : unvalidated.length === 0
                ? received.length > 0
                  ? 'All validated'
                  : 'Nothing to validate'
                : `Validate ${unvalidated.length} received`}
          </Button>
        </div>
      }
    >
      {cycle.requests.every((r) => r.status === 'draft') && (
        <Banner tone="warn" title="Requests have not been sent">
          Nothing will arrive until the requests go out. Send them from the Requests screen.
        </Banner>
      )}

      <Grid cols={3}>
        {cycle.submissions.map((sub) => (
          <SourceCard key={sub.id} submission={sub} validating={validating} busy={busy} />
        ))}
      </Grid>
    </Screen>
  );
}

function SourceCard({
  submission,
  validating,
  busy,
}: {
  submission: Submission;
  validating: boolean;
  busy: string | null;
}) {
  const { cycle, act } = useCycle();
  const request = cycle!.requests.find((r) => r.recipient === submission.source);
  const flags = cycle!.flags.filter(
    (f) => f.source === submission.source && f.origin === 'validation' && f.status !== 'superseded'
  );
  const latest = submission.versions.at(-1);
  const receiving =
    (busy === 'receive_and_validate' && submission.versions.length === 0) ||
    (busy === 'receive_and_validate_all' && submission.versions.length === 0);
  const spinning =
    receiving || (validating && (submission.status === 'submitted' || submission.versions.length === 0));

  const tone =
    submission.status === 'clean'
      ? 'good'
      : submission.status === 'flagged'
        ? 'bad'
        : submission.daysWaiting >= 5
          ? 'bad'
          : submission.daysWaiting >= 3
            ? 'warn'
            : 'default';

  return (
    <Card
      tone={tone}
      title={
        <span className="flex items-center gap-2">
          <StatusMark submission={submission} flagCount={flags.length} spinning={spinning} />
          {submission.source}
        </span>
      }
      subtitle={request?.items[0] ?? 'nothing requested'}
    >
      <div className="flex flex-col gap-3">
        {latest ? (
          <>
            {latest.files.map((file) => (
              <div key={file.name} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-mono text-xs text-text">{file.name}</span>
                  <Badge>{file.kind}</Badge>
                </div>
                <span className="font-mono text-xs text-text-muted">
                  {file.rowCount} rows · {file.sizeKb} kb · {relTime(latest.receivedAt)}
                </span>
                <span className="truncate font-mono text-[11px] text-text-muted/70" title={file.columns.join(', ')}>
                  {file.columns.join(' · ')}
                </span>
              </div>
            ))}

            {submission.versions.length > 1 && (
              <Badge tone="info">
                v{submission.versions.length} · resubmitted {relTime(latest.receivedAt)}
              </Badge>
            )}
            {submission.assumed && (
              <Badge tone="warn">assumed — carried from cycle 2026-08</Badge>
            )}
            {latest.note && <p className="text-xs italic text-text-muted">&ldquo;{latest.note}&rdquo;</p>}
            {submission.crossSourcePending && (
              <p className="text-xs text-text-muted">
                Cross-source checks pending — waiting on another source to arrive.
              </p>
            )}
          </>
        ) : (
          <p className="font-mono text-xs text-text-muted">{slaLabel(submission, request)}</p>
        )}

        <div className="flex flex-wrap gap-2">
          {submission.versions.length === 0 && request?.status === 'sent' && (
            <>
              <Button
                size="sm"
                tone="primary"
                disabled={busy !== null}
                onClick={() => act('receive_and_validate', { source: submission.source })}
                title="Demo shortcut: attach the fixture file and run validation for this source"
              >
                {receiving ? 'Receiving…' : 'Receive & validate'}
              </Button>
              {submission.daysWaiting >= 7 && (
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => act('confirm_fallback', { source: submission.source })}
                >
                  Use last cycle&apos;s data
                </Button>
              )}
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() => act('advance_clock', { days: 1 })}
                title="Advances the shared demo clock by one business day"
              >
                Advance a day
              </Button>
            </>
          )}

          {submission.status === 'submitted' && (
            <Button
              size="sm"
              tone="primary"
              disabled={busy !== null}
              onClick={() => act('validate', { source: submission.source })}
            >
              Validate
            </Button>
          )}

          {submission.status === 'flagged' && (
            <Link href="/validation">
              <Button size="sm" tone="ghost">
                Review {flags.length} flag{flags.length === 1 ? '' : 's'}
              </Button>
            </Link>
          )}

        </div>
      </div>
    </Card>
  );
}

/** Version 1's StatusDot, extended for the states version 2 adds. */
function StatusMark({
  submission,
  flagCount,
  spinning,
}: {
  submission: Submission;
  flagCount: number;
  spinning: boolean;
}) {
  if (spinning) {
    return <Spinner className="size-3" />;
  }
  if (submission.assumed) return <Badge tone="warn">assumed</Badge>;
  if (submission.status === 'clean') return <span className="text-green-accent">✓</span>;
  if (submission.status === 'flagged') {
    return <Badge tone="bad" mono>{flagCount}</Badge>;
  }
  if (submission.daysWaiting >= 5) return <Dot tone="bad" />;
  if (submission.daysWaiting >= 3) return <Dot tone="warn" />;
  if (submission.versions.length > 0) return <Dot tone="good" />;
  return <Dot tone="idle" />;
}
