import { NextResponse } from 'next/server';
import { requireMarketplaceAdmin } from '../../../../../../lib/marketplaceAdminAuth';
import { getInterestById, setInterestOutcome } from '../../../../../../lib/db';
import { loadReleases, sendPreorderNotSecuredEmail } from '../../../../../../lib/releases';

export async function POST(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Missing or invalid id.' }, { status: 400 });
  }

  const registration = getInterestById.get(id);
  if (!registration) return NextResponse.json({ error: 'Registration not found.' }, { status: 404 });
  if (registration.contactType !== 'email') {
    return NextResponse.json({ error: 'This registrant has no email on file.' }, { status: 400 });
  }

  const release = loadReleases().releases.find((r) => r.id === registration.releaseId);
  if (!release) return NextResponse.json({ error: 'Release not found.' }, { status: 404 });

  const result = await sendPreorderNotSecuredEmail(release, { contactValue: registration.contactValue });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  setInterestOutcome.run({ id, outcome: 'not_secured' });
  return NextResponse.json({ success: true });
}
