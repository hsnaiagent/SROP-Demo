/**
 * Business policy that both halves of the app need. version2.md §4.
 *
 * Pure functions over the cycle record and plain values — no file access, no imports
 * that reach the filesystem. That matters: the screens need these to render an SLA
 * label or resolve a threshold, and a client component that transitively imports
 * `node:fs` will not build.
 *
 * `lib/rules.ts` and `lib/orchestrator.ts` are the server-side users; the screens
 * import from here directly.
 */

import { seriesKey } from './plan';
import type { CycleRecord, Request, Submission, ThresholdOverride } from './types';

// ---------------------------------------------------------------- thresholds

/** Global default, overridable per series, plant or product — by Y only. */
export const DEFAULT_DEVIATION_THRESHOLD = 0.50;

/** Above this a deviation is high rather than medium. */
export const HIGH_DEVIATION_THRESHOLD = 1.0;

/**
 * Most specific override wins: series, then plant, then product, then the default.
 * Every override carries a reason and persists into future cycles, which is why the
 * Data Dashboard lists them — an invisible threshold is invisible policy.
 */
export function thresholdFor(
  row: { refinery: string; bulkPlant: string; product: string },
  overrides: ThresholdOverride[]
): { value: number; override: ThresholdOverride | null } {
  const bySpecificity: Array<[ThresholdOverride['scope'], string]> = [
    ['series', seriesKey(row)],
    ['plant', row.bulkPlant],
    ['product', row.product],
  ];
  for (const [scope, key] of bySpecificity) {
    const hit = overrides.find((o) => o.scope === scope && o.key === key);
    if (hit) return { value: hit.deviation, override: hit };
  }
  return { value: DEFAULT_DEVIATION_THRESHOLD, override: null };
}

// ----------------------------------------------------------------- the ladder

export const SLA_REMINDER_DAYS = 3;
export const SLA_ESCALATION_DAYS = 5;
export const SLA_FALLBACK_DAYS = 7;
export const DUE_BUSINESS_DAYS = 3;

/** Business days only — a request sent on Friday is not overdue on Monday. */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return d;
}

/** Where a source sits on the ladder, in words. */
export function slaLabel(submission: Submission, request: Request | undefined): string {
  if (submission.versions.length > 0 && !submission.assumed) return '';
  if (submission.assumed) return 'carried forward from cycle 2026-08';
  if (!request || request.status !== 'sent') return 'not yet requested';

  if (submission.daysWaiting >= SLA_FALLBACK_DAYS) {
    return `silent ${submission.daysWaiting} business days — fallback ready`;
  }
  if (submission.daysWaiting >= SLA_ESCALATION_DAYS) {
    return `escalated to department head, day ${submission.daysWaiting}`;
  }
  if (submission.daysWaiting >= SLA_REMINDER_DAYS) {
    return `reminder sent, day ${submission.daysWaiting}`;
  }
  const remaining = DUE_BUSINESS_DAYS - submission.daysWaiting;
  return remaining > 0
    ? `due in ${remaining} business ${remaining === 1 ? 'day' : 'days'}`
    : 'due today';
}

/**
 * Sources silent long enough for the fallback to be offered. The orchestrator prepares
 * it; only Y can take it, because carrying stale data into a plan is a business
 * decision rather than a timeout.
 */
export function fallbackCandidates(cycle: CycleRecord): Submission[] {
  return cycle.submissions.filter(
    (s) => !s.assumed && s.versions.length === 0 && s.daysWaiting >= SLA_FALLBACK_DAYS
  );
}
