import { NextResponse } from 'next/server';
import { normalizePhone, createRateLimiter } from '../../../lib/utils';
import { sendEmail, isEmailConfigured } from '../../../lib/email';

const ADMIN_EMAIL = 'admin@preordercards.com';

// Own bucket, independent from the other route groups' limiters.
const rateLimit = createRateLimiter();

export async function POST(request) {
  const check = rateLimit(request);
  if (!check.allowed) {
    return NextResponse.json({ error: check.message }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const { name, phone, availability } = body || {};

  const trimmedName = String(name || '').trim();
  if (!trimmedName || trimmedName.length > 200) {
    return NextResponse.json({ error: 'Enter your name.' }, { status: 400 });
  }

  const normalizedPhone = normalizePhone(String(phone || ''));
  if (!normalizedPhone) {
    return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
  }

  const trimmedAvailability = String(availability || '').trim();
  if (!trimmedAvailability || trimmedAvailability.length > 300) {
    return NextResponse.json({ error: 'Let us know a good time to reach you.' }, { status: 400 });
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({ error: 'Applications are temporarily unavailable. Please try again later.' }, { status: 503 });
  }

  const result = await sendEmail({
    to: ADMIN_EMAIL,
    subject: 'New verified seller application',
    text: `Name: ${trimmedName}\nPhone: ${normalizedPhone}\nBest time to call: ${trimmedAvailability}`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: 'Could not submit your application. Please try again later.' }, { status: 502 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
