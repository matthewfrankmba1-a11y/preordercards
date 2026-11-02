import { NextResponse } from 'next/server';
import { getNewsletterSendById, getAdminEmailById, insertNewsletterUnsubscribe } from '../../../../lib/db';
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

  // 'a' is a broadcast sent from the admin panel's Email tab, 's' a weekly
  // newsletter send. Two id spaces, two token kinds, one landing page.
  const adminId = Number(params.get('a'));
  if (Number.isInteger(adminId) && adminId > 0) {
    if (!verifyToken('ua', adminId, params.get('k'))) return null;
    const row = getAdminEmailById.get(adminId);
    return row ? row.toEmail : null;
  }

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
