import type { EmailDraft, Flag } from '@/lib/types';

import type { SimulatedReply } from '../demo-data';

type ActionPanel = 'email' | 'reason' | null;

interface FlagsPaneProps {
  flags: Flag[];
  cleanSources: string[];
  openCount: number;
  activeAction: Record<string, ActionPanel>;
  emailDrafts: Record<string, EmailDraft>;
  reasonDrafts: Record<string, string>;
  reasonErrors: Record<string, boolean>;
  simulated: Record<string, SimulatedReply>;
  onOpenEmail: (flagId: string) => void;
  onOpenReason: (flagId: string) => void;
  onCancelAction: (flagId: string) => void;
  onEmailFieldChange: (flagId: string, field: keyof EmailDraft, value: string) => void;
  onSendEmail: (flagId: string) => void;
  onSimulateResponse: (flagId: string) => void;
  onAcceptResponse: (flagId: string) => void;
  onReasonChange: (flagId: string, value: string) => void;
  onConfirmReason: (flagId: string) => void;
}

const SEVERITY_COLOR: Record<Flag['severity'], string> = {
  high: 'text-red-400 bg-red-500/10',
  medium: 'text-amber-400 bg-amber-500/10',
  low: 'text-zinc-400 bg-zinc-500/10',
};

/** `refinery=JAZAN,bulk_plant=BP-JAZAN,product=DIESEL,month=2026-10` -> `JAZAN · BP-JAZAN · DIESEL · 2026-10` */
function formatRowRef(rowRef: string): string {
  return rowRef
    .split(',')
    .map((pair) => pair.split('=')[1] ?? pair)
    .join(' · ');
}

function ruleLabel(rule: Flag['rule']): string {
  return rule.toLowerCase().split('_').join(' ');
}

