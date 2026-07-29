import { NextResponse } from 'next/server';
import { upsertInterest, countByRelease, getInterestByReleaseAndContact, markEmailSent } from '../../../lib/db';
import { loadReleases, todayISO, notifyDiscord, sendConfirmationEmail } from '../../../lib/releases';
import { EMAIL_RE, normalizePhone, createRateLimiter } from '../../../lib/utils';
import bot from '../../../lib/bot';

// Own bucket, independent from the other route groups' limiters.
const rateLimit = createRateLimiter();

export async function POST(request) {
  const check = rateLimit(request);
  if (!check.allowed) {
    return NextResponse.json({ error: check.message }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const { releaseId, contactType, contactValue, quantity } = body || {};

  if (typeof releaseId !== 'string' || typeof contactType !== 'string' || typeof contactValue !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid fields.' }, { status: 400 });
  }

  const data = loadReleases();
  const release = data.releases.find((r) => r.id === releaseId);
  if (!release) {
    return NextResponse.json({ error: 'Unknown release.' }, { status: 404 });
  }

  if (release.releaseDate < todayISO() || release.soldOut === true) {
    return NextResponse.json(
      { error: 'This release has already shipped and is no longer accepting registrations.' },
      { status: 410 }
    );
  }

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
    return NextResponse.json({ error: 'quantity must be a whole number between 1 and 10.' }, { status: 400 });
  }

  let normalizedValue;
  if (contactType === 'email') {
    const email = contactValue.trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    normalizedValue = email;
  } else if (contactType === 'phone') {
    const phone = normalizePhone(contactValue);
    if (!phone) {
      return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
    }
    normalizedValue = phone;
  } else {
    return NextResponse.json({ error: 'contactType must be "email" or "phone".' }, { status: 400 });
  }

  upsertInterest.run({
    releaseId,
    contactType,
    contactValue: normalizedValue,
    quantity: qty,
  });

  const row = getInterestByReleaseAndContact.get(releaseId, normalizedValue);

  // Prefer the bot (posts a "Send Confirmation Email" button); fall back to the
  // plain webhook — with no button, since incoming webhooks can't route
  // interactions — if the bot isn't configured.
  if (bot.isConfigured()) {
    bot.postInterestAlert(release, row);
  } else {
    notifyDiscord(release, { contactType, contactValue: normalizedValue, quantity: qty });
  }

  // Auto-fires the same acknowledgment email the Discord "Send Confirmation
  // Email" button sends manually — that button still works too (it checks
  // emailSentAt first and no-ops with "Already sent" once this beats it to
  // it, which it normally will), so a failed auto-send here still has a
  // manual retry path. Fire-and-forget, same reasoning as notifyDiscord
  // above: never let an email provider hiccup slow down or fail the signup
  // itself. row.emailSentAt is only non-null on a re-registration (upsert)
  // that already got its email — skip re-sending in that case.
  if (contactType === 'email' && !row.emailSentAt) {
    sendConfirmationEmail(release, { contactType, contactValue: normalizedValue, quantity: qty })
      .then((result) => {
        if (result.ok) {
          markEmailSent.run({ id: row.id, sentAt: new Date().toISOString() });
        } else {
          console.error('Auto-send confirmation email failed:', result.error);
        }
      })
      .catch((err) => console.error('Auto-send confirmation email threw:', err.message));
  }

  const counts = Object.fromEntries(countByRelease.all().map((r) => [r.releaseId, r.count]));
  return NextResponse.json({ success: true, interestCount: counts[releaseId] || 1 }, { status: 201 });
}
