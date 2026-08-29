import { NextResponse } from 'next/server';
import { getNewsletterSendById, markNewsletterClicked } from '../../../../lib/db';
import { verifyToken, SITE_URL } from '../../../../lib/newsletter';

// Click tracking for the weekly newsletter: records that this recipient
// clicked, then redirects to the real destination. Click rate per send-day
// cohort is what decides the Sunday-vs-Monday test (see the admin report
// route), since open tracking is unreliable.
export const dynamic = 'force-dynamic';

// Only same-origin paths are ever redirected to. The destination arrives in
// the query string so one signed link shape can cover every link in the
// email, which would otherwise be an open redirect — a leading "//" or any
// "scheme:" prefix would send readers off-site under this domain's name.
function safePath(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const sendId = Number(params.get('s'));
  const path = safePath(params.get('p'));
  const destination = `${SITE_URL}${path}`;

  // A bad or missing token never costs the reader their click — it just
  // isn't counted.
  if (Number.isInteger(sendId) && sendId > 0 && verifyToken('c', sendId, params.get('k'))) {
    const send = getNewsletterSendById.get(sendId);
    if (send) markNewsletterClicked.run(sendId);
  }

  return NextResponse.redirect(destination, 302);
}
