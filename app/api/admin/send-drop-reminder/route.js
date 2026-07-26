import { NextResponse } from 'next/server';
import { checkAdminSecret } from '../../../../lib/utils';
import { loadReleases, todayISO, sendDropReminderEmail } from '../../../../lib/releases';
import { getPendingReminderInterestsByRelease, markReminderSent } from '../../../../lib/db';

// Batch-sends the "drop is coming up" reminder to everyone who registered
// interest by email in a specific release and hasn't already received it.
// Deliberately manual (per release, admin-triggered) rather than scheduled.
export async function POST(request) {
  if (!checkAdminSecret(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const releaseId = body?.releaseId;
  if (!releaseId) {
    return NextResponse.json({ error: 'Missing releaseId.' }, { status: 400 });
  }

  const data = loadReleases();
  const release = data.releases.find((r) => r.id === releaseId);
  if (!release) {
    return NextResponse.json({ error: 'Release not found.' }, { status: 404 });
  }
  if (release.soldOut === true || release.releaseDate < todayISO()) {
    return NextResponse.json({ error: 'This release is already sold out or past its release date.' }, { status: 400 });
  }

  const pending = getPendingReminderInterestsByRelease.all(releaseId);
  let sent = 0;
  let failed = 0;
  for (const row of pending) {
    const result = await sendDropReminderEmail(release, { contactValue: row.contactValue, quantity: row.quantity });
    if (result.ok) {
      markReminderSent.run({ id: row.id, sentAt: new Date().toISOString() });
      sent += 1;
    } else {
      failed += 1;
    }
  }
  return NextResponse.json({ success: true, releaseId, releaseTitle: release.title, sent, failed, totalPending: pending.length });
}
