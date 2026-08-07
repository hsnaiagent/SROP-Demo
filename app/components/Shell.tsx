'use client';

/**
 * The application shell. version2.md §6.
 *
 * The only navigation in the app. Eight planner entries, each tied to exactly one
 * phase of the cycle, in the order the phases happen; three for a stakeholder.
 * Screens for phases not yet reached stay visible but disabled with the reason on
 * hover, so the shape of the whole process is legible from the first minute.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { CYCLE_STATUS_LABEL } from '@/lib/types';

import { useCycle, PLANNER } from '../providers';
import { Badge, Spinner } from './ui';

interface NavEntry {
  href: string;
  label: string;
  phase: number;
  /** Why the entry is disabled, or null when it is reachable. */
  block?: string | null;
  badge?: { count: number; tone: 'bad' | 'warn' | 'info' } | null;
  done?: boolean;
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const { cycle, reference, role, setRole, isPlanner, loading, error, message, clearMessage } = useCycle();
  const pathname = usePathname();

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(clearMessage, 6000);
    return () => clearTimeout(t);
  }, [message, clearMessage]);

  const identities = [PLANNER, ...(reference?.stakeholders.filter((s) => s.kind !== 'planner').map((s) => s.name) ?? [])];

  const nav = isPlanner ? plannerNav(cycle) : stakeholderNav(cycle, role);
  const openTasks = taskCount(cycle, role, isPlanner);

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-[248px] shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
        <div className="border-b border-zinc-800 px-5 py-4">
          <p className="text-sm font-semibold tracking-tight text-zinc-50">SROP Platform</p>
          <p className="mt-0.5 font-mono text-xs text-zinc-500">
            Cycle {cycle?.id ?? '—'}
            {cycle && ` · ${cycle.horizon.length}-month horizon`}
          </p>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {nav.map((entry) => {
            const active = pathname === entry.href;
            const disabled = Boolean(entry.block);
            const inner = (
              <span className="flex w-full items-center gap-2.5">
                <span
                  className={`w-4 shrink-0 font-mono text-[10px] ${
                    entry.done ? 'text-emerald-400' : 'text-zinc-600'
                  }`}
                >
                  {entry.done ? '✓' : entry.phase}
                </span>
                <span className="flex-1 truncate">{entry.label}</span>
                {entry.badge && entry.badge.count > 0 && (
                  <Badge tone={entry.badge.tone} mono>
                    {entry.badge.count}
                  </Badge>
                )}
              </span>
            );

            const base =
              'rounded-lg px-2.5 py-2 text-sm font-medium transition-colors text-left';
            if (disabled) {
              return (
                <span
                  key={entry.href}
                  title={entry.block ?? undefined}
                  className={`${base} cursor-not-allowed text-zinc-600`}
                >
                  {inner}
                </span>
              );
            }
            return (
              <Link
                key={entry.href}
                href={entry.href}
                className={`${base} ${
                  active ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100'
                }`}
              >
                {inner}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-zinc-800 px-5 py-3">
          <p className="text-[11px] leading-relaxed text-zinc-600">
            Uploads are accepted and acknowledged, then the pre-generated fixture is used. Email is
            drafted, never sent.
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950/80 px-8 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            {loading ? (
              <Spinner />
            ) : (
              <Badge tone={cycle ? 'info' : 'neutral'}>
                {cycle ? CYCLE_STATUS_LABEL[cycle.status] : 'No cycle open'}
              </Badge>
            )}
            {cycle && (
              <span className="font-mono text-xs text-zinc-500">
                phase {Math.min(7, phaseOf(cycle) + 1)} of 7
              </span>
            )}
          </div>

          <label className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Viewing as</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm font-medium text-zinc-100 outline-none focus:border-amber-500"
            >
              {identities.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {openTasks > 0 && <Badge tone="warn" mono>{openTasks}</Badge>}
          </label>
        </header>

        {(error || message) && (
          <div className="px-8 pt-4">
            {error && (
              <div className="rounded-lg border border-red-900 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">
                {error}
              </div>
            )}
            {message && !error && (
              <div className="rounded-lg border border-sky-900 bg-sky-500/10 px-4 py-2.5 text-sm text-sky-100">
                {message}
              </div>
            )}
          </div>
        )}

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ nav wiring

import { currentDraft, gate1, needsRerun, openFlags, phaseIndex } from '@/lib/gates';
import type { CycleRecord } from '@/lib/types';

const phaseOf = (cycle: CycleRecord) => phaseIndex(cycle);

function plannerNav(cycle: CycleRecord | null): NavEntry[] {
  const flags = cycle ? openFlags(cycle) : [];
  const draft = cycle ? currentDraft(cycle) : null;
  const submitted = cycle?.submissions.filter((s) => s.versions.length > 0).length ?? 0;
  const pendingReviews = cycle
    ? cycle.reviews.filter((r) => draft && r.draftId === draft.id && ['notified', 'viewed', 'escalated'].includes(r.status)).length
    : 0;
  const queue = cycle
    ? cycle.revisions.filter((r) => r.status === 'pending').length +
      cycle.comments.filter((x) => x.status === 'open').length
    : 0;

  const noCycle = cycle ? null : 'Start a cycle on Cycle Home first';

  return [
    { href: '/', label: 'Cycle Home', phase: 1, done: false },
    {
      href: '/requests',
      label: 'Requests',
      phase: 1,
      block: noCycle,
      done: Boolean(cycle?.requests.some((r) => r.status === 'sent')),
    },
    {
      href: '/submissions',
      label: 'Submissions',
      phase: 2,
      block: noCycle ?? (cycle!.requests.some((r) => r.status === 'sent') ? null : 'Send the data requests first'),
      badge: submitted > 0 ? { count: submitted, tone: 'info' } : null,
      done: Boolean(cycle && cycle.submissions.length > 0 && cycle.submissions.every((s) => s.versions.length > 0)),
    },
    {
      href: '/validation',
      label: 'Validation',
      phase: 3,
      block: noCycle ?? (cycle!.flags.length > 0 ? null : 'Run validation on the Submissions screen'),
      badge: flags.length > 0 ? { count: flags.length, tone: 'bad' } : null,
      done: Boolean(cycle && cycle.flags.length > 0 && flags.length === 0),
    },
    {
      href: '/dashboard',
      label: 'Data Dashboard',
      phase: 3,
      block: noCycle,
    },
    {
      href: '/plan',
      label: 'Master File & Plan',
      phase: 4,
      block: noCycle ?? (cycle && gate1(cycle).open ? null : `Gate 1 is closed — ${cycle ? gate1(cycle).reason : ''}`),
      done: Boolean(draft),
    },
    {
      href: '/draft-review',
      label: 'Draft SROP Review',
      phase: 6,
      block: noCycle ?? (draft?.status === 'issued' || draft?.status === 'finalized' ? null : 'Issue a draft first'),
      badge: queue > 0 ? { count: queue, tone: 'warn' } : pendingReviews > 0 ? { count: pendingReviews, tone: 'info' } : null,
      done: Boolean(cycle?.finalisedAt),
    },
    {
      href: '/history',
      label: 'History',
      phase: 7,
      block: noCycle,
      done: Boolean(cycle?.finalisedAt),
    },
  ].map((e) => ({ ...e, phase: e.phase })) as NavEntry[];
}

function stakeholderNav(cycle: CycleRecord | null, role: string): NavEntry[] {
  const submission = cycle?.submissions.find((s) => s.source === role);
  const draft = cycle ? currentDraft(cycle) : null;
  const review = cycle?.reviews.find((r) => r.stakeholder === role && draft && r.draftId === draft.id);
  const canReview = Boolean(review && draft?.status === 'issued');

  const entries: NavEntry[] = [
    { href: '/', label: 'My Tasks', phase: 1 },
  ];

  if (submission) {
    entries.push({
      href: '/submit',
      label: 'Submit Data',
      phase: 2,
      block: submission.status === 'requested' || submission.versions.length > 0 ? null : null,
      done: submission.versions.length > 0,
    });
  }

  entries.push({
    href: '/review',
    label: 'Review Draft SROP',
    phase: 6,
    block: canReview ? null : 'No draft has been issued to you yet',
    done: Boolean(review && ['approved', 'confirmed', 'deemed_approved'].includes(review.status)),
  });

  return entries;
}

/** The count next to the role switcher: what this identity actually owes. */
function taskCount(cycle: CycleRecord | null, role: string, isPlanner: boolean): number {
  if (!cycle) return 0;
  if (isPlanner) {
    const draft = currentDraft(cycle);
    return (
      openFlags(cycle).length +
      cycle.revisions.filter((r) => r.status === 'pending').length +
      cycle.comments.filter((c) => c.status === 'open').length +
      cycle.excludedDecisions.filter((d) => d.decision === 'pending').length +
      (draft && needsRerun(cycle) ? 1 : 0)
    );
  }

  let count = 0;
  const submission = cycle.submissions.find((s) => s.source === role);
  if (submission && submission.versions.length === 0 && !submission.assumed) count += 1;

  const draft = currentDraft(cycle);
  const review = cycle.reviews.find((r) => r.stakeholder === role && draft && r.draftId === draft.id);
  if (review && ['notified', 'viewed', 'escalated'].includes(review.status)) count += 1;

  count += cycle.flags.filter((f) => f.source === role && f.status === 'awaiting_response').length;
  count += cycle.comments.filter((c) => c.author === role && c.status !== 'open' && !c.resolvedAt).length;

  return count;
}
