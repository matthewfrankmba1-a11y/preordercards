import { NextResponse } from 'next/server';
import { checkAdminSecret } from '../../../../../lib/utils';
import { runStatsSummary } from '../../../../../lib/statsSummary';

// Manually fires the 6-hourly stats summary early, for testing — does not
// affect the schedule (still runs every INTERVAL_MS from server start).
export async function POST(request) {
  if (!checkAdminSecret(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  const result = await runStatsSummary();
  return NextResponse.json({ success: true, ...result });
}
