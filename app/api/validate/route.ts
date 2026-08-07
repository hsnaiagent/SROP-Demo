/**
 * POST /api/validate — runs the North validator over the four submission files.
 *
 * ⚠️ Run the demo with `next dev`. This handler awaits a poll that takes ~27s today
 * and is allowed up to 120s; that is fine locally (no limit) and would be killed on
 * a serverless platform's default timeout. Do not deploy this and do not discover
 * the difference on stage.
 */

import { NextResponse } from 'next/server';

import { loadSubmissionMeta } from '@/lib/csv';
import { isMockMode, NorthError, validate } from '@/lib/north';

/** Never prerender or cache: this hits a live instance. */
export const dynamic = 'force-dynamic';

export async function POST() {
  const startedAt = Date.now();

  try {
    const result = await validate();

    return NextResponse.json({
      ...result,
      meta: {
        mock: isMockMode(),
        elapsedMs: Date.now() - startedAt,
        submissions: loadSubmissionMeta(),
      },
    });
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;

    if (error instanceof NorthError) {
      // NorthError bodies are already token-redacted.
      console.error(`[validate] ${error.message}${error.detail ? `\n${error.detail}` : ''}`);
      return NextResponse.json(
        {
          error: error.message,
          detail: error.detail,
          hint: 'Set MOCK_MODE=1 in .env.local to run the UI without North.',
          meta: { mock: false, elapsedMs },
        },
        { status: 502 }
      );
    }

    console.error('[validate] unexpected', error);
    return NextResponse.json(
      { error: 'validation failed', meta: { mock: false, elapsedMs } },
      { status: 500 }
    );
  }
}
