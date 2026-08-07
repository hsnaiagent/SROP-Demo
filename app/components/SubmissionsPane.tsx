import type { SubmissionMeta } from '@/lib/csv';

import { ARRIVAL_TIMES } from '../demo-data';

export type ValidationPhase = 'idle' | 'validating' | 'triage' | 'planned';

interface SubmissionsPaneProps {
  submissions: SubmissionMeta[] | null;
  phase: ValidationPhase;
  flagCountBySource: Record<string, number>;
  cleanSources: string[];
  error: string | null;
  onRunValidation: () => void;
}

function StatusDot({
  phase,
  loaded,
  flagCount,
  clean,
}: {
  phase: ValidationPhase;
  loaded: boolean;
  flagCount: number;
  clean: boolean;
}) {
  if (phase === 'validating') {
    return (
      <span
        aria-hidden
        className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400"
      />
    );
  }

  if ((phase === 'triage' || phase === 'planned') && loaded) {
    if (clean) {
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
          ✓
        </span>
      );
    }
    return (
      <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500/20 px-1.5 font-mono text-sm text-red-400">
        {flagCount}
      </span>
    );
  }

  return <span aria-hidden className="h-3 w-3 rounded-full bg-zinc-600" />;
}

export default function SubmissionsPane({
  submissions,
  phase,
  flagCountBySource,
  cleanSources,
  error,
  onRunValidation,
}: SubmissionsPaneProps) {
  const loaded = submissions !== null;
  const revealed = phase === 'triage' || phase === 'planned';

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-zinc-200">Submissions</h2>
        <button
          type="button"
          onClick={onRunValidation}
          disabled={!loaded || phase === 'validating' || revealed}
          className="rounded-md bg-amber-500 px-4 py-2 text-base font-medium text-zinc-950 transition-colors disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          {phase === 'validating' ? 'Validating…' : revealed ? 'Validated' : 'Run Validation'}
        </button>
      </div>

      {error && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-base text-red-300">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(submissions ?? Array.from({ length: 4 })).map((sub, i) => {
          const meta = sub as SubmissionMeta | undefined;
          const source = meta?.source ?? '—';
          const clean = cleanSources.includes(source);
          const flagCount = flagCountBySource[source] ?? 0;

          return (
            <div
              key={meta?.file ?? i}
              className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-zinc-100">{source}</span>
                <StatusDot phase={phase} loaded={loaded} flagCount={flagCount} clean={clean} />
              </div>
              <span className="font-mono text-base text-zinc-400">{meta?.file ?? 'loading…'}</span>
              <span className="text-base text-zinc-500">Arrived {ARRIVAL_TIMES[i]}</span>
              <span className="font-mono text-base text-zinc-400">
                {meta ? `${meta.rowCount} rows` : '—'}
              </span>
              {/* Job 1 rests on the judges SEEING that these headers differ between
                  files. Truncated 14px grey text would have hidden the whole point. */}
              <span className="font-mono text-base leading-snug break-words text-zinc-400" title={meta?.columns.join(', ')}>
                {meta?.columns.join(', ') ?? '—'}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
