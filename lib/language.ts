/**
 * The language layer. version2.md §9's division of labour: code does arithmetic,
 * this file does prose.
 *
 * Templates are the primary implementation, not a fallback. Nothing on stage may
 * depend on a network call, so every function here returns a complete, sensible
 * result offline and synchronously. A live model could improve the wording; it can
 * never be required for the platform to work.
 *
 * That is also why the orchestrator chat is pattern-matched rather than parsed by a
 * model: an unrecognised phrase still produces the standard six requests plus the
 * planner's own words carried through as an ad-hoc item, which is a useful answer.
 */

import { RULE_LABEL } from './types';
import type { EmailDraft, Flag, Request, Stakeholder } from './types';

const signature = '\n\n— SROP Planning\nSent from the SROP platform';

const plantList = (plants: string[]) =>
  plants.length <= 1 ? plants[0] ?? '' : `${plants.slice(0, -1).join(', ')} and ${plants.at(-1)}`;

// ------------------------------------------------------------- request drafting

/** What each stakeholder is routinely asked for. The standard monthly pull. */
export function standardItems(s: Stakeholder, horizon: string[]): string[] {
  const window = `${horizon[0]} to ${horizon.at(-1)}`;
  if (s.submits.includes('prices')) {
    return [`Product prices for all products, ${window}`];
  }
  if (s.submits.includes('demand')) {
    return [`Demand per refinery, per bulk plant, per product, ${window}`];
  }
  if (s.submits.includes('inventory')) {
    return [`Opening inventory (tank levels) for ${plantList(s.ownsPlants)}`];
  }
  return [];
}

export function requestEmail(s: Stakeholder, items: string[], dueDate: string): EmailDraft {
  const bullets = items.map((i) => `  • ${i}`).join('\n');
  return {
    to: s.email,
    subject: `SROP data request — due ${dueDate}`,
    body:
      `Hello ${s.name},\n\n` +
      `The SROP cycle for this month is open. Please provide:\n\n${bullets}\n\n` +
      `Upload directly on the platform — the link below takes you to your submission page, ` +
      `and the file is validated as soon as it arrives so you will hear back quickly if ` +
      `anything looks off.\n\n` +
      `Due: ${dueDate}\n` +
      `Submit here: https://srop.internal/submit` +
      signature,
  };
}

export function reminderEmail(request: Request, daysWaiting: number): EmailDraft {
  return {
    to: request.email,
    subject: `Reminder — SROP data request still open (${daysWaiting} business days)`,
    body:
      `Hello ${request.recipient},\n\n` +
      `We have not yet received your submission for this SROP cycle. It was requested ` +
      `${daysWaiting} business days ago and was due ${request.dueDate}.\n\n` +
      `The plan cannot be run until every source has reported, so this is currently ` +
      `holding the cycle.\n\n` +
      `Submit here: https://srop.internal/submit` +
      signature,
  };
}

export function escalationEmail(
  request: Request,
  s: Stakeholder,
  daysWaiting: number
): EmailDraft {
  return {
    to: s.escalationContact ?? request.email,
    subject: `Escalation — ${request.recipient} SROP submission outstanding ${daysWaiting} days`,
    body:
      `Hello,\n\n` +
      `${request.recipient} has not submitted its SROP data for this cycle. The request ` +
      `was sent ${daysWaiting} business days ago, a reminder has already gone out, and ` +
      `the cycle is now blocked on this source.\n\n` +
      `Requested:\n${request.items.map((i) => `  • ${i}`).join('\n')}\n\n` +
      `If no submission arrives, the planner will carry last cycle's figures forward and ` +
      `mark them as assumed on the published SROP.\n\n` +
      `cc: SROP Planner` +
      signature,
  };
}

// ---------------------------------------------------------------- flag queries

/** One flag, one email. The numbers are already in it — the planner does not retype them. */
export function flagQueryEmail(flag: Flag, s: Stakeholder | undefined): EmailDraft {
  return {
    to: s?.email ?? 'unknown@aramco.example',
    subject: `SROP query — ${RULE_LABEL[flag.rule]} in ${flag.file}`,
    body:
      `Hello ${flag.source},\n\n` +
      `The Data Checker flagged one value in your submission and we would like to confirm it ` +
      `before it goes into the plan.\n\n` +
      `  Row:      ${prettyRowRef(flag.rowRef)}\n` +
      `  Field:    ${flag.field}\n` +
      `  Evidence: ${flag.evidence}\n\n` +
      `${flag.plainEnglish}\n\n` +
      `If the figure is correct, reply confirming and we will log your reason against it. ` +
      `If it is not, reply with the corrected value or upload a new file.` +
      signature,
  };
}

