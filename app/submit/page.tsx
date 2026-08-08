'use client';

/**
 * Screen 8.2 — Submit Data. version2.md §8.2.
 *
 * The upload is accepted, acknowledged and summarised, and then the platform proceeds
 * with the pre-generated fixture for this source. The file list and row counts shown are
 * the fixture's. Nothing dropped here changes the numbers anywhere in the system — which
 * is stated on the screen rather than hidden.
 */

import Link from 'next/link';
import { useRef, useState } from 'react';

import { slaLabel } from '@/lib/policy';

import { useCycle } from '../providers';
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  Screen,
  Textarea,
  prettyRef,
  relTime,
} from '../components/ui';

export default function SubmitPage() {
  const { cycle, role, act, busy } = useCycle();
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const submission = cycle?.submissions.find((s) => s.source === role);
  const request = cycle?.requests.find((r) => r.recipient === role);

  if (!cycle || !submission || !request || request.status !== 'sent') {
    return (
      <Screen title="Submit Data">
        <EmptyState title="Nothing is currently requested from you">
          You will be emailed when the planner opens a cycle and asks for your data.
        </EmptyState>
      </Screen>
    );
  }

  const flags = cycle.flags.filter(
    (f) => f.source === role && f.origin === 'validation' && f.status !== 'superseded'
  );
  const latest = submission.versions.at(-1);

  return (
    <Screen
      title="Submit Data"
      lede={`Requested for cycle ${cycle.id}. ${slaLabel(submission, request) || 'Received.'}`}
    >
      <Card title="What was asked" subtitle={`From ${request.recipient}, due ${request.dueDate}`}>
        <ul className="flex flex-col gap-1.5 text-sm text-text">
          {request.items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-text-muted/70">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Card>

      {latest && (
        <Banner tone="good" title={`Received — version ${latest.n}`}>
          {latest.files.map((f) => `${f.name} (${f.rowCount} rows)`).join(', ')}, {relTime(latest.receivedAt)}.
          {submission.status === 'clean' && ' The Data Checker found no issues.'}
          {submission.status === 'flagged' &&
            ` The Data Checker raised ${flags.length} question${flags.length === 1 ? '' : 's'} — see below.`}
          {submission.status === 'submitted' && ' The Data Checker is queued.'}
        </Banner>
      )}

      <Card
        title={latest ? 'Resubmit' : 'Upload'}
        subtitle="CSV or XLSX"
      >
        <div className="flex flex-col gap-4">
          <div
            onClick={() => input.current?.click()}
            className="cursor-pointer rounded-xl border border-dashed border-border px-6 py-8 text-center transition-colors hover:border-blue-accent/50 dark:hover:border-green-accent/50"
          >
            <input
              ref={input}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={(e) => setPicked(e.target.files?.[0]?.name ?? null)}
            />
            <p className="text-sm font-medium text-text">
              {picked ?? 'Drop your file here, or click to browse'}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {picked
                ? 'Ready to submit.'
                : `Expected: ${request.items[0]?.toLowerCase() ?? 'your data file'}`}
            </p>
          </div>

          <Field label="Note to the planner (optional)" hint="For anything the file itself cannot say.">
            <Textarea
              rows={2}
              value={note}
              placeholder="e.g. BP-QASSIM JET-A1 is high on purpose — Hajj season."
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              tone="primary"
              disabled={busy !== null}
              onClick={() => {
                act('submit', { source: role, note, fileName: picked });
                setNote('');
                setPicked(null);
              }}
            >
              {busy === 'submit' ? 'Submitting…' : latest ? 'Submit new version' : 'Submit'}
            </Button>
            <p className="text-xs text-text-muted">
              This is a demo: the upload is acknowledged and then the pre-generated fixture for{' '}
              {role} is used. Your file does not change the numbers.
            </p>
          </div>
        </div>
      </Card>

      {/* Validation results, read-only, with the same evidence line the planner sees. */}
      {flags.length > 0 && (
        <Card title="What the Data Checker found" subtitle="The same evidence the planner sees">
          <div className="flex flex-col gap-3">
            {flags.map((flag) => (
              <div
                key={flag.id}
                className={`rounded-lg border px-4 py-3 ${
                  ['justified', 'corrected'].includes(flag.status)
                    ? 'border-border bg-surface'
                    : 'border-warn/40 bg-warn/[0.05]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-text-muted">{prettyRef(flag.rowRef)}</span>
                  <Badge
                    tone={
                      flag.status === 'corrected' || flag.status === 'justified'
                        ? 'good'
                        : flag.status === 'escalated'
                          ? 'bad'
                          : 'warn'
                    }
                  >
                    {flag.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <p className="mt-1.5 font-mono text-sm text-text">{flag.evidence}</p>
                <p className="mt-1 text-sm italic text-text-muted">&ldquo;{flag.plainEnglish}&rdquo;</p>
                {flag.status === 'awaiting_response' && (
                  <p className="mt-2 text-sm text-warn">
                    The planner has asked you about this. Reply from{' '}
                    <Link href="/" className="underline">
                      My Tasks
                    </Link>
                    , or resubmit the file above.
                  </p>
                )}
                {flag.note && (
                  <p className="mt-2 text-xs text-green-accent">Resolved — &ldquo;{flag.note}&rdquo;</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </Screen>
  );
}
