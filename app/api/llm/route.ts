/**
 * Demo-only prose polish via North Chat API.
 * Accepts deterministic fallback text and returns LLM-polished wording when available.
 */

import { northChat } from '@/lib/north-chat';

export const dynamic = 'force-dynamic';

type PolishMode = 'review_chat' | 'planner_chat' | 'stakeholder_email';

const SHARED_RULES =
  'Use a professional tone. Do not change numbers, intents, commitments, or facts. ' +
  'Do not invent plan data. Output only the rewritten reply with no markdown preamble.';

const SYSTEM_PROMPTS: Record<PolishMode, string> = {
  review_chat:
    `You help a refinery or department stakeholder review a draft SROP plan. ${SHARED_RULES}`,
  planner_chat:
    `You are the SROP planning orchestrator assistant. ${SHARED_RULES}`,
  stakeholder_email:
    `You write realistic emails from an SROP planning team to stakeholders requesting monthly data. ` +
    `Read the full planner-orchestrator conversation — the latest message may revise earlier instructions ` +
    `(e.g. "remove the emergency for Yanbu" cancels an earlier urgency ask). ` +
    `Each email must reflect the current intent for that recipient across the whole thread, not only the last line. ` +
    `Replace template boilerplate and awkward bullets with natural wording. ` +
    `Keep the recipient name, due date, submit link, and signature. ` +
    `Do not invent data requests beyond what the thread implies for that recipient. ` +
    `Output only the full rewritten email body.`,
};

function systemPrompt(mode: PolishMode): string {
  return SYSTEM_PROMPTS[mode] ?? SYSTEM_PROMPTS.planner_chat;
}

function buildUserPrompt(
  message: string,
  fallback: string,
  context: string | undefined,
  mode: PolishMode
): string {
  if (mode === 'stakeholder_email') {
    const parts = [
      context?.trim()
        ? `Conversation and recipient context:\n${context.trim()}`
        : `The planner typed: "${message}"`,
      `Rewrite this draft email for the recipient named above. Apply the full conversation — ` +
        `especially if the planner is revising an earlier ask. Latest planner line: "${message}"\n\n` +
        `Draft to rewrite:\n\n${fallback}`,
    ];
    return parts.join('\n\n');
  }

  const parts = [
    context?.trim()
      ? `Conversation so far:\n${context.trim()}\n\nLatest planner line: "${message}"`
      : `The stakeholder/planner said: "${message}"`,
    `Rewrite this draft reply naturally while preserving every fact:\n\n${fallback}`,
  ];
  return parts.join('\n\n');
}

export async function POST(req: Request) {
  let body: { message?: string; fallback?: string; mode?: string; context?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const message = String(body.message ?? '').trim();
  const fallback = String(body.fallback ?? '').trim();
  if (!message || !fallback) {
    return Response.json({ error: 'message and fallback are required' }, { status: 400 });
  }

  const mode: PolishMode =
    body.mode === 'review_chat'
      ? 'review_chat'
      : body.mode === 'stakeholder_email'
        ? 'stakeholder_email'
        : 'planner_chat';
  const polished = await northChat(
    systemPrompt(mode),
    buildUserPrompt(message, fallback, body.context, mode)
  );

  if (polished) {
    return Response.json({ text: polished, source: 'llm' as const });
  }
  return Response.json({ text: fallback, source: 'fallback' as const });
}
