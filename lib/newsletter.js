// The weekly "what's coming out this week" newsletter: builds one issue per
// calendar week from the release calendar, publishes it to the site as a
// blog post, and mails it to the collected signup list split into two
// send-day cohorts so Sunday and Monday can be compared head to head.
//
// Not destructured — db.js lazily opens the database on first property
// access, deferred until these functions actually run (never at module top
// level, which Next's build step would otherwise trigger).
const crypto = require('crypto');
const db = require('./db');
const { sendEmail, isEmailConfigured } = require('./email');
const { EMAIL_RE, isLikelyTestContact } = require('./utils');
const { getReleasesInWindow } = require('./blogDraft');
const { runBlogAgent } = require('./blogAgent');
const { renderIssueHtml, renderIssueText, formatWindowLabel, formatShortDate } = require('./newsletterEmail');

const SITE_URL = (process.env.SITE_URL || 'https://preordercards.com').replace(/\/+$/, '');
const TIMEZONE = 'America/New_York';

// Both arms go out at the same local hour so the send day is the only
// variable under test.
const SEND_HOUR = Number(process.env.NEWSLETTER_SEND_HOUR || 10);
const TICK_INTERVAL_MS = 5 * 60 * 1000;

// Resend's free tier allows 3,000 emails/month and rate-limits bursts, so
// sends are serial with a short gap and a per-run ceiling. A run that hits
// the ceiling isn't lost: the next tick in the same send hour picks up the
// recipients that don't have a row yet.
const MAX_PER_RUN = Number(process.env.NEWSLETTER_MAX_PER_RUN || 500);
const SEND_DELAY_MS = Number(process.env.NEWSLETTER_SEND_DELAY_MS || 150);

// 'all' (default) = everyone who has given us an email address, including
// people who registered interest in a release or a listing — the
// registration form tells them the address gets the weekly roundup, and
// every issue carries a one-click unsubscribe. 'signups' narrows it back to
// just the two dedicated signup forms.
const AUDIENCE = process.env.NEWSLETTER_AUDIENCE === 'signups' ? 'signups' : 'all';

// Off by default: a fresh deploy should never start mailing the list on its
// own before someone has previewed an issue.
const ENABLED = process.env.NEWSLETTER_ENABLED === 'true';

const VARIANTS = ['sunday', 'monday'];
const VARIANT_BY_WEEKDAY = { 0: 'sunday', 1: 'monday' };

// --- dates -----------------------------------------------------------------

function dateStringInTZ(date, timeZone = TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date); // YYYY-MM-DD
}

function hourInTZ(date, timeZone = TIMEZONE) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hour12: false }).format(date));
}

// Noon UTC, not midnight: it keeps the date from sliding a day either way
// when the string is parsed, whatever the host's own offset is.
function dayOfWeekForISO(iso) {
  return new Date(iso + 'T12:00:00Z').getUTCDay();
}

function addDaysISO(iso, days) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The Sunday-to-Saturday week containing the given date. Both cohorts share
// one window — the Monday arm mails the same issue as the Sunday arm, so
// the only difference between them is the day it lands.
function weekWindowFor(dateISO) {
  const since = addDaysISO(dateISO, -dayOfWeekForISO(dateISO));
  return { since, until: addDaysISO(since, 6) };
}

// --- signed links ----------------------------------------------------------

// Every tracking and unsubscribe link is an HMAC over the send row's id, so
// the id alone isn't enough to unsubscribe someone else or fake engagement,
// and no email address ever rides in a URL. Distinct `kind` prefixes stop a
// click token from being replayed as an unsubscribe.
function linkSecret() {
  return process.env.NEWSLETTER_SECRET || process.env.ADMIN_SECRET || '';
}

function signToken(kind, id) {
  return crypto
    .createHmac('sha256', linkSecret())
    .update(`${kind}:${id}`)
    .digest('base64url')
    .slice(0, 27);
}