/** Several flags from one source, one email — so a refinery gets one message, not nine. */
export function bulkQueryEmail(flags: Flag[], s: Stakeholder | undefined): EmailDraft {
  const rows = flags
    .map((f) => `  • ${prettyRowRef(f.rowRef)}\n    ${f.evidence}`)
    .join('\n\n');
  return {
    to: s?.email ?? 'unknown@aramco.example',
    subject: `SROP query — ${flags.length} values to confirm in ${flags[0].file}`,
    body:
      `Hello ${flags[0].source},\n\n` +
      `The Data Checker flagged ${flags.length} values in your submission. Rather than send you ` +
      `${flags.length} separate emails, they are all below.\n\n${rows}\n\n` +
      `For each one, either confirm it is intentional or reply with the corrected value.` +
      signature,
  };
}

export function declineEmail(author: string, rowRef: string, reason: string): EmailDraft {
  return {
    to: 'stakeholder@aramco.example',
    subject: 'SROP — your proposed change was not applied',
    body:
      `Hello ${author},\n\n` +
      `Your proposed change to ${prettyRowRef(rowRef)} has not been applied to the plan.\n\n` +
      `Reason given by the planner:\n  ${reason}\n\n` +
      `If you disagree, reply on the platform and it will come back to the planner's queue.` +
      signature,
  };
}

export function draftEmail(version: number, recipients: string[]): EmailDraft {
  return {
    to: recipients.join(', '),
    subject: `Draft SROP v${version} — please review and approve`,
    body:
      `Hello,\n\n` +
      `Draft SROP v${version} is ready for your review. Open the platform to see the rows ` +
      `that concern you, checked against your own capacity and tank limits.\n\n` +
      `You can approve it, propose a change to your own data, or reject a specific value ` +
      `with a comment. All three take under a minute.\n\n` +
      `Review here: https://srop.internal/review` +
      signature,
  };
}

export function finalEmail(version: number, recipients: string[]): EmailDraft {
  return {
    to: recipients.join(', '),
    subject: `Final SROP published (from draft v${version})`,
    body:
      `Hello,\n\n` +
      `The SROP for this cycle is approved and published. Every comment raised during ` +
      `review has been resolved and every stakeholder has confirmed.\n\n` +
      `The final file and the full audit trail are on the platform.\n\n` +
      `Open here: https://srop.internal/history` +
      signature,
  };
}

// ------------------------------------------------------------- orchestrator chat

export interface ChatOutcome {
  reply: string;
  /** Extra items keyed by recipient name, on top of the standard pull. */
  adHoc: Record<string, string[]>;
  /** Set when the ask is too vague to draft — the orchestrator asks instead of guessing. */
  question: string | null;
  /** Recipients whose ad-hoc extras should be dropped (e.g. "remove the emergency for Yanbu"). */
  clearAdHoc?: string[];
  /** Recipients whose email wording should change without altering request items. */
  emailTargets?: string[];
  /** Passed to email polish only — does not change request items. */
  polishHint?: string | null;
}

const REFINERY_WORDS: Record<string, string> = {
  yanbu: 'Refinery YANBU',
  jazan: 'Refinery JAZAN',
  jizan: 'Refinery JAZAN',
  riyadh: 'Refinery RIYADH',
  rabigh: 'Refinery RABIGH',
};

function recipientsFromText(trimmed: string, stakeholders: Stakeholder[]): string[] {
  const fromRefineries = Object.entries(REFINERY_WORDS)
    .filter(([word]) => new RegExp(`\\b${word}`, 'i').test(trimmed))
    .map(([, name]) => name);

  const fromNames: string[] = [];
  for (const s of stakeholders) {
    if (s.kind === 'planner') continue;
    if (fromRefineries.includes(s.name)) continue;
    const escaped = s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(escaped, 'i').test(trimmed)) {
      fromNames.push(s.name);
      continue;
    }
    const words = s.name.toLowerCase().split(/\s+/);
    if (words.length > 1 && words.every((w) => new RegExp(`\\b${w}\\b`, 'i').test(trimmed))) {
      fromNames.push(s.name);
    }
  }

  const mentionsAllRefineries = /\ball (the )?refineries\b|\bevery refinery\b|\ball four\b/i.test(trimmed);
  if (fromRefineries.length || fromNames.length) {
    return [...new Set([...fromRefineries, ...fromNames])];
  }
  if (mentionsAllRefineries) {
    return stakeholders.filter((s) => s.kind === 'refinery').map((s) => s.name);
  }
  return [];
}

