/**
 * Downloads the master workbook. One CSV block per sheet, with the sheet marker and
 * source trace in the header line, so the file is inspectable in a text editor and
 * every number in it is attributable.
 */

import { masterFileText } from '@/lib/intake';
import { readCycle } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cycle = await readCycle();
  if (!cycle?.masterFile) {
    return new Response('No master workbook has been built for this cycle.', { status: 404 });
  }

  return new Response(masterFileText(cycle.masterFile), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="SROP_master_${cycle.id}.csv"`,
    },
  });
}