function verifyToken(kind, id, token) {
  if (!linkSecret() || !token) return false;
  const expected = Buffer.from(signToken(kind, id));
  const actual = Buffer.from(String(token));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// UTM goes before any fragment — "/#some-release" has to become
// "/?utm_...#some-release", not "/#some-release?utm_...", or GA4 never sees
// the campaign and the anchor stops resolving.
function withUtm(path, campaign, variant) {
  const [beforeHash, hash] = path.split('#');
  const separator = beforeHash.includes('?') ? '&' : '?';
  const query =
    `utm_source=newsletter&utm_medium=email` +
    `&utm_campaign=${encodeURIComponent(campaign)}&utm_content=${encodeURIComponent(variant)}`;
  return `${beforeHash}${separator}${query}${hash ? '#' + hash : ''}`;
}

// sendId is null for previews and test sends (no row to attribute clicks
// to), in which case links point straight at their destination and the
// open pixel is dropped rather than pointing at a token that can't verify.
function buildLinks(issue, { sendId, variant }) {
  const campaign = issue.issueKey;

  const track = (path) => {
    const target = withUtm(path, campaign, variant);
    if (!sendId) return SITE_URL + target;
    return `${SITE_URL}/api/newsletter/click?s=${sendId}&k=${signToken('c', sendId)}&p=${encodeURIComponent(target)}`;
  };

  return {
    calendar: track('/'),
    marketplace: track('/marketplace.html'),
    webVersion: track(issue.webPath),
    release: (release) => track(`/#${release.id}`),
    unsubscribe: sendId
      ? `${SITE_URL}/api/newsletter/unsubscribe?s=${sendId}&k=${signToken('u', sendId)}`
      : `${SITE_URL}/newsletter.html`,
    openPixel: sendId ? `${SITE_URL}/api/newsletter/open?s=${sendId}&k=${signToken('o', sendId)}` : null,
  };
}

// --- the A/B split ---------------------------------------------------------

// Deterministic, so an address stays in the same arm week after week. A
// per-address coin flip decided at send time would re-randomize the cohorts
// every issue and make the day comparison meaningless. NEWSLETTER_AB_SALT
// exists to reshuffle the split deliberately if the arms ever need
// re-drawing after a test concludes.
function variantForEmail(email) {
  const salt = process.env.NEWSLETTER_AB_SALT || '';
  const digest = crypto.createHash('sha256').update(`${salt}:${String(email).trim().toLowerCase()}`).digest();
  return VARIANTS[digest.readUInt32BE(0) % VARIANTS.length];
}

// --- issue content ---------------------------------------------------------

function buildSubject(releases, since, until) {
  const windowLabel = formatWindowLabel(since, until);
  if (!releases.length) return `No new drops this week (${windowLabel}) — what's next`;
  const [first, ...rest] = releases;
  const more = rest.length ? ` + ${rest.length} more` : '';
  return `This week: ${first.title}${more}`;
}

// The connective prose for a week with no post — the blog agent declined
// (no upcoming releases) or its run failed. The email still carries the
// whole release list, which is rendered from the calendar rather than from
// any model output, so this only has to supply the surrounding copy, and
// stays evergreen rather than improvising commentary about products.
function fallbackSections(releases) {
  const eqlCount = releases.filter((r) => r.eql).length;
  const sections = [];

  if (eqlCount) {
    sections.push({
      heading: 'EQL releases this week',
      paragraphs: [
        `${eqlCount === 1 ? 'One release' : `${eqlCount} releases`} this week ${eqlCount === 1 ? 'is' : 'are'} sold ` +
          'through an EQL raffle entry rather than first-come-first-served checkout. Entry windows open and close ' +
          'ahead of the release date, so getting one means registering during the window, not refreshing at drop time.',
      ],
    });
  }

  sections.push({
    heading: 'How to use the calendar',
    paragraphs: [
      'Registering interest on a release is free and collects no payment — it tells us how much to try to secure ' +
        'and gets you an email when we know whether we got an allocation. Dates come from public trackers and ' +
        'manufacturers move them with little notice, so confirm before you plan around one.',
    ],
  });

  return sections;
}

// The week's post, if the agent has already published one for this week.
// Body sections are stored as JSON (see the blog_posts table).
function getWeeklyPost(sinceISO) {
  const row = db.getLatestBlogPostSince.get(sinceISO);
  if (!row) return null;
  let sections;
  try {
    sections = JSON.parse(row.bodyJson);
  } catch (err) {
    console.error(`Newsletter: blog post ${row.slug} has unparseable body JSON —`, err.message);
    return null;
  }
  return { ...row, sections: Array.isArray(sections) ? sections : [] };
}

// One issue per week: the blog post the agent wrote for that week, wrapped
// around the week's release list. Both cohorts mail the same post — the
// Monday arm must be reading exactly what the Sunday arm read, or the send
// day isn't the only difference between them.
//
// `generate` lets a real send publish the post itself if the agent hasn't
// run yet (it's scheduled earlier the same morning, but a redeploy could
// have eaten its window). Previews never generate — building an issue to
// look at it shouldn't publish anything to the live site.
async function buildIssue(dateISO, { generate = false } = {}) {
  const { since, until } = weekWindowFor(dateISO);
  const releases = getReleasesInWindow(since, until);

  let post = getWeeklyPost(since);

  if (!post && generate && process.env.ANTHROPIC_API_KEY) {
    try {
      const result = await runBlogAgent();
      if (!result.published) {
        console.log('Newsletter: blog agent published nothing —', result.reason);
      }
      post = getWeeklyPost(since);
    } catch (err) {
      // A missing post costs the issue its prose, not the send: the release
      // list plus the fallback sections is still a complete email.
      console.error('Newsletter: blog agent run failed —', err.message);
    }
  }

  const windowLabel = formatWindowLabel(since, until);

  return {
    // The issue's identity: what dedupes sends, keys the A/B report, and
    // names the UTM campaign. The post slug when there's a post, so the
    // report reads back against a real URL.
    issueKey: post ? post.slug : `week-of-${since}`,
    weekOf: since,
    untilDate: until,
    postSlug: post ? post.slug : null,
    webPath: post ? `/blog/${post.slug}` : '/blog.html',
    subject: buildSubject(releases, since, until),
    title: post ? post.title : `What's Coming Out This Week (${windowLabel})`,
    tagline:
      (post && post.tagline) ||
      (releases.length
        ? `${releases.length} ${releases.length === 1 ? 'release' : 'releases'} dated ${windowLabel}.`
        : `Nothing dated ${windowLabel} yet — here's what to watch.`),
    description: post
      ? post.description
      : releases.length
        ? `This week's card releases (${windowLabel}): ${releases.slice(0, 3).map((r) => r.title).join(', ')}${releases.length > 3 ? ', and more' : ''}.`
        : `No card releases are dated for ${windowLabel} yet. Here's how to keep an eye on what's next.`,
    intro: releases.length
      ? `Here's every trading card release dated between ${formatShortDate(since)} and ${formatShortDate(until)}, in order.`
      : `Nothing is dated for ${windowLabel} on the calendar right now. Dates get added as manufacturers confirm them, so it's worth a look mid-week.`,
    sections: post ? post.sections : fallbackSections(releases),
    releases,
  };
}

// The week-of date of the first issue an address collected today will
// receive. Eligibility is `joinedAt < weekOf`, so that's the next Sunday
// strictly after today — added on a Saturday you make tomorrow's send;
// added on the Sunday itself you wait for the following week.
function firstEligibleWeek(dateISO = dateStringInTZ(new Date())) {
  const dayOfWeek = dayOfWeekForISO(dateISO);
  return addDaysISO(dateISO, dayOfWeek === 0 ? 7 : 7 - dayOfWeek);
}

// The week-of date of the next issue that will actually go out. On a Sunday
// or Monday that's the current week — both cohorts mail the current week's
// issue on those two days. Any other day, the next send is the coming
// Sunday. Used for "how many people would the next send reach", which is a
// different question from "how many are eligible for the issue dated this
// week" once the week's sends are behind us.
function nextIssueWeek(dateISO = dateStringInTZ(new Date())) {
  return dayOfWeekForISO(dateISO) <= 1 ? weekWindowFor(dateISO).since : firstEligibleWeek(dateISO);
}

// --- recipients ------------------------------------------------------------

// weekOf is the issue's Sunday, and doubles as the eligibility cutoff: an
// address collected during that week doesn't get that week's issue. Someone
// who registers interest on Saturday has just had a confirmation email;
// their first roundup is the following week's, not one twelve hours later.
function listRecipients(weekOf) {
  const statement = AUDIENCE === 'all' ? db.listNewsletterRecipientsAll : db.listNewsletterRecipientsSignups;
  return statement
    .all({ joinedBefore: weekOf })
    .map((row) => row.email)
    .filter((email) => EMAIL_RE.test(email) && !isLikelyTestContact(email));
}

function recipientsForVariant(variant, weekOf) {
  return listRecipients(weekOf).filter((email) => variantForEmail(email) === variant);
}

// --- sending ---------------------------------------------------------------

function renderIssueEmail(issue, { sendId = null, variant = 'sunday' } = {}) {
  const links = buildLinks(issue, { sendId, variant });
  const headers = {
    // Mailbox providers surface this as their own unsubscribe control, which
    // keeps people from reaching for the spam button instead.
    'List-Unsubscribe': `<${links.unsubscribe}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
  return {
    subject: issue.subject,
    html: renderIssueHtml(issue, links),
    text: renderIssueText(issue, links),
    headers,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Sends one cohort of one issue. Safe to call again: a recipient who already
// has a row for this issue is skipped, so a partial run (rate limit, crash,
// per-run ceiling) resumes rather than double-mailing anyone.
async function sendIssueToVariant({ issue, variant, limit = MAX_PER_RUN }) {
  if (!isEmailConfigured()) return { error: 'RESEND_API_KEY is not configured.' };
  if (!linkSecret()) {
    return { error: 'NEWSLETTER_SECRET (or ADMIN_SECRET) must be set — it signs the unsubscribe links.' };
  }

  const recipients = recipientsForVariant(variant, issue.weekOf);
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const email of recipients) {
    if (sent + failed >= limit) break;

    const existing = db.getNewsletterSendByIssueAndEmail.get({ issueKey: issue.issueKey, email });
    // 'failed' is the one status worth another attempt — it means Resend
    // rejected the request (a rate limit, a timeout), not that the mailbox
    // is bad. Anything else (already sent, in flight, bounced, complained)
    // must never be mailed twice.
    if (existing && existing.status !== 'failed') {
      skipped += 1;
      continue;
    }

    let sendId;
    if (existing) {
      sendId = existing.id;
    } else {
      try {
        // Written before the send so the row id can be baked into this
        // recipient's own tracking and unsubscribe links. A UNIQUE violation
        // here means a concurrent run already claimed the address.
        sendId = db.insertNewsletterSend.get({
          issueKey: issue.issueKey,
          weekOf: issue.weekOf,
          email,
          variant,
        }).id;
      } catch (err) {
        skipped += 1;
        continue;
      }
    }

    const message = renderIssueEmail(issue, { sendId, variant });
    const result = await sendEmail({
      to: email,
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: message.headers,
    });

    db.markNewsletterSendResult.run({
      id: sendId,
      status: result.ok ? 'sent' : 'failed',
      resendEmailId: result.id || null,
      error: result.ok ? null : String(result.error || '').slice(0, 500),
    });

    if (result.ok) sent += 1;
    else failed += 1;

    if (SEND_DELAY_MS > 0) await sleep(SEND_DELAY_MS);
  }

  return {
    issueKey: issue.issueKey,
    postSlug: issue.postSlug,
    webPath: issue.webPath,
    variant,
    eligible: recipients.length,
    sent,
    failed,
    skipped,
    reachedLimit: sent + failed >= limit && recipients.length > sent + failed + skipped,
  };
}

// Renders the issue without sending — what the admin preview endpoint
// returns, and what a test send mails to a single address.
function previewIssue(issue, { variant = 'sunday' } = {}) {
  const message = renderIssueEmail(issue, { sendId: null, variant });
  return {
    issueKey: issue.issueKey,
    variant,
    subject: message.subject,
    html: message.html,
    text: message.text,
    recipientCounts: {
      sunday: recipientsForVariant('sunday', issue.weekOf).length,
      monday: recipientsForVariant('monday', issue.weekOf).length,
    },
  };
}

async function sendTestIssue(issue, { variant = 'sunday', to }) {
  if (!isEmailConfigured()) return { ok: false, error: 'RESEND_API_KEY is not configured.' };
  const message = renderIssueEmail(issue, { sendId: null, variant });
  return sendEmail({
    to,
    subject: `[TEST] ${message.subject}`,
    text: message.text,
    html: message.html,
    headers: message.headers,
  });
}

// --- scheduled run ---------------------------------------------------------

let running = false;

// The whole weekly job for one cohort: make sure this week's issue exists,
// publish it, mail the cohort.
async function runScheduledSend({ variant, dateISO = dateStringInTZ(new Date()), limit = MAX_PER_RUN } = {}) {
  if (!VARIANTS.includes(variant)) return { error: `Unknown variant "${variant}".` };
  if (running) return { skipped: 'A newsletter run is already in progress.' };

  running = true;
  try {
    // generate: a real send publishes the week's post itself if the agent
    // hasn't managed to yet, so an email never goes out pointing at a post
    // that doesn't exist.
    const issue = await buildIssue(dateISO, { generate: true });
    return await sendIssueToVariant({ issue, variant, limit });
  } finally {
    running = false;
  }
}

// Wall-clock tick rather than a weekly timer, for the same reason as the
// stats summary: a redeploy resets any long interval, and a weekly one
// would drift or be skipped entirely. Ticking every 5 minutes and checking
// the local day/hour means the send lands on the right day regardless of
// restarts, and repeat ticks within the send hour are no-ops once every
// recipient has a row.
function startNewsletterSchedule() {
  if (!ENABLED) {
    console.log('Weekly newsletter schedule is off (set NEWSLETTER_ENABLED=true to arm it).');
    return;
  }

  console.log(`Weekly newsletter schedule armed: Sunday and Monday cohorts at ${SEND_HOUR}:00 ${TIMEZONE}.`);

  setInterval(() => {
    const now = new Date();
    if (hourInTZ(now) !== SEND_HOUR) return;

    const todayISO = dateStringInTZ(now);
    const variant = VARIANT_BY_WEEKDAY[dayOfWeekForISO(todayISO)];
    if (!variant) return;

    runScheduledSend({ variant, dateISO: todayISO })
      .then((result) => {
        if (result && (result.sent || result.failed || result.error)) {
          console.log('Weekly newsletter run:', JSON.stringify(result));
        }
      })
      .catch((err) => console.error('Weekly newsletter run failed:', err.message));
  }, TICK_INTERVAL_MS);
}

// --- reporting -------------------------------------------------------------

// A cutoff far enough ahead that every collected address clears it — used
// only to count the whole list, never to select recipients for a send.
const TOMORROW_SENTINEL = '9999-12-31';

function rate(numerator, denominator) {
  if (!denominator) return null;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

// The point of the A/B test: open and click rates per send day, per issue
// and pooled across every issue so far, with the leader named once there's
// anything to compare.
function buildReport() {
  const rows = db.newsletterStatsByIssueVariant.all();

  const issues = new Map();
  const totals = {
    sunday: { sent: 0, opened: 0, clicked: 0, failed: 0, bounced: 0, clickCount: 0 },
    monday: { sent: 0, opened: 0, clicked: 0, failed: 0, bounced: 0, clickCount: 0 },
  };

  for (const row of rows) {
    if (!issues.has(row.issueKey)) {
      issues.set(row.issueKey, { issueKey: row.issueKey, weekOf: row.weekOf, variants: {} });
    }
    issues.get(row.issueKey).variants[row.variant] = {
      sent: row.sent,
      failed: row.failed,
      bounced: row.bounced,
      opened: row.opened,
      clicked: row.clicked,
      clickCount: row.clickCount,
      openRate: rate(row.opened, row.sent),
      clickRate: rate(row.clicked, row.sent),
    };

    const bucket = totals[row.variant];
    if (bucket) {
      bucket.sent += row.sent;
      bucket.opened += row.opened;
      bucket.clicked += row.clicked;
      bucket.failed += row.failed;
      bucket.bounced += row.bounced;
      bucket.clickCount += row.clickCount;
    }
  }

  const overall = {};
  for (const variant of VARIANTS) {
    overall[variant] = {
      ...totals[variant],
      openRate: rate(totals[variant].opened, totals[variant].sent),
      clickRate: rate(totals[variant].clicked, totals[variant].sent),
    };
  }

  // Click rate decides it, not opens: Apple Mail Privacy Protection fetches
  // the pixel for its users whether or not anyone read the mail, so opens
  // are directional at best. Clicks are the traffic this is meant to drive.
  let leader = null;
  if (overall.sunday.sent && overall.monday.sent) {
    const sundayRate = overall.sunday.clickRate ?? 0;
    const mondayRate = overall.monday.clickRate ?? 0;
    leader =
      sundayRate === mondayRate ? 'tie' : sundayRate > mondayRate ? 'sunday' : 'monday';
  }

  return {
    audience: AUDIENCE,
    enabled: ENABLED,
    sendHour: SEND_HOUR,
    timezone: TIMEZONE,
    // Two list sizes: who would get an issue sent right now, and everyone
    // on the list including addresses still inside their first-week wait.
    listSize: listRecipients(weekWindowFor(dateStringInTZ(new Date())).since).length,
    listSizeIncludingPending: listRecipients(TOMORROW_SENTINEL).length,
    unsubscribes: db.countNewsletterUnsubscribes.get().c,
    overall,
    leader,
    note:
      'Leader is decided on click rate — open tracking is unreliable for Apple Mail users, whose ' +
      'client loads the pixel regardless of whether the message was read.',
    issues: [...issues.values()],
  };
}

module.exports = {
  AUDIENCE,
  ENABLED,
  SITE_URL,
  VARIANTS,
  buildIssue,
  buildReport,
  dateStringInTZ,
  firstEligibleWeek,
  listRecipients,
  nextIssueWeek,
  previewIssue,
  recipientsForVariant,
  renderIssueEmail,
  runScheduledSend,
  sendIssueToVariant,
  sendTestIssue,
  startNewsletterSchedule,
  variantForEmail,
  verifyToken,
  weekWindowFor,
};
