'use client';

import { useEffect, useRef, useState } from 'react';

import type { SubmissionMeta } from '@/lib/csv';
import type { EmailDraft, Flag, GenerateResponse, Rule, ValidateResponse } from '@/lib/types';

import FlagsPane from './components/FlagsPane';
import PlanPane from './components/PlanPane';
import SubmissionsPane, { type ValidationPhase } from './components/SubmissionsPane';
import { CORRECTIONS, buildEmailDraft, type SimulatedReply } from './demo-data';

interface ValidateApiResult extends ValidateResponse {
  meta: {
    mock: boolean;
    elapsedMs: number;
    submissions: SubmissionMeta[];
  };
}

type ActionPanel = 'email' | 'reason' | null;

/** Purely for pacing the spinner — the real work already happened in the background fetch. */
const MIN_SPINNER_MS = 1100;

async function fetchValidate(): Promise<ValidateApiResult> {
  const res = await fetch('/api/validate', { method: 'POST' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.hint ? `${data.error} — ${data.hint}` : data.error ?? 'Validation failed');
  }
  return data as ValidateApiResult;
}

export default function Home() {
  // ---- all app state lives here; the three panes below are pure props-in components ----
  const [submissions, setSubmissions] = useState<SubmissionMeta[] | null>(null);
  const [phase, setPhase] = useState<ValidationPhase>('idle');
  const [flags, setFlags] = useState<Flag[]>([]);
  const [cleanSources, setCleanSources] = useState<string[]>([]);
  const [summary, setSummary] = useState('');
  const [serverEmails, setServerEmails] = useState<Record<string, EmailDraft>>({});
  const [error, setError] = useState<string | null>(null);

  const [activeAction, setActiveAction] = useState<Record<string, ActionPanel>>({});
  const [emailDrafts, setEmailDrafts] = useState<Record<string, EmailDraft>>({});
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  const [reasonErrors, setReasonErrors] = useState<Record<string, boolean>>({});
  const [simulated, setSimulated] = useState<Record<string, SimulatedReply>>({});

  const [plan, setPlan] = useState<GenerateResponse | null>(null);
  const [refused, setRefused] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Fired once North's response is ready; Run Validation reveals it (plus a short
  // fake delay for pacing) rather than triggering a second, slower call on click.
  const pendingValidateRef = useRef<Promise<ValidateApiResult> | null>(null);

  useEffect(() => {
    const promise = fetchValidate();
    pendingValidateRef.current = promise;
    promise.then((data) => setSubmissions(data.meta.submissions)).catch((err: Error) => setError(err.message));
  }, []);

  const openCount = flags.filter(
    (f) => f.status === 'open' || f.status === 'awaiting_response' || f.status === 'responded'
  ).length;
  const gateOpen = flags.length > 0 && openCount === 0;
  const flagCountBySource = flags.reduce<Record<string, number>>((acc, f) => {
    acc[f.source] = (acc[f.source] ?? 0) + 1;
    return acc;
  }, {});

  async function handleRunValidation() {
    if (phase !== 'idle' || !pendingValidateRef.current) return;
    setPhase('validating');
    setError(null);
    try {
      const [data] = await Promise.all([
        pendingValidateRef.current,
        new Promise((resolve) => setTimeout(resolve, MIN_SPINNER_MS)),
      ]);
      setFlags(data.flags.map((f) => ({ ...f, status: 'open' as const })));
      setCleanSources(data.cleanSources);
      setSummary(data.summary);
      setServerEmails(data.emails ?? {});
      setSubmissions(data.meta.submissions);
      setPhase('triage');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
      setPhase('idle');
    }
  }

  function onOpenEmail(flagId: string) {
    setActiveAction((prev) => ({ ...prev, [flagId]: 'email' }));
    setEmailDrafts((prev) => {
      if (prev[flagId]) return prev;
      const flag = flags.find((f) => f.id === flagId);
      if (!flag) return prev;
      return { ...prev, [flagId]: serverEmails[flagId] ?? buildEmailDraft(flag) };
    });
  }

  function onOpenReason(flagId: string) {
    setActiveAction((prev) => ({ ...prev, [flagId]: 'reason' }));
  }

  function onCancelAction(flagId: string) {
    setActiveAction((prev) => ({ ...prev, [flagId]: null }));
    setReasonErrors((prev) => ({ ...prev, [flagId]: false }));
  }

  function onEmailFieldChange(flagId: string, field: keyof EmailDraft, value: string) {
    setEmailDrafts((prev) => ({
      ...prev,
      [flagId]: { ...(prev[flagId] ?? { to: '', subject: '', body: '' }), [field]: value },
    }));
  }

  function onSendEmail(flagId: string) {
    setFlags((prev) => prev.map((f) => (f.id === flagId ? { ...f, status: 'awaiting_response' } : f)));
  }

  function onSimulateResponse(flagId: string) {
    const flag = flags.find((f) => f.id === flagId);
    if (!flag) return;
    const reply = CORRECTIONS[flag.rule];
    setSimulated((prev) => ({ ...prev, [flagId]: reply }));
    setFlags((prev) => prev.map((f) => (f.id === flagId ? { ...f, status: 'responded' } : f)));
  }

  function onAcceptResponse(flagId: string) {
    const reply = simulated[flagId];
    setFlags((prev) =>
      prev.map((f) =>
        f.id === flagId
          ? {
              ...f,
              status: 'corrected',
              correctedValue: reply?.correctedValue != null ? String(reply.correctedValue) : undefined,
              note: reply?.reply,
            }
          : f
      )
    );
  }

  function onReasonChange(flagId: string, value: string) {
    setReasonDrafts((prev) => ({ ...prev, [flagId]: value }));
    if (value.trim()) setReasonErrors((prev) => ({ ...prev, [flagId]: false }));
  }

  function onConfirmReason(flagId: string) {
    const text = (reasonDrafts[flagId] ?? '').trim();
    if (!text) {
      setReasonErrors((prev) => ({ ...prev, [flagId]: true }));
      return;
    }
    setFlags((prev) => prev.map((f) => (f.id === flagId ? { ...f, status: 'justified', note: text } : f)));
    setActiveAction((prev) => ({ ...prev, [flagId]: null }));
  }

  async function handleGenerateClick() {
    if (!gateOpen) {
      setRefused(true);
      window.setTimeout(() => setRefused(false), 500);
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const corrections: Partial<Record<Rule, number>> = {};
      for (const f of flags) {
        if (f.status === 'corrected' && f.correctedValue) {
          const n = Number(f.correctedValue);
          if (Number.isFinite(n)) corrections[f.rule] = n;
        }
      }
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corrections }),
      });
      const data = (await res.json()) as GenerateResponse;
      if (!res.ok) throw new Error('Plan generation failed');
      setPlan(data);
      setPhase('planned');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Plan generation failed');
    } finally {
      setGenerating(false);
    }
  }

  const revealed = phase === 'triage' || phase === 'planned';

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10 text-base">
      <header>
        <h1 className="text-2xl font-bold text-zinc-100">SROP Validation &amp; Planning</h1>
        {summary && <p className="mt-1 text-base text-zinc-400">{summary}</p>}
      </header>

      <SubmissionsPane
        submissions={submissions}
        phase={phase}
        flagCountBySource={flagCountBySource}
        cleanSources={cleanSources}
        error={error}
        onRunValidation={handleRunValidation}
      />

      {revealed && (
        <FlagsPane
          flags={flags}
          cleanSources={cleanSources}
          openCount={openCount}
          activeAction={activeAction}
          emailDrafts={emailDrafts}
          reasonDrafts={reasonDrafts}
          reasonErrors={reasonErrors}
          simulated={simulated}
          onOpenEmail={onOpenEmail}
          onOpenReason={onOpenReason}
          onCancelAction={onCancelAction}
          onEmailFieldChange={onEmailFieldChange}
          onSendEmail={onSendEmail}
          onSimulateResponse={onSimulateResponse}
          onAcceptResponse={onAcceptResponse}
          onReasonChange={onReasonChange}
          onConfirmReason={onConfirmReason}
        />
      )}

      {revealed && (
        <PlanPane
          gateOpen={gateOpen}
          openCount={openCount}
          totalFlags={flags.length}
          refused={refused}
          generating={generating}
          plan={plan}
          onGenerateClick={handleGenerateClick}
        />
      )}
    </div>
  );
}
