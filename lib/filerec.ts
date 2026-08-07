/**
 * The File-Recognition Agent. version2.md §9.4.
 *
 * It exists because letting stakeholders edit their own data is only safe if something
 * checks what they actually edited. Five rules:
 *
 *   1. identify the file from its columns, not its name — a closed verdict set
 *   2. diff against the issued draft, cell by cell
 *   3. check authority per changed cell; out-of-scope changes are quarantined and
 *      travel to the planner as suggestions, never rejected outright and never applied
 *   4. check magnitude — a refinery may change its own tank levels, but not to
 *      something impossible without the planner seeing it
 *   5. report to the uploader first, before it reaches the planner
 *
 * An unidentifiable file is a VERDICT, not a failure. Failure is reserved for the
 * agent actually breaking.
 */

import { loadLimits, loadStakeholders, plantOwners } from './csv';
import { thresholdFor } from './rules';
import type {
  AuthorityVerdict,
  Flag,
  RevisionChange,
  Stakeholder,
  SubmissionKind,
  ThresholdOverride,
} from './types';

/** Column signatures per known shape. Identification is by columns, never by name. */
const SHAPES: Array<{ kind: SubmissionKind; requires: string[] }> = [
  { kind: 'inventory', requires: ['bulk_plant', 'product', 'opening_inventory_kb'] },
  { kind: 'prices', requires: ['product', 'month', 'price_usd'] },
  { kind: 'demand', requires: ['refinery', 'bulk_plant', 'product', 'month', 'demand_kb'] },
];

export type Recognised = SubmissionKind | 'unrecognised';

/** Rule 1. Derives the shape from the fields the change set touches. */
export function identify(columns: string[]): Recognised {
  const present = new Set(columns.map((c) => c.trim()));
  // Most specific signature first, so an inventory file is not read as a price file.
  const match = SHAPES.find((s) => s.requires.every((c) => present.has(c)));
  return match?.kind ?? 'unrecognised';
}

export function identifyFromChanges(changes: Array<{ field: string }>): Recognised {
  const fields = new Set(changes.map((c) => c.field));
  if (fields.has('opening_inventory_kb') || fields.has('min_level') || fields.has('max_level')) {
    return 'inventory';
  }
  if (fields.has('price_usd')) return 'prices';
  if (fields.has('demand_kb')) return 'demand';
  return 'unrecognised';
}

export const RECOGNISED_SHAPES = 'tank levels, bulk plant limits, demand, or prices';

// ------------------------------------------------------------------- authority

/** Rule 3. Field ownership plus, for a refinery, ownership of the plant in the row. */
export function checkAuthority(
  author: Stakeholder,
  change: { field: string; rowRef: string }
): { ok: boolean; reason: string } {
  if (author.ownsFields.includes('*')) return { ok: true, reason: 'planner has full authority' };

  if (!author.ownsFields.includes(change.field)) {
    const owner = loadStakeholders().find((s) => s.ownsFields.includes(change.field));
    return {
      ok: false,
      reason: `${change.field} is owned by ${owner?.name ?? 'another department'}`,
    };
  }

  // A refinery owns its fields only for the plants it operates.
  if (author.kind === 'refinery') {
    const plant = plantFromRowRef(change.rowRef);
    if (plant && !author.ownsPlants.includes(plant)) {
      const owners = plantOwners();
      return {
        ok: false,
        reason: `${plant} belongs to Refinery ${owners[plant] ?? 'another refinery'}`,
      };
    }
  }

  return { ok: true, reason: 'within your data domain' };
}

function plantFromRowRef(rowRef: string): string | null {
  const hit = rowRef.split(',').find((p) => p.trim().startsWith('bulk_plant='));
  return hit ? hit.split('=')[1].trim() : null;
}

function productFromRowRef(rowRef: string): string | null {
  const hit = rowRef.split(',').find((p) => p.trim().startsWith('product='));
  return hit ? hit.split('=')[1].trim() : null;
}

// ------------------------------------------------------------------- magnitude

/**
 * Rule 4. Would the new value trip a validation rule? Checked even when the change is
 * within authority, because "allowed to change it" is not "allowed to break it".
 */
export function checkMagnitude(
  change: { field: string; rowRef: string; before: number; after: number },
  overrides: ThresholdOverride[]
): { extreme: boolean; reason: string } {
  const plant = plantFromRowRef(change.rowRef);
  const product = productFromRowRef(change.rowRef);

  if (change.field === 'opening_inventory_kb' && plant && product) {
    const owner = plantOwners()[plant];
    const limit = loadLimits().find(
      (l) => l.refinery === owner && l.bulkPlant === plant && l.product === product
    );
    if (limit) {
      if (change.after > limit.maxLevel) {
        return {
          extreme: true,
          reason: `${change.after} kb is above the ${limit.maxLevel} kb maximum for ${product} at ${plant}`,
        };
      }
      if (change.after < limit.minLevel) {
        return {
          extreme: true,
          reason: `${change.after} kb is below the ${limit.minLevel} kb minimum for ${product} at ${plant}`,
        };
      }
    }
  }

  if (change.before > 0) {
    const swing = Math.abs(change.after - change.before) / change.before;
    const threshold = plant && product
      ? thresholdFor({ refinery: plantOwners()[plant] ?? '', bulkPlant: plant, product }, overrides).value
      : 0.5;
    if (swing > threshold) {
      return {
        extreme: true,
        reason: `${change.before} → ${change.after} is a ${Math.round(swing * 100)}% move, past the ${Math.round(threshold * 100)}% threshold`,
      };
    }
  }

  return { extreme: false, reason: 'within normal range' };
}

