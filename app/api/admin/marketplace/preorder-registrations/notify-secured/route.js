import { NextResponse } from 'next/server';
import { requireMarketplaceAdmin } from '../../../../../../lib/marketplaceAdminAuth';
import { getInterestById, setInterestOutcome } from '../../../../../../lib/db';
import { loadReleases, sendPreorderSecuredEmail } from '../../../../../../lib/releases';

// Sends the "we secured your preorder" email with the admin-entered
// numbers, then records the outcome on the registration row (never
// deletes/shades it — that's the separate cancel/delete actions).
export async function POST(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Missing or invalid id.' }, { status: 400 });
  }

  const quantity = Number(body?.quantity);
  const pricePerBox = Number(body?.pricePerBox);
  const marketPrice = Number(body?.marketPrice);
  const savings = Number(body?.savings);
  const fee = Number(body?.fee);
  if (![quantity, pricePerBox, marketPrice, savings, fee].every((n) => Number.isFinite(n))) {
    return NextResponse.json({ error: 'Quantity, price per box, market price, savings, and fee must all be numbers.' }, { status: 400 });
  }
  if (quantity <= 0 || pricePerBox < 0 || marketPrice < 0 || fee < 0) {
    return NextResponse.json({ error: 'Quantity and price fields must be positive.' }, { status: 400 });
  }

  const registration = getInterestById.get(id);
  if (!registration) return NextResponse.json({ error: 'Registration not found.' }, { status: 404 });
  if (registration.contactType !== 'email') {
    return NextResponse.json({ error: 'This registrant has no email on file.' }, { status: 400 });
  }

  const release = loadReleases().releases.find((r) => r.id === registration.releaseId);
  if (!release) return NextResponse.json({ error: 'Release not found.' }, { status: 404 });

  const result = await sendPreorderSecuredEmail(release, {
    contactValue: registration.contactValue,
    quantity,
    pricePerBox,
    marketPrice,
    savings,
    fee,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  setInterestOutcome.run({ id, outcome: 'secured' });
  return NextResponse.json({ success: true });
}
