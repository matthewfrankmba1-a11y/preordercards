import { NextResponse } from 'next/server';
import { requireMarketplaceAdmin } from '../../../../../lib/marketplaceAdminAuth';
import {
  insertDiscountSignup,
  getDiscountSignupByEmail,
  isNewsletterUnsubscribed,
  countNewsletterUnsubscribes,
} from '../../../../../lib/db';
import { EMAIL_RE, isLikelyTestContact } from '../../../../../lib/utils';
import {
  AUDIENCE,
  dateStringInTZ,
  firstEligibleWeek,
  listRecipients,
  nextIssueWeek,
} from '../../../../../lib/newsletter';

// Adds addresses to the newsletter list by hand, from the TOTP-gated
// marketplace admin panel.
//
// The add is deliberately silent — no welcome email, no confirmation of any
// kind. These are people the owner already has a relationship with (a DM, a
// show, a reply thread), so a surprise "welcome!" from a list they didn't
// visibly join reads worse than the first roundup arriving on schedule.
// Everything downstream is completely normal: they land in the same
// audience query as every other subscriber, get the same first-week wait,
// and every issue carries the same one-click unsubscribe.
const SENTINEL_FAR_FUTURE = '9999-12-31';

function splitAddresses(input) {
  const raw = Array.isArray(input) ? input.join('\n') : String(input || '');
  // Commas, semicolons and whitespace all separate — pasting from a
  // spreadsheet column, a contacts export, or an email "To:" line should
  // all just work without the owner reformatting anything first.
  return raw
    .split(/[\s,;]+/)
    .map((value) => value.trim().toLowerCase().replace(/^[<"']+|[>"']+$/g, ''))
    .filter(Boolean);
}

function listSummary() {
  const today = dateStringInTZ(new Date());
  const nextWeek = nextIssueWeek(today);
  return {
    // Measured against the next issue that actually goes out, not against
    // the calendar week — on a Saturday those are different weeks, and the
    // useful question is "who would the next send reach".
    receivingNext: listRecipients(nextWeek).length,
    totalOnList: listRecipients(SENTINEL_FAR_FUTURE).length,
    unsubscribed: countNewsletterUnsubscribes.get().c,
    audience: AUDIENCE,
    nextIssueWeek: nextWeek,
    firstIssueWeek: firstEligibleWeek(today),
  };
}

export async function GET(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ ...listSummary() });
}

export async function POST(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const body = await request.json().catch(() => ({}));
  const addresses = splitAddresses(body?.emails);

  if (!addresses.length) {
    return NextResponse.json({ error: 'Paste at least one email address.' }, { status: 400 });
  }
  // Generous but bounded — a paste this large is more likely a mistake
  // (wrong column, whole spreadsheet) than a real batch.
  if (addresses.length > 1000) {
    return NextResponse.json({ error: 'Too many addresses at once — paste 1,000 or fewer.' }, { status: 400 });
  }

  const results = [];
  const seen = new Set();

  for (const email of addresses) {
    if (seen.has(email)) {
      results.push({ email, status: 'duplicate' });
      continue;
    }
    seen.add(email);

    if (!EMAIL_RE.test(email) || email.length > 254) {
      results.push({ email, status: 'invalid' });
      continue;
    }

    // An unsubscribe is permanent and outranks a manual add: the send would
    // suppress this address anyway, so inserting the row would only create
    // the false impression that they'd been added. Re-subscribing someone
    // who opted out has to be a deliberate act, not a side effect of pasting
    // an old list.
    if (isNewsletterUnsubscribed.get(email)) {
      results.push({ email, status: 'unsubscribed' });
      continue;
    }

    // Same filter the send applies — adding one would be a silent no-op.
    if (isLikelyTestContact(email)) {
      results.push({ email, status: 'test' });
      continue;
    }

    if (getDiscountSignupByEmail.get(email)) {
      results.push({ email, status: 'already' });
      continue;
    }

    const inserted = insertDiscountSignup.run({ email, source: 'manual' });
    results.push({ email, status: inserted.changes ? 'added' : 'already' });
  }

  const counts = results.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({ success: true, counts, results, ...listSummary() });
}
