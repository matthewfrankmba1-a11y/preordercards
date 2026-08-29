import { NextResponse } from 'next/server';
import { checkAdminSecret } from '../../../../../lib/utils';
import { getLifetimePageViews } from '../../../../../lib/ga4';
import { getHomepageViews, setHomepageViews } from '../../../../../lib/pageViews';

// One-shot: sets the footer counter to the site's real history so it doesn't
// start from zero. Reads GA4's lifetime homepage `screenPageViews` by
// default; pass an explicit `views` to set a number by hand (e.g. read off
// the GA4 dashboard) when the Data API credentials aren't configured.
//
// This runs on the server rather than as a shell command because the
// database lives on Render's mounted disk, which has no shell access from a
// dev machine — same reasoning as the seller key-minting routes.
//
// Refuses to overwrite a counter that has already been seeded or has
// accumulated real traffic unless `force: true`, so a second accidental call
// can't silently reset it.
export async function POST(request) {
  if (!checkAdminSecret(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const previous = getHomepageViews();

  if (previous > 0 && body?.force !== true) {
    return NextResponse.json(
      {
        error: `Counter is already at ${previous}. Pass {"force": true} to overwrite it.`,
        previous,
      },
      { status: 409 }
    );
  }

  let target;
  let source;
  let ga4 = null;

  if (body?.views !== undefined) {
    target = Number(body.views);
    source = 'explicit';
    if (!Number.isInteger(target) || target < 0) {
      return NextResponse.json({ error: '`views` must be a whole number, 0 or greater.' }, { status: 400 });
    }
  } else {
    ga4 = await getLifetimePageViews();
    if (!ga4) {
      return NextResponse.json(
        {
          error:
            'Could not read GA4. Check GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_KEY, or pass an explicit {"views": N}.',
        },
        { status: 503 }
      );
    }
    target = ga4.homepage;
    source = 'ga4';
  }

  const views = setHomepageViews(target);

  // `ga4.sitewide` is reported but never used as the seed — the footer
  // counts homepage views specifically, and sitewide would overstate it.
  return NextResponse.json({
    success: true,
    previous,
    views,
    source,
    ...(ga4 ? { ga4Homepage: ga4.homepage, ga4Sitewide: ga4.sitewide } : {}),
  });
}
