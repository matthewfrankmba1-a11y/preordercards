import { NextResponse } from 'next/server';
import { checkAdminSecret } from '../../../../../lib/utils';
import {
  buildIssue,
  dateStringInTZ,
  previewIssue,
  runScheduledSend,
  sendTestIssue,
  VARIANTS,
} from '../../../../../lib/newsletter';

// Manual control over the weekly send. Four modes, all admin-secret gated:
//
//   {"mode":"preview"}                     — assemble the week's issue and
//                                            return the rendered email plus
//                                            each cohort's size. Sends nothing,
//                                            and never publishes a post.
//   {"mode":"test","to":"me@example.com"}  — mail that one address a copy.
//                                            No send rows, no tracking.
//   {"mode":"send","variant":"sunday"}     — the real thing for one cohort,
//                                            same code path the schedule runs.
//   {"mode":"send","variant":"monday"}
//
// "week" (YYYY-MM-DD, any day inside the target week) picks a week other
// than the current one; "limit" caps a send.
export async function POST(request) {
  if (!checkAdminSecret(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const mode = body?.mode || 'preview';
  const variant = body?.variant || 'sunday';
  const dateISO = typeof body?.week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.week) ? body.week : dateStringInTZ(new Date());

  if (!VARIANTS.includes(variant)) {
    return NextResponse.json({ error: `variant must be one of: ${VARIANTS.join(', ')}.` }, { status: 400 });
  }

  try {
    if (mode === 'send') {
      const limitParam = Number(body?.limit);
      const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined;
      const result = await runScheduledSend({ variant, dateISO, ...(limit ? { limit } : {}) });
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true, ...result });
    }

    // Neither preview nor test publishes anything: only a real send will
    // fall back to running the blog agent when the week has no post yet.
    const issue = await buildIssue(dateISO);

    if (mode === 'test') {
      const to = body?.to;
      if (typeof to !== 'string' || !to.includes('@')) {
        return NextResponse.json({ error: 'A "to" address is required for a test send.' }, { status: 400 });
      }
      const result = await sendTestIssue(issue, { variant, to });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
      return NextResponse.json({ success: true, mode, to, issueKey: issue.issueKey, subject: issue.subject });
    }

    if (mode === 'preview') {
      return NextResponse.json({
        success: true,
        mode,
        week: { since: issue.weekOf, until: issue.untilDate },
        postSlug: issue.postSlug,
        hasPost: Boolean(issue.postSlug),
        releaseCount: issue.releases.length,
        webPath: issue.webPath,
        ...previewIssue(issue, { variant }),
      });
    }

    return NextResponse.json({ error: 'mode must be one of: preview, test, send.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