export default function FlagsPane({
  flags,
  cleanSources,
  openCount,
  activeAction,
  emailDrafts,
  reasonDrafts,
  reasonErrors,
  simulated,
  onOpenEmail,
  onOpenReason,
  onCancelAction,
  onEmailFieldChange,
  onSendEmail,
  onSimulateResponse,
  onAcceptResponse,
  onReasonChange,
  onConfirmReason,
}: FlagsPaneProps) {
  const bySource = new Map<string, Flag[]>();
  for (const flag of flags) {
    const bucket = bySource.get(flag.source);
    if (bucket) bucket.push(flag);
    else bySource.set(flag.source, [flag]);
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-zinc-200">Flags</h2>
        <span className="font-mono text-base text-zinc-300">
          {openCount} of {flags.length} flags open
        </span>
      </div>

      <div className="flex flex-col gap-6">
        {[...bySource.entries()].map(([source, sourceFlags]) => (
          <div key={source} className="flex flex-col gap-3">
            <h3 className="text-base font-semibold uppercase tracking-wide text-zinc-400">
              {source}
            </h3>
            {sourceFlags.map((flag) => (
              <div
                key={flag.id}
                className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-base font-semibold uppercase ${SEVERITY_COLOR[flag.severity]}`}
                    >
                      {flag.severity}
                    </span>
                    <span className="text-base font-medium text-zinc-100">
                      {ruleLabel(flag.rule)}
                    </span>
                  </span>
                  <span className="font-mono text-sm text-zinc-500">{flag.file}</span>
                </div>

                <span className="font-mono text-base text-zinc-400">{formatRowRef(flag.rowRef)}</span>

                {/* The 1:05 line. Largest thing on the card on purpose — the presenter
                    reads it aloud and the judges verify it from three metres away. */}
                <p className="whitespace-pre-wrap break-words font-mono text-lg text-zinc-100">
                  {flag.evidence}
                </p>

                <p className="text-base italic text-zinc-400">&ldquo;{flag.plainEnglish}&rdquo;</p>

                {flag.status === 'open' && !activeAction[flag.id] && (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => onOpenReason(flag.id)}
                      className="rounded-md border border-zinc-600 px-4 py-2 text-base font-medium text-zinc-100 hover:border-zinc-400"
                    >
                      Accept as justified
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenEmail(flag.id)}
                      className="rounded-md bg-amber-500 px-4 py-2 text-base font-medium text-zinc-950 hover:bg-amber-400"
                    >
                      Send query email
                    </button>
                  </div>
                )}

                {flag.status === 'open' && activeAction[flag.id] === 'reason' && (
                  <div className="flex flex-col gap-2 rounded-md border border-zinc-700 bg-zinc-950/60 p-3">
                    <label className="text-sm text-zinc-400" htmlFor={`reason-${flag.id}`}>
                      Reason (required)
                    </label>
                    <textarea
                      id={`reason-${flag.id}`}
                      value={reasonDrafts[flag.id] ?? ''}
                      onChange={(e) => onReasonChange(flag.id, e.target.value)}
                      rows={2}
                      className="rounded-md border border-zinc-700 bg-zinc-900 p-2 text-base text-zinc-100 outline-none focus:border-amber-500"
                      placeholder="Why is this acceptable as-is?"
                    />
                    {reasonErrors[flag.id] && (
                      <span className="text-sm text-red-400">
                        A reason is required — this is the audit trail.
                      </span>
                    )}
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => onConfirmReason(flag.id)}
                        className="rounded-md bg-amber-500 px-4 py-2 text-base font-medium text-zinc-950 hover:bg-amber-400"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => onCancelAction(flag.id)}
                        className="rounded-md px-4 py-2 text-base text-zinc-400 hover:text-zinc-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {(flag.status === 'open' || flag.status === 'awaiting_response' || flag.status === 'responded') &&
                  activeAction[flag.id] === 'email' && (
                    <div className="flex flex-col gap-2 rounded-md border border-zinc-700 bg-zinc-950/60 p-3">
                      {flag.status === 'open' ? (
                        <>
                          <label className="text-sm text-zinc-400">
                            To
                            <input
                              value={emailDrafts[flag.id]?.to ?? ''}
                              onChange={(e) => onEmailFieldChange(flag.id, 'to', e.target.value)}
                              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 p-2 font-mono text-base text-zinc-100 outline-none focus:border-amber-500"
                            />
                          </label>
                          <label className="text-sm text-zinc-400">
                            Subject
                            <input
                              value={emailDrafts[flag.id]?.subject ?? ''}
                              onChange={(e) => onEmailFieldChange(flag.id, 'subject', e.target.value)}
                              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 p-2 text-base text-zinc-100 outline-none focus:border-amber-500"
                            />
                          </label>
                          <label className="text-sm text-zinc-400">
                            Body
                            <textarea
                              value={emailDrafts[flag.id]?.body ?? ''}
                              onChange={(e) => onEmailFieldChange(flag.id, 'body', e.target.value)}
                              rows={4}
                              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 p-2 text-base text-zinc-100 outline-none focus:border-amber-500"
                            />
                          </label>
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => onSendEmail(flag.id)}
                              className="rounded-md bg-amber-500 px-4 py-2 text-base font-medium text-zinc-950 hover:bg-amber-400"
                            >
                              Send
                            </button>
                            <button
                              type="button"
                              onClick={() => onCancelAction(flag.id)}
                              className="rounded-md px-4 py-2 text-base text-zinc-400 hover:text-zinc-200"
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="text-sm text-zinc-400">
                            Sent to <span className="font-mono text-zinc-300">{emailDrafts[flag.id]?.to}</span>
                          </span>
                          <span className="font-mono text-sm text-zinc-500">
                            {emailDrafts[flag.id]?.subject}
                          </span>

                          {flag.status === 'awaiting_response' && (
                            <div className="mt-1 flex items-center gap-3">
                              <span className="text-sm text-zinc-500">awaiting response…</span>
                              <button
                                type="button"
                                onClick={() => onSimulateResponse(flag.id)}
                                className="rounded-md border border-zinc-600 px-3 py-1.5 text-base font-medium text-zinc-100 hover:border-zinc-400"
                              >
                                Simulate response
                              </button>
                            </div>
                          )}

                          {flag.status === 'responded' && simulated[flag.id] && (
                            <div className="mt-1 flex flex-col gap-2">
                              <p className="font-mono text-base text-zinc-100">
                                &ldquo;{simulated[flag.id].reply}&rdquo;
                              </p>
                              <button
                                type="button"
                                onClick={() => onAcceptResponse(flag.id)}
                                className="w-fit rounded-md bg-amber-500 px-4 py-2 text-base font-medium text-zinc-950 hover:bg-amber-400"
                              >
                                {simulated[flag.id].correctedValue !== null
                                  ? `Accept correction (${simulated[flag.id].correctedValue})`
                                  : 'Accept response'}
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                {flag.status === 'justified' && (
                  <p className="text-base text-emerald-400">
                    Justified — &ldquo;{flag.note}&rdquo;
                  </p>
                )}

                {flag.status === 'corrected' && (
                  <p className="font-mono text-base text-emerald-400">
                    {flag.correctedValue
                      ? `Corrected — ${flag.submittedValue} → ${flag.correctedValue}`
                      : 'Resolved — confirmed, no data change'}
                  </p>
                )}
              </div>
            ))}
          </div>
        ))}

        {cleanSources.map((source) => (
          <div key={source} className="flex flex-col gap-3">
            <h3 className="text-base font-semibold uppercase tracking-wide text-zinc-400">
              {source}
            </h3>
            <div className="rounded-lg border border-emerald-800/50 bg-emerald-500/5 p-4 text-base text-emerald-400">
              No issues found — clean submission.
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
