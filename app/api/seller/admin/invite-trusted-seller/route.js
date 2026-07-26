import { NextResponse } from 'next/server';
import { insertInviteKey } from '../../../../../lib/db';
import { EMAIL_RE, checkAdminSecret } from '../../../../../lib/utils';
import { generateInviteKeyCode, buildTrustedSellerEmail } from '../../../../../lib/sellerAuthCore';
import { sendEmail, isEmailConfigured } from '../../../../../lib/email';

// Generates a 24-hour invite key and emails it to a prospective trusted
// seller with the full onboarding rundown (fees, listing rules, product
// integrity requirements, escrow terms). Protected by the same shared
// admin secret as the other key-management routes.
export async function POST(request) {
  if (!checkAdminSecret(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const email = String(body?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  if (!isEmailConfigured()) {
    return NextResponse.json({ error: 'Email sending is not configured.' }, { status: 500 });
  }

  const keyCode = generateInviteKeyCode();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  insertInviteKey.run({ keyCode, keyType: 'seller', expiresAt: expiresAt.toISOString() });

  const result = await sendEmail({
    to: email,
    subject: "You're invited: PreorderCards Trusted Seller Program",
    text: buildTrustedSellerEmail(keyCode, expiresAt),
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: 'Key was created, but the invite email failed to send.', keyCode, expiresAt: expiresAt.toISOString() },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, keyCode, expiresAt: expiresAt.toISOString() });
}
