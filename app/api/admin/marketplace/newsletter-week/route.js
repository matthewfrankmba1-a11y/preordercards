import { NextResponse } from 'next/server';
import { requireMarketplaceAdmin } from '../../../../../lib/marketplaceAdminAuth';
import { getNewsletterDateCheck, setNewsletterDateCheck } from '../../../../../lib/db';
import {
  buildIssue,
  dateCheckStatus,
  dateStringInTZ,
  nextIssueWeek,
  releasesFingerprint,
} from '../../../../../lib/newsletter';

// The accuracy gate for the weekly send. GET shows exactly what the next
// issue would claim about each release; POST records that a human checked
// those claims against the manufacturer's own calendar, which is what
// unlocks the send.
//
// The confirmation is fingerprinted over the release fields the email
// actually asserts, so editing a date after confirming re-blocks the send
// instead of riding out on a stale approval.
export async function GET(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const issue = await buildIssue(dateStringInTZ(new Date()));
  const check = getNewsletterDateCheck.get(issue.weekOf);

  return NextResponse.json({
    weekOf: issue.weekOf,
    until: issue.untilDate,
    nextIssueWeek: nextIssueWeek(dateStringInTZ(new Date())),
    status: dateCheckStatus(issue),
    confirmedReleaseCount: check ? check.releaseCount : null,
    // Exactly the claims the email prints, in the order it prints them, so
    // the check is against the email's own words rather than a summary of
    // them.
    releases: issue.releases.map((r) => ({
      id: r.id,
      title: r.title,
      releaseDate: r.releaseDate,
      sport: r.sport,
      format: r.format,
      eql: Boolean(r.eql),
      isPreorderOpenDate: Boolean(r.isPreorderOpenDate),
      description: r.description || '',
    })),
  });
}

export async function POST(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const body = await request.json().catch(() => ({}));
  const issue = await buildIssue(dateStringInTZ(new Date()));

  // The client echoes back the week it was looking at. If the week rolled
  // over between loading the page and clicking confirm, the confirmation
  // would land on a week nobody actually reviewed.
  if (body?.weekOf && body.weekOf !== issue.weekOf) {
    return NextResponse.json(
      { error: `The week changed while you were reviewing (now ${issue.weekOf}). Reload and check again.` },
      { status: 409 }
    );
  }

  setNewsletterDateCheck.run({
    weekOf: issue.weekOf,
    releaseCount: issue.releases.length,
    fingerprint: releasesFingerprint(issue.releases),
  });

  return NextResponse.json({ success: true, status: dateCheckStatus(issue) });
}
