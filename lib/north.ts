/**
 * The North client. A direct port of scripts/north.mjs + probe-2-execute.mjs, which
 * are proven against the live instance — do not rewrite the sequence from scratch.
 *
 * Server-only. NORTH_TOKEN must never be prefixed NEXT_PUBLIC_; it would ship to the
 * browser. Nothing here prints the token, and error bodies are redacted before they
 * are surfaced.
 *
 * Three things this file exists to get right, each of which cost real time to learn:
 *
 *   1. `inputs` is keyed by input_id, and input_id is NOT the name you typed in the
 *      builder. Resolve it at runtime from GET /automations/{id}.        (G-new-4)
 *   2. A node's output is the agent envelope, not the bare schema object. The
 *      payload is at `.data`, duplicated as a string at `.text`.         (G-new-5)
 *   3. There is no upload step. The CSVs go in as text.                  (v2.0.0)
 */

// NB: no `import 'server-only'` — that package isn't installed and Block 4's scope
// rule is no new dependencies. This module reads fs and NORTH_TOKEN, so it must only
// ever be imported from a route handler or a server component. Never from 'use client'.

import { buildReferenceText, buildSubmissionsText } from './csv';
import { RULES } from './types';
import type {
  EmailDraft,
  Flag,
  RawExecution,
  RawInputParameter,
  RawValidatePayload,
  Rule,
  Severity,
  ValidateResponse,
} from './types';

const HOST = process.env.NORTH_HOST ?? 'zhoom.democloud.cohere.com';
const BASE = `https://${HOST}/api/v1`;

const POLL_MS = 2_000;
/** A healthy run is ~27s. 120s is ample; keep it overridable anyway. */
const TIMEOUT_MS = Number(process.env.NORTH_TIMEOUT_MS ?? 120_000);

/** Cap the flag list. A runaway list breaks the "3 of 4 flags open" counter. */
const MAX_FLAGS = 6;

const SOURCE_LABEL =
  'OSPAS demand + Demand Planning prices + Yanbu/Jazan inventory';

export const isMockMode = () =>
  process.env.MOCK_MODE === '1' || process.env.NEXT_PUBLIC_MOCK === '1';

// --------------------------------------------------------------------- helpers

export class NorthError extends Error {
  // Declared as fields, not constructor parameter properties: Node's strip-only
  // type stripping (`node --experimental-strip-types`, which the tests use) rejects
  // parameter properties outright. Keep this shape or scripts/north.test.mjs breaks.
  status?: number;
  detail?: string;

  constructor(message: string, status?: number, detail?: string) {
    super(message);
    this.name = 'NorthError';
    this.status = status;
    this.detail = detail;
  }
}

const authHeaders = (extra: Record<string, string> = {}) => {
  const token = process.env.NORTH_TOKEN;
  if (!token) {
    throw new NorthError(
      'NORTH_TOKEN is not set. Put it in .env.local, or run with MOCK_MODE=1.'
    );
  }
  return { Authorization: `Bearer ${token}`, ...extra };
};

/** Redact anything token-shaped before a response body reaches a log or the client. */
const safe = (text: string): string => {
  const token = process.env.NORTH_TOKEN;
  const redacted = text.replace(/Bearer\s+[\w.\-]+/gi, 'Bearer <redacted>');
  return token ? redacted.split(token).join('<redacted>') : redacted;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isRule = (v: string): v is Rule => (RULES as readonly string[]).includes(v);
const asSeverity = (v: string): Severity =>
  v === 'high' || v === 'medium' || v === 'low' ? v : 'medium';

// ------------------------------------------------------------------- unwrapping

/**
 * Same order as probe-2-execute.mjs and scripts/make-mock.mjs: agent envelope
 * first, then a bare object, then a JSON string as a last resort. Keep all three —
 * the bare-object branch is what catches the platform changing its mind.
 */
export function unwrapPayload(output: unknown): RawValidatePayload | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;

  if (Array.isArray(o.flags)) return o as unknown as RawValidatePayload;

  const data = o.data as Record<string, unknown> | undefined;
  if (data && Array.isArray(data.flags)) return data as unknown as RawValidatePayload;

  if (typeof o.text === 'string') {
    try {
      const parsed = JSON.parse(o.text) as Record<string, unknown>;
      if (Array.isArray(parsed.flags)) return parsed as unknown as RawValidatePayload;
    } catch {
      /* not JSON — fall through */
    }
  }
  return null;
}

/**
 * snake_case → camelCase, exactly once, right here. Nothing below this function
 * should ever see a snake_case key.
 *
 * Also filters to the four known rule names: a fifth invented name would break the
 * UI's grouping, and temperature 0 plus enums is not a hard guarantee.
 */
export function toValidateResponse(
  payload: RawValidatePayload,
  emails: Record<string, EmailDraft> = {}
): ValidateResponse {
  const flags: Flag[] = payload.flags
    .filter((f) => isRule(f.rule))
    .slice(0, MAX_FLAGS)
    .map((f) => ({
      id: f.id,
      source: f.source,
      file: f.file,
      rule: f.rule as Rule,
      severity: asSeverity(f.severity),
      field: f.field,
      rowRef: f.row_ref,
      submittedValue: f.submitted_value,
      evidence: f.evidence,
      plainEnglish: f.plain_english,
      status: 'open',
    }));

  return {
    flags,
    cleanSources: payload.clean_sources ?? [],
    summary: payload.summary ?? '',
    emails,
  };
}

