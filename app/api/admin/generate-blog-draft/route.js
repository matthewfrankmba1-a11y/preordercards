import { NextResponse } from 'next/server';
import { checkAdminSecret } from '../../../../lib/utils';
import { todayISO } from '../../../../lib/releases';
import { generateBlogDraftForWeek } from '../../../../lib/blogDraft';
import { renderBlogPostModule, renderBlogPostsEntry } from '../../../../lib/blogPostTemplate';

// Drafts a "what's coming out this week" post via Claude from the real
// release calendar, then templates it into the exact page.js source + the
// lib/blogPosts.js entry this site's post pages already follow — review the
// draft, then save pageSource to app/blog/<slug>/page.js and add
// blogPostsEntry to lib/blogPosts.js. Doesn't write files itself: a new
// static route only takes effect after a rebuild/redeploy anyway, so there's
// no runtime benefit to writing into the deployed filesystem here.
export async function POST(request) {
  if (!checkAdminSecret(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const daysParam = Number(body?.days);
  const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 7;

  let result;
  try {
    result = await generateBlogDraftForWeek({ days });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  const datePublished = todayISO();
  const pageSource = renderBlogPostModule(result.draft, datePublished);
  const blogPostsEntry = renderBlogPostsEntry(result.draft, datePublished);

  return NextResponse.json({
    success: true,
    since: result.since,
    until: result.until,
    releaseCount: result.releases.length,
    servedByModel: result.servedByModel,
    draft: result.draft,
    filePath: `app/blog/${result.draft.slug}/page.js`,
    pageSource,
    blogPostsEntry,
  });
}
