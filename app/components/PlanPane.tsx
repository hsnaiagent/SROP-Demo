import type { GenerateResponse } from '@/lib/types';

import { formatDeltaKb, formatKb, formatMoney } from '../demo-data';

interface PlanPaneProps {
  gateOpen: boolean;
  openCount: number;
  totalFlags: number;
  refused: boolean;
  generating: boolean;
  plan: GenerateResponse | null;
  onGenerateClick: () => void;
}

export default function PlanPane({
  gateOpen,
  openCount,
  totalFlags,
  refused,
  generating,
  plan,
  onGenerateClick,
}: PlanPaneProps) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-zinc-200">SROP Plan</h2>

      <div className="flex flex-col items-start gap-2">
        <button
          type="button"
          onClick={onGenerateClick}
          className={`flex items-center gap-2 rounded-md px-5 py-3 text-base font-semibold transition-colors ${
            gateOpen
              ? 'bg-amber-500 text-zinc-950 hover:bg-amber-400'
              : 'cursor-not-allowed bg-zinc-800 text-zinc-500'
          } ${refused ? 'animate-shake' : ''}`}
        >
          {!gateOpen && <span aria-hidden>🔒</span>}
          {generating ? 'Generating…' : plan ? 'Regenerate SROP Plan' : 'Generate SROP Plan'}
        </button>
        {!gateOpen && (
          <span className="text-base text-zinc-400">
            Resolve all {totalFlags} flags to generate — {openCount} still open
          </span>
        )}
      </div>

      {plan && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <span className="text-base text-zinc-400">Total revenue</span>
            <span className="font-mono text-2xl text-zinc-100">
              {formatMoney(plan.rawRevenue)} → {formatMoney(plan.resolvedRevenue)}
            </span>
            <span
              className={`font-mono text-2xl font-semibold ${
                plan.deltaRevenue < 0 ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              {plan.deltaRevenue < 0 ? '' : '+'}
              {formatMoney(plan.deltaRevenue)}
            </span>
          </div>

          <div className="max-h-[28rem] overflow-auto rounded-lg border border-zinc-800">
            <table className="w-full min-w-[36rem] border-collapse text-base">
              <thead className="sticky top-0 bg-zinc-900 text-base uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="px-3 py-2 text-left">Month</th>
                  <th className="px-3 py-2 text-left">Refinery</th>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-right">Submitted</th>
                  <th className="px-3 py-2 text-right">Validated</th>
                  <th className="px-3 py-2 text-right">Δ</th>
                </tr>
              </thead>
              <tbody>
                {/* Excluded rows first — LPG-95 must be visible without scrolling the table. */}
                {plan.excluded.map((key) => {
                  const [refinery, bulkPlant, product] = key.split('|');
                  return (
                    <tr key={key} className="border-t border-zinc-800 text-zinc-500">
                      <td className="px-3 py-2 font-mono">—</td>
                      <td className="px-3 py-2">{refinery}</td>
                      <td className="px-3 py-2">
                        {product} <span className="text-sm">({bulkPlant})</span>
                      </td>
                      <td colSpan={3} className="px-3 py-2 text-right italic">
                        excluded — no reference limits
                      </td>
                    </tr>
                  );
                })}
                {plan.raw.map((row, i) => {
                  const resolved = plan.resolved[i];
                  const delta = Number((resolved.production - row.production).toFixed(1));
                  const changed = delta !== 0;
                  return (
                    <tr
                      key={`${row.month}-${row.refinery}-${row.product}`}
                      className={`border-t border-zinc-800 ${changed ? 'bg-amber-500/10' : ''}`}
                    >
                      <td className="px-3 py-2 font-mono">{row.month}</td>
                      <td className="px-3 py-2">{row.refinery}</td>
                      <td className="px-3 py-2">{row.product}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatKb(row.production)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatKb(resolved.production)}</td>
                      <td
                        className={`px-3 py-2 text-right font-mono ${
                          changed ? 'font-semibold text-amber-400' : 'text-zinc-600'
                        }`}
                      >
                        {formatDeltaKb(delta)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
