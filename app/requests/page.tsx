'use client';

/**
 * Screen 2 — Requests. version2.md §7.2.
 *
 * Y describes what is needed in ordinary language; the orchestrator turns it into
 * per-recipient requests that Y reviews before anything is sent. The orchestrator asks
 * a clarifying question rather than guessing when the ask is incomplete, and anything
 * it adds beyond the standard pull is marked "new this cycle" so attention goes to the
 * unusual asks.
 */

import { useState } from 'react';

import type { ChatMessage, Request } from '@/lib/types';

import { useCycle } from '../providers';
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Screen,
  Textarea,
  relTime,
} from '../components/ui';

const SUGGESTIONS = [
  'Standard monthly pull.',
  'Standard pull, and ask Jazan about the October outage.',
  'Ask the refineries about limits.',
];

async function polishText(
  message: string,
  fallback: string,
  mode: 'planner_chat' | 'stakeholder_email',
  context?: string
): Promise<{ text: string; source: 'llm' | 'fallback' }> {
  try {
    const res = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, fallback, mode, context }),
    });
    if (!res.ok) return { text: fallback, source: 'fallback' };
    const data = (await res.json()) as { text?: string; source?: 'llm' | 'fallback' };
    return {
      text: data.text?.trim() || fallback,
      source: data.source === 'llm' ? 'llm' : 'fallback',
    };
  } catch {
    return { text: fallback, source: 'fallback' };
  }
}

function formatChatHistory(chat: ChatMessage[]): string {
  return chat
    .slice(-14)
    .map((m) => `${m.role === 'planner' ? 'Planner' : 'Orchestrator'}: ${m.text}`)
    .join('\n');
}

function requestItemsChanged(
  before: Array<{ id: string; items: string }>,
  req: Request
): boolean {
  const prev = before.find((b) => b.id === req.id);
  return !prev || prev.items !== req.items.join('|');
}

interface ChatExtra {
  asked?: boolean;
  polishHint?: string | null;
  clearAdHoc?: string[];
  emailTargets?: string[];
}

function shouldPolishEmail(
  req: Request,
  before: Array<{ id: string; items: string }>,
  extra: ChatExtra
): boolean {
  const changed = requestItemsChanged(before, req);
  const clearAdHoc = new Set(extra.clearAdHoc ?? []);
  const emailTargets = new Set(extra.emailTargets ?? []);
  const globalTone =
    Boolean(extra.polishHint) && emailTargets.size === 0 && clearAdHoc.size === 0;
  return (
    changed ||
    clearAdHoc.has(req.recipient) ||
    emailTargets.has(req.recipient) ||
    globalTone
  );
}

async function polishDraftEmails(
  userText: string,
  chatHistory: string,
  requests: Request[],
  before: Array<{ id: string; items: string }>,
  previousBodies: Record<string, string>,
  extra: ChatExtra
): Promise<Array<{ id: string; body: string }>> {
  const clearAdHoc = new Set(extra.clearAdHoc ?? []);
  const emailTargets = new Set(extra.emailTargets ?? []);
  const updates: Array<{ id: string; body: string }> = [];

  for (const req of requests.filter((r) => r.status === 'draft')) {
    if (!shouldPolishEmail(req, before, extra)) continue;

    const targeted = clearAdHoc.has(req.recipient) || emailTargets.has(req.recipient);
    const previous = previousBodies[req.id];

    const contextParts = [
      chatHistory,
      extra.polishHint ? `Latest planner instruction: ${extra.polishHint}` : '',
      `Recipient: ${req.recipient}. Due: ${req.dueDate}.`,
      `Requested items: ${req.items.join('; ')}`,
      clearAdHoc.has(req.recipient)
        ? 'The planner is removing a prior urgency or ad-hoc ask for this recipient. Write a standard professional request with no emergency tone.'
        : targeted
          ? 'Only this recipient\'s email wording should change; keep the same data asks as before.'
          : '',
      previous
        ? `Previous email draft for this recipient (revise to match the full conversation):\n${previous}`
        : '',
    ].filter(Boolean);

    const { text } = await polishText(
      userText,
      previous ?? req.emailDraft.body,
      'stakeholder_email',
      contextParts.join('\n\n')
    );
    updates.push({ id: req.id, body: text });
  }

  return updates;
}

