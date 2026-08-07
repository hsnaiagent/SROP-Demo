/**
 * UI-only data that has no home in `lib/` because it never touches North or the
 * optimizer — it exists purely to make the browser demo self-contained.
 *
 * `CORRECTIONS` mirrors `data/corrections.json` exactly (see BLOCK-5-BRIEF.md §1).
 * It is duplicated here, not imported, because `data/` is server-only (read via
 * `fs` in `lib/csv.ts`) and this block is frontend-only — reading the real file
 * would need a new API route, which is out of scope for Block 5.
 */

import type { EmailDraft, Flag, Rule } from '@/lib/types';

export interface SimulatedReply {
  from: string;
  reply: string;
  correctedValue: number | null;
  movesThePlan: boolean;
}

export const CORRECTIONS: Record<Rule, SimulatedReply> = {
  HISTORICAL_DEVIATION: {
    from: 'OSPAS',
    reply:
      'Checked against our dispatch log - 41.2 was a transcription error. Correct figure for JAZAN DIESEL October is 25.8 kb.',
    correctedValue: 25.8,
    movesThePlan: true,
  },
  LIMIT_BREACH: {
    from: 'Refinery JAZAN',
    reply:
      'Confirmed intentional. GASOLINE-91 is running an approved temporary over-fill under waiver TW-2026-114 ahead of the Q4 turnaround.',
    correctedValue: null,
    movesThePlan: false,
  },
  ZERO_OR_MISSING: {
    from: 'Demand Planning',
    reply:
      'Confirmed intentional. No JET-A1 term pricing published for November - scheduled shutdown, no liftings expected.',
    correctedValue: null,
    movesThePlan: false,
  },
  UNKNOWN_ENTITY: {
    from: 'OSPAS',
    reply:
      'Confirmed intentional. LPG-95 is a new grade approved for JAZAN; it has not been added to the reference limits file yet.',
    correctedValue: null,
    movesThePlan: false,
  },
};

/** Fake internal addresses — no real email is ever sent (see hard constraints). */
const SOURCE_EMAIL: Record<string, string> = {
  OSPAS: 'ospas.data@srop.internal',
  'Demand Planning': 'demand.planning@srop.internal',
  'Refinery YANBU': 'ops.yanbu@srop.internal',
  'Refinery JAZAN': 'ops.jazan@srop.internal',
};

const emailFor = (source: string) =>
  SOURCE_EMAIL[source] ?? `${source.toLowerCase().replace(/\s+/g, '.')}@srop.internal`;

const ruleLabel = (rule: Rule) =>
  rule
    .toLowerCase()
    .split('_')
    .join(' ');

/**
 * Client-side draft template — built from the flag's own fields so it works
 * whether or not `emails[flag.id]` is ever populated (Node 2 doesn't exist yet).
 * Kept under 90 words, no greeting fluff, per BLOCK-5-BRIEF.md §2.
 */
export function buildEmailDraft(flag: Flag): EmailDraft {
  return {
    to: emailFor(flag.source),
    subject: `Data query — ${ruleLabel(flag.rule)} — ${flag.rowRef}`,
    body: `${flag.plainEnglish} Specifically: ${flag.evidence}. Please confirm this figure or send the corrected value.\n\n— SROP Planning`,
  };
}

/**
 * Arrival timestamps aren't in the payload (BLOCK-5-BRIEF.md). These are fixed,
 * fake offsets keyed by position in `meta.submissions` — they only need to look
 * like four different arrival times, not be real.
 */
export const ARRIVAL_TIMES = ['08:12', '08:19', '08:41', '08:47'];

export const formatKb = (n: number) => `${n.toFixed(1)} kb`;

export const formatDeltaKb = (n: number) => {
  const rounded = Number(n.toFixed(1));
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)} kb`;
};

export const formatMoney = (n: number) => {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n / 1_000_000).toFixed(2)}M`;
};
