import { NextResponse } from 'next/server';
import { requireMarketplaceAdmin } from '../../../../../lib/marketplaceAdminAuth';
import {
  getNewsletterDateCheck,
  setNewsletterDateCheck,
  addNewsletterExclusion,
  removeNewsletterExclusion,
} from '../../../../../lib/db';
import {
  buildIssue,
  dateCheckStatus,
  dateStringInTZ,
  nextIssueWeek,
  releasesFingerprint,
} from '../../../../../lib/newsletter';

// The accuracy gate for the weekly send. GET shows exactly what the issue
// would claim about each release; POST either strikes a release out of this
// week's issue, puts it back, or records that a human checked the remaining
// claims against the manufacturer's own calendar — which is what unlocks
// the send.
//
// Striking out beats correcting for the common case: a date that disagrees
// with the manufacturer can be dropped from this week's email in one click,
// where fixing data/releases.json properly means an edit, a commit and a
// redeploy. The release keeps showing on the site; it just isn't asserted
// in the email.
//
// The confirmation is fingerprinted over what actually ships — the included
// releases only — so striking one out after confirming re-locks the send,
// and an excluded release's data changing doesn't, because the email makes
// no claim about it.
function describe(release, excluded) {
  return {
    id: release.id,
    title: release.title,
    releaseDate: release.releaseDate,
    sport: release.sport,
    format: release.format,
    eql: Boolean(release.eql),
    isPreorderOpenDate: Boolean(release.isPreorderOpenDate),
    description: release.description || '',
    excluded,
  };
}

async function weekPayload() {
  const today = dateStringInTZ(new Date());
  const issue = await buildIssue(today);
  const check = getNewsletterDateCheck.get(issue.weekOf);

  const releases = [
    ...issue.releases.map((r) => describe(r, false)),
    ...issue.excludedReleases.map((r) => describe(r, true)),
  ].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) || a.title.localeCompare(b.title));

  return {
    weekOf: issue.weekOf,
    until: issue.untilDate,
    nextIssueWeek: nextIssueWeek(today),
    status: dateCheckStatus(issue),
    confirmedReleaseCount: check ? check.releaseCount : null,
    includedCount: issue.releases.length,
    excludedCount: issue.excludedReleases.length,
    releases,
  };
}

export async function GET(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(await weekPayload());
}

export async function POST(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const body = await request.json().catch(() => ({}));
  const action = body?.action || 'confirm';
  const today = dateStringInTZ(new Date());
  const issue = await buildIssue(today);

  // The client echoes back the week it was looking at. If the week rolled
  // over between loading the page and clicking, the action would land on a
  // week nobody actually reviewed.
  if (body?.weekOf && body.weekOf !== issue.weekOf) {
    return NextResponse.json(
      { error: `The week changed while you were reviewing (now ${issue.weekOf}). Reload and check again.` },
      { status: 409 }
    );
  }

  if (action === 'exclude' || action === 'include') {
    const releaseId = body?.releaseId;
    if (typeof releaseId !== 'string' || !releaseId) {
      return NextResponse.json({ error: 'releaseId is required.' }, { status: 400 });
    }
    const known = [...issue.releases, ...issue.excludedReleases].some((r) => r.id === releaseId);
    if (!known) {
      return NextResponse.json({ error: 'That release is not in this week.' }, { status: 404 });
    }
    if (action === 'exclude') addNewsletterExclusion.run({ weekOf: issue.weekOf, releaseId });
    else removeNewsletterExclusion.run({ weekOf: issue.weekOf, releaseId });
    return NextResponse.json(await weekPayload());
  }

  if (action === 'confirm') {
    setNewsletterDateCheck.run({
      weekOf: issue.weekOf,
      releaseCount: issue.releases.length,
      fingerprint: releasesFingerprint(issue.releases),
    });
    return NextResponse.json(await weekPayload());
  }

  return NextResponse.json({ error: 'action must be one of: confirm, exclude, include.' }, { status: 400 });
}
