/**
 * The single source of truth for shapes in this app. Everything imports from here.
 *
 * Version 2 keeps every version 1 type that still earns its place and adds the
 * cycle model from version2.md §3. The validation half no longer speaks to an
 * external agent platform, so the `Raw*` wire types are gone — flags are produced
 * by `lib/rules.ts` in this process and are already camelCase.
 */

// ---------------------------------------------------------------- domain enums

export type Rule =
  | 'HISTORICAL_DEVIATION'
  | 'LIMIT_BREACH'
  | 'ZERO_OR_MISSING'
  | 'UNKNOWN_ENTITY'
  | 'CROSS_SOURCE_CONFLICT'
  | 'OUT_OF_SCOPE_EDIT';

export const RULES: readonly Rule[] = [
  'HISTORICAL_DEVIATION',
  'LIMIT_BREACH',
  'ZERO_OR_MISSING',
  'UNKNOWN_ENTITY',
  'CROSS_SOURCE_CONFLICT',
  'OUT_OF_SCOPE_EDIT',
] as const;

export const RULE_LABEL: Record<Rule, string> = {
  HISTORICAL_DEVIATION: 'historical deviation',
  LIMIT_BREACH: 'limit breach',
  ZERO_OR_MISSING: 'zero or missing',
  UNKNOWN_ENTITY: 'unknown entity',
  CROSS_SOURCE_CONFLICT: 'cross-source conflict',
  OUT_OF_SCOPE_EDIT: 'out-of-scope edit',
};

export type Severity = 'high' | 'medium' | 'low';

/**
 * open ──send query──▶ awaiting_response ──reply──▶ responded ──accept──▶ corrected
 *   │                        └──SLA expiry──▶ escalated ──┘
 *   ├──justify (note required, empty rejected)──────────────────────────▶ justified
 *   └──edit directly (note required)────────────────────────────────────▶ corrected
 *
 * Gate 1 opens when no flag is open, awaiting_response, responded or escalated.
 */
export type FlagStatus =
  | 'open'
  | 'awaiting_response'
  | 'responded'
  | 'escalated'
  | 'justified'
  | 'corrected'
  | 'superseded';

export const OPEN_FLAG_STATUSES: readonly FlagStatus[] = [
  'open',
  'awaiting_response',
  'responded',
  'escalated',
] as const;

export type FlagOrigin = 'validation' | 'draft_review' | 'intake';

// -------------------------------------------------------------- the directory

export type StakeholderKind = 'planner' | 'department' | 'refinery';

export interface Stakeholder {
  id: string;
  name: string;
  kind: StakeholderKind;
  refinery?: string;
  email: string;
  escalationContact: string | null;
  ownsPlants: string[];
  /** `['*']` for the planner. Field names match the CSV column names. */
  ownsFields: string[];
  submits: SubmissionKind[];
}

export type SubmissionKind = 'demand' | 'prices' | 'inventory';

// ------------------------------------------------------------------ the cycle

export type CycleStatus =
  | 'not_started'
  | 'requests_drafted'
  | 'requests_sent'
  | 'collecting'
  | 'validating'
  | 'triage'
  | 'consolidating'
  | 'plan_ready'
  | 'draft_issued'
  | 'revision'
  | 'final_approved'
  | 'archived';

export const CYCLE_STATUS_LABEL: Record<CycleStatus, string> = {
  not_started: 'Not started',
  requests_drafted: 'Requests drafted',
  requests_sent: 'Requests sent',
  collecting: 'Collecting submissions',
  validating: 'Validating',
  triage: 'In triage',
  consolidating: 'Consolidating',
  plan_ready: 'Draft generated',
  draft_issued: 'Draft under review',
  revision: 'Revision round',
  final_approved: 'Final approved',
  archived: 'Archived',
};

export type SubmissionStatus =
  | 'requested'
  | 'reminded'
  | 'escalated'
  | 'submitted'
  | 'validating'
  | 'flagged'
  | 'resolving'
  | 'clean'
  | 'assumed';

export type ReviewStatus =
  | 'notified'
  | 'viewed'
  | 'approved'
  | 'update_submitted'
  | 'comment_submitted'
  | 'escalated'
  | 'planner_reviewed'
  | 'deemed_approved'
  | 'confirmed';