const TOPIC_WORDS: Array<[RegExp, string]> = [
  [/outage|turnaround|shutdown|maintenance/i, 'Updated outage schedule for the horizon'],
  [/min.?max|min\/max|minimum and maximum/i, 'Updated min/max tank levels per bulk plant'],
  [/limit|capacity/i, 'Updated bulk plant limits and monthly capacity'],
  [/tank|inventory|level/i, 'Opening inventory (tank levels), confirmed as of month start'],
  [/price|pricing/i, 'Updated product prices'],
];

/**
 * Turns Y's free text into ad-hoc request items. Deliberately generous: anything it
 * cannot classify is carried through verbatim as an item on the named recipient,
 * because losing the planner's words would be worse than mis-filing them.
 *
 * It only asks a question when a topic was named with no recipient at all — the one
 * case where guessing would put the ask in front of the wrong department.
 */
export function interpretChat(text: string, stakeholders: Stakeholder[]): ChatOutcome {
  const trimmed = text.trim();
  const adHoc: Record<string, string[]> = {};

  if (!trimmed) {
    return { reply: 'Tell me what you need this cycle and who from, and I will draft it.', adHoc, question: null };
  }

  const recipients = recipientsFromText(trimmed, stakeholders);

  const topics = TOPIC_WORDS.filter(([re]) => re.test(trimmed)).map(([, item]) => item);

  const isRemoval =
    recipients.length > 0 &&
    /\b(remove|drop|cancel|clear|withdraw|without)\b/i.test(trimmed);

  if (isRemoval) {
    return {
      reply:
        `Cleared ad-hoc extras for ${plantList(recipients)}. ` +
        `The standard monthly pull is unchanged for all other recipients.`,
      adHoc: {},
      clearAdHoc: recipients,
      question: null,
      polishHint: trimmed,
    };
  }

  // A topic with no recipient is the one genuinely ambiguous case.
  if (topics.length > 0 && recipients.length === 0) {
    return {
      reply: '',
      adHoc,
      question:
        `You have asked about ${topics[0].toLowerCase()} but not said who from. ` +
        `Which refineries should I include — all four, or specific ones?`,
    };
  }

  const isWordingOnly =
    recipients.length > 0 &&
    topics.length === 0 &&
    /\b(email|emergency|urgent|tone|wording|formal|rewrite|reword|submit today|asap|immediately)\b/i.test(
      trimmed
    );

  if (isWordingOnly) {
    return {
      reply:
        `Will update the email wording for ${plantList(recipients)}. ` +
        `The standard monthly pull is unchanged for everyone else.`,
      adHoc: {},
      emailTargets: recipients,
      polishHint: trimmed,
      question: null,
    };
  }

  const isStandardOnly = recipients.length === 0 && topics.length === 0;
  if (isStandardOnly) {
    const polishHint = /\b(emergency|urgent|asap|today|same day|immediately)\b/i.test(trimmed)
      ? trimmed
      : null;
    return {
      reply:
        `Prepared the standard monthly pull: prices from Demand Planning, demand from ` +
        `OSPAS, and opening tank levels from all four refineries. Nothing ad-hoc added. ` +
        `Review the cards on the right and send when you are happy.`,
      adHoc,
      question: null,
      polishHint,
    };
  }

  const items = topics.length ? topics : [`Ad-hoc request from the planner: “${trimmed}”`];
  for (const r of recipients) adHoc[r] = items;

  const what = topics.length
    ? topics.map((t) => t.toLowerCase()).join('; ')
    : 'your note, carried through verbatim';

  return {
    reply:
      `Prepared the standard monthly pull, plus one ad-hoc item for ` +
      `${plantList(recipients)}: ${what}. ` +
      `Anything I add beyond the standard pull is marked “new this cycle” so it stands out. ` +
      `Due date defaults to 3 business days — change it on any card.`,
    adHoc,
    question: null,
  };
}

