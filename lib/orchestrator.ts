/**
 * The Orchestrator. version2.md §9.1.
 *
 * The only agent that is not a single-shot transformation — it runs for the life of
 * the cycle. It drafts requests from the planner's chat, runs the reminder and
 * escalation ladder, and records the patterns Y justifies so a recurring flag arrives
 * carrying last cycle's reason.
 *
 * It EMITS audit entries; the platform persists them. It owns no store.
 *
 * It never sends without review and it never crosses a gate. The day-7 non-response
 * fallback is prepared and handed to Y, because carrying stale data into a plan is a
 * business decision, not a timeout.
 */

import { loadPrevCycle, loadStakeholders } from './csv';
import {
  escalationEmail,
  interpretChat,
  reminderEmail,
  requestEmail,
  standardItems,
} from './language';
import {
  DUE_BUSINESS_DAYS,
  SLA_ESCALATION_DAYS,
  SLA_REMINDER_DAYS,
  addBusinessDays,
  fallbackCandidates,
  slaLabel,
} from './policy';
import { HORIZON, now } from './store';
import type {
  CycleRecord,
  Flag,
  LearnedJustification,
  Request,
  SentEmail,
  Stakeholder,
  Submission,
} from './types';

export { fallbackCandidates, slaLabel, SLA_ESCALATION_DAYS, SLA_REMINDER_DAYS };

const dueDateFrom = (start: Date) => addBusinessDays(start, DUE_BUSINESS_DAYS).toISOString().slice(0, 10);

// -------------------------------------------------------------- cycle creation

export function createCycleRecord(id: string): CycleRecord {
  return {
    id,
    status: 'not_started',
    horizon: HORIZON,
    createdAt: now(),
    requests: [],
    submissions: [],
    flags: [],
    thresholdOverrides: [],
    masterFile: null,
    drafts: [],
    reviews: [],
    comments: [],
    revisions: [],
    excludedDecisions: [],
    learned: [],
    emails: [],
    chat: [],
    finalisedAt: null,
    audit: [],
  };
}

/**
 * Rule 1 and 2: draft requests, comparing against the previous cycle's log so anything
 * routinely asked for that Y has not mentioned is surfaced rather than dropped. An
 * omission is more likely a slip than a decision.
 */
export function draftRequests(
  cycle: CycleRecord,
  adHoc: Record<string, string[]> = {}
): Request[] {
  const stakeholders = loadStakeholders();
  const template = loadPrevCycle().requestTemplate;
  const due = dueDateFrom(new Date());

  const requesting = stakeholders.filter((s) => s.submits.length > 0);

  return requesting.map((s) => {
    const fromTemplate = template.find((t) => t.recipient === s.name);
    const standard = fromTemplate?.items ?? standardItems(s, cycle.horizon);
    const extra = adHoc[s.name] ?? [];
    const items = [...standard, ...extra];

    return {
      id: `req-${s.id}`,
      recipient: s.name,
      email: s.email,
      items,
      dueDate: due,
      emailDraft: requestEmail(s, items, due),
      origin: extra.length ? 'new' : 'standard',
      reviewed: extra.length === 0,
      status: 'draft',
      sentAt: null,
      remindedAt: null,
      escalatedAt: null,
    };
  });
}

/** Y's chat turn. Returns the orchestrator's reply plus any ad-hoc items it extracted. */
export function handleChat(cycle: CycleRecord, text: string) {
  const outcome = interpretChat(text, loadStakeholders());

  // Rule 2: refuse to draft an ambiguous request. Ask, do not guess.
  if (outcome.question) {
    return {
      reply: outcome.question,
      requests: null as Request[] | null,
      asked: true,
      polishHint: null,
      clearAdHoc: [] as string[],
      emailTargets: [] as string[],
    };
  }

  const existingAdHoc: Record<string, string[]> = {};
  for (const r of cycle.requests) {
    const s = loadStakeholders().find((x) => x.name === r.recipient);
    const standard = loadPrevCycle().requestTemplate.find((t) => t.recipient === r.recipient)?.items
      ?? standardItems(s!, cycle.horizon);
    const extra = r.items.filter((i) => !standard.includes(i));
    if (extra.length) existingAdHoc[r.recipient] = extra;
  }

  const merged: Record<string, string[]> = { ...existingAdHoc };
  if (outcome.clearAdHoc) {
    for (const recipient of outcome.clearAdHoc) delete merged[recipient];
  }
  for (const [recipient, items] of Object.entries(outcome.adHoc)) {
    merged[recipient] = [...new Set([...(merged[recipient] ?? []), ...items])];
  }

  return {
    reply: outcome.reply,
    requests: draftRequests(cycle, merged),
    asked: false,
    polishHint: outcome.polishHint ?? null,
    clearAdHoc: outcome.clearAdHoc ?? [],
    emailTargets: outcome.emailTargets ?? [],
  };
}

