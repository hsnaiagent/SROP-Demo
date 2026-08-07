/**
 * The cycle store. version2.md §3.
 *
 * One JSON file per cycle. The platform owns all state — no agent holds any — so
 * this is the only place anything is written, and every write appends to the audit
 * trail. Writes are serialized through one promise chain because two role identities
 * acting a second apart must not clobber each other.
 *
 * State lives OUTSIDE `data/` on purpose. `data/` is the read-only fixture set, and
 * writing into it mid-demo makes the Next dev server's file watcher reload the page.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import type { AuditEntry, CycleRecord } from './types';

const STATE_DIR = path.join(process.cwd(), '.srop-state');

const cycleFile = (id: string) => path.join(STATE_DIR, `cycle-${id}.json`);

/** The demo runs one cycle. Its horizon is the four months from here. */
export const ACTIVE_CYCLE_ID = '2026-09';

export const HORIZON = ['2026-09', '2026-10', '2026-11', '2026-12'];

async function ensureDir() {
  await fs.mkdir(STATE_DIR, { recursive: true });
}

export async function readCycle(id: string = ACTIVE_CYCLE_ID): Promise<CycleRecord | null> {
  try {
    return JSON.parse(await fs.readFile(cycleFile(id), 'utf8')) as CycleRecord;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function listCycles(): Promise<CycleRecord[]> {
  try {
    const names = await fs.readdir(STATE_DIR);
    const cycles = await Promise.all(
      names
        .filter((n) => n.startsWith('cycle-') && n.endsWith('.json'))
        .map(async (n) => JSON.parse(await fs.readFile(path.join(STATE_DIR, n), 'utf8')) as CycleRecord)
    );
    return cycles.sort((a, b) => b.id.localeCompare(a.id));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

/**
 * Every mutation goes through here, one at a time. The callback gets a deep copy it
 * can edit freely; whatever it returns is what lands on disk.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

export function mutate(
  id: string,
  fn: (cycle: CycleRecord) => void | Promise<void>
): Promise<CycleRecord> {
  const run = async (): Promise<CycleRecord> => {
    const current = await readCycle(id);
    if (!current) throw new Error(`cycle ${id} does not exist`);
    const draft = structuredClone(current);
    await fn(draft);
    await ensureDir();
    await fs.writeFile(cycleFile(id), `${JSON.stringify(draft, null, 2)}\n`, 'utf8');
    return draft;
  };

  const next = writeQueue.then(run, run);
  // Keep the chain alive even if this mutation rejects, so one failure does not
  // deadlock every later write.
  writeQueue = next.catch(() => undefined);
  return next;
}

export async function saveCycle(cycle: CycleRecord): Promise<CycleRecord> {
  await ensureDir();
  await fs.writeFile(cycleFile(cycle.id), `${JSON.stringify(cycle, null, 2)}\n`, 'utf8');
  return cycle;
}

export async function deleteCycle(id: string): Promise<void> {
  await fs.rm(cycleFile(id), { force: true });
}

/** Nothing is ever overwritten in place without leaving one of these behind. */
export function audit(
  cycle: CycleRecord,
  actor: string,
  action: string,
  target: string,
  note = ''
): AuditEntry {
  const entry: AuditEntry = { at: new Date().toISOString(), actor, action, target, note };
  cycle.audit.unshift(entry);
  return entry;
}

export const now = () => new Date().toISOString();

let idCounter = 0;
/** Stable within a process; only used for records the user creates by hand. */
export const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++idCounter}`;
