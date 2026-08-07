/**
 * POST /api/generate — pure, stateless, no North call, no I/O.
 *
 * Calls buildPlan() TWICE: once on the rows as submitted, once with corrections
 * applied. Returns both plus the delta. That pair IS the two-column table at 3:05,
 * which is the demo's whole payoff.
 *
 * NO GATE CHECK HERE. The "all flags resolved" gate is UI state (plan §7.2). Keeping
 * this route a pure function is what makes it unit-testable — see scripts/plan.test.mjs.
 */

import { NextResponse } from 'next/server';

import { loadPlanInput } from '@/lib/csv';
import { applyCorrection, buildPlan, totalRevenue } from '@/lib/plan';
import { RULES } from '@/lib/types';
import type { GenerateRequest, GenerateResponse, PlanInput, Rule } from '@/lib/types';

/**
 * Which row each rule's correction applies to. Only HISTORICAL_DEVIATION carries a
 * materially different number — the other three resolve as "confirmed, intentional"
 * and change no data. See data/corrections.json.
 */
const CORRECTION_ROW_REF: Partial<Record<Rule, string>> = {
  HISTORICAL_DEVIATION: 'refinery=JAZAN,bulk_plant=BP-JAZAN,product=DIESEL,month=2026-10',
};

const isPlanInput = (v: unknown): v is PlanInput => {
  if (typeof v !== 'object' || v === null) return false;
  const i = v as Partial<PlanInput>;
  return (
    Array.isArray(i.demand) &&
    Array.isArray(i.prices) &&
    Array.isArray(i.limits) &&
    Array.isArray(i.inventory)
  );
};

export async function POST(request: Request) {
  let body: Partial<GenerateRequest> = {};
  try {
    body = (await request.json()) as Partial<GenerateRequest>;
  } catch {
    // An empty body is fine — the CSVs live on the server, so `input` is optional.
    body = {};
  }

  // Deviation from plan §6, deliberate: the client has no copy of the CSVs, so
  // shipping 60 rows up just to get them parsed back is pointless. Passing `input`
  // explicitly still works, which is what keeps the handler unit-testable.
  const input: PlanInput = isPlanInput(body.input) ? body.input : loadPlanInput();

  const corrections = body.corrections ?? {};
  for (const key of Object.keys(corrections)) {
    if (!RULES.includes(key as Rule)) {
      return NextResponse.json(
        { error: `unknown rule in corrections: ${key}` },
        { status: 400 }
      );
    }
  }

  // Same function, same input, applied twice. Never fork this.
  const raw = buildPlan(input);

  let correctedInput = input;
  for (const rule of RULES) {
    const value = corrections[rule];
    const rowRef = CORRECTION_ROW_REF[rule];
    if (typeof value === 'number' && rowRef) {
      correctedInput = applyCorrection(correctedInput, rowRef, value);
    }
  }
  const resolved = buildPlan(correctedInput);

  const rawRevenue = totalRevenue(raw.rows);
  const resolvedRevenue = totalRevenue(resolved.rows);

  const payload: GenerateResponse = {
    raw: raw.rows,
    resolved: resolved.rows,
    excluded: resolved.excluded,
    rawRevenue,
    resolvedRevenue,
    deltaRevenue: Number((resolvedRevenue - rawRevenue).toFixed(2)),
  };

  return NextResponse.json(payload);
}
