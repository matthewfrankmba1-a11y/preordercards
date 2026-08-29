import { NextResponse } from 'next/server';
import { insertDiscountSignup, getDiscountSignupByEmail, markWelcomeEmailSent } from '../../../../lib/db';
import { EMAIL_RE, createRateLimiter } from '../../../../lib/utils';
import { sendNewsletterWelcomeEmail } from '../../../../lib/discountSignups';

// Signup form on /newsletter.html. Shares one list with the homepage
// discount banner (discount_signups) — the two forms differ only in the
// welcome email they trigger, since someone who came for the weekly
// roundup shouldn't be greeted with seller-fee promo copy.
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

  const result = insertDiscountSignup.run({ email: normalizedEmail, source: 'newsletter' });
  const isNew = result.changes > 0;

  // Fire-and-forget, same as the discount-banner signup — a slow or failing
  // email provider shouldn't block or fail the signup itself. Status is
  // only persisted on success so a failed attempt stays resendable.
  if (isNew) {
    const signupRow = getDiscountSignupByEmail.get(normalizedEmail);
    sendNewsletterWelcomeEmail(normalizedEmail)
      .then((sendResult) => {
        if (sendResult.ok) {
          markWelcomeEmailSent.run({ id: signupRow.id, resendEmailId: sendResult.id || null });
        } else {
          console.error('Newsletter welcome email failed:', sendResult.error);
        }
      })
      .catch((err) => console.error('Newsletter welcome email threw:', err.message));
  }

  return NextResponse.json({ success: true, alreadySignedUp: !isNew }, { status: 201 });
}
