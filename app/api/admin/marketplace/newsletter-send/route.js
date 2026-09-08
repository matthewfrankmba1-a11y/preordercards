import { NextResponse } from 'next/server';
import { requireMarketplaceAdmin } from '../../../../../lib/marketplaceAdminAuth';
import {
  buildIssue,
  dateCheckStatus,
  dateStringInTZ,
  isSendRunning,
  runScheduledSend,
  sendReadiness,
  ENABLED,
  VARIANTS,
} from '../../../../../lib/newsletter';

// The Send now button behind the marketplace admin panel's TOTP session,
// so mailing the list doesn't mean pasting ADMIN_SECRET into a terminal.
//
// POST starts the run and returns immediately rather than holding the
// request open for it: a few hundred messages at NEWSLETTER_SEND_DELAY_MS
// apart takes minutes, which is longer than any proxy in front of this
// wants to wait. The panel polls GET for progress, and the Discord notice
// still fires when the cohort finishes.

async function payload() {
  const issue = await buildIssue(dateStringInTZ(new Date()));
  const status = dateCheckStatus(issue);
  return {
    weekOf: issue.weekOf,
    subject: issue.subject,
    // The schedule being off is worth saying out loud on a page with a send
    // button: it's exactly the state where a manual send is the only way an
    // issue goes out at all.
    scheduleArmed: ENABLED,
    running: isSendRunning(),
    blocker: status.skipped
      ? `The week of ${issue.weekOf} is skipped. Un-skip it above to send.`
      : status.blocker,
    cohorts: sendReadiness(issue),
  };
}

export async function GET(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(await payload());
}

export async function POST(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const body = await request.json().catch(() => ({}));
  const variant = body?.variant;
  if (!VARIANTS.includes(variant)) {
    return NextResponse.json({ error: `variant must be one of: ${VARIANTS.join(', ')}.` }, { status: 400 });
  }

  const today = dateStringInTZ(new Date());
  const issue = await buildIssue(today);

  // Same guard the date check uses: the button was drawn for a particular
  // week, and if the week rolled over between the page load and the click,
  // this would mail an issue nobody reviewed.
  if (body?.weekOf && body.weekOf !== issue.weekOf) {
    return NextResponse.json(
      { error: `The week changed while you had this open (now ${issue.weekOf}). Reload before sending.` },
      { status: 409 }
    );
  }

  if (isSendRunning()) {
    return NextResponse.json({ error: 'A send is already in progress.' }, { status: 409 });
  }

  // A pre-check so a blocked send says why in the panel instead of failing
  // silently in the background. It is not the enforcement point — that stays
  // in sendIssueToVariant, which every send passes through.
  const status = dateCheckStatus(issue);
  if (status.skipped) {
    return NextResponse.json(
      { error: `The week of ${issue.weekOf} is skipped. Un-skip it before sending.` },
      { status: 400 }
    );
  }
  if (status.blocker) {
    return NextResponse.json({ error: status.blocker }, { status: 400 });
  }

  // Deliberately not awaited — see the note at the top. Errors can't reach
  // the client from here, so they go to the log and, for a finished cohort,
  // to the Discord notice.
  runScheduledSend({ variant, dateISO: today })
    .then((result) => {
      if (result && result.error) console.error(`Newsletter send (${variant}) ended with: ${result.error}`);
      else console.log(`Newsletter send (${variant}) from the admin panel:`, JSON.stringify(result));
    })
    .catch((err) => console.error(`Newsletter send (${variant}) threw:`, err.message));

  return NextResponse.json({ started: true, variant, ...(await payload()) });
}
