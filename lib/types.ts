/**
 * The single source of truth for shapes in this app. Everything imports from here.
 *
 * The North-facing half is typed against `scripts/out/last-execution.json` — a real
 * response from execution `ad8dc141` — and NOT against the schema in the plan's §5.
 * They happen to agree this time, but the artifact is what actually arrived.
 *
 * North speaks snake_case. Everything below the `Raw*` types is camelCase, and the
 * mapping happens exactly once, at the route-handler boundary (`lib/north.ts`).
 * snake_case must never reach a component.
 */

// ---------------------------------------------------------------- domain enums

export type Rule =
  | 'HISTORICAL_DEVIATION'
  | 'LIMIT_BREACH'
  | 'ZERO_OR_MISSING'
  | 'UNKNOWN_ENTITY';

export const RULES: readonly Rule[] = [
  'HISTORICAL_DEVIATION',
  'LIMIT_BREACH',
  'ZERO_OR_MISSING',
  'UNKNOWN_ENTITY',
] as const;

export type Severity = 'high' | 'medium' | 'low';

/**
 * open ──send query──▶ awaiting_response ──simulate──▶ responded ──accept──▶ corrected
 *   └──justify (note required, empty rejected)──────────────────────────────▶ justified
 *
 * The gate in Pane 3 opens when no flag is `open`, `awaiting_response` or `responded`.
 */
export type FlagStatus =
  | 'open'
  | 'awaiting_response'
  | 'responded'
  | 'justified'
  | 'corrected';

/** The four stakeholders. Matches the `source` enum in the North output schema. */
export type SourceName =
  | 'OSPAS'
  | 'Demand Planning'
  | 'Refinery YANBU'
  | 'Refinery JAZAN';

// ------------------------------------------------------- North wire types (raw)

/** Exactly the keys observed in `nodes[].output.data.flags[]`. */
export interface RawFlag {
  id: string;
  source: string;
  file: string;
  rule: string;
  severity: string;
  field: string;
  row_ref: string;
  submitted_value: string;
  evidence: string;
  plain_english: string;
}

export interface RawValidatePayload {
  flags: RawFlag[];
  clean_sources: string[];
  summary: string;
}

/**
 * A node's output is NOT the bare schema object. Even an LLM node comes back in the
 * agent envelope; the structured payload sits at `.data`, duplicated as a JSON string
 * at `.text`. See CHECKLIST G-new-5.
 */
export interface RawNodeOutput {
  kind: string;
  conversation_id: string | null;
  rendered_prompt?: string;
  text?: string;
  data?: RawValidatePayload;
  chat_response?: unknown;
  error?: unknown;
}

export interface RawExecutionNode {
  node_id: string;
  status: string;
  output: RawNodeOutput | string | null;
  started_at?: string;
  ended_at?: string;
  duration_seconds?: number;
}

export type ExecutionStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface RawExecution {
  id: string;
  automation_id: string;
  automation_version_id?: string;
  status: ExecutionStatus;
  queued_at?: string;
  started_at?: string;
  ended_at?: string;
  run_time_seconds?: number;
  nodes?: RawExecutionNode[];
}

/** From `GET /api/v1/automations/{id}`. `input_id` is generated — never the name. */
export interface RawInputParameter {
  input_id: string;
  name: string;
  input_type: string;
  required: boolean;
  description?: string;
}

// --------------------------------------------------------------- app-side types

export interface Flag {
  id: string;
  source: string;
  file: string;
  rule: Rule;
  severity: Severity;
  field: string;
  /** e.g. `refinery=JAZAN,bulk_plant=BP-JAZAN,product=DIESEL,month=2026-10` */
  rowRef: string;
  submittedValue: string;
  /** Carries BOTH numbers. Never optional — it is the credibility claim at 1:05. */
  evidence: string;
  plainEnglish: string;

  // Client-side only, added on arrival. Never sent by North.
  status: FlagStatus;
  note?: string;
  correctedValue?: string;
}

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
}

export interface ValidateResponse {
  flags: Flag[];
  cleanSources: string[];
  summary: string;
  /** Keyed by flag id. Empty until Node 2 (`draft_emails`) exists. */
  emails: Record<string, EmailDraft>;
}

// ------------------------------------------------------------------ plan inputs

export interface DemandRow {
  refinery: string;
  bulkPlant: string;
  product: string;
  /** `YYYY-MM`, sorts lexicographically. */
  month: string;
  demandKb: number;
}

export interface PriceRow {
  product: string;
  month: string;
  priceUsd: number;
}

export interface LimitRow {
  refinery: string;
  bulkPlant: string;
  product: string;
  minLevel: number;
  maxLevel: number;
  capacity: number;
}

export interface InventoryRow {
  bulkPlant: string;
  product: string;
  openingInventoryKb: number;
}

export interface PlanInput {
  demand: DemandRow[];
  prices: PriceRow[];
  limits: LimitRow[];
  inventory: InventoryRow[];
}

// ----------------------------------------------------------------- plan outputs

export interface PlanRow {
  month: string;
  refinery: string;
  product: string;
  production: number;
  closing: number;
  shortfall: number;
  revenue: number;
}

export interface PlanResult {
  rows: PlanRow[];
  /**
   * Series with no matching row in ref_limits.csv — they cannot be planned.
   * LPG-95 lands here: it gets *justified*, not removed, so it survives into the
   * resolved dataset with no limits and no price. Pane 3 should show it as an
   * explicit "excluded — no reference limits" row rather than drop it silently.
   */
  excluded: string[];
}

export interface GenerateResponse {
  raw: PlanRow[];
  resolved: PlanRow[];
  excluded: string[];
  rawRevenue: number;
  resolvedRevenue: number;
  deltaRevenue: number;
}

/** Body of `POST /api/generate`. Corrections are keyed by `Rule`, not by flag id. */
export interface GenerateRequest {
  input: PlanInput;
  corrections: Partial<Record<Rule, number>>;
}
