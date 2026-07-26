import { NextResponse } from 'next/server';
import { insertDiscountSignup } from '../../../lib/db';
import { EMAIL_RE, createRateLimiter } from '../../../lib/utils';

const DISCOUNT_SIGNUP_WEBHOOK_URL = process.env.DISCOUNT_SIGNUP_WEBHOOK_URL;

// Own bucket, independent from the other route groups' limiters.
const rateLimit = createRateLimiter();

export async function POST(request) {
  const check = rateLimit(request);
  if (!check.allowed) {
    return NextResponse.json({ error: check.message }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const { email } = body || {};
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim()) || email.length > 254) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  const normalizedEmail = email.trim().toLowerCase();

  const result = insertDiscountSignup.run(normalizedEmail);
  const isNew = result.changes > 0;

  if (isNew && DISCOUNT_SIGNUP_WEBHOOK_URL) {
    try {
      await fetch(DISCOUNT_SIGNUP_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'New Preorder!',
          embeds: [
            {
              title: '🎉 New 5% discount signup',
              color: 13770556,
              fields: [{ name: 'Email', value: normalizedEmail }],
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });
    } catch (err) {
      console.error('Discount signup Discord webhook failed:', err.message);
    }
  }

  return NextResponse.json({ success: true, alreadySignedUp: !isNew }, { status: 201 });
}
