import { NextResponse } from 'next/server';
import { getSellerByInviteKey } from '../../../../lib/db';
import { sellerAuthRateLimit, issuePasswordResetEmail } from '../../../../lib/sellerAuthCore';

// Requests a password reset link be emailed to the alert email registered
// on this key's account. There's no username/email login — the invite key
// is the account identifier, so that's what's submitted here.
export async function POST(request) {
  const check = sellerAuthRateLimit(request);
  if (!check.allowed) {
    return NextResponse.json({ error: check.message }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const { key } = body || {};
  if (typeof key !== 'string' || !key.trim()) {
    return NextResponse.json({ error: 'Enter your invite key.' }, { status: 400 });
  }
  const seller = getSellerByInviteKey.get(key.trim().toUpperCase());
  if (!seller) {
    return NextResponse.json({ error: 'No account found for that key.' }, { status: 400 });
  }
  const result = await issuePasswordResetEmail(
    seller,
    'This account has no alert email on file. Contact admin@preordercards.com to reset your password.'
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, message: 'Reset link sent to the email on file.' });
}
