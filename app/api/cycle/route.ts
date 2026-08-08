/**
 * The one mutating surface. version2.md §3.
 *
 * Every state change in the platform goes through the action dispatcher below, which
 * means audit, persistence and gate enforcement all live in exactly one place. GET
 * returns the whole cycle record plus the reference data the screens need.
 *
 * Each action returns the full updated record, so the client never has to reconcile
 * a partial response against local state.
 */

import { NextResponse } from 'next/server';

import {
  loadPlanInput,
  loadReference,
  loadStakeholders,
  readJson,
  submissionFilesFor,
} from '@/lib/csv';
import { recogniseUpload } from '@/lib/filerec';
import { currentDraft, deriveStatus, gate1, gate2, gate4, openFlags } from '@/lib/gates';
import { correctionImpact, impactSentence } from '@/lib/impact';
import { buildMasterFile, markStale, resolvedPlanInput } from '@/lib/intake';
import {
  bulkQueryEmail,
  declineEmail,
  draftEmail,
  finalEmail,
  flagQueryEmail,
  interpretEdit,
  interpretStakeholderChat,
} from '@/lib/language';
import {
  advanceClock,
  createCycleRecord,
  draftRequests,
  handleChat,
  recordJustification,
  stakeholderByName,
  submissionsForRequests,
} from '@/lib/orchestrator';
import { bandBreachRows, buildPlan, shortfallRows, totalRevenue, totalVolume } from '@/lib/plan';
import { summarise, validateSource } from '@/lib/rules';
import { ACTIVE_CYCLE_ID, audit, deleteCycle, mutate, now, readCycle, saveCycle } from '@/lib/store';
import type {
  Comment,
  CycleRecord,
  Draft,
  EmailDraft,
  Flag,
  FlagStatus,
  PlanRow,
  Revision,
  StakeholderReview,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

const PLANNER = 'Y - SROP Planner';

interface ScriptedReply {
  from: string;
  reply: string;
  correctedValue: number | null;
  movesThePlan: boolean;
}

const scriptedReplies = () => readJson<Record<string, ScriptedReply>>('corrections.json');

interface ScriptedRevision {
  id: string;
  stakeholder: string;
  channel: string;
  rowRef?: string;
  text?: string;
  proposedValue?: number;
  fileName?: string;
  changes?: Array<{ field: string; rowRef: string; before: number; after: number }>;
}

const scriptedRevisions = () => readJson<ScriptedRevision[]>('revisions.json');

// --------------------------------------------------------------------- reading

export async function GET() {
  const cycle = await readCycle();
  return NextResponse.json({ cycle, reference: loadReference() });
}

// --------------------------------------------------------------------- writing

export async function POST(request: Request) {
  let body: { action?: string; actor?: string; payload?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'malformed request body' }, { status: 400 });
  }

  const action = body.action ?? '';
  const actor = body.actor ?? PLANNER;
  const p = body.payload ?? {};

  try {
    // Actions that do not need an existing cycle.
    if (action === 'create_cycle') {
      const fresh = createCycleRecord(ACTIVE_CYCLE_ID);
      audit(fresh, actor, 'cycle created', ACTIVE_CYCLE_ID, `horizon ${fresh.horizon.join(' → ')}`);
      await saveCycle(fresh);
      return ok(fresh);
    }
    if (action === 'reset') {
      await deleteCycle(ACTIVE_CYCLE_ID);
      return NextResponse.json({ cycle: null, reference: loadReference() });
    }

    // Read-only preview: tells the planner what a correction is worth before he commits.
    if (action === 'impact_preview') {
      const impact = correctionImpact(
        String(p.field),
        String(p.rowRef),
        Number(p.value)
      );
      return NextResponse.json({
        impact,
        sentence: impactSentence(impact, String(p.value)),
      });
    }

    const result: { message?: string; extra?: unknown } = {};
    const cycle = await mutate(ACTIVE_CYCLE_ID, (c) => {
      apply(c, action, actor, p, result);
      c.status = deriveStatus(c);
    });

    return NextResponse.json({ cycle, reference: loadReference(), ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'action failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function ok(cycle: CycleRecord) {
  return NextResponse.json({ cycle, reference: loadReference() });
}

// ------------------------------------------------------------------ dispatcher

function apply(
  c: CycleRecord,
  action: string,
  actor: string,
  p: Record<string, unknown>,
  result: { message?: string; extra?: unknown }
): void {
  switch (action) {
    // ------------------------------------------------------------ phase 1
    case 'chat': {
      const text = String(p.text ?? '');
      const prior = new Map(
        c.requests.map((r) => [r.id, { items: r.items.join('|'), body: r.emailDraft.body }])
      );
      c.chat.push({ id: `msg-${c.chat.length}`, role: 'planner', text, at: now() });
      const outcome = handleChat(c, text);
      c.chat.push({ id: `msg-${c.chat.length}`, role: 'orchestrator', text: outcome.reply, at: now() });
      if (outcome.requests) {
        const clearSet = new Set(outcome.clearAdHoc ?? []);
        const targetSet = new Set(outcome.emailTargets ?? []);
        c.requests = outcome.requests.map((req) => {
          const old = prior.get(req.id);
          if (
            old &&
            old.items === req.items.join('|') &&
            !clearSet.has(req.recipient) &&
            !targetSet.has(req.recipient) &&
            old.body.trim()
          ) {
            return { ...req, emailDraft: { ...req.emailDraft, body: old.body } };
          }
          return req;
        });
        c.submissions = mergeSubmissions(c, submissionsForRequests(c.requests));
      }
      audit(c, actor, outcome.asked ? 'orchestrator asked for clarification' : 'requests drafted from chat', 'requests', text);
      result.extra = {
        asked: outcome.asked,
        polishHint: outcome.polishHint,
        clearAdHoc: outcome.clearAdHoc,
        emailTargets: outcome.emailTargets,
      };
      return;
    }

    case 'load_template': {
      c.requests = draftRequests(c);
      c.submissions = mergeSubmissions(c, submissionsForRequests(c.requests));
      c.chat.push({
        id: `msg-${c.chat.length}`,
        role: 'orchestrator',
        text:
          `Loaded last cycle's request log — ${c.requests.length} recipients, already reviewed. ` +
          `Add anything ad-hoc in the box below, or send as-is.`,
        at: now(),
      });
      audit(c, actor, 'loaded previous cycle request template', 'requests', `${c.requests.length} requests`);
      return;
    }

    case 'update_request': {
      const req = c.requests.find((r) => r.id === p.id);
      if (!req) throw new Error('request not found');
      if (Array.isArray(p.items)) req.items = p.items.map(String);
      if (typeof p.dueDate === 'string') req.dueDate = p.dueDate;
      if (typeof p.reviewed === 'boolean') req.reviewed = p.reviewed;
      if (p.emailDraft) req.emailDraft = p.emailDraft as EmailDraft;
      return;
    }

    case 'update_request_bodies': {
      const updates = p.updates;
      if (!Array.isArray(updates)) throw new Error('updates must be an array');
      for (const raw of updates) {
        const u = raw as { id?: unknown; body?: unknown };
        const id = String(u.id ?? '');
        const body = String(u.body ?? '');
        if (!id || !body) continue;
        const req = c.requests.find((r) => r.id === id);
        if (!req) continue;
        req.emailDraft = { ...req.emailDraft, body };
      }
      return;
    }

    case 'send_requests': {
      const unreviewed = c.requests.filter((r) => !r.reviewed);
      if (unreviewed.length > 0) {
        throw new Error(`${unreviewed.length} request${unreviewed.length === 1 ? '' : 's'} not yet reviewed`);
      }
      for (const req of c.requests) {
        if (req.status === 'sent') continue;
        req.status = 'sent';
        req.sentAt = now();
        c.emails.push({
          id: `mail-request-${req.id}`,
          ...req.emailDraft,
          sentAt: now(),
          kind: 'request',
          relatedTo: req.recipient,
        });
        const sub = c.submissions.find((s) => s.source === req.recipient);
        if (sub) {
          sub.requestedAt = now();
          sub.status = 'requested';
        }
      }
      audit(c, actor, 'requests sent', 'all recipients', `${c.requests.length} emails`);
      return;
    }

    // ------------------------------------------------------------ phase 2
    case 'submit': {
      const source = String(p.source);
      const names = receiveSubmission(c, actor, source, String(p.note ?? ''));
      result.message = `Received ${names.join(', ')}. Data Checker runs next.`;
      return;
    }

    case 'receive_and_validate': {
      const source = String(p.source);
      const sub = c.submissions.find((s) => s.source === source);
      if (!sub) throw new Error(`${source} was not asked for anything this cycle`);
      if (sub.versions.length > 0) throw new Error(`${source} already received — use Check data`);

      const names = receiveSubmission(c, actor, source, 'demo fixture');
      runValidationSources(c, [source], result);
      result.message = `Received ${names.join(', ')} · ${result.message}`;
      return;
    }

    case 'receive_and_validate_all': {
      const pending = c.submissions.filter(
        (s) =>
          s.versions.length === 0 &&
          c.requests.find((r) => r.recipient === s.source)?.status === 'sent'
      );
      if (pending.length === 0) throw new Error('no sources are waiting to be received');

      const sources = pending.map((s) => s.source);
      const received: string[] = [];
      for (const source of sources) {
        received.push(...receiveSubmission(c, actor, source, 'demo fixture'));
      }
      runValidationSources(c, sources, result);
      result.message = `Received ${sources.length} sources (${received.length} files) · ${result.message}`;
      return;
    }

    case 'validate': {
      const targets = p.source
        ? [String(p.source)]
        : c.submissions.filter((s) => s.versions.length > 0).map((s) => s.source);
      runValidationSources(c, targets, result);
      return;
    }

    case 'advance_clock': {
      const { emails, notes } = advanceClock(c, Number(p.days ?? 1));
      c.emails.push(...emails);
      for (const note of notes) audit(c, 'Orchestrator', 'SLA', 'cycle', note);
      result.message = notes.length ? notes.join(' · ') : 'One business day passed. Nothing is overdue.';
      return;
    }

    case 'confirm_fallback': {
      const source = String(p.source);
      const sub = c.submissions.find((s) => s.source === source);
      if (!sub) throw new Error('submission not found');
      sub.assumed = true;
      sub.status = 'assumed';
      sub.versions.push({
        n: sub.versions.length + 1,
        receivedAt: now(),
        note: 'carried forward from cycle 2026-08 after non-response',
        files: submissionFilesFor(source, sub.kind),
      });
      if (c.masterFile) markStale(c, `${source} data carried forward after the last build`);
      audit(c, actor, 'confirmed non-response fallback', source, 'last cycle data carried forward, marked assumed');
      result.message = `${source} data carried forward and marked assumed. It will be visible as assumed on the draft.`;
      return;
    }

    case 'decline_fallback': {
      audit(c, actor, 'declined non-response fallback', String(p.source), 'cycle held');
      result.message = `Cycle held on ${p.source}. Nothing else changes until they respond.`;
      return;
    }

    // ------------------------------------------------------------ phase 3
    case 'flag_justify': {
      const flag = requireFlag(c, p.id);
      const note = String(p.note ?? '').trim();
      if (!note) throw new Error('a reason is required — this is the audit trail');
      transition(flag, 'justified', actor, note);
      flag.note = note;
      recordJustification(c, flag, note);
      if (c.masterFile) markStale(c, 'a flag was resolved after the last build');
      audit(c, actor, 'justified flag', flag.rowRef, note);
      return;
    }

    case 'flag_justify_all': {
      const note = String(p.note ?? '').trim();
      if (!note) throw new Error('a reason is required — this is the audit trail');
      const targets = c.flags.filter((f) => f.status === 'open');
      if (targets.length === 0) throw new Error('no open flags to justify');
      for (const flag of targets) {
        transition(flag, 'justified', actor, note);
        flag.note = note;
        recordJustification(c, flag, note);
        audit(c, actor, 'justified flag', flag.rowRef, note);
      }
      if (c.masterFile) markStale(c, 'flags were resolved after the last build');
      result.message = `Justified ${targets.length} flags.`;
      return;
    }

    case 'flag_query': {
      const ids = Array.isArray(p.ids) ? p.ids.map(String) : [String(p.id)];
      const flags = ids.map((id) => requireFlag(c, id));
      const draft = (p.emailDraft as EmailDraft | undefined)
        ?? (flags.length > 1
          ? bulkQueryEmail(flags, stakeholderByName(flags[0].source))
          : flagQueryEmail(flags[0], stakeholderByName(flags[0].source)));

      c.emails.push({
        id: `mail-query-${flags[0].id}-${c.emails.length}`,
        ...draft,
        sentAt: now(),
        kind: 'flag_query',
        relatedTo: flags.map((f) => f.id).join(','),
      });
      for (const flag of flags) {
        transition(flag, 'awaiting_response', actor, `query sent to ${draft.to}`);
        flag.daysWaiting = 0;
      }
      audit(c, actor, 'sent flag query', flags.map((f) => f.rowRef).join(' · '), draft.subject);
      return;
    }

    case 'flag_reply': {
      // The stakeholder replies. In production this is a resubmission or an email.
      const flag = requireFlag(c, p.id);
      const reply = scriptedReplyFor(flag);
      flag.response = reply.reply;
      // The materiality of the proposed correction is computed now and carried on the
      // flag, so the confirmation step can state it without a second round trip.
      if (reply.correctedValue !== null) {
        flag.impact = correctionImpact(flag.field, flag.rowRef, reply.correctedValue);
      }
      transition(flag, 'responded', reply.from, 'replied');
      audit(c, reply.from, 'replied to query', flag.rowRef, reply.reply);
      return;
    }

    case 'flag_accept': {
      const flag = requireFlag(c, p.id);
      const reply = scriptedReplyFor(flag);
      if (reply.correctedValue !== null) {
        flag.correctedValue = String(reply.correctedValue);
        flag.impact = correctionImpact(flag.field, flag.rowRef, reply.correctedValue);
      }
      flag.note = flag.response ?? reply.reply;
      transition(flag, 'corrected', actor, flag.correctedValue ? `accepted ${flag.correctedValue}` : 'confirmed, no data change');
      if (c.masterFile) markStale(c, 'a correction was accepted after the last build');
      audit(c, actor, 'accepted response', flag.rowRef, flag.correctedValue ? `→ ${flag.correctedValue}` : 'no change');
      return;
    }

    case 'flag_edit': {
      const flag = requireFlag(c, p.id);
      const value = Number(p.value);
      const note = String(p.note ?? '').trim();
      if (!Number.isFinite(value)) throw new Error('could not resolve that to a number');
      if (!note) throw new Error('a reason is required for a direct edit');
      flag.correctedValue = String(value);
      flag.impact = correctionImpact(flag.field, flag.rowRef, value);
      flag.note = note;
      transition(flag, 'corrected', actor, `edited directly to ${value} — ${note}`);
      if (c.masterFile) markStale(c, 'a value was edited after the last build');
      audit(c, actor, 'edited value directly', flag.rowRef, `${flag.submittedValue} → ${value} · ${note}`);
      return;
    }

    case 'interpret_edit': {
      const flag = requireFlag(c, p.id);
      const key = seriesKeyFromRowRef(flag.rowRef);
      const reference = loadReference();
      const outcome = interpretEdit(String(p.text ?? ''), {
        current: Number(flag.submittedValue.replace(/[^\d.-]/g, '')) || 0,
        baselineMean: reference.baseline[key] ?? null,
        lastMonth: null,
        lastCycle: reference.lastCycle[`${key}|${monthFromRowRef(flag.rowRef)}`] ?? null,
      });
      result.extra = outcome;
      return;
    }

    case 'override_threshold': {
      const scope = String(p.scope) as 'series' | 'product' | 'plant';
      const key = String(p.key);
      const deviation = Number(p.deviation);
      const reason = String(p.reason ?? '').trim();
      if (!reason) throw new Error('an override needs a reason — it becomes standing policy');
      if (!Number.isFinite(deviation) || deviation <= 0) throw new Error('threshold must be a positive percentage');

      c.thresholdOverrides = [
        ...c.thresholdOverrides.filter((o) => !(o.scope === scope && o.key === key)),
        { id: `ovr-${scope}-${key}`, scope, key, deviation, reason, setBy: actor, setAt: now() },
      ];

      // Re-validate: flags the new threshold no longer catches close as justified,
      // carrying the override text as their reason.
      const arrived = c.submissions.filter((s) => s.versions.length > 0).map((s) => s.source);
      const stillFlagged = new Set<string>();
      for (const sub of c.submissions) {
        if (sub.versions.length === 0) continue;
        for (const f of validateSource(sub.source, { overrides: c.thresholdOverrides, arrived }).flags) {
          stillFlagged.add(f.id);
        }
      }
      let closed = 0;
      for (const flag of c.flags) {
        if (flag.origin !== 'validation' || !openFlagStatus(flag.status)) continue;
        if (stillFlagged.has(flag.id)) continue;
        transition(flag, 'justified', actor, `threshold raised to ${Math.round(deviation * 100)}% — ${reason}`);
        flag.note = `Threshold raised to ${Math.round(deviation * 100)}% for ${key}: ${reason}`;
        recordJustification(c, flag, flag.note);
        closed += 1;
      }
      audit(c, actor, 'raised deviation threshold', key, `${Math.round(deviation * 100)}% · ${reason} · closed ${closed} flags`);
      result.message = closed
        ? `Threshold raised. ${closed} flag${closed === 1 ? '' : 's'} closed with that reason attached.`
        : 'Threshold raised. No open flags fell inside it.';
      return;
    }

    case 'decide_excluded': {
      const key = String(p.key ?? '');
      const reason = String(p.reason ?? '').trim();
      if (!reason) throw new Error('a reason is required so stakeholders see a decision, not a gap');

      ensureExcludedDecisions(c);
      let decision = c.excludedDecisions.find((d) => d.key === key);
      if (!decision) {
        const draft = currentDraft(c);
        const known =
          draft?.excluded.some((s) => s.key === key) ||
          buildPlan(resolvedPlanInput(c, loadPlanInput())).excluded.some((s) => s.key === key);
        if (!known) throw new Error('excluded series not found');
        decision = {
          key,
          decision: 'pending',
          reason: null,
          decidedBy: null,
          decidedAt: null,
        };
        c.excludedDecisions.push(decision);
      }
      decision.decision = 'exclusion_confirmed';
      decision.reason = reason;
      decision.decidedBy = actor;
      decision.decidedAt = now();
      audit(c, actor, 'confirmed exclusion', key, reason);
      return;
    }

    // ------------------------------------------------------------ phase 4 & 5
    case 'build_master': {
      const g = gate1(c);
      if (!g.open) throw new Error(`Gate 1 is closed — ${g.reason}`);
      const input = resolvedPlanInput(c, loadPlanInput());
      c.masterFile = buildMasterFile(c, input);
      for (const sub of c.submissions) sub.includedInMasterAt = now();
      audit(c, 'Intake Agent', 'built master workbook', `${c.masterFile.sheets.length} sheets`, `from ${c.submissions.length} sources`);
      result.message = `Workbook built — ${c.masterFile.sheets.length} sheets from ${c.submissions.length} sources.`;
      return;
    }

    case 'approve_master': {
      if (!c.masterFile) throw new Error('nothing to approve — build the workbook first');
      if (c.masterFile.stale) throw new Error(`workbook is stale — ${c.masterFile.staleReason}`);
      const g = gate1(c);
      if (!g.open) throw new Error(`Gate 1 is closed — ${g.reason}`);
      c.masterFile.approvedByPlanner = true;
      c.masterFile.approvedAt = now();
      audit(c, actor, 'approved workbook for the run', 'Gate 2', 'run authority granted');
      return;
    }

    case 'run_plan': {
      const g = gate2(c);
      if (!g.open) throw new Error(`Gate 2 is closed — ${g.reason}`);

      const input = resolvedPlanInput(c, loadPlanInput());
      const { rows, excluded } = buildPlan(input);
      const previous = currentDraft(c);

      const draft: Draft = {
        id: `draft-${c.drafts.length + 1}`,
        version: c.drafts.length + 1,
        generatedAt: now(),
        planRows: rows,
        excluded,
        totalRevenue: totalRevenue(rows),
        totalVolume: totalVolume(rows),
        shortfallRowCount: shortfallRows(rows).length,
        bandBreachRowCount: bandBreachRows(rows).length,
        changesFromPrevious: previous ? diffDrafts(previous.planRows, rows, c) : [],
        status: 'generated',
        issuedAt: null,
      };

      for (const d of c.drafts) if (d.status !== 'finalized') d.status = 'superseded';
      c.drafts.push(draft);
      syncExcludedDecisions(c, excluded);
      audit(c, 'LP model', `generated draft v${draft.version}`, draft.id,
        `${rows.length} rows · ${draft.shortfallRowCount} shortfalls · ${draft.bandBreachRowCount} band breaches`);
      result.message = `Draft v${draft.version} generated — ${rows.length} rows, ${draft.shortfallRowCount} with a shortfall.`;
      return;
    }

    case 'issue_draft': {
      const draft = currentDraft(c);
      if (!draft) throw new Error('no draft to issue');
      if (draft.status === 'issued') throw new Error('this version is already issued');

      draft.status = 'issued';
      draft.issuedAt = now();

      const reviewers = loadStakeholders().filter((s) => s.kind !== 'planner');
      c.reviews = [
        ...c.reviews.filter((r) => r.draftId !== draft.id),
        ...reviewers.map<StakeholderReview>((s) => ({
          id: `rev-${draft.id}-${s.id}`,
          draftId: draft.id,
          stakeholder: s.name,
          status: 'notified',
          respondedAt: null,
          daysWaiting: 0,
          note: null,
        })),
      ];

      const mail = draftEmail(draft.version, reviewers.map((s) => s.email));
      c.emails.push({ id: `mail-draft-${draft.id}`, ...mail, sentAt: now(), kind: 'draft', relatedTo: draft.id });
      audit(c, actor, `issued draft v${draft.version}`, 'all stakeholders', `${reviewers.length} recipients`);
      result.message = `Draft v${draft.version} issued to ${reviewers.length} stakeholders.`;
      return;
    }

    // ------------------------------------------------------------ phase 6
    case 'mark_viewed': {
      const review = requireReview(c, actor);
      if (review.status === 'notified') review.status = 'viewed';
      return;
    }

    case 'review_approve': {
      const review = requireReview(c, actor);
      review.status = 'approved';
      review.respondedAt = now();
      audit(c, actor, 'approved the draft', review.draftId, '');
      result.message = 'Approval recorded. Nothing further is needed from you.';
      return;
    }

    case 'review_comment': {
      const review = requireReview(c, actor);
      const draft = currentDraft(c)!;
      const rowRef = String(p.rowRef);
      const text = String(p.text ?? '').trim();
      if (!text) throw new Error('a comment needs a reason');

      const row = draft.planRows.find((r) => rowRefOf(r) === rowRef);
      const comment: Comment = {
        id: `cmt-${c.comments.length + 1}`,
        draftId: draft.id,
        author: actor,
        rowRef,
        quotedValue: row ? `${row.demand} kb` : '—',
        text,
        proposedValue: p.proposedValue == null ? null : Number(p.proposedValue),
        status: 'open',
        plannerResponse: null,
        resolvedAt: null,
      };
      c.comments.push(comment);
      review.status = 'comment_submitted';
      review.respondedAt = now();
      audit(c, actor, 'commented on the draft', rowRef, text);
      result.message = 'Comment sent to the planner. You will see the response here.';
      return;
    }

    case 'review_upload': {
      const review = requireReview(c, actor);
      const draft = currentDraft(c)!;
      const author = stakeholderByName(actor);
      if (!author) throw new Error('unknown stakeholder');

      const scripted = scriptedRevisions().find((r) => r.stakeholder === actor && r.channel === 'upload');
      const raw = (p.changes as Array<{ field: string; rowRef: string; before: number; after: number }> | undefined)
        ?? scripted?.changes
        ?? [];

      const recognition = recogniseUpload(author, raw, {
        overrides: c.thresholdOverrides,
        draftId: draft.id,
      });

      // Rule 5: the uploader is told first. An unrecognised file is a verdict, so it
      // stops here rather than reaching the planner.
      if (recognition.recognisedAs === 'unrecognised' || recognition.changes.length === 0) {
        result.message = recognition.stakeholderReport;
        result.extra = recognition;
        return;
      }

      const revision: Revision = {
        id: `rv-${c.revisions.length + 1}`,
        draftId: draft.id,
        author: actor,
        channel: 'upload',
        fileName: String(p.fileName ?? scripted?.fileName ?? 'upload.xlsx'),
        recognisedAs: recognition.recognisedAs,
        changes: recognition.changes,
        text: null,
        status: 'pending',
        plannerNote: null,
        resolvedAt: null,
      };
      c.revisions.push(revision);

      for (const flag of recognition.flags) {
        if (!c.flags.some((f) => f.id === flag.id)) c.flags.push(flag);
      }

      review.status = 'update_submitted';
      review.respondedAt = now();
      audit(c, 'File-Recognition Agent', `identified ${recognition.recognisedAs} upload`, actor,
        recognition.changes.map((ch) => `${ch.field}:${ch.verdict}`).join(' · '));
      result.message = recognition.stakeholderReport;
      result.extra = recognition;
      return;
    }

    case 'review_chat': {
      const outcome = interpretStakeholderChat(String(p.text ?? ''));
      result.extra = outcome;
      result.message = outcome.reply;
      return;
    }

    case 'revision_accept': {
      const revision = c.revisions.find((r) => r.id === p.id);
      if (!revision) throw new Error('revision not found');
      revision.status = 'accepted';
      revision.resolvedAt = now();
      revision.plannerNote = String(p.note ?? '');

      // Accepting an out-of-scope change is recorded against the planner, not the
      // stakeholder who proposed it.
      for (const change of revision.changes) {
        if (change.verdict !== 'out_of_scope') continue;
        audit(c, actor, 'accepted an out-of-scope change', change.rowRef,
          `${change.field} ${change.before} → ${change.after}, proposed by ${revision.author}`);
      }
      for (const flag of c.flags) {
        if (flag.origin === 'draft_review' && revision.changes.some((ch) => ch.rowRef === flag.rowRef)) {
          transition(flag, 'corrected', actor, 'revision accepted');
        }
      }
      settleReviewer(c, revision.author, revision.draftId);
      if (c.masterFile) markStale(c, `revision from ${revision.author} accepted after the last build`);
      audit(c, actor, 'accepted revision', revision.id, `from ${revision.author}`);
      return;
    }

    case 'revision_decline': {
      const revision = c.revisions.find((r) => r.id === p.id);
      if (!revision) throw new Error('revision not found');
      const note = String(p.note ?? '').trim();
      if (!note) throw new Error('declining needs a reason — it is emailed to the author');
      revision.status = 'declined';
      revision.resolvedAt = now();
      revision.plannerNote = note;
      for (const flag of c.flags) {
        if (flag.origin === 'draft_review' && revision.changes.some((ch) => ch.rowRef === flag.rowRef)) {
          transition(flag, 'justified', actor, `revision declined — ${note}`);
          flag.note = note;
        }
      }
      settleReviewer(c, revision.author, revision.draftId);
      const mail = declineEmail(revision.author, revision.changes[0]?.rowRef ?? '', note);
      c.emails.push({ id: `mail-decline-${revision.id}`, ...mail, sentAt: now(), kind: 'decline', relatedTo: revision.id });
      audit(c, actor, 'declined revision', revision.id, note);
      return;
    }

    case 'comment_accept': {
      const comment = c.comments.find((x) => x.id === p.id);
      if (!comment) throw new Error('comment not found');
      comment.status = 'accepted';
      comment.resolvedAt = now();
      comment.plannerResponse = String(p.note ?? 'Accepted — applied to the plan.');
      if (p.proposedValue != null) comment.proposedValue = Number(p.proposedValue);
      const review = c.reviews.find((r) => r.stakeholder === comment.author && r.draftId === comment.draftId);
      if (review) review.status = 'confirmed';
      if (c.masterFile) markStale(c, `comment from ${comment.author} accepted after the last build`);
      audit(c, actor, 'accepted comment', comment.rowRef, comment.plannerResponse ?? '');
      return;
    }

    case 'comment_decline': {
      const comment = c.comments.find((x) => x.id === p.id);
      if (!comment) throw new Error('comment not found');
      const note = String(p.note ?? '').trim();
      if (!note) throw new Error('declining a comment needs a reason — it goes back to the author');
      comment.status = 'declined';
      comment.resolvedAt = now();
      comment.plannerResponse = note;
      const review = c.reviews.find((r) => r.stakeholder === comment.author && r.draftId === comment.draftId);
      if (review) review.status = 'confirmed';
      const mail = declineEmail(comment.author, comment.rowRef, note);
      c.emails.push({ id: `mail-decline-${comment.id}`, ...mail, sentAt: now(), kind: 'decline', relatedTo: comment.id });
      audit(c, actor, 'declined comment', comment.rowRef, note);
      return;
    }

    case 'deem_approved': {
      const review = c.reviews.find((r) => r.id === p.id);
      if (!review) throw new Error('review not found');
      const note = String(p.note ?? '').trim();
      if (!note) throw new Error('recording a deemed approval needs a reason');
      review.status = 'deemed_approved';
      review.respondedAt = now();
      review.note = note;
      audit(c, actor, 'recorded deemed approval', review.stakeholder, note);
      return;
    }

    case 'simulate_review_approve': {
      const draft = currentDraft(c);
      if (!draft || draft.status !== 'issued') throw new Error('no draft is out for review');
      const review = c.reviews.find((r) => r.id === String(p.id ?? '') && r.draftId === draft.id);
      if (!review) throw new Error('review not found');
      if (['approved', 'confirmed', 'deemed_approved'].includes(review.status)) {
        throw new Error(`${review.stakeholder} has already responded`);
      }
      if (['comment_submitted', 'update_submitted'].includes(review.status)) {
        throw new Error(
          `${review.stakeholder} has a pending proposal — resolve it in the revision queue first`
        );
      }
      review.status = 'approved';
      review.respondedAt = now();
      audit(c, review.stakeholder, 'approved the draft', draft.id, 'demo simulation');
      result.message = `${review.stakeholder} approved the draft.`;
      return;
    }

    case 'simulate_review_approve_all': {
      const draft = currentDraft(c);
      if (!draft || draft.status !== 'issued') throw new Error('no draft is out for review');
      const pending = c.reviews.filter(
        (r) =>
          r.draftId === draft.id && ['notified', 'viewed', 'escalated'].includes(r.status)
      );
      if (pending.length === 0) throw new Error('no stakeholders waiting to approve');
      for (const review of pending) {
        review.status = 'approved';
        review.respondedAt = now();
        audit(c, review.stakeholder, 'approved the draft', draft.id, 'demo simulation');
      }
      result.message = `${pending.length} stakeholders approved the draft.`;
      return;
    }

    case 'simulate_responses': {
      // Drives every scripted stakeholder response at once, for the walkthrough.
      const draft = currentDraft(c);
      if (!draft || draft.status !== 'issued') throw new Error('no draft is out for review');

      // The scripted objections belong to the first review round only. Replaying them
      // on a reissued draft would mean a stakeholder rejecting the very change they
      // asked for, and the cycle could never close.
      const scripted = draft.version === 1 ? scriptedRevisions() : [];
      for (const item of scripted) {
        const review = c.reviews.find((r) => r.stakeholder === item.stakeholder && r.draftId === draft.id);
        if (!review || review.status !== 'notified') continue;
        if (item.channel === 'approve') {
          review.status = 'approved';
          review.respondedAt = now();
          audit(c, item.stakeholder, 'approved the draft', draft.id, '');
        } else if (item.channel === 'comment') {
          const row = draft.planRows.find((r) => rowRefOf(r) === item.rowRef);
          c.comments.push({
            id: `cmt-${c.comments.length + 1}`,
            draftId: draft.id,
            author: item.stakeholder,
            rowRef: item.rowRef!,
            quotedValue: row ? `${row.demand} kb` : '—',
            text: item.text!,
            proposedValue: item.proposedValue ?? null,
            status: 'open',
            plannerResponse: null,
            resolvedAt: null,
          });
          review.status = 'comment_submitted';
          review.respondedAt = now();
          audit(c, item.stakeholder, 'commented on the draft', item.rowRef!, item.text!);
        } else if (item.channel === 'upload') {
          const author = stakeholderByName(item.stakeholder);
          if (!author) continue;
          const recognition = recogniseUpload(author, item.changes ?? [], {
            overrides: c.thresholdOverrides,
            draftId: draft.id,
          });
          c.revisions.push({
            id: `rv-${c.revisions.length + 1}`,
            draftId: draft.id,
            author: item.stakeholder,
            channel: 'upload',
            fileName: item.fileName ?? 'upload.xlsx',
            recognisedAs: recognition.recognisedAs,
            changes: recognition.changes,
            text: null,
            status: 'pending',
            plannerNote: null,
            resolvedAt: null,
          });
          for (const flag of recognition.flags) {
            if (!c.flags.some((f) => f.id === flag.id)) c.flags.push(flag);
          }
          review.status = 'update_submitted';
          review.respondedAt = now();
          audit(c, 'File-Recognition Agent', `identified ${recognition.recognisedAs} upload`, item.stakeholder,
            recognition.changes.map((ch) => ch.verdict).join(' · '));
        }
      }
      // Everyone with no scripted response approves.
      for (const review of c.reviews) {
        if (review.draftId === draft.id && review.status === 'notified') {
          review.status = 'approved';
          review.respondedAt = now();
          audit(c, review.stakeholder, 'approved the draft', draft.id, '');
        }
      }
      result.message = 'Stakeholder responses received.';
      return;
    }

    // ------------------------------------------------------------ phase 7
    case 'publish_final': {
      const g = gate4(c);
      if (!g.open) throw new Error(`Gate 4 is closed — ${g.reason}`);
      const draft = currentDraft(c)!;
      draft.status = 'finalized';
      c.finalisedAt = now();
      const reviewers = loadStakeholders().filter((s) => s.kind !== 'planner');
      const mail = finalEmail(draft.version, reviewers.map((s) => s.email));
      c.emails.push({ id: `mail-final-${draft.id}`, ...mail, sentAt: now(), kind: 'final', relatedTo: draft.id });
      audit(c, actor, 'published the final SROP', draft.id,
        `from draft v${draft.version} · $${(draft.totalRevenue / 1_000_000).toFixed(2)}M`);
      result.message = `Final SROP published from draft v${draft.version}. Cycle archived.`;
      return;
    }

    default:
      throw new Error(`unknown action: ${action}`);
  }
}

// --------------------------------------------------------------------- helpers

function receiveSubmission(
  c: CycleRecord,
  actor: string,
  source: string,
  note: string
): string[] {
  const sub = c.submissions.find((s) => s.source === source);
  if (!sub) throw new Error(`${source} was not asked for anything this cycle`);

  const files = submissionFilesFor(source, sub.kind);
  if (files.length === 0) throw new Error(`no fixture data exists for ${source}`);

  sub.versions.push({
    n: sub.versions.length + 1,
    receivedAt: now(),
    note,
    files,
  });
  sub.status = 'submitted';
  sub.assumed = false;

  for (const flag of c.flags) {
    if (flag.source === source && flag.origin === 'validation') {
      flag.history.push({
        at: now(),
        actor,
        from: flag.status,
        to: 'superseded',
        note: `v${sub.versions.length} received`,
      });
      flag.status = 'superseded';
    }
  }
  if (c.masterFile) markStale(c, `${source} submitted v${sub.versions.length} after the last build`);

  audit(
    c,
    actor,
    `submitted ${sub.kind}`,
    source,
    `v${sub.versions.length} · ${files.map((f) => f.name).join(', ')}`
  );
  return files.map((f) => f.name);
}

/** One validation instance per source. Independent failure domains. */
function runValidationSources(
  c: CycleRecord,
  targets: string[],
  result: { message?: string }
): void {
  if (targets.length === 0) throw new Error('nothing has been submitted yet');

  const arrived = c.submissions.filter((s) => s.versions.length > 0).map((s) => s.source);

  const produced: Flag[] = [];
  for (const source of targets) {
    const sub = c.submissions.find((s) => s.source === source)!;
    const { flags, crossSourcePending } = validateSource(source, {
      overrides: c.thresholdOverrides,
      arrived,
    });
    sub.crossSourcePending = crossSourcePending;
    sub.status = flags.length > 0 ? 'flagged' : 'clean';
    produced.push(...flags);
  }

  const previous = new Map(c.flags.map((f) => [f.id, f]));
  const kept = c.flags.filter((f) => !targets.includes(f.source) || f.origin !== 'validation');
  const merged = produced.map((fresh) => {
    const before = previous.get(fresh.id);
    if (!before || before.status === 'superseded') return fresh;
    return {
      ...fresh,
      status: before.status,
      note: before.note,
      correctedValue: before.correctedValue,
      response: before.response,
      impact: before.impact,
      daysWaiting: before.daysWaiting,
      history: before.history,
    };
  });
  c.flags = [...kept, ...merged];

  syncExcludedDecisions(c, buildPlan(loadPlanInput()).excluded);

  const clean = c.submissions.filter((s) => s.status === 'clean').map((s) => s.source);
  result.message = summarise(openFlags(c), clean);
  audit(c, 'Validation Agent', 'validated submissions', targets.join(', '), `${merged.length} flags`);
}

function ensureExcludedDecisions(c: CycleRecord) {
  if (!c.excludedDecisions) c.excludedDecisions = [];
}

/** Track every unplannable series so Y can confirm or add limits before Gate 1 opens. */
function syncExcludedDecisions(c: CycleRecord, excluded: Array<{ key: string }>) {
  ensureExcludedDecisions(c);
  for (const series of excluded) {
    if (!c.excludedDecisions.some((d) => d.key === series.key)) {
      c.excludedDecisions.push({
        key: series.key,
        decision: 'pending',
        reason: null,
        decidedBy: null,
        decidedAt: null,
      });
    }
  }
}

function openFlagStatus(status: FlagStatus) {
  return status === 'open' || status === 'awaiting_response' || status === 'responded' || status === 'escalated';
}

function requireFlag(c: CycleRecord, id: unknown): Flag {
  const flag = c.flags.find((f) => f.id === id);
  if (!flag) throw new Error('flag not found');
  return flag;
}

function requireReview(c: CycleRecord, actor: string): StakeholderReview {
  const draft = currentDraft(c);
  if (!draft) throw new Error('no draft is out for review');
  const review = c.reviews.find((r) => r.draftId === draft.id && r.stakeholder === actor);
  if (!review) throw new Error(`${actor} is not a reviewer on this draft`);
  return review;
}

/**
 * Once the planner has decided on a stakeholder's proposal, that stakeholder is settled
 * for this draft. Without this, Gate 4 would count an author who did respond as still
 * outstanding and the cycle could never close.
 */
function settleReviewer(c: CycleRecord, stakeholder: string, draftId: string) {
  const review = c.reviews.find((r) => r.stakeholder === stakeholder && r.draftId === draftId);
  if (review) {
    review.status = 'confirmed';
    review.respondedAt = review.respondedAt ?? now();
  }
}

function transition(flag: Flag, to: FlagStatus, actor: string, note: string) {
  flag.history.push({ at: now(), actor, from: flag.status, to, note });
  flag.status = to;
}

function mergeSubmissions(c: CycleRecord, fresh: CycleRecord['submissions']) {
  return fresh.map((f) => {
    const existing = c.submissions.find((s) => s.source === f.source);
    return existing ?? f;
  });
}

export function rowRefOf(row: PlanRow): string {
  return `refinery=${row.refinery},bulk_plant=${row.bulkPlant},product=${row.product},month=${row.month}`;
}

function seriesKeyFromRowRef(rowRef: string): string {
  const parts = new Map(rowRef.split(',').map((p) => {
    const [k, ...rest] = p.split('=');
    return [k.trim(), rest.join('=').trim()];
  }));
  return `${parts.get('refinery')}|${parts.get('bulk_plant')}|${parts.get('product')}`;
}

function monthFromRowRef(rowRef: string): string {
  const hit = rowRef.split(',').find((p) => p.trim().startsWith('month='));
  return hit ? hit.split('=')[1].trim() : '';
}

/** The scripted reply for a flag. Keyed by rule, and by series where a rule fires twice. */
function scriptedReplyFor(flag: Flag): ScriptedReply {
  const replies = scriptedReplies();
  const bySeries = replies[`${flag.rule}:${seriesKeyFromRowRef(flag.rowRef)}`];
  if (bySeries) return bySeries;
  const byRule = replies[flag.rule];
  if (byRule) return byRule;
  return {
    from: flag.source,
    reply: 'Confirmed as submitted — the figure is intentional.',
    correctedValue: null,
    movesThePlan: false,
  };
}

function diffDrafts(before: PlanRow[], after: PlanRow[], c: CycleRecord) {
  const beforeByRef = new Map(before.map((r) => [rowRefOf(r), r]));
  const causes = [
    ...c.revisions.filter((r) => r.status === 'accepted').map((r) => `${r.author} update, accepted`),
    ...c.comments.filter((x) => x.status === 'accepted').map((x) => `${x.author} comment, accepted`),
  ];
  const cause = causes.join('; ') || 'planner correction';

  return after
    .map((row) => {
      const prior = beforeByRef.get(rowRefOf(row));
      if (!prior || prior.demand === row.demand) return null;
      return { rowRef: rowRefOf(row), before: prior.demand, after: row.demand, causedBy: cause };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}