// --------------------------------------------------------- natural-language edit

export interface NlEditOutcome {
  value: number | null;
  explanation: string;
}

/**
 * Resolves phrases like "set it to the September figure" or "use 25.8" against the
 * numbers actually available for the row. Returns null rather than guessing.
 */
export function interpretEdit(
  text: string,
  context: { current: number; baselineMean: number | null; lastMonth: number | null; lastCycle: number | null }
): NlEditOutcome {
  const trimmed = text.trim();

  const explicit = trimmed.match(/(-?\d+(?:\.\d+)?)/);
  if (/\b(set|use|make|change)\b/i.test(trimmed) && explicit) {
    return { value: Number(explicit[1]), explanation: `read as the literal value ${explicit[1]}` };
  }

  if (/baseline|history|historical|12.?month|mean|average/i.test(trimmed) && context.baselineMean) {
    return {
      value: round1(context.baselineMean),
      explanation: `resolved to the 12-month historical mean for this series`,
    };
  }
  if (/last month|previous month|september|prior month/i.test(trimmed) && context.lastMonth) {
    return { value: round1(context.lastMonth), explanation: `resolved to the previous month's figure` };
  }
  if (/last cycle|last month's plan|previous cycle/i.test(trimmed) && context.lastCycle) {
    return { value: round1(context.lastCycle), explanation: `resolved to last cycle's value for this month` };
  }
  if (explicit) {
    return { value: Number(explicit[1]), explanation: `read as the literal value ${explicit[1]}` };
  }

  return {
    value: null,
    explanation:
      'I could not resolve that to a number. Try a value directly, or refer to the ' +
      'historical mean, the previous month, or last cycle.',
  };
}

// ------------------------------------------------------------ stakeholder chat

export interface StakeholderChatOutcome {
  intent: 'approve' | 'comment' | 'update' | 'unclear';
  reply: string;
  rowHint: string | null;
  proposedValue: number | null;
}

export function interpretStakeholderChat(text: string): StakeholderChatOutcome {
  const trimmed = text.trim();

  if (/^\s*(approve|approved|looks good|fine|no changes|agreed)\b/i.test(trimmed)) {
    return {
      intent: 'approve',
      reply: 'I will record that as an approval of this draft. Confirm below and it goes to the planner.',
      rowHint: null,
      proposedValue: null,
    };
  }

  const value = trimmed.match(/(\d+(?:\.\d+)?)\s*kb\b/i) ?? trimmed.match(/\b(\d+\.\d+)\b/);
  const product = trimmed.match(/\b(diesel|gasoline-?9[15]|jet-?a1|fuel-?oil|asphalt)\b/i);
  const month = trimmed.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i);

  if (/too high|too low|cannot|can't|wrong|reject|disagree|turnaround|outage|unreachable/i.test(trimmed)) {
    return {
      intent: 'comment',
      reply:
        `I have written that up as a comment on ${product ? product[1].toUpperCase() : 'the row you named'}` +
        `${month ? ` for ${month[1]}` : ''}, with your reason attached. ` +
        `It goes straight to the planner's queue — check the card below and confirm.`,
      rowHint: product ? product[1].toUpperCase() : null,
      proposedValue: value ? Number(value[1]) : null,
    };
  }

  if (value) {
    return {
      intent: 'update',
      reply:
        `I read that as proposing ${value[1]} kb. I will check it against your authority and ` +
        `your limits before it reaches the planner. Confirm the card below to submit it.`,
      rowHint: product ? product[1].toUpperCase() : null,
      proposedValue: Number(value[1]),
    };
  }

  return {
    intent: 'unclear',
    reply:
      'I can approve this draft, raise a comment against a specific value, or propose a ' +
      'change to your own data. Which of those did you mean?',
    rowHint: null,
    proposedValue: null,
  };
}

// --------------------------------------------------------------------- helpers

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** `refinery=JAZAN,bulk_plant=BP-JAZAN,product=DIESEL,month=2026-10` -> `JAZAN · BP-JAZAN · DIESEL · 2026-10` */
export function prettyRowRef(rowRef: string): string {
  return rowRef
    .split(',')
    .map((pair) => pair.split('=')[1] ?? pair)
    .join(' · ');
}
