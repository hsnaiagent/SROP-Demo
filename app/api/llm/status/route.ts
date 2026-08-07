/**
 * Production-safe LLM config check. No secrets returned.
 * Hit GET /api/llm/status after deploying to Railway to confirm variables are loaded.
 */

import { llmConfigStatus } from '@/lib/llm-env';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(llmConfigStatus());
}
