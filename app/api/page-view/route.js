import { NextResponse } from 'next/server';
import { createRateLimiter } from '../../../lib/utils';
import { isLikelyBot, recordHomepageView, getHomepageViews } from '../../../lib/pageViews';

// Own bucket, independent from the other route groups' limiters. Higher
// ceiling than the form routes (a shared office or phone network can
// legitimately produce a lot of homepage loads), but low enough that
// nobody can script the counter up by orders of magnitude.
const rateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 60,
  message: 'Too many requests.',
});

export async function POST(request) {
  // A blocked or bot request still gets the current total back, so the
  // footer shows a real number rather than an error state — the count
  // just doesn't include this visit.
  if (!rateLimit(request).allowed || isLikelyBot(request.headers.get('user-agent'))) {
    return NextResponse.json({ views: getHomepageViews(), counted: false });
  }

  return NextResponse.json({ views: recordHomepageView(), counted: true });
}