// ------------------------------------------------------------------ the driver

export interface RecognitionResult {
  recognisedAs: Recognised;
  changes: RevisionChange[];
  /** Rule 5: what the uploader is told, before the planner sees anything. */
  stakeholderReport: string;
  flags: Flag[];
}

export function recogniseUpload(
  author: Stakeholder,
  raw: Array<{ field: string; rowRef: string; before: number; after: number }>,
  opts: { overrides?: ThresholdOverride[]; draftId: string }
): RecognitionResult {
  const recognisedAs = identifyFromChanges(raw);

  // Rule 1 as a verdict, not a failure.
  if (recognisedAs === 'unrecognised') {
    return {
      recognisedAs,
      changes: [],
      stakeholderReport:
        `I could not tell what this file is. The shapes I recognise are ${RECOGNISED_SHAPES}. ` +
        `Re-upload with the original column headers, or raise a comment instead and describe ` +
        `the change in words.`,
      flags: [],
    };
  }

  if (raw.length === 0) {
    return {
      recognisedAs,
      changes: [],
      stakeholderReport:
        'This file is identical to the data already in the draft — nothing changed, so there ' +
        'is nothing to submit. If you meant to approve the draft, use Approve instead.',
      flags: [],
    };
  }

  const overrides = opts.overrides ?? [];
  const changes: RevisionChange[] = raw.map((change) => {
    const authority = checkAuthority(author, change);
    if (!authority.ok) {
      return { ...change, verdict: 'out_of_scope' as AuthorityVerdict, reason: authority.reason };
    }
    const magnitude = checkMagnitude(change, overrides);
    if (magnitude.extreme) {
      return { ...change, verdict: 'extreme_value' as AuthorityVerdict, reason: magnitude.reason };
    }
    return { ...change, verdict: 'within_authority' as AuthorityVerdict, reason: authority.reason };
  });

  const within = changes.filter((c) => c.verdict === 'within_authority');
  const outOfScope = changes.filter((c) => c.verdict === 'out_of_scope');
  const extreme = changes.filter((c) => c.verdict === 'extreme_value');

  const flags: Flag[] = [
    ...outOfScope.map((c) => outOfScopeFlag(author, c, opts.draftId)),
    ...extreme.map((c) => extremeFlag(author, c, opts.draftId)),
  ];

  return { recognisedAs, changes, stakeholderReport: report(changes, within, outOfScope, extreme), flags };
}

function report(
  all: RevisionChange[],
  within: RevisionChange[],
  outOfScope: RevisionChange[],
  extreme: RevisionChange[]
): string {
  const parts = [`You changed ${all.length} ${all.length === 1 ? 'value' : 'values'}.`];

  if (within.length) {
    parts.push(`${within.length} ${within.length === 1 ? 'is' : 'are'} within your authority.`);
  }
  for (const c of outOfScope) {
    parts.push(
      `${describe(c)} — ${c.reason}, so it will travel to the planner as a suggestion rather than being applied.`
    );
  }
  for (const c of extreme) {
    parts.push(`${describe(c)} — ${c.reason}, so the planner will see it flagged.`);
  }
  if (outOfScope.length === 0 && extreme.length === 0) {
    parts.push('Nothing needs the planner’s attention beyond the normal review.');
  } else {
    parts.push('You can proceed anyway, or withdraw and re-upload.');
  }
  return parts.join(' ');
}

function describe(c: RevisionChange): string {
  const bits = c.rowRef.split(',').map((p) => p.split('=')[1] ?? p);
  return `${bits.join(' · ')} ${c.field}`;
}

function outOfScopeFlag(author: Stakeholder, c: RevisionChange, draftId: string): Flag {
  return {
    id: `OUT_OF_SCOPE_EDIT|${c.rowRef}|${c.field}`,
    source: author.name,
    file: 'draft-review upload',
    rule: 'OUT_OF_SCOPE_EDIT',
    severity: 'high',
    field: c.field,
    rowRef: c.rowRef,
    submittedValue: String(c.after),
    evidence: `${author.name} changed ${c.field} from ${c.before} to ${c.after} — ${c.reason}`,
    plainEnglish: `${author.name} does not own ${c.field}. The change is held for you rather than applied, and accepting it is recorded against you, not them.`,
    origin: 'draft_review',
    status: 'open',
    daysWaiting: 0,
    history: [],
    note: draftId,
  };
}

function extremeFlag(author: Stakeholder, c: RevisionChange, draftId: string): Flag {
  return {
    id: `EXTREME|${c.rowRef}|${c.field}`,
    source: author.name,
    file: 'draft-review upload',
    rule: 'LIMIT_BREACH',
    severity: 'high',
    field: c.field,
    rowRef: c.rowRef,
    submittedValue: String(c.after),
    evidence: `${c.before} → ${c.after}: ${c.reason}`,
    plainEnglish: `${author.name} is allowed to change this field, but the new value is outside what the reference tables permit.`,
    origin: 'draft_review',
    status: 'open',
    daysWaiting: 0,
    history: [],
    note: draftId,
  };
}
