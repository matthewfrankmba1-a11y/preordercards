import { NextResponse } from 'next/server';
import { getNewsletterSendById, insertNewsletterUnsubscribe } from '../../../../lib/db';
import { verifyToken, SITE_URL } from '../../../../lib/newsletter';

// One-click unsubscribe. Every newsletter carries this link in its footer
// and in the List-Unsubscribe header, so both the visible link (GET) and
// the mailbox provider's own button (POST, per RFC 8058) land here.
//
// The link identifies the recipient by their send-row id plus an HMAC, so
// the address never appears in a URL and one subscriber's link can't be
// edited into someone else's unsubscribe.
export const dynamic = 'force-dynamic';

function resolveEmail(request) {
  const params = request.nextUrl.searchParams;
  const sendId = Number(params.get('s'));
  if (!Number.isInteger(sendId) || sendId <= 0) return null;
  if (!verifyToken('u', sendId, params.get('k'))) return null;
  const send = getNewsletterSendById.get(sendId);
  return send ? send.email : null;
}

export async function GET(request) {
  const email = resolveEmail(request);
  if (email) insertNewsletterUnsubscribe.run({ email, source: 'link' });

  // Redirected rather than answered with bare HTML so the confirmation is
  // the site's own page, styled like everything else.
  return NextResponse.redirect(`${SITE_URL}/newsletter.html?unsubscribed=${email ? '1' : '0'}`, 302);
}

// RFC 8058 one-click: the provider POSTs here with no user present, and
// only a 2xx counts as honored.
export async function POST(request) {
  const email = resolveEmail(request);
  if (email) insertNewsletterUnsubscribe.run({ email, source: 'one-click' });
  return NextResponse.json({ unsubscribed: Boolean(email) });
}