export default function RequestsPage() {
  const { cycle, act, busy } = useCycle();
  const [text, setText] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [polishedReplies, setPolishedReplies] = useState<Record<string, string>>({});
  const [polishedEmails, setPolishedEmails] = useState<Record<string, string>>({});
  const [polishingEmails, setPolishingEmails] = useState(false);

  if (!cycle) {
    return (
      <Screen
        title="Requests"
        lede="No cycle is open. Start one to set the four-month planning horizon and open the orchestrator chat."
      >
        <Card tone="accent">
          <div className="flex flex-col items-start gap-4 py-4">
            <p className="max-w-xl text-sm leading-relaxed text-zinc-400">
              One cycle covers one issue of the SROP and always plans four months ahead. The
              orchestrator will draft data requests for OSPAS, Demand Planning and all four
              refineries — nothing is sent until you review them.
            </p>
            <Button tone="primary" onClick={() => act('create_cycle')} disabled={busy !== null}>
              {busy === 'create_cycle' ? 'Starting…' : 'Start new cycle'}
            </Button>
          </div>
        </Card>
      </Screen>
    );
  }

  const sent = cycle.requests.some((r) => r.status === 'sent');
  const unreviewed = cycle.requests.filter((r) => !r.reviewed).length;

  const send = async () => {
    const userText = text;
    const before = cycle.requests.map((r) => ({ id: r.id, items: r.items.join('|') }));
    const previousBodies = Object.fromEntries(
      cycle.requests.map((r) => [r.id, polishedEmails[r.id] ?? r.emailDraft.body])
    );
    setText('');
    const chatRes = await act('chat', { text: userText });
    if (!chatRes.ok || !chatRes.cycle) return;

    const extra = (chatRes.extra ?? {}) as ChatExtra;

    try {
      const requests = chatRes.cycle.requests;
      const chatHistory = formatChatHistory(chatRes.cycle.chat);
      const last = chatRes.cycle.chat.at(-1);

      if (last?.role === 'orchestrator') {
        const { text: reply, source } = await polishText(
          userText,
          last.text,
          'planner_chat',
          chatHistory
        );
        if (source === 'llm' && reply !== last.text) {
          setPolishedReplies((prev) => ({ ...prev, [last.id]: reply }));
        }
      }

      if (!extra.asked && requests.length > 0) {
        setPolishingEmails(true);
        const updates = await polishDraftEmails(
          userText,
          chatHistory,
          requests,
          before,
          previousBodies,
          extra
        );
        if (updates.length > 0) {
          await act('update_request_bodies', { updates });
        }
        setPolishedEmails((prev) => {
          const next = { ...prev };
          const clearAdHoc = new Set(extra.clearAdHoc ?? []);
          const emailTargets = new Set(extra.emailTargets ?? []);
          for (const r of requests) {
            const untouched =
              !requestItemsChanged(before, r) &&
              !clearAdHoc.has(r.recipient) &&
              !emailTargets.has(r.recipient);
            if (untouched) {
              // Keep the polished text from earlier turns — server bodies are templates.
              const kept = prev[r.id] ?? previousBodies[r.id];
              if (kept) next[r.id] = kept;
            }
          }
          for (const u of updates) next[u.id] = u.body;
          return next;
        });
        const firstNew = requests.find((r) => r.origin === 'new');
        if (firstNew) setExpanded(firstNew.id);
      }
    } catch {
      // persisted cycle stays deterministic on failure
    } finally {
      setPolishingEmails(false);
    }
  };

  const emailBody = (req: Request) => polishedEmails[req.id] ?? req.emailDraft.body;

  return (
    <Screen
      title="Requests"
      lede="Describe what you need and who from. The orchestrator drafts it; nothing is sent until you review it."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {!sent && (
            <Button
              tone="primary"
              disabled={busy !== null || cycle.requests.length === 0 || unreviewed > 0}
              title={unreviewed > 0 ? `${unreviewed} cards not yet reviewed` : undefined}
              onClick={() => act('send_requests')}
            >
              {busy === 'send_requests' ? 'Sending…' : `Send all ${cycle.requests.length} requests`}
            </Button>
          )}
          <Button
            tone="danger"
            size="sm"
            disabled={busy !== null}
            title="Clears all cycle state — fixture data in data/ is untouched"
            onClick={() => {
              if (confirm('Delete this cycle and start over?')) act('reset');
            }}
          >
            {busy === 'reset' ? 'Resetting…' : 'Reset cycle'}
          </Button>
        </div>
      }
    >
      {polishingEmails && (
        <Banner tone="info" title="Polishing email drafts">
          Rewriting the request emails for a more natural tone — this takes a few seconds.
        </Banner>
      )}

      {sent && (
        <Banner tone="good" title="Requests sent">
          All {cycle.requests.length} requests went out{' '}
          {cycle.requests[0]?.sentAt ? relTime(cycle.requests[0].sentAt) : ''}. Track arrivals on the
          Submissions screen. The SLA ladder is now running: reminder at 3 business days, escalation
          at 5.
        </Banner>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.3fr]">
        {/* ------------------------------------------------------------ chat */}
        <Card
          title="Orchestrator"
          subtitle="What do you need this cycle, and from whom?"
          actions={
            !sent && (
              <Button size="sm" onClick={() => act('load_template')} disabled={busy !== null}>
                Load last cycle&apos;s requests
              </Button>
            )
          }
        >
          <div className="flex flex-col gap-3">
            <div className="flex max-h-[380px] flex-col gap-3 overflow-y-auto">
              {cycle.chat.length === 0 && (
                <p className="text-sm leading-relaxed text-zinc-500">
                  Type what you need below, or load last cycle&apos;s request log and adjust it. The
                  orchestrator compares whatever you say against the previous cycle, so anything you
                  routinely ask for but have not mentioned is still included.
                </p>
              )}
              {cycle.chat.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'planner'
                      ? 'ml-8 bg-amber-500/10 text-amber-50'
                      : 'mr-4 border border-zinc-800 bg-zinc-950/60 text-zinc-200'
                  }`}
                >
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    {msg.role === 'planner' ? 'You' : 'Orchestrator'}
                  </span>
                  {polishedReplies[msg.id] ?? msg.text}
                </div>
              ))}
            </div>

            {!sent && (
              <>
                <Textarea
                  rows={2}
                  value={text}
                  placeholder="e.g. Standard monthly pull. Also ask Jazan about the October outage."
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (text.trim()) send();
                    }
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button tone="primary" size="sm" onClick={send} disabled={busy !== null || polishingEmails || !text.trim()}>
                    {polishingEmails ? 'Polishing emails…' : busy === 'chat' ? 'Drafting…' : 'Send'}
                  </Button>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setText(s)}
                      className="rounded-full border border-zinc-800 px-2.5 py-1 text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </Card>

        {/* -------------------------------------------------- draft request cards */}
        <div className="flex flex-col gap-3">
          {cycle.requests.length === 0 ? (
            <EmptyState title="No requests drafted yet">
              Tell the orchestrator what you need, or load last cycle&apos;s log.
            </EmptyState>
          ) : (
            cycle.requests.map((req) => (
              <Card
                key={req.id}
                tone={req.origin === 'new' ? 'warn' : 'default'}
                title={
                  <span className="flex items-center gap-2">
                    {req.recipient}
                    {req.origin === 'new' ? (
                      <Badge tone="warn">new this cycle</Badge>
                    ) : (
                      <Badge>standard</Badge>
                    )}
                    {req.status === 'sent' && <Badge tone="good">sent</Badge>}
                  </span>
                }
                subtitle={req.email}
                actions={
                  req.status === 'draft' && (
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
                      <input
                        type="checkbox"
                        checked={req.reviewed}
                        onChange={(e) => act('update_request', { id: req.id, reviewed: e.target.checked })}
                        className="size-3.5 accent-amber-500"
                      />
                      reviewed
                    </label>
                  )
                }
              >
                <div className="flex flex-col gap-3">
                  <ul className="flex flex-col gap-1.5 text-sm text-zinc-300">
                    {req.items.map((item, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-zinc-600">•</span>
                        <span className="flex-1">{item}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <span className="flex items-center gap-2 text-zinc-500">
                      Due
                      {req.status === 'draft' ? (
                        <Input
                          type="date"
                          value={req.dueDate}
                          onChange={(e) => act('update_request', { id: req.id, dueDate: e.target.value })}
                          className="w-auto px-2 py-1 text-xs"
                        />
                      ) : (
                        <span className="font-mono text-zinc-300">{req.dueDate}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === req.id ? null : req.id)}
                      className="text-zinc-400 underline decoration-dotted hover:text-zinc-200"
                    >
                      {expanded === req.id ? 'hide email' : 'show email draft'}
                    </button>
                  </div>

                  {expanded === req.id && (
                    <div className="flex flex-col gap-2.5 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                      <Field label="To">
                        <Input
                          value={req.emailDraft.to}
                          readOnly={req.status === 'sent'}
                          onChange={(e) =>
                            act('update_request', {
                              id: req.id,
                              emailDraft: { ...req.emailDraft, to: e.target.value },
                            })
                          }
                          className="font-mono text-xs"
                        />
                      </Field>
                      <Field label="Subject">
                        <Input
                          value={req.emailDraft.subject}
                          readOnly={req.status === 'sent'}
                          onChange={(e) =>
                            act('update_request', {
                              id: req.id,
                              emailDraft: { ...req.emailDraft, subject: e.target.value },
                            })
                          }
                        />
                      </Field>
                      <Field label="Body" hint="Drafted with the request already in it — you do not write this.">
                        <Textarea
                          rows={8}
                          value={emailBody(req)}
                          readOnly={req.status === 'sent'}
                          onChange={(e) =>
                            act('update_request', {
                              id: req.id,
                              emailDraft: { ...req.emailDraft, body: e.target.value },
                            })
                          }
                          className="text-xs leading-relaxed"
                        />
                      </Field>
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </Screen>
  );
}
