/**
 * Server-only North Chat API client for demo prose polish.
 * Do not import from client components — token lives here only.
 */

import { llmEnabled, northHost, northIapHeaders, northToken } from '@/lib/llm-env';

const TIMEOUT_MS = 15_000;

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${northToken()}`,
    'Content-Type': 'application/json',
  };
  const iap = northIapHeaders();
  if (iap) Object.assign(h, iap);
  return h;
}

function redact(text: string): string {
  const t = northToken();
  return String(text)
    .replace(/Bearer\s+[\w.\-]+/gi, 'Bearer <redacted>')
    .replace(t ? new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') : /$^/, '<redacted>');
}

interface NorthChatMessage {
  role?: string;
  content?: unknown;
}

interface NorthChatResponse {
  messages?: NorthChatMessage[];
}

function messageContent(content: unknown): string | null {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed || null;
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((block) => {
        if (typeof block === 'string') return block;
        if (block && typeof block === 'object') {
          const obj = block as Record<string, unknown>;
          if (typeof obj.text === 'string') return obj.text;
          if (typeof obj.content === 'string') return obj.content;
        }
        return '';
      })
      .filter(Boolean);
    const joined = parts.join('').trim();
    return joined || null;
  }
  if (content && typeof content === 'object') {
    const obj = content as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text.trim() || null;
  }
  return null;
}

function extractAssistantText(body: NorthChatResponse): string | null {
  const messages = body.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant') {
      const text = messageContent(msg.content);
      if (text) return text;
    }
  }
  return null;
}

/**
 * Calls North /api/v1/chat. Returns assistant text or null on any failure.
 */
export async function northChat(system: string, user: string): Promise<string | null> {
  if (!llmEnabled()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`https://${northHost()}/api/v1/chat`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        stream: false,
        thinking: { type: 'disabled' },
      }),
      signal: controller.signal,
    });

    const raw = await res.text();
    if (!res.ok) {
      console.warn(`[north-chat] HTTP ${res.status}: ${redact(raw.slice(0, 500))}`);
      return null;
    }

    let body: NorthChatResponse;
    try {
      body = JSON.parse(raw) as NorthChatResponse;
    } catch {
      console.warn('[north-chat] invalid JSON response');
      return null;
    }

    const text = extractAssistantText(body);
    if (!text) {
      console.warn('[north-chat] no assistant message in response');
      return null;
    }
    return text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[north-chat] ${redact(msg)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
