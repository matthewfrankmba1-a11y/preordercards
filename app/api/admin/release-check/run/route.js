import { NextResponse } from 'next/server';
import { checkAdminSecret } from '../../../../../lib/utils';
import { runReleaseCheck } from '../../../../../lib/releaseCheck';

// Runs the release-source check on demand and returns the full report.
// Nothing is ever written to data/releases.json — see lib/releaseCheck.js.
//
// Body:
//   {"notify": false} skips the Discord post — what you want while testing.
//   {"debug": true}   fetches each source and returns what actually came
//                     back (status, final URL, content type, lengths, and a
//                     sample of the raw HTML) without running extraction.
//                     This is the tool for "the source stopped working":
//                     a character count alone can't distinguish a bot block
//                     from a client-rendered page from a redirect.
export async function POST(request) {
  if (!checkAdminSecret(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const notify = body?.notify !== false;
  const debug = body?.debug === true;

  const report = await runReleaseCheck({ notify, debug });
  if (report.error) return NextResponse.json({ error: report.error }, { status: 400 });
  return NextResponse.json({ success: true, ...report });
}
