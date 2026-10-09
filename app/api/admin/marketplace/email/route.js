import { NextResponse } from 'next/server';
import { requireMarketplaceAdmin } from '../../../../../lib/marketplaceAdminAuth';
import { listAdminEmails, isNewsletterUnsubscribed, listAllInterestsForAdmin } from '../../../../../lib/db';
import { loadReleases } from '../../../../../lib/releases';
import { isEmailConfigured, EMAIL_FROM } from '../../../../../lib/email';
import {
  MAX_BODY,
  MAX_RECIPIENTS,
  MAX_SUBJECT,
  parseRecipients,
  queueEmail,
  sendAdminEmail,
} from '../../../../../lib/adminEmail';
import bot from '../../../../../lib/bot';

const LOG_LIMIT = 50;

function recentLog() {
  return listAdminEmails.all({ limit: LOG_LIMIT });
}

// The people who registered interest in a given release, so "email everyone
// who preordered X" doesn't mean copying addresses out of the registrations
// table by hand. Cancelled registrations are left out — they asked to be
// taken off that release. Phone-only registrants have no address to add.
//
// This is a targeted audience, not a list: it's still capped by the same
// per-send limit, and mailing everyone is still the newsletter's job.
function audiences() {
  const byRelease = new Map();

  for (const row of listAllInterestsForAdmin.all()) {
    if (row.cancelledAt || row.contactType !== 'email') continue;
    const email = String(row.contactValue || '').trim().toLowerCase();
    if (!email) continue;
    if (!byRelease.has(row.releaseId)) byRelease.set(row.releaseId, new Set());
    byRelease.get(row.releaseId).add(email);
  }

  // Every release is listed, not only the ones with registrants. A release
  // missing from the list is indistinguishable from a release nobody
  // registered for, and the second is the far more common case — showing it
  // with "0 addresses" answers the question instead of raising it.
  const rows = loadReleases().releases.map((release) => ({
    releaseId: release.id,
    title: release.title,
    releaseDate: release.releaseDate || null,
    emails: [...(byRelease.get(release.id) || [])].sort(),
  }));

  // Registrations whose release id is no longer in the data — a renamed or
  // deleted entry. Those people are still owed an answer, so the id itself
  // stands in for the title rather than the audience disappearing.
  const known = new Set(rows.map((r) => r.releaseId));
  for (const [releaseId, emails] of byRelease) {
    if (known.has(releaseId)) continue;
    rows.push({ releaseId, title: releaseId, releaseDate: null, emails: [...emails].sort() });
  }

  return rows.sort(
    (a, b) =>
      b.emails.length - a.emails.length ||
      (b.releaseDate || '').localeCompare(a.releaseDate || '') ||
      a.title.localeCompare(b.title)
  );
}


export async function GET(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const url = new URL(request.url);
  // The composer asks about its current recipient box as it's typed, so the
  // unsubscribe warning appears before the send rather than after it.
  const check = url.searchParams.get('check');
  const { valid, invalid } = check ? parseRecipients(check) : { valid: [], invalid: [] };

  return NextResponse.json({
    configured: isEmailConfigured(),
    from: EMAIL_FROM,
    limits: { recipients: MAX_RECIPIENTS, subject: MAX_SUBJECT, body: MAX_BODY },
    recipients: { valid, invalid, unsubscribed: valid.filter((email) => isNewsletterUnsubscribed.get(email)) },
    audiences: audiences(),
    recent: recentLog(),
  });
}

export async function POST(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const body = await request.json().catch(() => ({}));

  // Park it for approval instead of sending now — the point is to tap Send
  // from a phone, in Discord, rather than coming back to the panel.
  if (body?.queue) {
    if (!bot.isConfigured()) {
      return NextResponse.json(
        { error: 'The Discord bot is not configured (DISCORD_BOT_TOKEN / DISCORD_CHANNEL_ID), so there is nowhere to post it.' },
        { status: 400 }
      );
    }

    const queued = queueEmail({
      to: body?.to,
      subject: body?.subject,
      body: body?.body,
      allowUnsubscribed: Boolean(body?.allowUnsubscribed),
    });
    if (queued.error) return NextResponse.json({ error: queued.error }, { status: 400 });

    const posted = await bot.postQueuedEmail(queued);
    if (!posted) {
      return NextResponse.json(
        { error: "Couldn't post to Discord — the bot may be offline. Nothing was sent." },
        { status: 502 }
      );
    }
    return NextResponse.json({ queued: true, toEmail: queued.toEmail, recent: recentLog() });
  }

  const result = await sendAdminEmail({
    to: body?.to,
    subject: body?.subject,
    body: body?.body,
    allowUnsubscribed: Boolean(body?.allowUnsubscribed),
  });

  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ...result, recent: recentLog() });
}
