import { NextResponse } from 'next/server';
import { checkAdminSecret } from '../../../../../lib/utils';
import { buildReport } from '../../../../../lib/newsletter';

// The Sunday-vs-Monday scoreboard: sends, opens, clicks and rates per
// cohort, per issue and pooled, plus the current leader on click rate.
// Read-only — GET so it can be checked from a browser with the header set.
export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (!checkAdminSecret(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  return NextResponse.json({ success: true, ...buildReport() });
}