export interface Request {
  id: string;
  recipient: string;
  email: string;
  items: string[];
  dueDate: string;
  emailDraft: EmailDraft;
  origin: 'standard' | 'new';
  reviewed: boolean;
  status: 'draft' | 'sent';
  sentAt: string | null;
  remindedAt: string | null;
  escalatedAt: string | null;
}

export interface SubmissionFile {
  name: string;
  kind: 'csv' | 'xlsx';
  sizeKb: number;
  rowCount: number;
  columns: string[];
}

export interface SubmissionVersion {
  n: number;
  receivedAt: string;
  note: string;
  files: SubmissionFile[];
}

export interface Submission {
  id: string;
  source: string;
  kind: SubmissionKind;
  status: SubmissionStatus;
  requestedAt: string | null;
  /** Business days elapsed since the request. Advanced by the demo clock control. */
  daysWaiting: number;
  versions: SubmissionVersion[];
  crossSourcePending: boolean;
  assumed: boolean;
  includedInMasterAt: string | null;
}

export interface FlagHistoryEntry {
  at: string;
  actor: string;
  from: FlagStatus;
  to: FlagStatus;
  note?: string;
}

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
  /** Carries BOTH numbers. Never optional — it is the credibility claim. */
  evidence: string;
  plainEnglish: string;

  origin: FlagOrigin;
  status: FlagStatus;
  note?: string;
  correctedValue?: string;
  /** Set when a reply has arrived but has not yet been accepted. */
  response?: string;
  /** Filled by lib/impact.ts at the moment a correction is confirmed. */
  impact?: PlanImpact;
  daysWaiting: number;
  history: FlagHistoryEntry[];
}

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
}

export interface ThresholdOverride {
  id: string;
  scope: 'series' | 'product' | 'plant';
  key: string;
  deviation: number;
  reason: string;
  setBy: string;
  setAt: string;
}

export interface Comment {
  id: string;
  draftId: string;
  author: string;
  rowRef: string;
  quotedValue: string;
  text: string;
  proposedValue: number | null;
  status: 'open' | 'accepted' | 'declined';
  plannerResponse: string | null;
  resolvedAt: string | null;
}

export type RevisionChannel = 'upload' | 'comment' | 'chat';

export type AuthorityVerdict = 'within_authority' | 'out_of_scope' | 'extreme_value';

export interface RevisionChange {
  field: string;
  rowRef: string;
  before: number;
  after: number;
  verdict: AuthorityVerdict;
  reason: string;
}

export interface Revision {
  id: string;
  draftId: string;
  author: string;
  channel: RevisionChannel;
  fileName: string | null;
  /** The File-Recognition Agent's identification of the uploaded shape. */
  recognisedAs: SubmissionKind | 'unrecognised' | null;
  changes: RevisionChange[];
  text: string | null;
  status: 'pending' | 'accepted' | 'declined';
  plannerNote: string | null;
  resolvedAt: string | null;
}

export interface MasterSheet {
  name: string;
  rowCount: number;
  columns: string[];
  /** Which submission and version each sheet came from. */
  sourceTrace: string;
  rows: string[][];
}

export interface MasterFile {
  builtAt: string;
  builtFromFlagCount: number;
  sheets: MasterSheet[];
  stale: boolean;
  staleReason: string | null;
  approvedByPlanner: boolean;
  approvedAt: string | null;
}

export interface DraftChange {
  rowRef: string;
  before: number;
  after: number;
  causedBy: string;
}

export interface Draft {
  id: string;
  version: number;
  generatedAt: string;
  planRows: PlanRow[];
  excluded: ExcludedSeries[];
  totalRevenue: number;
  totalVolume: number;
  shortfallRowCount: number;
  bandBreachRowCount: number;
  changesFromPrevious: DraftChange[];
  status: 'generated' | 'issued' | 'superseded' | 'finalized';
  issuedAt: string | null;
}

export interface StakeholderReview {
  id: string;
  draftId: string;
  stakeholder: string;
  status: ReviewStatus;
  respondedAt: string | null;
  daysWaiting: number;
  note: string | null;
}

export interface AuditEntry {
  at: string;
  actor: string;
  action: string;
  target: string;
  note: string;
}

export interface LearnedJustification {
  key: string;
  rule: Rule;
  reason: string;
  cycleId: string;
  timesApplied: number;
}

