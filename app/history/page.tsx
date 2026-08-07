'use client';

/**
 * Screen 8 — History. version2.md §7.8.
 *
 * The folder of past SROP files, made queryable. Four tabs over the one cycle record:
 * files, flags, correspondence, audit. Nothing here is derived — it is the record, read
 * back. That is what lets it answer "why is this number what it is".
 */

import { useState } from 'react';

import { RULE_LABEL } from '@/lib/types';

import { useCycle } from '../providers';
import {
  Badge,
  Card,
  Cell,
  EmptyState,
  Grid,
  Row,
  Screen,
  Select,
  Stat,
  Table,
  Tabs,
  fmtKb,
  fmtMoney,
  prettyRef,
  relTime,
} from '../components/ui';

type Tab = 'files' | 'flags' | 'mail' | 'audit' | 'learned';

export default function HistoryPage() {
  const { cycle } = useCycle();
  const [tab, setTab] = useState<Tab>('files');
  const [actor, setActor] = useState('all');

  if (!cycle) {
    return (
      <Screen title="History">
        <EmptyState title="No cycle open">Start a cycle on Cycle Home first.</EmptyState>
      </Screen>
    );
  }

  const final = cycle.drafts.find((d) => d.status === 'finalized');
  const live = cycle.drafts.at(-1);
  const resolved = cycle.flags.filter((f) => ['justified', 'corrected'].includes(f.status)).length;
  const actors = [...new Set(cycle.audit.map((a) => a.actor))].sort();

  return (
    <Screen
      title="History"
      lede={
        cycle.finalisedAt
          ? `Cycle ${cycle.id} was published ${relTime(cycle.finalisedAt)} and is archived. Everything below is the record, not a summary of it.`
          : `Cycle ${cycle.id} is still in progress. Everything that has happened so far is below.`
      }
    >
      <Grid cols={4}>
        <Stat
          label="Status"
          value={cycle.finalisedAt ? 'Archived' : 'In progress'}
          tone={cycle.finalisedAt ? 'good' : 'neutral'}
        />
        <Stat
          label="Final revenue"
          value={final ? fmtMoney(final.totalRevenue) : live ? fmtMoney(live.totalRevenue) : '—'}
          hint={final ? `from draft v${final.version}` : 'not yet published'}
        />
        <Stat
          label="Flags"
          value={`${resolved}/${cycle.flags.length}`}
          tone={resolved === cycle.flags.length && cycle.flags.length > 0 ? 'good' : 'neutral'}
          hint="raised and resolved"
        />
        <Stat
          label="Revision rounds"
          value={Math.max(0, cycle.drafts.length - 1)}
          hint={`${cycle.drafts.length} draft${cycle.drafts.length === 1 ? '' : 's'} generated`}
        />
      </Grid>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'files', label: 'Files' },
          { value: 'flags', label: 'Flags', badge: <Badge mono>{cycle.flags.length}</Badge> },
          { value: 'mail', label: 'Correspondence', badge: <Badge mono>{cycle.emails.length}</Badge> },
          { value: 'audit', label: 'Audit', badge: <Badge mono>{cycle.audit.length}</Badge> },
          { value: 'learned', label: 'Learned', badge: <Badge mono>{cycle.learned.length}</Badge> },
        ]}
      />

      {tab === 'files' && (
        <div className="flex flex-col gap-4">
          <Card title="Submissions" subtitle="Every version retained and attributable">
            <Table columns={['Source', 'Version', 'File', 'Rows', 'Received', 'Basis']} align={[3]}>
              {cycle.submissions.flatMap((sub) =>
                sub.versions.length === 0
                  ? [
                      <Row key={sub.id}>
                        <Cell>{sub.source}</Cell>
                        <Cell colSpan={5} tone="muted">
                          never submitted
                        </Cell>
                      </Row>,
                    ]
                  : sub.versions.map((v) => (
                      <Row key={`${sub.id}-${v.n}`}>
                        <Cell>{sub.source}</Cell>
                        <Cell mono>v{v.n}</Cell>
                        <Cell mono tone="muted">{v.files.map((f) => f.name).join(', ')}</Cell>
                        <Cell right mono tone="muted">
                          {v.files.reduce((sum, f) => sum + f.rowCount, 0)}
                        </Cell>
                        <Cell tone="muted">{relTime(v.receivedAt)}</Cell>
                        <Cell>
                          {sub.assumed ? <Badge tone="warn">assumed</Badge> : <Badge tone="good">submitted</Badge>}
                        </Cell>
                      </Row>
                    ))
              )}
            </Table>
          </Card>

          <Card title="Generated artefacts">
            <Table columns={['Artefact', 'Built', 'Detail', '']}>
              {cycle.masterFile && (
                <Row>
                  <Cell>Master workbook</Cell>
                  <Cell tone="muted">{relTime(cycle.masterFile.builtAt)}</Cell>
                  <Cell tone="muted">
                    {cycle.masterFile.sheets.length} sheets ·{' '}
                    {cycle.masterFile.sheets.reduce((s, x) => s + x.rowCount, 0)} rows
                  </Cell>
                  <Cell right>
                    <a href="/api/master" className="text-xs text-amber-400 underline">
                      download
                    </a>
                  </Cell>
                </Row>
              )}
              {cycle.drafts.map((d) => (
                <Row key={d.id}>
                  <Cell>
                    Draft SROP v{d.version}
                    {d.status === 'finalized' && <Badge tone="good">final</Badge>}
                    {d.status === 'superseded' && <Badge>superseded</Badge>}
                  </Cell>
                  <Cell tone="muted">{relTime(d.generatedAt)}</Cell>
                  <Cell tone="muted">
                    {d.planRows.length} rows · {fmtMoney(d.totalRevenue)} · {fmtKb(d.totalVolume)} ·{' '}
                    {d.shortfallRowCount} shortfall
                  </Cell>
                  <Cell />
                </Row>
              ))}
            </Table>
          </Card>
        </div>
      )}

      {tab === 'flags' && (
        <Card title="Every flag raised this cycle" subtitle="With the note that closed it">
          {cycle.flags.length === 0 ? (
            <EmptyState title="No flags raised" />
          ) : (
            <Table columns={['Rule', 'Source', 'Row', 'Evidence', 'Outcome', 'Closed by']}>
              {cycle.flags.map((f) => (
                <Row key={f.id}>
                  <Cell>
                    <Badge tone={f.severity === 'high' ? 'bad' : f.severity === 'medium' ? 'warn' : 'neutral'}>
                      {RULE_LABEL[f.rule]}
                    </Badge>
                  </Cell>
                  <Cell tone="muted">{f.source}</Cell>
                  <Cell mono tone="muted">{prettyRef(f.rowRef)}</Cell>
                  <Cell mono className="max-w-sm truncate" >{f.evidence}</Cell>
                  <Cell
                    tone={
                      f.status === 'corrected' || f.status === 'justified'
                        ? 'good'
                        : f.status === 'superseded'
                          ? 'muted'
                          : 'warn'
                    }
                  >
                    {f.status === 'corrected' && f.correctedValue
                      ? `corrected → ${f.correctedValue}`
                      : f.status.replace(/_/g, ' ')}
                  </Cell>
                  <Cell tone="muted" className="max-w-sm truncate">
                    {f.note ?? '—'}
                  </Cell>
                </Row>
              ))}
            </Table>
          )}
        </Card>
      )}

      {tab === 'mail' && (
        <Card title="Correspondence" subtitle="Every email drafted and sent, and every response">
          {cycle.emails.length === 0 ? (
            <EmptyState title="Nothing sent yet" />
          ) : (
            <div className="flex flex-col gap-3">
              {cycle.emails.map((mail) => (
                <details key={mail.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
                  <summary className="cursor-pointer">
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone={mail.kind === 'escalation' ? 'bad' : mail.kind === 'reminder' ? 'warn' : 'info'}>
                        {mail.kind.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-zinc-100">{mail.subject}</span>
                      <span className="font-mono text-xs text-zinc-500">→ {mail.to}</span>
                      <span className="ml-auto text-xs text-zinc-600">{relTime(mail.sentAt)}</span>
                    </span>
                  </summary>
                  <pre className="mt-3 whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-400">
                    {mail.body}
                  </pre>
                </details>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'audit' && (
        <Card
          title="Audit trail"
          subtitle="Every state transition, with who caused it"
          actions={
            <Select
              value={actor}
              onChange={setActor}
              options={[{ value: 'all', label: 'Every actor' }, ...actors.map((a) => ({ value: a, label: a }))]}
            />
          }
        >
          <Table columns={['When', 'Actor', 'Action', 'Target', 'Note']}>
            {cycle.audit
              .filter((a) => actor === 'all' || a.actor === actor)
              .map((entry, i) => (
                <Row key={i}>
                  <Cell tone="muted" mono>{relTime(entry.at)}</Cell>
                  <Cell>{entry.actor}</Cell>
                  <Cell tone="muted">{entry.action}</Cell>
                  <Cell mono tone="muted" className="max-w-xs truncate">
                    {prettyRef(entry.target)}
                  </Cell>
                  <Cell tone="muted" className="max-w-md truncate">
                    {entry.note}
                  </Cell>
                </Row>
              ))}
          </Table>
        </Card>
      )}

      {tab === 'learned' && (
        <Card
          title="Learned justifications"
          subtitle="Patterns you have justified, carried into future cycles"
        >
          {cycle.learned.length === 0 ? (
            <EmptyState title="Nothing learned yet">
              When you justify a flag, the pattern is recorded here. A recurring pattern still raises
              the flag next cycle — it just arrives carrying your earlier reason, because suppressing
              it would hide a real change behind an old excuse.
            </EmptyState>
          ) : (
            <Table columns={['Rule', 'Series', 'Reason', 'Times applied']} align={[3]}>
              {cycle.learned.map((l) => (
                <Row key={l.key}>
                  <Cell>
                    <Badge>{RULE_LABEL[l.rule]}</Badge>
                  </Cell>
                  <Cell mono tone="muted">{l.key.split('|').slice(1).join(' · ')}</Cell>
                  <Cell className="max-w-lg whitespace-normal">{l.reason}</Cell>
                  <Cell right mono tone="muted">{l.timesApplied}</Cell>
                </Row>
              ))}
            </Table>
          )}
        </Card>
      )}
    </Screen>
  );
}
