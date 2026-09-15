import { NextResponse } from 'next/server';
import { requireMarketplaceAdmin } from '../../../../../lib/marketplaceAdminAuth';
import { listAdminEmails, isNewsletterUnsubscribed } from '../../../../../lib/db';
import { isEmailConfigured, EMAIL_FROM } from '../../../../../lib/email';
import { MAX_BODY, MAX_RECIPIENTS, MAX_SUBJECT, parseRecipients, sendAdminEmail } from '../../../../../lib/adminEmail';

const LOG_LIMIT = 50;

function recentLog() {
  return listAdminEmails.all({ limit: LOG_LIMIT });
}

export async function GET(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const url = new URL(request.url);
  // The composer asks about its current recipient box as it's typed, so the
  // unsubscribe warning appears before the send rather than after it.
  const check = url.searchParams.get('check');
  const { valid, invalid } = check ? parseRecipients(check) : { valid: [], invalid: [] };

  return NextResponse.json({
    configured: isEmailConfigured(),
    from: EMAIL_FROM,
    limits: { recipients: MAX_RECIPIENTS, subject: MAX_SUBJECT, body: MAX_BODY },
    recipients: { valid, invalid, unsubscribed: valid.filter((email) => isNewsletterUnsubscribed.get(email)) },
    recent: recentLog(),
  });
}

export async function POST(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const body = await request.json().catch(() => ({}));
  const result = await sendAdminEmail({
    to: body?.to,
    subject: body?.subject,
    body: body?.body,
    allowUnsubscribed: Boolean(body?.allowUnsubscribed),
  });

  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ...result, recent: recentLog() });
}