export interface CycleRecord {
  id: string;
  status: CycleStatus;
  horizon: string[];
  createdAt: string;
  requests: Request[];
  submissions: Submission[];
  flags: Flag[];
  thresholdOverrides: ThresholdOverride[];
  masterFile: MasterFile | null;
  drafts: Draft[];
  reviews: StakeholderReview[];
  comments: Comment[];
  revisions: Revision[];
  excludedDecisions: ExcludedDecision[];
  learned: LearnedJustification[];
  emails: SentEmail[];
  chat: ChatMessage[];
  finalisedAt: string | null;
  audit: AuditEntry[];
}

export interface ExcludedDecision {
  key: string;
  decision: 'pending' | 'limits_added' | 'exclusion_confirmed';
  reason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface SentEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  sentAt: string;
  kind: 'request' | 'reminder' | 'escalation' | 'flag_query' | 'draft' | 'final' | 'decline';
  relatedTo: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'planner' | 'orchestrator';
  text: string;
  at: string;
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

export interface OutageRow {
  bulkPlant: string;
  month: string;
  outageDays: number;
}

export interface PlanInput {
  demand: DemandRow[];
  prices: PriceRow[];
  limits: LimitRow[];
  inventory: InventoryRow[];
  /** `REFINERY|PLANT|PRODUCT` -> 12-month historical mean. Reasonableness tab. */
  baseline?: Record<string, number>;
  /** `REFINERY|PLANT|PRODUCT|MONTH` -> last cycle's value. May be absent. */
  lastCycle?: Record<string, number>;
  /** Bulk plants whose data was carried forward after a non-response. */
  assumedPlants?: string[];
}

// ----------------------------------------------------------------- plan outputs

export interface PlanRow {
  month: string;
  refinery: string;
  /** Limits are defined per bulk plant, so a row without this cannot be checked. */
  bulkPlant: string;
  product: string;
  demand: number;
  opening: number;
  production: number;
  closing: number;
  shortfall: number;
  capacity: number;
  minLevel: number;
  maxLevel: number;
  price: number;
  revenue: number;
  baselineMean: number | null;
  lastCycleValue: number | null;
  assumed: boolean;
}

export interface ExcludedSeries {
  key: string;
  refinery: string;
  bulkPlant: string;
  product: string;
  months: string[];
  /** The volume at stake, so the row states a consequence rather than a fact. */
  demandKb: number;
  reason: string;
}

export interface PlanResult {
  rows: PlanRow[];
  excluded: ExcludedSeries[];
}

export interface PlanImpact {
  rowRef: string;
  productionDelta: number;
  revenueDelta: number;
  monthLabel: string;
  plantLabel: string;
  /** False when the field does not reach the plan at all. */
  reachesPlan: boolean;
}

// --------------------------------------------------------------- view controls

export type PlanTab = 'feasibility' | 'reasonableness';

export type PivotView =
  | 'series'
  | 'refinery'
  | 'product'
  | 'price'
  | 'revenue'
  | 'inventory';

export const PIVOT_LABEL: Record<PivotView, string> = {
  series: 'Series by month',
  refinery: 'Volume by refinery',
  product: 'Volume by product',
  price: 'Price by product',
  revenue: 'Revenue by refinery',
  inventory: 'Inventory by bulk plant',
};

export interface Filters {
  refinery: string;
  bulkPlant: string;
  product: string;
  month: string;
}

export const NO_FILTER = 'all';

export const EMPTY_FILTERS: Filters = {
  refinery: NO_FILTER,
  bulkPlant: NO_FILTER,
  product: NO_FILTER,
  month: NO_FILTER,
};

// ------------------------------------------------------------------- API shapes

export interface ValidateResult {
  flags: Flag[];
  cleanSources: string[];
  summary: string;
}

export interface ReferenceData {
  limits: LimitRow[];
  outage: OutageRow[];
  baseline: Record<string, number>;
  baselineSeries: Record<string, Array<{ month: string; value: number }>>;
  stakeholders: Stakeholder[];
  lastCycle: Record<string, number>;
  requestTemplate: Array<{ recipient: string; items: string[] }>;
  /** Planning horizon months — used for pre-submission dashboard rows. */
  horizon: string[];
  /** Fixture submission data; planner corrections are applied via `resolvedPlanInput`. */
  planInput: PlanInput;
}

export interface CyclePayload {
  cycle: CycleRecord;
  reference: ReferenceData;
}
