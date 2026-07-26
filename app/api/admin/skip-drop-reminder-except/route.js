import { NextResponse } from 'next/server';
import { checkAdminSecret } from '../../../../lib/utils';
import { markAllPendingRemindersSentExcept } from '../../../../lib/db';

// Skips everyone else pending for a release (marks reminded without
// emailing) so a single address can be tested in isolation before firing
// a real batch send to everyone.
export async function POST(request) {
  if (!checkAdminSecret(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { releaseId, exceptContactValue } = body || {};
  if (!releaseId || !exceptContactValue) {
    return NextResponse.json({ error: 'Missing releaseId or exceptContactValue.' }, { status: 400 });
  }
  const result = markAllPendingRemindersSentExcept.run({
    releaseId,
    excludeContactValue: String(exceptContactValue).trim().toLowerCase(),
    sentAt: new Date().toISOString(),
  });
  return NextResponse.json({ success: true, skipped: result.changes });
}