// ----------------------------------------------------------------- north calls

async function call(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = safe(await res.text()).slice(0, 600);
    throw new NorthError(`${init?.method ?? 'GET'} ${url} -> HTTP ${res.status}`, res.status, body);
  }
  return res;
}

/**
 * name → input_id. Sending the display name yields
 * `400 AUTOMATION_MISSING_REQUIRED_INPUTS` naming that very input, which reads
 * exactly like the input does not exist.
 */
export async function resolveInputIds(automationId: string): Promise<Map<string, string>> {
  const res = await call(`${BASE}/automations/${automationId}`, { headers: authHeaders() });
  const automation = (await res.json()) as { input_parameters?: RawInputParameter[] };
  const params = automation.input_parameters ?? [];

  if (params.length === 0) {
    throw new NorthError('automation reports no input_parameters — was it published with its inputs?');
  }
  return new Map(params.map((p) => [p.name, p.input_id]));
}

async function poll(executionId: string, startedAt: number): Promise<RawExecution> {
  const TERMINAL = ['completed', 'failed', 'cancelled'];

  for (;;) {
    const res = await call(
      `${BASE}/automations/executions/${executionId}?include_nodes=true`,
      { headers: authHeaders() }
    );
    const execution = (await res.json()) as RawExecution;

    if (TERMINAL.includes(execution.status)) return execution;

    if (Date.now() - startedAt > TIMEOUT_MS) {
      throw new NorthError(
        `execution ${executionId} still "${execution.status}" after ${Math.round(TIMEOUT_MS / 1000)}s. ` +
          `It may still finish — re-attach with: node scripts/probe-2-execute.mjs --execution ${executionId}`
      );
    }
    await sleep(POLL_MS);
  }
}

// ------------------------------------------------------------------ public API

/**
 * Runs the validator end to end and returns a UI-ready response.
 *
 * In MOCK_MODE this returns lib/mock/validate-response.json instead. Because both
 * paths are typed as ValidateResponse, the compiler guarantees they agree — which
 * is precisely the bug that otherwise surfaces when you flip to live North at
 * hour 11.
 */
export async function validate(): Promise<ValidateResponse> {
  if (isMockMode()) {
    const mock = (await import('./mock/validate-response.json')).default;
    return mock as ValidateResponse;
  }

  const automationId = process.env.NORTH_AUTOMATION_ID;
  if (!automationId) {
    throw new NorthError('NORTH_AUTOMATION_ID is not set. See PROBE-AUTOMATION.md.');
  }

  const idByName = await resolveInputIds(automationId);
  const idFor = (name: string) => {
    const id = idByName.get(name);
    if (!id) {
      throw new NorthError(
        `no input named "${name}" on the published automation. Available: ${[...idByName.keys()].join(', ')}`
      );
    }
    return id;
  };

  const payload = {
    inputs: {
      [idFor('submissions_text')]: { type: 'text', value: buildSubmissionsText() },
      [idFor('reference_text')]: { type: 'text', value: buildReferenceText() },
      [idFor('source_label')]: { type: 'text', value: SOURCE_LABEL },
    },
  };

  const startedAt = Date.now();
  const res = await call(`${BASE}/automations/${automationId}/execute`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const started = (await res.json()) as RawExecution;

  const execution = await poll(started.id, startedAt);

  if (execution.status !== 'completed') {
    throw new NorthError(`execution finished with status "${execution.status}"`);
  }

  for (const node of execution.nodes ?? []) {
    const unwrapped = unwrapPayload(node.output);
    if (unwrapped) return toValidateResponse(unwrapped, extractEmails(execution));
  }

  throw new NorthError('no node returned a flags[] array — structured output was not honoured');
}

/**
 * Node 2 (`draft_emails`) does not exist yet, so this returns {} today. Wiring it up
 * later means finding the node whose payload has an `emails`-shaped array; the UI
 * already falls back to a template when a flag has no draft.
 */
function extractEmails(execution: RawExecution): Record<string, EmailDraft> {
  const emails: Record<string, EmailDraft> = {};

  for (const node of execution.nodes ?? []) {
    const output = node.output;
    if (!output || typeof output !== 'object') continue;

    const data = (output as unknown as Record<string, unknown>).data as
      | Record<string, unknown>
      | undefined;
    const list = (data?.emails ?? data?.drafts) as unknown;
    if (!Array.isArray(list)) continue;

    for (const item of list) {
      const e = item as Record<string, unknown>;
      const flagId = typeof e.flag_id === 'string' ? e.flag_id : undefined;
      if (!flagId) continue;
      emails[flagId] = {
        to: String(e.to ?? ''),
        subject: String(e.subject ?? ''),
        body: String(e.body ?? ''),
      };
    }
  }
  return emails;
}
