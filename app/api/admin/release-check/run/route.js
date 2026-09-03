import { NextResponse } from 'next/server';
import { checkAdminSecret } from '../../../../../lib/utils';
import { runReleaseCheck } from '../../../../../lib/releaseCheck';

// Runs the release-source check on demand and returns the full report.
// Nothing is ever written to data/releases.json — see lib/releaseCheck.js.
//
// Body: {"notify": false} to skip the Discord post, which is what you want
// when testing the sources rather than reporting to the channel.
export async function POST(request) {
  if (!checkAdminSecret(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const notify = body?.notify !== false;

  const report = await runReleaseCheck({ notify });
  if (report.error) return NextResponse.json({ error: report.error }, { status: 400 });
  return NextResponse.json({ success: true, ...report });
}
