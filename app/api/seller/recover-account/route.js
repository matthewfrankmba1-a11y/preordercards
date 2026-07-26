import { NextResponse } from 'next/server';
import { findSellerByNamePhone } from '../../../../lib/db';
import { normalizePhone } from '../../../../lib/utils';
import { sellerAuthRateLimit, issueAccountRecoveryEmail } from '../../../../lib/sellerAuthCore';

// For sellers who've lost their invite key entirely — identifies the
// account by the full name + phone number collected on their required
// profile instead of the key, then emails the key back to them.
export async function POST(request) {
  const check = sellerAuthRateLimit(request);
  if (!check.allowed) {
    return NextResponse.json({ error: check.message }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const { fullName, phone } = body || {};
  if (typeof fullName !== 'string' || !fullName.trim() || typeof phone !== 'string' || !phone.trim()) {
    return NextResponse.json({ error: 'Enter your full name and phone number.' }, { status: 400 });
  }
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
  }
  const seller = findSellerByNamePhone.get({ fullName: fullName.trim(), phone: normalizedPhone });
  if (!seller) {
    return NextResponse.json({ error: 'No account found matching that name and phone number.' }, { status: 400 });
  }
  const result = await issueAccountRecoveryEmail(seller);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, message: 'Your invite key and a reset link have been sent to the email on file.' });
}
