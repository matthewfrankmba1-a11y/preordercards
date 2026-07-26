import { NextResponse } from 'next/server';
import { updateSellerEmail } from '../../../../lib/db';
import { EMAIL_RE } from '../../../../lib/utils';
import { requireSeller } from '../../../../lib/sellerAuthCore';

// Sets or updates the seller's alert email — login stays key + password
// always; this is purely a notification contact, not a credential.
export async function POST(request) {
  const { seller, error } = requireSeller(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const body = await request.json().catch(() => ({}));
  const { email } = body || {};
  let normalizedEmail = null;
  if (email) {
    normalizedEmail = String(email).trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail) || normalizedEmail.length > 254) {
      return NextResponse.json({ error: 'Enter a valid email address, or leave it blank to remove it.' }, { status: 400 });
    }
  }
  updateSellerEmail.run({ sellerId: seller.id, email: normalizedEmail });
  return NextResponse.json({ success: true, email: normalizedEmail });
}