export function submissionsForRequests(requests: Request[]): Submission[] {
  const stakeholders = loadStakeholders();
  return requests.map((r) => {
    const s = stakeholders.find((x) => x.name === r.recipient)!;
    return {
      id: `sub-${s.id}`,
      source: s.name,
      kind: s.submits[0],
      status: 'requested',
      requestedAt: null,
      daysWaiting: 0,
      versions: [],
      crossSourcePending: false,
      assumed: false,
      includedInMasterAt: null,
    };
  });
}

// ----------------------------------------------------------------- the ladder

export interface LadderResult {
  emails: SentEmail[];
  notes: string[];
}

/**
 * Rule 3. Advances the clock by one business day and fires whatever the SLA demands.
 * Reminders and escalations send automatically; the day-7 fallback is only PREPARED —
 * it appears on Cycle Home as a decision for Y.
 */
export function advanceClock(cycle: CycleRecord, days = 1): LadderResult {
  const stakeholders = loadStakeholders();
  const emails: SentEmail[] = [];
  const notes: string[] = [];

  for (const submission of cycle.submissions) {
    if (submission.versions.length > 0 || submission.assumed) continue;
    const request = cycle.requests.find((r) => r.recipient === submission.source);
    if (!request || request.status !== 'sent') continue;

    submission.daysWaiting += days;
    const s = stakeholders.find((x) => x.name === submission.source);

    if (submission.daysWaiting >= SLA_ESCALATION_DAYS && !request.escalatedAt) {
      request.escalatedAt = now();
      submission.status = 'escalated';
      const draft = escalationEmail(request, s!, submission.daysWaiting);
      emails.push(sent(draft, 'escalation', submission.source));
      notes.push(`${submission.source} escalated to ${s?.escalationContact ?? 'management'}`);
    } else if (submission.daysWaiting >= SLA_REMINDER_DAYS && !request.remindedAt) {
      request.remindedAt = now();
      submission.status = 'reminded';
      const draft = reminderEmail(request, submission.daysWaiting);
      emails.push(sent(draft, 'reminder', submission.source));
      notes.push(`Reminder sent to ${submission.source}`);
    }
  }

  // Flags waiting on a stakeholder reply run the same ladder.
  for (const flag of cycle.flags) {
    if (flag.status !== 'awaiting_response') continue;
    flag.daysWaiting += days;
    if (flag.daysWaiting >= SLA_ESCALATION_DAYS) {
      flag.history.push({
        at: now(),
        actor: 'Orchestrator',
        from: 'awaiting_response',
        to: 'escalated',
        note: `no reply in ${flag.daysWaiting} business days`,
      });
      flag.status = 'escalated';
      notes.push(`Query to ${flag.source} escalated after ${flag.daysWaiting} days`);
    }
  }

  // Stakeholders sitting on an issued draft run it too.
  for (const review of cycle.reviews) {
    if (review.status !== 'notified' && review.status !== 'viewed') continue;
    review.daysWaiting += days;
    if (review.daysWaiting >= SLA_ESCALATION_DAYS) {
      review.status = 'escalated';
      notes.push(`${review.stakeholder} escalated — no response to the draft in ${review.daysWaiting} days`);
    }
  }

  return { emails, notes };
}

function sent(draft: { to: string; subject: string; body: string }, kind: SentEmail['kind'], relatedTo: string): SentEmail {
  return {
    id: `mail-${kind}-${relatedTo}-${Date.now().toString(36)}`,
    ...draft,
    sentAt: now(),
    kind,
    relatedTo,
  };
}

// ------------------------------------------------------------------- learning

/**
 * Rule 5. A recurring pattern still raises the flag — it just arrives carrying the
 * earlier reason. Suppressing it would hide a real change behind an old excuse.
 */
export function recordJustification(cycle: CycleRecord, flag: Flag, reason: string): void {
  const key = `${flag.rule}|${flag.rowRef.replace(/,month=[^,]*/, '')}`;
  const existing = cycle.learned.find((l) => l.key === key);
  if (existing) {
    existing.reason = reason;
    existing.timesApplied += 1;
    return;
  }
  cycle.learned.push({ key, rule: flag.rule, reason, cycleId: cycle.id, timesApplied: 1 });
}

export function priorJustification(
  cycle: CycleRecord,
  flag: Flag
): LearnedJustification | undefined {
  const key = `${flag.rule}|${flag.rowRef.replace(/,month=[^,]*/, '')}`;
  return cycle.learned.find((l) => l.key === key);
}

export function stakeholderByName(name: string): Stakeholder | undefined {
  return loadStakeholders().find((s) => s.name === name);
}
