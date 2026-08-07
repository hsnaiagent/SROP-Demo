/**
 * The four gates. version2.md §2.
 *
 * Gates are the whole point of the platform: each one is a place where the process
 * used to depend on Y remembering something. Nothing crosses a gate automatically —
 * agents prepare work and surface decisions, Y crosses gates.
 */

import type { CycleRecord, Draft, Flag, Submission } from './types';
import { OPEN_FLAG_STATUSES } from './types';

export const isOpen = (flag: Flag) => OPEN_FLAG_STATUSES.includes(flag.status);

export const openFlags = (cycle: CycleRecord) => cycle.flags.filter(isOpen);

export const submissionSettled = (s: Submission) =>
  s.status === 'clean' || s.status === 'assumed' || (s.versions.length > 0 && s.status === 'resolving');

export interface GateState {
  open: boolean;
  reason: string | null;
}

/**
 * Gate 1 — validation. No flag may be open, awaiting a reply, replied-but-unaccepted,
 * or escalated, and every requested submission must have landed or been assumed.
 */
export function gate1(cycle: CycleRecord): GateState {
  const open = openFlags(cycle);
  if (open.length > 0) {
    return { open: false, reason: `${open.length} of ${cycle.flags.length} flags still open` };
  }

  const missing = cycle.submissions.filter((s) => s.versions.length === 0 && !s.assumed);
  if (missing.length > 0) {
    return {
      open: false,
      reason: `waiting on ${missing.map((s) => s.source).join(', ')}`,
    };
  }

  const unvalidated = cycle.submissions.filter(
    (s) => s.versions.length > 0 && s.status !== 'clean' && s.status !== 'flagged' && s.status !== 'assumed'
  );
  if (unvalidated.length > 0) {
    return { open: false, reason: `${unvalidated.length} submissions not yet validated` };
  }

  const pendingExclusions = cycle.excludedDecisions.filter((d) => d.decision === 'pending');
  if (pendingExclusions.length > 0) {
    return { open: false, reason: `${pendingExclusions.length} excluded series awaiting your decision` };
  }

  if (cycle.submissions.length === 0) {
    return { open: false, reason: 'no submissions requested yet' };
  }

  return { open: true, reason: null };
}

/** Gate 2 — run authority. Y must approve a FRESH workbook. Staleness closes it. */
export function gate2(cycle: CycleRecord): GateState {
  if (!cycle.masterFile) return { open: false, reason: 'master file not built' };
  if (cycle.masterFile.stale) {
    return { open: false, reason: cycle.masterFile.staleReason ?? 'master file is stale' };
  }
  if (!cycle.masterFile.approvedByPlanner) {
    return { open: false, reason: 'master file not approved for the run' };
  }
  return { open: true, reason: null };
}

/** Gate 3 — issue. Y must approve sending the draft to stakeholders. */
export function gate3(cycle: CycleRecord): GateState {
  const draft = currentDraft(cycle);
  if (!draft) return { open: false, reason: 'no draft generated' };
  if (draft.status === 'issued') return { open: false, reason: 'already issued' };
  return { open: true, reason: null };
}

/**
 * Gate 4 — finalization. Every stakeholder approved, deemed approved, or had their
 * comment resolved and re-confirmed. Silence is not approval.
 */
export function gate4(cycle: CycleRecord): GateState {
  const draft = currentDraft(cycle);
  if (!draft || draft.status !== 'issued') {
    return { open: false, reason: 'no draft is out for review' };
  }

  const settled: Array<string> = ['approved', 'confirmed', 'deemed_approved'];
  const outstanding = cycle.reviews.filter(
    (r) => r.draftId === draft.id && !settled.includes(r.status)
  );
  if (outstanding.length > 0) {
    return {
      open: false,
      reason: `${outstanding.length} of ${cycle.reviews.filter((r) => r.draftId === draft.id).length} stakeholders outstanding`,
    };
  }

  const openComments = cycle.comments.filter((c) => c.status === 'open');
  if (openComments.length > 0) {
    return { open: false, reason: `${openComments.length} comments unresolved` };
  }

  const pendingRevisions = cycle.revisions.filter((r) => r.status === 'pending');
  if (pendingRevisions.length > 0) {
    return { open: false, reason: `${pendingRevisions.length} revisions still in your queue` };
  }

  if (needsRerun(cycle)) {
    return { open: false, reason: 'accepted revisions require a rerun before publishing' };
  }

  return { open: true, reason: null };
}

export function currentDraft(cycle: CycleRecord): Draft | null {
  const live = cycle.drafts.filter((d) => d.status !== 'superseded');
  return live.at(-1) ?? null;
}

/**
 * An accepted revision or comment changes underlying data, so the plan on screen is
 * no longer the plan the data implies. Y must rerun before publishing — a stakeholder
 * edit never triggers a rerun on its own.
 */
export function needsRerun(cycle: CycleRecord): boolean {
  const draft = currentDraft(cycle);
  if (!draft) return false;
  const accepted = [
    ...cycle.revisions.filter((r) => r.status === 'accepted' && r.resolvedAt),
    ...cycle.comments.filter((c) => c.status === 'accepted' && c.resolvedAt),
  ];
  return accepted.some((item) => (item.resolvedAt ?? '') > draft.generatedAt);
}

/** Derived cycle status. The one place the phase tracker gets its truth. */
export function deriveStatus(cycle: CycleRecord): CycleRecord['status'] {
  if (cycle.finalisedAt) return 'archived';

  const draft = currentDraft(cycle);
  if (draft?.status === 'finalized') return 'final_approved';
  if (draft?.status === 'issued') return needsRerun(cycle) ? 'revision' : 'draft_issued';
  if (draft) return 'plan_ready';
  if (cycle.masterFile) return 'consolidating';
  if (cycle.flags.length > 0) return 'triage';
  if (cycle.submissions.some((s) => s.status === 'validating')) return 'validating';
  if (cycle.submissions.some((s) => s.versions.length > 0)) return 'collecting';
  if (cycle.requests.some((r) => r.status === 'sent')) return 'requests_sent';
  if (cycle.requests.length > 0) return 'requests_drafted';
  return 'not_started';
}

/** Which of the seven phases the cycle is in, for the tracker. */
export const PHASES = [
  'Initiate',
  'Collect',
  'Validate',
  'Consolidate',
  'Run plan',
  'Draft review',
  'Finalise',
] as const;

export function phaseIndex(cycle: CycleRecord): number {
  switch (deriveStatus(cycle)) {
    case 'not_started':
    case 'requests_drafted':
      return 0;
    case 'requests_sent':
    case 'collecting':
      return 1;
    case 'validating':
    case 'triage':
      return 2;
    case 'consolidating':
      return 3;
    case 'plan_ready':
      return 4;
    case 'draft_issued':
    case 'revision':
      return 5;
    case 'final_approved':
    case 'archived':
      return 6;
    default:
      return 0;
  }
}
