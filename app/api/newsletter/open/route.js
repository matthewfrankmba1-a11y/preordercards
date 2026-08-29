import { getNewsletterSendById, markNewsletterOpened } from '../../../../lib/db';
import { verifyToken } from '../../../../lib/newsletter';

// 1x1 tracking pixel at the foot of each newsletter. Treated as directional
// only: Apple Mail Privacy Protection prefetches images for its users
// whether or not the message was read, so opens inflate and can't settle
// the A/B test on their own — the click route is what does.
export const dynamic = 'force-dynamic';

// Smallest valid transparent GIF, inlined so the response never depends on
// a file on disk.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const sendId = Number(params.get('s'));

  if (Number.isInteger(sendId) && sendId > 0 && verifyToken('o', sendId, params.get('k'))) {
    const send = getNewsletterSendById.get(sendId);
    if (send) markNewsletterOpened.run(sendId);
  }

  // Always returns the pixel, verified or not — an error image in someone's
  // inbox is a worse outcome than an uncounted open.
  return new Response(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(PIXEL.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    },
  });
}
